import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';

type PostingEntryInput = {
  walletId?: string;
  accountCode:
    | 'PROCESSOR_CLEARING'
    | 'CREATOR_PENDING'
    | 'CREATOR_AVAILABLE'
    | 'CREATOR_LOCKED'
    | 'PLATFORM_REVENUE'
    | 'WITHDRAWAL_CLEARING';
  direction: 'DEBIT' | 'CREDIT';
  amount: Prisma.Decimal;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class WalletAccountingService {
  async recordProviderTransaction(
    tx: Prisma.TransactionClient,
    input: {
      paymentIntentId: string;
      paymentAttemptId?: string;
      provider: 'CHAPA';
      providerRef: string;
      status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'MISMATCHED';
      eventType: string;
      amount: Prisma.Decimal;
      currency: string;
      feeAmount?: Prisma.Decimal;
      netAmount?: Prisma.Decimal;
      rawPayload?: Prisma.InputJsonValue;
      verifiedAt?: Date;
    },
  ) {
    return tx.paymentProviderTransaction.upsert({
      where: {
        provider_providerRef: {
          provider: input.provider,
          providerRef: input.providerRef,
        },
      },
      create: {
        paymentIntentId: input.paymentIntentId,
        paymentAttemptId: input.paymentAttemptId,
        provider: input.provider,
        providerRef: input.providerRef,
        status: input.status,
        eventType: input.eventType,
        amount: input.amount,
        currency: input.currency,
        feeAmount: input.feeAmount ?? new Prisma.Decimal(0),
        netAmount: input.netAmount,
        rawPayload: input.rawPayload,
        verifiedAt: input.verifiedAt,
      },
      update: {
        paymentIntentId: input.paymentIntentId,
        paymentAttemptId: input.paymentAttemptId,
        status: input.status,
        eventType: input.eventType,
        amount: input.amount,
        currency: input.currency,
        feeAmount: input.feeAmount ?? new Prisma.Decimal(0),
        netAmount: input.netAmount,
        rawPayload: input.rawPayload,
        verifiedAt: input.verifiedAt,
      },
    });
  }

  async recordSupportCapture(
    tx: Prisma.TransactionClient,
    input: {
      supportId: string;
      paymentIntentId: string;
      paymentAttemptId?: string;
      providerRef: string;
      creatorUserId: string;
      grossAmount: Prisma.Decimal;
      netAmount: Prisma.Decimal;
      platformFee: Prisma.Decimal;
      currency: string;
      rawPayload?: Prisma.InputJsonValue;
      verifiedAt?: Date;
    },
  ) {
    const wallet = await this.getWallet(tx, input.creatorUserId);
    const providerTransaction = await this.recordProviderTransaction(tx, {
      paymentIntentId: input.paymentIntentId,
      paymentAttemptId: input.paymentAttemptId,
      provider: 'CHAPA',
      providerRef: input.providerRef,
      status: 'SUCCESS',
      eventType: 'payment_verified',
      amount: input.grossAmount,
      currency: input.currency,
      feeAmount: input.platformFee,
      netAmount: input.netAmount,
      rawPayload: input.rawPayload,
      verifiedAt: input.verifiedAt,
    });

    await this.createPostingBatch(tx, {
      batchType: 'SUPPORT_CAPTURE',
      currency: input.currency,
      description: 'Capture successful support payment',
      idempotencyKey: `support-capture:${input.supportId}`,
      supportId: input.supportId,
      providerTransactionId: providerTransaction.id,
      entries: [
        {
          accountCode: 'PROCESSOR_CLEARING',
          direction: 'DEBIT',
          amount: input.grossAmount,
          metadata: {
            supportId: input.supportId,
            providerRef: input.providerRef,
          },
        },
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_PENDING',
          direction: 'CREDIT',
          amount: input.netAmount,
          metadata: { supportId: input.supportId },
        },
        {
          accountCode: 'PLATFORM_REVENUE',
          direction: 'CREDIT',
          amount: input.platformFee,
          metadata: { supportId: input.supportId },
        },
      ],
    });
  }

  async recordSupportSettlement(
    tx: Prisma.TransactionClient,
    input: {
      supportId: string;
      creatorUserId: string;
      amount: Prisma.Decimal;
      currency: string;
    },
  ) {
    const wallet = await this.getWallet(tx, input.creatorUserId);
    await this.createPostingBatch(tx, {
      batchType: 'SUPPORT_SETTLEMENT',
      currency: input.currency,
      description: 'Release matured support from pending to available',
      idempotencyKey: `support-settlement:${input.supportId}`,
      supportId: input.supportId,
      entries: [
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_PENDING',
          direction: 'DEBIT',
          amount: input.amount,
          metadata: { supportId: input.supportId },
        },
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_AVAILABLE',
          direction: 'CREDIT',
          amount: input.amount,
          metadata: { supportId: input.supportId },
        },
      ],
    });
  }

  async recordWithdrawalReserve(
    tx: Prisma.TransactionClient,
    input: {
      withdrawalId: string;
      userId: string;
      amount: Prisma.Decimal;
      currency: string;
    },
  ) {
    const wallet = await this.getWallet(tx, input.userId);
    await this.createPostingBatch(tx, {
      batchType: 'WITHDRAWAL_RESERVE',
      currency: input.currency,
      description: 'Reserve creator funds for withdrawal',
      idempotencyKey: `withdrawal-reserve:${input.withdrawalId}`,
      withdrawalId: input.withdrawalId,
      entries: [
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_AVAILABLE',
          direction: 'DEBIT',
          amount: input.amount,
          metadata: { withdrawalId: input.withdrawalId },
        },
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_LOCKED',
          direction: 'CREDIT',
          amount: input.amount,
          metadata: { withdrawalId: input.withdrawalId },
        },
      ],
    });
  }

  async recordWithdrawalPayout(
    tx: Prisma.TransactionClient,
    input: {
      withdrawalId: string;
      userId: string;
      amount: Prisma.Decimal;
      currency: string;
    },
  ) {
    const wallet = await this.getWallet(tx, input.userId);
    await this.createPostingBatch(tx, {
      batchType: 'WITHDRAWAL_PAYOUT',
      currency: input.currency,
      description: 'Complete creator withdrawal payout',
      idempotencyKey: `withdrawal-payout:${input.withdrawalId}`,
      withdrawalId: input.withdrawalId,
      entries: [
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_LOCKED',
          direction: 'DEBIT',
          amount: input.amount,
          metadata: { withdrawalId: input.withdrawalId },
        },
        {
          accountCode: 'WITHDRAWAL_CLEARING',
          direction: 'CREDIT',
          amount: input.amount,
          metadata: { withdrawalId: input.withdrawalId },
        },
      ],
    });
  }

  async recordWithdrawalRelease(
    tx: Prisma.TransactionClient,
    input: {
      withdrawalId: string;
      userId: string;
      amount: Prisma.Decimal;
      currency: string;
    },
  ) {
    const wallet = await this.getWallet(tx, input.userId);
    await this.createPostingBatch(tx, {
      batchType: 'WITHDRAWAL_RELEASE',
      currency: input.currency,
      description: 'Release reserved withdrawal funds back to creator',
      idempotencyKey: `withdrawal-release:${input.withdrawalId}`,
      withdrawalId: input.withdrawalId,
      entries: [
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_LOCKED',
          direction: 'DEBIT',
          amount: input.amount,
          metadata: { withdrawalId: input.withdrawalId },
        },
        {
          walletId: wallet.id,
          accountCode: 'CREATOR_AVAILABLE',
          direction: 'CREDIT',
          amount: input.amount,
          metadata: { withdrawalId: input.withdrawalId },
        },
      ],
    });
  }

  private async createPostingBatch(
    tx: Prisma.TransactionClient,
    input: {
      batchType:
        | 'SUPPORT_CAPTURE'
        | 'SUPPORT_SETTLEMENT'
        | 'WITHDRAWAL_RESERVE'
        | 'WITHDRAWAL_PAYOUT'
        | 'WITHDRAWAL_RELEASE';
      currency: string;
      description: string;
      idempotencyKey: string;
      supportId?: string;
      withdrawalId?: string;
      providerTransactionId?: string;
      entries: PostingEntryInput[];
    },
  ) {
    const totals = input.entries.reduce(
      (acc, entry) => {
        if (entry.direction === 'DEBIT') {
          acc.debits = acc.debits.plus(entry.amount);
        } else {
          acc.credits = acc.credits.plus(entry.amount);
        }
        return acc;
      },
      {
        debits: new Prisma.Decimal(0),
        credits: new Prisma.Decimal(0),
      },
    );

    if (!totals.debits.equals(totals.credits)) {
      throw new Error(
        `Accounting posting ${input.idempotencyKey} is not balanced`,
      );
    }

    try {
      await tx.accountingPostingBatch.create({
        data: {
          batchType: input.batchType,
          currency: input.currency,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          supportId: input.supportId,
          withdrawalId: input.withdrawalId,
          providerTransactionId: input.providerTransactionId,
          entries: {
            create: input.entries.map((entry) => ({
              walletId: entry.walletId,
              accountCode: entry.accountCode,
              direction: entry.direction,
              amount: entry.amount,
              currency: input.currency,
              metadata: entry.metadata,
            })),
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await tx.accountingPostingBatch.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });

        if (existing) {
          return;
        }
      }

      throw error;
    }
  }

  private async getWallet(tx: Prisma.TransactionClient, userId: string) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found for accounting posting');
    }

    return wallet;
  }
}
