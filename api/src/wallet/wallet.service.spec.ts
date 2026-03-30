import { BadRequestException } from '@nestjs/common';
import { Prisma, WithdrawalMethod } from 'generated/prisma/client';
import { WalletAccountingService } from './wallet-accounting.service';
import { WalletBalanceService } from './wallet-balance.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { WalletService } from './wallet.service';
import { WithdrawalTransitionService } from './withdrawal-transition.service';

describe('WalletService', () => {
  const prisma = {
    $transaction: jest.fn(),
  } as any;
  const walletLedger = {
    getWalletBalanceSnapshot: jest.fn(),
    createWalletTransaction: jest.fn(),
  } as any as WalletLedgerService;
  const walletAccounting = {
    recordWithdrawalReserve: jest.fn(),
    recordWithdrawalPayout: jest.fn(),
    recordWithdrawalRelease: jest.fn(),
  } as any as WalletAccountingService;
  const walletBalance = {
    reserveWithdrawalFunds: jest.fn(),
    completeWithdrawal: jest.fn(),
    rejectWithdrawal: jest.fn(),
  } as any as WalletBalanceService;
  const walletReconciliation = {
    getReconciliationReport: jest.fn(),
    reconcileWallets: jest.fn(),
  } as any as WalletReconciliationService;
  const withdrawalTransition = {
    assertTransition: jest.fn(),
    moveToProcessing: jest.fn(),
    finalize: jest.fn(),
  } as any as WithdrawalTransitionService;

  let service: WalletService;

  beforeEach(() => {
    jest.resetAllMocks();
    walletLedger.getWalletBalanceSnapshot = jest.fn();
    walletLedger.createWalletTransaction = jest.fn();
    walletAccounting.recordWithdrawalReserve = jest.fn();
    walletAccounting.recordWithdrawalPayout = jest.fn();
    walletAccounting.recordWithdrawalRelease = jest.fn();
    walletBalance.reserveWithdrawalFunds = jest.fn();
    walletBalance.completeWithdrawal = jest.fn();
    walletBalance.rejectWithdrawal = jest.fn();
    withdrawalTransition.assertTransition = jest.fn();
    withdrawalTransition.moveToProcessing = jest.fn();
    withdrawalTransition.finalize = jest.fn();

    service = new WalletService(
      prisma,
      walletAccounting,
      walletLedger,
      walletBalance,
      walletReconciliation,
      withdrawalTransition,
    );
  });

  it('blocks concurrent overdraft attempts when the balance guard rejects the reservation', async () => {
    prisma.$transaction.mockImplementation(async (handler: any) =>
      handler({
        user: {
          findUnique: jest.fn().mockResolvedValue({ isVerified: true }),
        },
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({ id: 'fa_1', isActive: true }),
        },
      }),
    );
    walletBalance.reserveWithdrawalFunds = jest
      .fn()
      .mockRejectedValue(
        new BadRequestException(
          'Insufficient available balance or wallet is inactive',
        ),
      );

    await expect(
      service.requestWithdrawal('user_1', {
        amount: 500,
        method: WithdrawalMethod.TELEBIRR,
        financialAccountId: 'fa_1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns rejected withdrawal funds to available balance through an admin reversal', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin_1' }),
      },
      withdrawal: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'wd_1',
            userId: 'user_1',
            amount: new Prisma.Decimal(250),
            status: 'PROCESSING',
            adminNote: null,
            referenceId: null,
            processingStartedAt: new Date('2026-01-01T00:00:00.000Z'),
            processedAt: null,
            financialAccount: { provider: 'telebirr', accountName: 'Abebe' },
          })
          .mockResolvedValueOnce({
            id: 'wd_1',
            status: 'REJECTED',
            amount: new Prisma.Decimal(250),
            currency: 'ETB',
            processedAt: new Date('2026-01-01T00:00:00.000Z'),
            userId: 'user_1',
          }),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({
          actorId: 'admin_2',
          after: { status: 'PROCESSING' },
        }),
        create: jest.fn(),
      },
      notification: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (handler: any) => handler(tx));
    walletBalance.rejectWithdrawal = jest.fn().mockResolvedValue({
      availableBalance: new Prisma.Decimal(350),
      pendingBalance: new Prisma.Decimal(0),
      lockedBalance: new Prisma.Decimal(0),
    });
    withdrawalTransition.finalize = jest.fn().mockResolvedValue({ count: 1 });

    const result = await service.updateWithdrawalStatus('admin_1', 'wd_1', {
      status: 'REJECTED',
      adminNote: 'Compliance review failed',
    });

    expect(result.status).toBe('REJECTED');
    const [walletTransactionCall] = walletLedger.createWalletTransaction.mock
      .calls;
    expect(walletTransactionCall[1].reason).toBe('WITHDRAWAL_FAILED');
    expect(walletTransactionCall[1].balances.availableBalance.toString()).toBe(
      '350',
    );
    expect(walletAccounting.recordWithdrawalRelease).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        withdrawalId: 'wd_1',
        userId: 'user_1',
      }),
    );
  });

  it('blocks finalizing a withdrawal that was already processed by another actor', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin_1' }),
      },
      withdrawal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wd_1',
          userId: 'user_1',
          amount: new Prisma.Decimal(250),
          status: 'PROCESSING',
          adminNote: null,
          referenceId: null,
          processingStartedAt: new Date('2026-01-01T00:00:00.000Z'),
          processedAt: null,
          financialAccount: { provider: 'telebirr', accountName: 'Abebe' },
        }),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({
          actorId: 'admin_2',
          after: { status: 'PROCESSING' },
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (handler: any) => handler(tx));
    withdrawalTransition.finalize = jest.fn().mockResolvedValue({ count: 0 });

    await expect(
      service.updateWithdrawalStatus('admin_1', 'wd_1', {
        status: 'COMPLETED',
      }),
    ).rejects.toThrow('Withdrawal has already been finalized');

    expect(walletLedger.createWalletTransaction).not.toHaveBeenCalled();
    expect(walletAccounting.recordWithdrawalPayout).not.toHaveBeenCalled();
  });
});
