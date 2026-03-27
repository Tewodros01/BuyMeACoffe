import { BadRequestException } from '@nestjs/common';
import { FinancialAccountType } from 'generated/prisma/client';
import { encryptFinancialAccountNumber } from '../common/utils/encryption.util';
import { FinancialAccountService } from './financial-account.service';

describe('FinancialAccountService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    financialAccount: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  let service: FinancialAccountService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new FinancialAccountService(prisma);
  });

  it('encrypts payout account numbers at rest and only returns a masked value', async () => {
    prisma.user.findUnique.mockResolvedValue({ isVerified: true });
    prisma.financialAccount.count.mockResolvedValue(0);
    const createSpy = jest.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'fa_1',
        type: data.type,
        provider: data.provider,
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        label: data.label ?? null,
        isDefault: data.isDefault,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    prisma.$transaction.mockImplementation(async (handler: any) =>
      handler({
        financialAccount: {
          create: createSpy,
          updateMany: jest.fn(),
        },
      }),
    );

    const result = await service.create('user_1', {
      type: FinancialAccountType.MOBILE_MONEY,
      provider: 'telebirr',
      accountName: 'Abebe Bikila',
      accountNumber: '0911 234 567',
      label: 'Primary',
      isDefault: true,
    });

    expect(result.accountNumber).toBe('******4567');
    expect(createSpy.mock.calls[0][0].data.accountNumber).not.toBe('0911234567');
  });

  it('rejects payout account creation for unverified users', async () => {
    prisma.user.findUnique.mockResolvedValue({ isVerified: false });

    await expect(
      service.create('user_1', {
        type: FinancialAccountType.BANK_ACCOUNT,
        provider: 'cbe',
        accountName: 'Abebe Bikila',
        accountNumber: '1000123456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('masks encrypted account numbers when listing accounts', async () => {
    prisma.financialAccount.findMany.mockResolvedValue([
      {
        id: 'fa_1',
        type: FinancialAccountType.BANK_ACCOUNT,
        provider: 'cbe',
        accountName: 'Abebe Bikila',
        accountNumber: encryptFinancialAccountNumber('1000123456'),
        label: 'Main',
        isDefault: true,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.list('user_1');

    expect(result[0].accountNumber).toBe('******3456');
  });
});
