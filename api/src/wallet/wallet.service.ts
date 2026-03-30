import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  WithdrawalMethod,
  WithdrawalStatus,
} from 'generated/prisma/client';
import { maskFinancialAccountNumber } from '../common/utils/encryption.util';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpdateWithdrawalsDto } from './dto/bulk-update-withdrawals.dto';
import { ListAdminAuditLogsDto } from './dto/list-admin-audit-logs.dto';
import { ListAdminWithdrawalsDto } from './dto/list-admin-withdrawals.dto';
import { WalletAccountingService } from './wallet-accounting.service';
import { WalletBalanceService } from './wallet-balance.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { WithdrawalTransitionService } from './withdrawal-transition.service';

const MIN_WITHDRAWAL = 100;
const CURRENCY_SCALE = 2;

export interface RequestWithdrawalDto {
  amount: number;
  method: WithdrawalMethod;
  financialAccountId: string;
  note?: string;
  idempotencyKey?: string;
}

export interface UpdateWithdrawalStatusDto {
  status: Exclude<WithdrawalStatus, 'PENDING'>;
  adminNote?: string;
  referenceId?: string;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletAccounting: WalletAccountingService,
    private readonly walletLedger: WalletLedgerService,
    private readonly walletBalance: WalletBalanceService,
    private readonly walletReconciliation: WalletReconciliationService,
    private readonly withdrawalTransition: WithdrawalTransitionService,
  ) {}

  private normalizeWithdrawalAmount(amount: number): Prisma.Decimal {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than 0');
    }

    const scaledAmount = amount * 10 ** CURRENCY_SCALE;
    if (Math.abs(scaledAmount - Math.round(scaledAmount)) > 1e-8) {
      throw new BadRequestException(
        'Withdrawal amount cannot have more than 2 decimal places',
      );
    }

    return new Prisma.Decimal(amount.toFixed(CURRENCY_SCALE));
  }

  private normalizeOptionalText(value?: string) {
    return value?.trim() || null;
  }

  private ensureIdempotentWithdrawalMatches(
    existingWithdrawal: {
      amount: Prisma.Decimal;
      method: WithdrawalMethod;
      financialAccountId: string;
      note: string | null;
      id: string;
    },
    expected: {
      amount: Prisma.Decimal;
      method: WithdrawalMethod;
      financialAccountId: string;
      note: string | null;
    },
  ) {
    const sameRequest =
      existingWithdrawal.amount.equals(expected.amount) &&
      existingWithdrawal.method === expected.method &&
      existingWithdrawal.financialAccountId === expected.financialAccountId &&
      existingWithdrawal.note === expected.note;

    if (!sameRequest) {
      throw new ConflictException(
        `Idempotency key is already bound to a different withdrawal request (${existingWithdrawal.id})`,
      );
    }
  }

  private isRetryableTransactionError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    maxAttempts = 3,
  ) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !this.isRetryableTransactionError(error) ||
          attempt === maxAttempts
        ) {
          throw error;
        }
      }
    }

    throw new ConflictException('Transaction retry limit exceeded');
  }

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        availableBalance: true,
        lockedBalance: true,
        pendingBalance: true,
        totalEarned: true,
        currency: true,
        isActive: true,
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getTransactions(userId: string, take = 20) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        reason: true,
        amount: true,
        availableBalanceAfter: true,
        pendingBalanceAfter: true,
        lockedBalanceAfter: true,
        referenceType: true,
        referenceId: true,
        note: true,
        createdAt: true,
      },
    });
  }

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    if (dto.amount < MIN_WITHDRAWAL) {
      throw new BadRequestException(
        `Minimum withdrawal is ETB ${MIN_WITHDRAWAL}`,
      );
    }

    return this.runSerializableTransaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { isVerified: true },
      });
      if (!user) throw new NotFoundException('User not found');
      if (!user.isVerified) {
        throw new BadRequestException(
          'Identity verification is required before withdrawals are enabled',
        );
      }

      const account = await tx.financialAccount.findFirst({
        where: { id: dto.financialAccountId, userId, isActive: true },
      });
      if (!account) throw new NotFoundException('Financial account not found');

      const amount: Prisma.Decimal = this.normalizeWithdrawalAmount(dto.amount);
      const normalizedNote = this.normalizeOptionalText(dto.note);

      if (dto.idempotencyKey) {
        const existingWithdrawal = await tx.withdrawal.findFirst({
          where: {
            userId,
            idempotencyKey: dto.idempotencyKey,
          },
          select: {
            id: true,
            amount: true,
            method: true,
            financialAccountId: true,
            note: true,
            status: true,
            createdAt: true,
          },
        });

        if (existingWithdrawal) {
          this.ensureIdempotentWithdrawalMatches(existingWithdrawal, {
            amount,
            method: dto.method,
            financialAccountId: dto.financialAccountId,
            note: normalizedNote,
          });
          return existingWithdrawal;
        }
      }

      const updatedWallet = await this.walletBalance.reserveWithdrawalFunds(
        tx,
        userId,
        amount,
      );

      const withdrawalData: Prisma.WithdrawalUncheckedCreateInput = {
        userId,
        financialAccountId: dto.financialAccountId,
        amount,
        netAmount: amount,
        method: dto.method,
        note: normalizedNote,
        currency: 'ETB',
        ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
      };

      const withdrawal = await tx.withdrawal.create({
        data: withdrawalData,
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          createdAt: true,
        },
      });

      await this.walletLedger.createWalletTransaction(tx, {
        userId,
        type: 'DEBIT',
        reason: 'WITHDRAWAL_RESERVED',
        withdrawalId: withdrawal.id,
        amount,
        balances: updatedWallet,
        referenceId: withdrawal.id,
        referenceType: 'withdrawal',
        note: dto.note ?? 'Withdrawal requested and funds reserved',
      });
      await this.walletAccounting.recordWithdrawalReserve(tx, {
        withdrawalId: withdrawal.id,
        userId,
        amount,
        currency: 'ETB',
      });
      return withdrawal;
    });
  }

  async getWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        note: true,
        processingStartedAt: true,
        processedAt: true,
        createdAt: true,
        financialAccount: {
          select: { provider: true, accountName: true, label: true },
        },
      },
    });
  }

  async listAdminWithdrawals(query: ListAdminWithdrawalsDto) {
    const search = query.search?.trim();
    const take = query.take ?? 25;
    const page = query.page ?? 1;
    const skip = (page - 1) * take;
    const where: Prisma.WithdrawalWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { user: { email: { contains: search, mode: 'insensitive' } } },
              {
                user: {
                  username: { contains: search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  lastName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                financialAccount: {
                  provider: { contains: search, mode: 'insensitive' },
                },
              },
              { referenceId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, withdrawals] = await this.prisma.$transaction([
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          note: true,
          adminNote: true,
          referenceId: true,
          createdAt: true,
          processingStartedAt: true,
          processedAt: true,
          financialAccount: {
            select: {
              id: true,
              provider: true,
              accountName: true,
              accountNumber: true,
              label: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      items: withdrawals.map((withdrawal) => ({
        ...withdrawal,
        financialAccount: {
          ...withdrawal.financialAccount,
          accountNumber: maskFinancialAccountNumber(
            withdrawal.financialAccount.accountNumber,
          ),
        },
      })),
      pagination: {
        total,
        page,
        take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async getAdminMetrics() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      pendingCount,
      processingCount,
      completedCount,
      rejectedCount,
      pendingAggregate,
      processingAggregate,
      totalAggregate,
      completedToday,
      rejectedThisWeek,
    ] = await this.prisma.$transaction([
      this.prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      this.prisma.withdrawal.count({ where: { status: 'PROCESSING' } }),
      this.prisma.withdrawal.count({ where: { status: 'COMPLETED' } }),
      this.prisma.withdrawal.count({ where: { status: 'REJECTED' } }),
      this.prisma.withdrawal.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
      this.prisma.withdrawal.aggregate({
        where: { status: 'PROCESSING' },
        _sum: { amount: true },
      }),
      this.prisma.withdrawal.aggregate({
        _sum: { amount: true },
      }),
      this.prisma.withdrawal.count({
        where: { status: 'COMPLETED', approvedAt: { gte: dayAgo } },
      }),
      this.prisma.withdrawal.count({
        where: { status: 'REJECTED', rejectedAt: { gte: weekAgo } },
      }),
    ]);

    return {
      counts: {
        pending: pendingCount,
        processing: processingCount,
        completed: completedCount,
        rejected: rejectedCount,
      },
      amounts: {
        pending: Number(pendingAggregate._sum.amount ?? 0),
        processing: Number(processingAggregate._sum.amount ?? 0),
        totalRequested: Number(totalAggregate._sum.amount ?? 0),
      },
      trends: {
        completedToday,
        rejectedThisWeek,
      },
    };
  }

  async listAdminAuditLogs(query: ListAdminAuditLogsDto) {
    const take = query.take ?? 20;
    const page = query.page ?? 1;
    const skip = (page - 1) * take;
    const search = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(search
        ? {
            OR: [
              { entityId: { contains: search, mode: 'insensitive' } },
              { actor: { email: { contains: search, mode: 'insensitive' } } },
              {
                actor: { username: { contains: search, mode: 'insensitive' } },
              },
              {
                targetUser: {
                  email: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          before: true,
          after: true,
          reasonCode: true,
          correlationId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          targetUser: {
            select: {
              id: true,
              username: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      items: logs,
      pagination: {
        total,
        page,
        take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async listAccountingBatches(query?: {
    page?: number;
    take?: number;
    batchType?: string;
    search?: string;
  }) {
    const take = query?.take ?? 20;
    const page = query?.page ?? 1;
    const skip = (page - 1) * take;
    const search = query?.search?.trim();

    const where: Prisma.AccountingPostingBatchWhereInput = {
      ...(query?.batchType ? { batchType: query.batchType as never } : {}),
      ...(search
        ? {
            OR: [
              { idempotencyKey: { contains: search, mode: 'insensitive' } },
              { supportId: { contains: search, mode: 'insensitive' } },
              { withdrawalId: { contains: search, mode: 'insensitive' } },
              {
                providerTransaction: {
                  providerRef: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, batches] = await this.prisma.$transaction([
      this.prisma.accountingPostingBatch.count({ where }),
      this.prisma.accountingPostingBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          batchType: true,
          currency: true,
          description: true,
          idempotencyKey: true,
          supportId: true,
          withdrawalId: true,
          createdAt: true,
          providerTransaction: {
            select: {
              id: true,
              provider: true,
              providerRef: true,
              status: true,
            },
          },
          entries: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              walletId: true,
              accountCode: true,
              direction: true,
              amount: true,
              currency: true,
              metadata: true,
            },
          },
        },
      }),
    ]);

    return {
      items: batches,
      pagination: {
        total,
        page,
        take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async listProviderTransactions(query?: {
    page?: number;
    take?: number;
    status?: string;
    search?: string;
  }) {
    const take = query?.take ?? 20;
    const page = query?.page ?? 1;
    const skip = (page - 1) * take;
    const search = query?.search?.trim();

    const where: Prisma.PaymentProviderTransactionWhereInput = {
      ...(query?.status ? { status: query.status as never } : {}),
      ...(search
        ? {
            OR: [
              { providerRef: { contains: search, mode: 'insensitive' } },
              { eventType: { contains: search, mode: 'insensitive' } },
              {
                paymentIntent: {
                  supportId: { contains: search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, transactions] = await this.prisma.$transaction([
      this.prisma.paymentProviderTransaction.count({ where }),
      this.prisma.paymentProviderTransaction.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          provider: true,
          providerRef: true,
          status: true,
          eventType: true,
          amount: true,
          feeAmount: true,
          netAmount: true,
          currency: true,
          verifiedAt: true,
          recordedAt: true,
          paymentIntent: {
            select: {
              id: true,
              supportId: true,
              support: {
                select: {
                  id: true,
                  supporterName: true,
                  creatorProfile: {
                    select: {
                      slug: true,
                      user: {
                        select: {
                          firstName: true,
                          lastName: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          paymentAttempt: {
            select: {
              id: true,
              attemptNumber: true,
              checkoutUrl: true,
            },
          },
        },
      }),
    ]);

    return {
      items: transactions,
      pagination: {
        total,
        page,
        take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  async getAdminReconciliation(limit = 50) {
    return this.walletReconciliation.getReconciliationReport(limit);
  }

  async runAdminReconciliation(limit = 50) {
    const result = await this.walletReconciliation.reconcileWallets(limit);
    const report =
      await this.walletReconciliation.getReconciliationReport(limit);
    return {
      ...result,
      mismatches: report.mismatches,
    };
  }

  async bulkUpdateWithdrawals(
    actorUserId: string,
    dto: BulkUpdateWithdrawalsDto,
  ) {
    const uniqueIds = Array.from(new Set(dto.withdrawalIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('At least one withdrawal must be selected');
    }

    const results = await Promise.allSettled(
      uniqueIds.map((withdrawalId) =>
        this.updateWithdrawalStatus(actorUserId, withdrawalId, {
          status: dto.status,
          adminNote: dto.adminNote,
        }),
      ),
    );

    const successIds: string[] = [];
    const failed: Array<{ withdrawalId: string; reason: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successIds.push(uniqueIds[index]);
      } else {
        failed.push({
          withdrawalId: uniqueIds[index],
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : 'Bulk update failed',
        });
      }
    });

    return {
      requested: uniqueIds.length,
      succeeded: successIds.length,
      failed,
    };
  }

  async updateWithdrawalStatus(
    actorUserId: string,
    withdrawalId: string,
    dto: UpdateWithdrawalStatusDto,
  ) {
    return this.runSerializableTransaction(async (tx) => {
      const [actor, withdrawal] = await Promise.all([
        tx.user.findUnique({
          where: { id: actorUserId },
          select: { id: true },
        }),
        tx.withdrawal.findUnique({
          where: { id: withdrawalId },
          include: {
            user: { select: { id: true } },
            financialAccount: {
              select: { provider: true, accountName: true },
            },
          },
        }),
      ]);

      if (!actor) throw new NotFoundException('Actor not found');
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      if (withdrawal.status === dto.status) {
        throw new ConflictException('Withdrawal is already in that state');
      }
      this.withdrawalTransition.assertTransition(withdrawal.status, dto.status);
      if (
        withdrawal.status === 'COMPLETED' ||
        withdrawal.status === 'REJECTED'
      ) {
        throw new BadRequestException(
          'Finalized withdrawals cannot change status',
        );
      }

      const latestStatusAudit = await tx.auditLog.findFirst({
        where: {
          action: AuditAction.WITHDRAWAL_STATUS_CHANGED,
          entityType: 'withdrawal',
          entityId: withdrawal.id,
        },
        orderBy: { createdAt: 'desc' },
        select: { actorId: true, after: true },
      });

      if (dto.status === 'PROCESSING' && withdrawal.status !== 'PENDING') {
        throw new BadRequestException(
          'Only pending withdrawals can move to processing',
        );
      }

      if (dto.status === 'COMPLETED' || dto.status === 'REJECTED') {
        if (withdrawal.status !== 'PROCESSING') {
          throw new BadRequestException(
            'Only processing withdrawals can be finalized',
          );
        }
        if (!latestStatusAudit) {
          throw new ConflictException(
            'Maker/checker policy requires a prior processing action',
          );
        }
        if (latestStatusAudit.actorId === actor.id) {
          throw new ConflictException(
            'Maker/checker policy requires a different admin to finalize this withdrawal',
          );
        }
      }

      const amount: Prisma.Decimal = withdrawal.amount;
      const statusChangedAt = new Date();
      let updated: {
        id: string;
        status: WithdrawalStatus;
        amount: Prisma.Decimal;
        currency: string;
        processedAt: Date | null;
        userId: string;
      } | null = null;

      if (dto.status === 'PROCESSING') {
        const transition = await this.withdrawalTransition.moveToProcessing(
          tx,
          {
            withdrawalId: withdrawal.id,
            adminNote: dto.adminNote,
            referenceId: dto.referenceId,
            at: statusChangedAt,
          },
        );

        if (transition.count !== 1) {
          throw new ConflictException(
            'Withdrawal could not be moved to processing',
          );
        }
      }

      if (dto.status === 'COMPLETED') {
        const finalization = await this.withdrawalTransition.finalize(tx, {
          withdrawalId: withdrawal.id,
          status: 'COMPLETED',
          adminNote: dto.adminNote,
          referenceId: dto.referenceId,
          at: statusChangedAt,
        });

        if (finalization.count !== 1) {
          throw new ConflictException('Withdrawal has already been finalized');
        }

        const updatedWallet = await this.walletBalance.completeWithdrawal(
          tx,
          withdrawal.userId,
          amount,
        );

        await this.walletLedger.createWalletTransaction(tx, {
          userId: withdrawal.userId,
          type: 'DEBIT',
          reason: 'WITHDRAWAL_COMPLETED',
          withdrawalId: withdrawal.id,
          amount,
          balances: updatedWallet,
          referenceId: withdrawal.id,
          referenceType: 'withdrawal',
          note: dto.adminNote ?? 'Withdrawal completed',
        });
        await this.walletAccounting.recordWithdrawalPayout(tx, {
          withdrawalId: withdrawal.id,
          userId: withdrawal.userId,
          amount,
          currency: withdrawal.currency,
        });
      }

      if (dto.status === 'REJECTED') {
        const finalization = await this.withdrawalTransition.finalize(tx, {
          withdrawalId: withdrawal.id,
          status: 'REJECTED',
          adminNote: dto.adminNote,
          referenceId: dto.referenceId,
          at: statusChangedAt,
        });

        if (finalization.count !== 1) {
          throw new ConflictException('Withdrawal has already been finalized');
        }

        const updatedWallet = await this.walletBalance.rejectWithdrawal(
          tx,
          withdrawal.userId,
          amount,
        );

        await this.walletLedger.createWalletTransaction(tx, {
          userId: withdrawal.userId,
          type: 'CREDIT',
          reason: 'WITHDRAWAL_FAILED',
          withdrawalId: withdrawal.id,
          amount,
          balances: updatedWallet,
          referenceId: withdrawal.id,
          referenceType: 'withdrawal',
          note: dto.adminNote ?? 'Withdrawal rejected and funds returned',
        });
        await this.walletAccounting.recordWithdrawalRelease(tx, {
          withdrawalId: withdrawal.id,
          userId: withdrawal.userId,
          amount,
          currency: withdrawal.currency,
        });
      }

      updated = await tx.withdrawal.findUnique({
        where: { id: withdrawal.id },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          processedAt: true,
          userId: true,
        },
      });

      if (!updated) {
        throw new NotFoundException('Withdrawal not found after update');
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          targetUserId: withdrawal.userId,
          action: 'WITHDRAWAL_STATUS_CHANGED',
          entityType: 'withdrawal',
          entityId: withdrawal.id,
          before: {
            status: withdrawal.status,
            adminNote: withdrawal.adminNote,
            referenceId: withdrawal.referenceId,
          },
          after: {
            status: dto.status,
            adminNote: dto.adminNote ?? null,
            referenceId: dto.referenceId ?? null,
          },
          reasonCode:
            dto.status === 'COMPLETED'
              ? 'WITHDRAWAL_PAYOUT_CONFIRMED'
              : dto.status === 'REJECTED'
                ? 'WITHDRAWAL_REJECTED'
                : 'WITHDRAWAL_UNDER_REVIEW',
          correlationId: withdrawal.id,
          metadata: {
            amount: withdrawal.amount.toString(),
            currency: withdrawal.currency,
          },
        },
      });

      await tx.notification.create({
        data: {
          userId: withdrawal.userId,
          type:
            dto.status === 'REJECTED'
              ? 'WITHDRAWAL_REJECTED'
              : 'WITHDRAWAL_PROCESSED',
          title:
            dto.status === 'REJECTED'
              ? 'Withdrawal rejected'
              : dto.status === 'COMPLETED'
                ? 'Withdrawal completed'
                : 'Withdrawal processing',
          body:
            dto.status === 'REJECTED'
              ? 'Your funds were returned to your available balance.'
              : `Your withdrawal to ${withdrawal.financialAccount.provider} is now ${dto.status.toLowerCase()}.`,
          referenceId: withdrawal.id,
        },
      });

      return updated;
    });
  }
}
