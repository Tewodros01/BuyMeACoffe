import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  LedgerAccountCode,
  LedgerEntryDirection,
  NotificationType,
  Prisma,
  Role,
} from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RECONCILIATION_BATCH_SIZE = 200;
const RECONCILIATION_ALERT_COOLDOWN_HOURS = 24;

type ReconciliationBalance = {
  availableBalance: Prisma.Decimal;
  pendingBalance: Prisma.Decimal;
  lockedBalance: Prisma.Decimal;
};

type SerializedReconciliationBalance = {
  availableBalance: string;
  pendingBalance: string;
  lockedBalance: string;
};

type WalletReconciliationRow = {
  walletId: string;
  userId: string;
  actual: ReconciliationBalance;
  expected: ReconciliationBalance;
  latestSnapshot: ReconciliationBalance;
  mismatchFields: string[];
  snapshotMismatchFields: string[];
  lastTransactionId: string | null;
};

type SerializedWalletReconciliationRow = Omit<
  WalletReconciliationRow,
  'actual' | 'expected' | 'latestSnapshot'
> & {
  actual: SerializedReconciliationBalance;
  expected: SerializedReconciliationBalance;
  latestSnapshot: SerializedReconciliationBalance;
};

type AccountingEntryForReconciliation = {
  accountCode: LedgerAccountCode;
  direction: LedgerEntryDirection;
  amount: Prisma.Decimal;
};

