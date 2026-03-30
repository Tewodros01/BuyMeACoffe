import { Prisma } from 'generated/prisma/client';
import { WalletReconciliationService } from './wallet-reconciliation.service';

describe('WalletReconciliationService', () => {
  let service: WalletReconciliationService;

  beforeEach(() => {
    service = new WalletReconciliationService({} as any);
  });

  it('derives wallet balances from accounting entries', () => {
    const balances = (
      service as any
    ).getExpectedBalancesFromAccountingEntries([
      {
        accountCode: 'CREATOR_PENDING',
        direction: 'CREDIT',
        amount: new Prisma.Decimal(70),
      },
      {
        accountCode: 'CREATOR_PENDING',
        direction: 'DEBIT',
        amount: new Prisma.Decimal(70),
      },
      {
        accountCode: 'CREATOR_AVAILABLE',
        direction: 'CREDIT',
        amount: new Prisma.Decimal(70),
      },
    ]) as {
      availableBalance: Prisma.Decimal;
      pendingBalance: Prisma.Decimal;
      lockedBalance: Prisma.Decimal;
    };

    expect(balances.availableBalance.toString()).toBe('70');
    expect(balances.pendingBalance.toString()).toBe('0');
    expect(balances.lockedBalance.toString()).toBe('0');
  });

  it('returns zero balances when a wallet has no accounting entries', () => {
    const balances = (
      service as any
    ).getExpectedBalancesFromAccountingEntries([]) as {
      availableBalance: Prisma.Decimal;
      pendingBalance: Prisma.Decimal;
      lockedBalance: Prisma.Decimal;
    };

    expect(balances.availableBalance.toString()).toBe('0');
    expect(balances.pendingBalance.toString()).toBe('0');
    expect(balances.lockedBalance.toString()).toBe('0');
  });

  it('still falls back to the latest wallet transaction snapshot when needed', () => {
    const balances = (
      service as any
    ).getExpectedBalancesFromLatestTransaction({
      id: 'tx_latest',
      availableBalanceAfter: new Prisma.Decimal(70),
      pendingBalanceAfter: new Prisma.Decimal(0),
      lockedBalanceAfter: new Prisma.Decimal(0),
    }) as {
      availableBalance: Prisma.Decimal;
      pendingBalance: Prisma.Decimal;
      lockedBalance: Prisma.Decimal;
    };

    expect(balances.availableBalance.toString()).toBe('70');
    expect(balances.pendingBalance.toString()).toBe('0');
    expect(balances.lockedBalance.toString()).toBe('0');
  });
});
