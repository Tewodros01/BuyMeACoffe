import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletAccountingService } from '../wallet/wallet-accounting.service';
import { SupportOutboxService } from './support-outbox.service';
import { SupportPollService } from './support-poll.service';
import { SupportRewardService } from './support-reward.service';
import { SupportTransitionService } from './support-transition.service';
import { SupportWalletService } from './support-wallet.service';

const paymentSupportInclude = {
  creatorProfile: {
    select: {
      id: true,
      payoutHoldDays: true,
      user: { select: { id: true } },
    },
  },
  paymentIntent: {
    select: {
      id: true,
      status: true,
      attempts: {
        orderBy: { attemptNumber: 'desc' },
        take: 1,
        select: { id: true, providerRef: true },
      },
    },
  },
  campaign: {
    select: {
      id: true,
      videoId: true,
      title: true,
    },
  },
  deepLink: {
    select: {
      id: true,
      slug: true,
      source: true,
      campaignTag: true,
      videoId: true,
    },
  },
  poll: {
    select: {
      id: true,
      question: true,
    },
  },
  pollOption: {
    select: {
      id: true,
      text: true,
    },
  },
  reward: {
    select: {
      id: true,
      title: true,
      maxQuantity: true,
      claimedCount: true,
      contentUrl: true,
      telegramLink: true,
    },
  },
} satisfies Prisma.SupportInclude;

export type PaymentSupport = Prisma.SupportGetPayload<{
  include: typeof paymentSupportInclude;
}>;

@Injectable()
export class SupportPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportState: SupportTransitionService,
    private readonly supportWallet: SupportWalletService,
    private readonly supportReward: SupportRewardService,
    private readonly supportPoll: SupportPollService,
    private readonly supportOutbox: SupportOutboxService,
    private readonly walletAccounting: WalletAccountingService,
  ) {}

  async getSupportForPayment(txRef: string) {
    const support = await this.prisma.support.findFirst({
      where: {
        paymentIntent: {
          attempts: {
            some: { providerRef: txRef },
          },
        },
      },
      include: paymentSupportInclude,
    });

    if (!support) throw new NotFoundException('Support record not found');
    return support;
  }

  async markPaymentFailed(
    support: PaymentSupport,
    txRef: string,
    rawPayload?: Prisma.InputJsonValue,
  ) {
    if (
      support.status === 'FAILED' ||
      support.paymentIntent?.status === 'FAILED'
    ) {
      return;
    }

    const failedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.supportState.markPaymentFailed(tx, {
        supportId: support.id,
        paymentIntentId: support.paymentIntent!.id,
        txRef,
        failedAt,
        currentSupportStatus: support.status,
        currentPaymentIntentStatus: support.paymentIntent!.status,
      });

      await this.walletAccounting.recordProviderTransaction(tx, {
        paymentIntentId: support.paymentIntent!.id,
        paymentAttemptId: support.paymentIntent!.attempts[0]?.id,
        provider: 'CHAPA',
        providerRef: txRef,
        status: 'FAILED',
        eventType: 'payment_failed',
        amount: support.amount,
        currency: support.currency,
        feeAmount: support.platformFee,
        netAmount: support.netAmount,
        rawPayload,
        verifiedAt: failedAt,
      });
    });
  }

  async applyCompletedPayment(
    support: PaymentSupport,
    txRef: string,
    rawPayload?: Prisma.InputJsonValue,
  ) {
    const creatorUserId = support.creatorProfile.user.id;
    const netAmount = support.netAmount;
    const paidAt = new Date();
    const availableAt = new Date(
      paidAt.getTime() +
        support.creatorProfile.payoutHoldDays * 24 * 60 * 60 * 1000,
    );
    const rewardDelivery =
      support.rewardId != null && support.supporterId != null
        ? this.supportReward.buildRewardDeliveryPayload(support.reward)
        : null;

    const paymentApplied = await this.prisma.$transaction(async (tx) => {
      const completion = await this.supportState.markPaymentCompleted(tx, {
        supportId: support.id,
        paymentIntentId: support.paymentIntent!.id,
        txRef,
        paidAt,
        availableAt,
        currentSupportStatus: support.status,
        currentPaymentIntentStatus: support.paymentIntent!.status,
      });
      if (!completion) {
        return false;
      }

      await this.supportReward.applyRewardEntitlements(tx, support);
      await this.supportPoll.recordPaidVote(tx, support);
      await this.supportWallet.creditPendingSupport(tx, {
        creatorUserId,
        supportId: support.id,
        netAmount,
        platformFee: support.platformFee,
        currency: support.currency,
      });
      await this.walletAccounting.recordSupportCapture(tx, {
        supportId: support.id,
        paymentIntentId: support.paymentIntent!.id,
        paymentAttemptId: support.paymentIntent!.attempts[0]?.id,
        providerRef: txRef,
        creatorUserId,
        grossAmount: support.amount,
        netAmount,
        platformFee: support.platformFee,
        currency: support.currency,
        rawPayload,
        verifiedAt: paidAt,
      });
      await this.supportOutbox.enqueuePaymentCompleted(tx, support, {
        creatorUserId,
        rewardDelivery,
      });

      return true;
    });

    return {
      paymentApplied,
      creatorUserId,
      rewardDelivery,
    };
  }
}