@Injectable()
export class WalletReconciliationService {
  private readonly logger = new Logger(WalletReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async runScheduledReconciliation() {
    const result = await this.reconcileWallets();

    if (result.mismatchedWallets > 0) {
      this.logger.warn(
        `Wallet reconciliation found ${result.mismatchedWallets} mismatch(es) across ${result.checkedWallets} wallet(s)`,
      );
      return;
    }

    this.logger.log(
      `Wallet reconciliation checked ${result.checkedWallets} wallet(s) with no mismatches`,
    );
  }

  async reconcileWallets(limit = RECONCILIATION_BATCH_SIZE) {
    const report = await this.buildReconciliationReport(limit);

    for (const mismatch of report.mismatches) {
      this.logger.error(
        `Wallet reconciliation mismatch for wallet ${mismatch.walletId} (user ${mismatch.userId}) on ${mismatch.mismatchFields.join(', ')}`,
      );
      this.logger.error(
        JSON.stringify({
          walletId: mismatch.walletId,
          userId: mismatch.userId,
          actual: {
            availableBalance: mismatch.actual.availableBalance.toString(),
            pendingBalance: mismatch.actual.pendingBalance.toString(),
            lockedBalance: mismatch.actual.lockedBalance.toString(),
          },
          expected: {
            availableBalance: mismatch.expected.availableBalance.toString(),
            pendingBalance: mismatch.expected.pendingBalance.toString(),
            lockedBalance: mismatch.expected.lockedBalance.toString(),
          },
          latestSnapshot: {
            availableBalance:
              mismatch.latestSnapshot.availableBalance.toString(),
            pendingBalance: mismatch.latestSnapshot.pendingBalance.toString(),
            lockedBalance: mismatch.latestSnapshot.lockedBalance.toString(),
          },
          snapshotMismatchFields: mismatch.snapshotMismatchFields,
          lastTransactionId: mismatch.lastTransactionId,
        }),
      );
      await this.escalateMismatch(mismatch.walletId, mismatch.userId);
    }

    return {
      checkedWallets: report.checkedWallets,
      mismatchedWallets: report.mismatchedWallets,
    };
  }

  async getReconciliationReport(limit = RECONCILIATION_BATCH_SIZE) {
    const report = await this.buildReconciliationReport(limit);

    return {
      checkedWallets: report.checkedWallets,
      mismatchedWallets: report.mismatchedWallets,
      mismatches: report.mismatches.map((mismatch) =>
        this.serializeMismatch(mismatch),
      ),
    };
  }

  private async buildReconciliationReport(limit = RECONCILIATION_BATCH_SIZE) {
    const wallets = await this.prisma.wallet.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        availableBalance: true,
        pendingBalance: true,
        lockedBalance: true,
        transactions: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            availableBalanceAfter: true,
            pendingBalanceAfter: true,
            lockedBalanceAfter: true,
          },
        },
        accountingEntries: {
          where: {
            accountCode: {
              in: ['CREATOR_AVAILABLE', 'CREATOR_PENDING', 'CREATOR_LOCKED'],
            },
          },
          select: {
            accountCode: true,
            direction: true,
            amount: true,
          },
        },
      },
    });

    const mismatches: WalletReconciliationRow[] = [];

    for (const wallet of wallets) {
      const expected = this.getExpectedBalancesFromAccountingEntries(
        wallet.accountingEntries,
      );
      const latestSnapshot = this.getExpectedBalancesFromLatestTransaction(
        wallet.transactions[0],
      );
      const mismatchFields = this.getMismatchFields(wallet, expected);
      const snapshotMismatchFields = this.getMismatchFields(
        latestSnapshot,
        expected,
      );

      if (mismatchFields.length === 0) {
        continue;
      }

      mismatches.push({
        walletId: wallet.id,
        userId: wallet.userId,
        actual: {
          availableBalance: wallet.availableBalance,
          pendingBalance: wallet.pendingBalance,
          lockedBalance: wallet.lockedBalance,
        },
        expected,
        latestSnapshot,
        mismatchFields,
        snapshotMismatchFields,
        lastTransactionId: wallet.transactions[0]?.id ?? null,
      });
    }

    return {
      checkedWallets: wallets.length,
      mismatchedWallets: mismatches.length,
      mismatches,
    };
  }

  private getExpectedBalancesFromLatestTransaction(
    transaction:
      | {
          id: string;
          availableBalanceAfter: Prisma.Decimal;
          pendingBalanceAfter: Prisma.Decimal;
          lockedBalanceAfter: Prisma.Decimal;
        }
      | undefined,
  ) {
    if (!transaction) {
      return this.zeroBalances();
    }

    return {
      availableBalance: transaction.availableBalanceAfter,
      pendingBalance: transaction.pendingBalanceAfter,
      lockedBalance: transaction.lockedBalanceAfter,
    };
  }

  private getExpectedBalancesFromAccountingEntries(
    entries: AccountingEntryForReconciliation[],
  ) {
    return entries.reduce((balances, entry) => {
      const signedAmount =
        entry.direction === LedgerEntryDirection.CREDIT
          ? entry.amount
          : entry.amount.negated();

      if (entry.accountCode === LedgerAccountCode.CREATOR_AVAILABLE) {
        balances.availableBalance =
          balances.availableBalance.plus(signedAmount);
      }
      if (entry.accountCode === LedgerAccountCode.CREATOR_PENDING) {
        balances.pendingBalance = balances.pendingBalance.plus(signedAmount);
      }
      if (entry.accountCode === LedgerAccountCode.CREATOR_LOCKED) {
        balances.lockedBalance = balances.lockedBalance.plus(signedAmount);
      }

      return balances;
    }, this.zeroBalances());
  }

  private serializeMismatch(
    mismatch: WalletReconciliationRow,
  ): SerializedWalletReconciliationRow {
    return {
      ...mismatch,
      actual: this.serializeBalances(mismatch.actual),
      expected: this.serializeBalances(mismatch.expected),
      latestSnapshot: this.serializeBalances(mismatch.latestSnapshot),
    };
  }

  private serializeBalances(
    balances: ReconciliationBalance,
  ): SerializedReconciliationBalance {
    return {
      availableBalance: balances.availableBalance.toString(),
      pendingBalance: balances.pendingBalance.toString(),
      lockedBalance: balances.lockedBalance.toString(),
    };
  }

  private getMismatchFields(
    wallet: {
      availableBalance: Prisma.Decimal;
      pendingBalance: Prisma.Decimal;
      lockedBalance: Prisma.Decimal;
    },
    expected: ReconciliationBalance,
  ) {
    const mismatches: string[] = [];

    if (!wallet.availableBalance.equals(expected.availableBalance)) {
      mismatches.push('availableBalance');
    }
    if (!wallet.pendingBalance.equals(expected.pendingBalance)) {
      mismatches.push('pendingBalance');
    }
    if (!wallet.lockedBalance.equals(expected.lockedBalance)) {
      mismatches.push('lockedBalance');
    }

    return mismatches;
  }

  private zeroBalances(): ReconciliationBalance {
    return {
      availableBalance: new Prisma.Decimal(0),
      pendingBalance: new Prisma.Decimal(0),
      lockedBalance: new Prisma.Decimal(0),
    };
  }

  private async escalateMismatch(walletId: string, userId: string) {
    const referenceId = `wallet-reconciliation:${walletId}`;
    const cooldownWindow = new Date(
      Date.now() - RECONCILIATION_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000,
    );

    const existingAlertCount = await this.prisma.notification.count({
      where: {
        type: NotificationType.SYSTEM,
        referenceId,
        createdAt: { gte: cooldownWindow },
      },
    });

    if (existingAlertCount > 0) {
      return;
    }

    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, deletedAt: null },
      select: { id: true },
    });

    if (admins.length === 0) {
      return;
    }

    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: NotificationType.SYSTEM,
        title: 'Wallet reconciliation mismatch detected',
        body: `Wallet ${walletId} for user ${userId} diverged from its latest ledger snapshot and requires investigation.`,
        referenceId,
      })),
    });
  }
}
