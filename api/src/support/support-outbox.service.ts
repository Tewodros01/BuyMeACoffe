import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import type { PaymentSupport } from './support-payment.service';

export const SUPPORT_PAYMENT_COMPLETED_EVENT =
  'SUPPORT_PAYMENT_COMPLETED_PROJECTIONS';
export const SUPPORT_PAYMENT_COMPLETED_TELEGRAM_EVENT =
  'SUPPORT_PAYMENT_COMPLETED_TELEGRAM';

@Injectable()
export class SupportOutboxService {
  async enqueuePaymentCompleted(
    tx: Prisma.TransactionClient,
    support: PaymentSupport,
    input: {
      creatorUserId: string;
      rewardDelivery: {
        title: string;
        contentUrl: string | null;
        telegramLink: string | null;
        deliveryMessage: string;
      } | null;
    },
  ) {
    await Promise.all([
      tx.supportEventOutbox.upsert({
        where: {
          supportId_eventType: {
            supportId: support.id,
            eventType: SUPPORT_PAYMENT_COMPLETED_EVENT,
          },
        },
        create: {
          supportId: support.id,
          eventType: SUPPORT_PAYMENT_COMPLETED_EVENT,
          payload: {
            creatorUserId: input.creatorUserId,
            rewardDelivery: input.rewardDelivery,
          },
        },
        update: {
          payload: {
            creatorUserId: input.creatorUserId,
            rewardDelivery: input.rewardDelivery,
          },
          lastError: null,
          processedAt: null,
          processingStartedAt: null,
        },
      }),
      tx.supportEventOutbox.upsert({
        where: {
          supportId_eventType: {
            supportId: support.id,
            eventType: SUPPORT_PAYMENT_COMPLETED_TELEGRAM_EVENT,
          },
        },
        create: {
          supportId: support.id,
          eventType: SUPPORT_PAYMENT_COMPLETED_TELEGRAM_EVENT,
          payload: {
            creatorUserId: input.creatorUserId,
            supporterName: support.supporterName,
            coffeeCount: support.coffeeCount,
            amount: Number(support.amount),
            message: support.message,
          },
        },
        update: {
          payload: {
            creatorUserId: input.creatorUserId,
            supporterName: support.supporterName,
            coffeeCount: support.coffeeCount,
            amount: Number(support.amount),
            message: support.message,
          },
          lastError: null,
          processedAt: null,
          processingStartedAt: null,
        },
      }),
    ]);
  }
}
