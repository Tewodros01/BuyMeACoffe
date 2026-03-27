import { BadRequestException } from '@nestjs/common';
import { Prisma, WithdrawalMethod } from 'generated/prisma/client';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const prisma = {
    $transaction: jest.fn(),
  } as any;

  let service: WalletService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new WalletService(prisma);
  });

  it('blocks concurrent overdraft attempts when the conditional wallet update fails', async () => {
    prisma.$transaction.mockImplementation(async (handler: any) =>
      handler({
        user: {
          findUnique: jest.fn().mockResolvedValue({ isVerified: true }),
        },
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({ id: 'fa_1', isActive: true }),
        },
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      }),
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
        findUnique: jest.fn().mockResolvedValue({
          id: 'wd_1',
          userId: 'user_1',
          amount: new Prisma.Decimal(250),
          status: 'PENDING',
          adminNote: null,
          referenceId: null,
          financialAccount: { provider: 'telebirr', accountName: 'Abebe' },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'wd_1',
          status: 'REJECTED',
          amount: new Prisma.Decimal(250),
          currency: 'ETB',
          processedAt: new Date('2026-01-01T00:00:00.000Z'),
          userId: 'user_1',
        }),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          availableBalance: new Prisma.Decimal(100),
          lockedBalance: new Prisma.Decimal(250),
        }),
        update: jest.fn().mockResolvedValue({
          availableBalance: new Prisma.Decimal(350),
        }),
      },
      walletTransaction: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (handler: any) => handler(tx));

    const result = await service.updateWithdrawalStatus('admin_1', 'wd_1', {
      status: 'REJECTED',
      adminNote: 'Compliance review failed',
    });

    expect(result.status).toBe('REJECTED');
    const [walletTransactionCall] = tx.walletTransaction.create.mock.calls;
    expect(walletTransactionCall[0].data.reason).toBe('WITHDRAWAL_FAILED');
    expect(walletTransactionCall[0].data.balanceAfter.toString()).toBe('350');
  });
});
