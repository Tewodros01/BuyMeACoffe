import { ConflictException, Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from 'generated/prisma/client';

const SUPPORT_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['COMPLETED', 'FAILED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  FAILED: [],
  REFUNDED: [],
};

@Injectable()
export class SupportTransitionService {
  private assertTransition(
    entity: 'support' | 'payment_intent',
    current: PaymentStatus,
    next: PaymentStatus,
  ) {
    if (!SUPPORT_PAYMENT_TRANSITIONS[current]?.includes(next)) {
      throw new ConflictException(
        `Invalid ${entity} transition from ${current} to ${next}`,
      );
    }
  }

  async markPaymentFailed(
    tx: Prisma.TransactionClient,
    input: {
      supportId: string;
      paymentIntentId: string;
      txRef: string;
      failedAt: Date;
      currentSupportStatus: PaymentStatus;
      currentPaymentIntentStatus: PaymentStatus;
    },
  ) {
    this.assertTransition('support', input.currentSupportStatus, 'FAILED');
    this.assertTransition(
      'payment_intent',
      input.currentPaymentIntentStatus,
      'FAILED',
    );

    await Promise.all([
      tx.support.update({
        where: { id: input.supportId },
        data: { status: 'FAILED' },
      }),
      tx.paymentIntent.update({
        where: { supportId: input.supportId },
        data: { status: 'FAILED' },
      }),
      tx.paymentAttempt.updateMany({
        where: {
          paymentIntentId: input.paymentIntentId,
          providerRef: input.txRef,
        },
        data: { status: 'FAILED', completedAt: input.failedAt },
      }),
    ]);
  }

  async markPaymentCompleted(
    tx: Prisma.TransactionClient,
    input: {
      supportId: string;
      paymentIntentId: string;
      txRef: string;
      paidAt: Date;
      availableAt: Date;
      currentSupportStatus: PaymentStatus;
      currentPaymentIntentStatus: PaymentStatus;
    },
  ) {
    this.assertTransition('support', input.currentSupportStatus, 'COMPLETED');
    this.assertTransition(
      'payment_intent',
      input.currentPaymentIntentStatus,
      'COMPLETED',
    );

    const completion = await tx.support.updateMany({
      where: {
        id: input.supportId,
        paymentAppliedAt: null,
      },
      data: {
        status: 'COMPLETED',
        paidAt: input.paidAt,
        paymentAppliedAt: input.paidAt,
        settlementStatus: 'PENDING',
        availableAt: input.availableAt,
        walletCredited: true,
      },
    });

    if (completion.count !== 1) {
      return false;
    }

    await Promise.all([
      tx.paymentIntent.update({
        where: { supportId: input.supportId },
        data: { status: 'COMPLETED' },
      }),
      tx.paymentAttempt.updateMany({
        where: {
          paymentIntentId: input.paymentIntentId,
          providerRef: input.txRef,
        },
        data: {
          status: 'COMPLETED',
          completedAt: input.paidAt,
        },
      }),
    ]);

    return true;
  }
}
