import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class SupportStateService {
  async markPaymentFailed(
    tx: Prisma.TransactionClient,
    input: {
      supportId: string;
      paymentIntentId: string;
      txRef: string;
      failedAt: Date;
    },
  ) {
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
    },
  ) {
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
