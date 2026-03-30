import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma/client';
import { SupportService } from './support.service';

describe('SupportService', () => {
  const prisma = {
    support: {
      findFirst: jest.fn(),
    },
    webhookEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const chapa = {
    generateTxRef: jest.fn(),
    initializePayment: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    verifyPayment: jest.fn(),
  } as any;

  const supportValidation = {
    prepareInitiationContext: jest.fn(),
  } as any;

  const supportPayment = {
    getSupportForPayment: jest.fn(),
    markPaymentFailed: jest.fn(),
    applyCompletedPayment: jest.fn(),
  } as any;

  let service: SupportService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SupportService(
      prisma,
      chapa,
      {
        get: jest.fn((key: string) => {
          if (key === 'apiUrl') return 'http://localhost:3000';
          if (key === 'frontendUrl') return 'http://localhost:5173';
          return undefined;
        }),
      } as unknown as ConfigService,
      supportValidation,
      supportPayment,
    );
  });

  it('rejects verified payments whose amount does not match the original support', async () => {
    prisma.support.findFirst.mockResolvedValue({ status: 'PENDING' });
    supportPayment.getSupportForPayment.mockResolvedValue({
      id: 'support_1',
      creatorProfileId: 'creator_profile_1',
      creatorProfile: { payoutHoldDays: 3, user: { id: 'creator_1' } },
      paymentIntent: { id: 'pi_1' },
      amount: new Prisma.Decimal(150),
      netAmount: new Prisma.Decimal(142.5),
      currency: 'ETB',
      status: 'PENDING',
      paymentAppliedAt: null,
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
    prisma.support.findFirst.mockResolvedValue({ status: 'PENDING' });
    supportPayment.getSupportForPayment.mockResolvedValue({
      id: 'support_1',
      creatorProfileId: 'creator_profile_1',
      creatorProfile: { payoutHoldDays: 3, user: { id: 'creator_1' } },
      paymentIntent: { id: 'pi_1' },
      amount: new Prisma.Decimal(150),
      netAmount: new Prisma.Decimal(142.5),
      currency: 'ETB',
      status: 'PENDING',
      paymentAppliedAt: null,
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
    supportPayment.applyCompletedPayment.mockResolvedValue({
      paymentApplied: false,
      creatorUserId: 'creator_1',
      rewardDelivery: null,
    });

    const result = await service.verifyAndComplete('tx_1');

    expect(result).toEqual({ status: 'already_completed' });
    expect(supportPayment.applyCompletedPayment).toHaveBeenCalled();
  });

  it('treats supports with paymentAppliedAt set as already completed', async () => {
    prisma.support.findFirst.mockResolvedValue({ status: 'PENDING' });
    supportPayment.getSupportForPayment.mockResolvedValue({
      id: 'support_1',
      creatorProfileId: 'creator_profile_1',
      creatorProfile: { payoutHoldDays: 3, user: { id: 'creator_1' } },
      paymentIntent: { id: 'pi_1' },
      amount: new Prisma.Decimal(150),
      netAmount: new Prisma.Decimal(142.5),
      currency: 'ETB',
      status: 'COMPLETED',
      paymentAppliedAt: new Date('2026-03-01T10:00:00.000Z'),
      walletCredited: false,
      supporterId: 'supporter_1',
      supporterEmail: 'fan@example.com',
      supporterName: 'Fan',
      coffeeCount: 3,
      message: 'Love your work',
    });

    const result = await service.verifyAndComplete('tx_1');

    expect(result).toEqual({ status: 'already_completed' });
    expect(chapa.verifyPayment).not.toHaveBeenCalled();
    expect(supportPayment.applyCompletedPayment).not.toHaveBeenCalled();
  });

  it('treats already failed supports as failed without replaying the transition', async () => {
    prisma.support.findFirst.mockResolvedValue({ status: 'FAILED' });
    supportPayment.getSupportForPayment.mockResolvedValue({
      id: 'support_1',
      creatorProfileId: 'creator_profile_1',
      creatorProfile: { payoutHoldDays: 3, user: { id: 'creator_1' } },
      paymentIntent: { id: 'pi_1', status: 'FAILED' },
      amount: new Prisma.Decimal(150),
      netAmount: new Prisma.Decimal(142.5),
      currency: 'ETB',
      status: 'FAILED',
      paymentAppliedAt: null,
      walletCredited: false,
      supporterId: null,
      supporterEmail: 'fan@example.com',
      supporterName: 'Fan',
      coffeeCount: 3,
      message: 'Love your work',
    });

    const result = await service.verifyAndComplete('tx_1');

    expect(result).toEqual({
      status: 'failed',
      message:
        'This payment was already marked as failed. In test mode, use one of Chapa’s approved sandbox numbers for the selected payment method.',
    });
    expect(chapa.verifyPayment).not.toHaveBeenCalled();
    expect(supportPayment.markPaymentFailed).not.toHaveBeenCalled();
  });
});
