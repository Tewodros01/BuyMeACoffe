import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma/client';
import { SupportService } from './support.service';

describe('SupportService', () => {
  const prisma = {
    support: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    wallet: { update: jest.fn() },
    walletTransaction: { create: jest.fn() },
    notification: { create: jest.fn() },
    creatorProfile: { update: jest.fn() },
    webhookEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const chapa = {
    generateTxRef: jest.fn(),
    initializePayment: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    verifyPayment: jest.fn(),
  } as any;

  const telegram = {
    notifyCreatorOfSupport: jest.fn().mockResolvedValue(undefined),
  } as any;

  let service: SupportService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SupportService(
      prisma,
      chapa,
      telegram,
      {
        get: jest.fn((key: string) => {
          if (key === 'apiUrl') return 'http://localhost:3000';
          if (key === 'frontendUrl') return 'http://localhost:5173';
          return undefined;
        }),
      } as unknown as ConfigService,
    );
  });

  it('rejects verified payments whose amount does not match the original support', async () => {
    prisma.support.findUnique.mockResolvedValue({
      id: 'support_1',
      creatorProfileId: 'creator_profile_1',
      creatorProfile: { user: { id: 'creator_1' } },
      amount: new Prisma.Decimal(150),
      netAmount: new Prisma.Decimal(142.5),
      currency: 'ETB',
      status: 'PENDING',
      walletCredited: false,
      supporterId: null,
      supporterEmail: 'fan@example.com',
      supporterName: 'Fan',
      coffeeCount: 3,
      message: 'Love your work',
    });
    chapa.verifyPayment.mockResolvedValue({
      data: {
        status: 'success',
        amount: 149,
        currency: 'ETB',
        tx_ref: 'tx_1',
      },
    });

    await expect(service.verifyAndComplete('tx_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('treats concurrent completion as already completed instead of double-crediting', async () => {
    prisma.support.findUnique
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({
        id: 'support_1',
        creatorProfileId: 'creator_profile_1',
        creatorProfile: { user: { id: 'creator_1' } },
        amount: new Prisma.Decimal(150),
        netAmount: new Prisma.Decimal(142.5),
        currency: 'ETB',
        status: 'PENDING',
        walletCredited: false,
        supporterId: 'supporter_1',
        supporterEmail: 'fan@example.com',
        supporterName: 'Fan',
        coffeeCount: 3,
        message: 'Love your work',
      });
    chapa.verifyPayment.mockResolvedValue({
      data: {
        status: 'success',
        amount: 150,
        currency: 'ETB',
        tx_ref: 'tx_1',
      },
    });
    prisma.$transaction.mockResolvedValue(false);

    const result = await service.verifyAndComplete('tx_1');

    expect(result).toEqual({ status: 'already_completed' });
    expect(telegram.notifyCreatorOfSupport).not.toHaveBeenCalled();
  });
});
