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

const MIN_WITHDRAWAL = 100;

export interface RequestWithdrawalDto {
  amount: number;
  method: WithdrawalMethod;
  financialAccountId: string;
  note?: string;
}

export interface UpdateWithdrawalStatusDto {
  status: Exclude<WithdrawalStatus, 'PENDING'>;
  adminNote?: string;
  referenceId?: string;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

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
        balanceAfter: true,
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

    return this.prisma.$transaction(async (tx) => {
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

      const amount = new Prisma.Decimal(dto.amount);
      const walletUpdate = await tx.wallet.updateMany({
        where: {
          userId,
          isActive: true,
          availableBalance: { gte: amount },
        },
        data: {
          availableBalance: { decrement: amount },
          lockedBalance: { increment: amount },
        },
      });
      if (walletUpdate.count !== 1) {
        throw new BadRequestException(
          'Insufficient available balance or wallet is inactive',
        );
      }

      const updatedWallet = await tx.wallet.findUnique({
        where: { userId },
        select: { availableBalance: true },
      });
      if (!updatedWallet) throw new NotFoundException('Wallet not found');

      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          financialAccountId: dto.financialAccountId,
          amount,
          method: dto.method,
          note: dto.note,
          currency: 'ETB',
        },
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          createdAt: true,
        },
      });

      await tx.walletTransaction.create({
        data: {
          wallet: { connect: { userId } },
          type: 'DEBIT',
          reason: 'WITHDRAWAL',
          amount,
          balanceAfter: updatedWallet.availableBalance,
          referenceId: withdrawal.id,
          referenceType: 'withdrawal',
        },
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
        where: { status: 'COMPLETED', processedAt: { gte: dayAgo } },
      }),
      this.prisma.withdrawal.count({
        where: { status: 'REJECTED', processedAt: { gte: weekAgo } },
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
    return this.prisma.$transaction(async (tx) => {
      const [actor, withdrawal] = await Promise.all([
        tx.user.findUnique({
          where: { id: actorUserId },
          select: { id: true },
        }),
        tx.withdrawal.findUnique({
          where: { id: withdrawalId },
          include: {
            user: { select: { id: true } },
            financialAccount: { select: { provider: true, accountName: true } },
          },
        }),
      ]);

      if (!actor) throw new NotFoundException('Actor not found');
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      if (withdrawal.status === dto.status) {
        throw new ConflictException('Withdrawal is already in that state');
      }
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

      const wallet = await tx.wallet.findUnique({
        where: { userId: withdrawal.userId },
        select: { availableBalance: true, lockedBalance: true },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');

      const amount = withdrawal.amount;

      if (dto.status === 'COMPLETED') {
        if (wallet.lockedBalance.lt(amount)) {
          throw new ConflictException('Locked balance is insufficient');
        }

        await tx.wallet.update({
          where: { userId: withdrawal.userId },
          data: {
            lockedBalance: { decrement: amount },
          },
        });
      }

      if (dto.status === 'REJECTED') {
        if (wallet.lockedBalance.lt(amount)) {
          throw new ConflictException('Locked balance is insufficient');
        }

        const updatedWallet = await tx.wallet.update({
          where: { userId: withdrawal.userId },
          data: {
            lockedBalance: { decrement: amount },
            availableBalance: { increment: amount },
          },
          select: { availableBalance: true },
        });

        await tx.walletTransaction.create({
          data: {
            wallet: { connect: { userId: withdrawal.userId } },
            type: 'CREDIT',
            reason: 'WITHDRAWAL_FAILED',
            amount,
            balanceAfter: updatedWallet.availableBalance,
            referenceId: withdrawal.id,
            referenceType: 'withdrawal',
            note: dto.adminNote ?? 'Withdrawal rejected and funds returned',
          },
        });
      }

      const updated = await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: dto.status,
          adminNote: dto.adminNote,
          referenceId: dto.referenceId,
          processedAt: dto.status === 'PROCESSING' ? null : new Date(),
        },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          processedAt: true,
          userId: true,
        },
      });

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
