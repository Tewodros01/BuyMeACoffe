import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletAccountingService } from '../wallet/wallet-accounting.service';
import { WalletBalanceService } from '../wallet/wallet-balance.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';

const SETTLEMENT_BATCH_SIZE = 100;

@Injectable()
export class SupportSettlementService {
  private readonly logger = new Logger(SupportSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletAccounting: WalletAccountingService,
    private readonly walletLedger: WalletLedgerService,
    private readonly walletBalance: WalletBalanceService,
  ) {}

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

    throw new Error('Settlement transaction retry limit exceeded');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySettlement() {
    const settled = await this.releaseMaturedSupports();

    if (settled > 0) {
      this.logger.log(`Released ${settled} matured support settlement(s)`);
    }
  }

  async releaseMaturedSupports(limit = SETTLEMENT_BATCH_SIZE) {
    const supports = await this.prisma.support.findMany({
      where: {
        status: 'COMPLETED',
        settlementStatus: 'PENDING',
        walletCredited: true,
        availableAt: { lte: new Date() },
      },
      orderBy: { availableAt: 'asc' },
      take: limit,
      select: {
        id: true,
        netAmount: true,
        creatorProfile: {
          select: {
            user: {
              select: { id: true },
            },
          },
        },
      },
    });

    let settledCount = 0;

    for (const support of supports) {
      try {
        const settled = await this.runSerializableTransaction(async (tx) => {
          const supportUpdate = await tx.support.updateMany({
            where: {
              id: support.id,
              status: 'COMPLETED',
              settlementStatus: 'PENDING',
              walletCredited: true,
              availableAt: { lte: new Date() },
            },
            data: {
              settlementStatus: 'AVAILABLE',
            },
          });

          if (supportUpdate.count !== 1) {
            return false;
          }

          const wallet = await this.walletBalance.settlePendingSupport(
            tx,
            support.creatorProfile.user.id,
            support.netAmount,
          );

          await this.walletLedger.createWalletTransaction(tx, {
            userId: support.creatorProfile.user.id,
            type: 'CREDIT',
            reason: 'SUPPORT_SETTLED',
            supportId: support.id,
            amount: support.netAmount,
            balances: wallet,
            referenceId: support.id,
            referenceType: 'support',
            note: 'Support hold period completed',
          });
          await this.walletAccounting.recordSupportSettlement(tx, {
            supportId: support.id,
            creatorUserId: support.creatorProfile.user.id,
            amount: support.netAmount,
            currency: 'ETB',
          });

          return true;
        });

        if (settled) {
          settledCount += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to release support settlement ${support.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return settledCount;
  }
}
