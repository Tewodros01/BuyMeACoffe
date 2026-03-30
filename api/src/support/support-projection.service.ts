import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class SupportProjectionService {
  async applyPaymentCompletedProjection(
    tx: Prisma.TransactionClient,
    input: {
      supportId: string;
      rewardDelivery: {
        deliveryMessage: string;
      } | null;
    },
  ) {
    const support = await tx.support.findUnique({
      where: { id: input.supportId },
      include: {
        creatorProfile: {
          select: {
            id: true,
            user: { select: { id: true } },
          },
        },
        reward: {
          select: {
            id: true,
            title: true,
          },
        },
        poll: {
          select: {
            id: true,
            question: true,
          },
        },
      },
    });

    if (!support) {
      return;
    }

    const supporterIdentityFilter =
      support.supporterId != null
        ? { supporterId: support.supporterId }
        : support.supporterEmail
          ? { supporterEmail: support.supporterEmail }
          : {
              supporterName: support.supporterName,
            };

    const [completedSupports, previousCompletedSupport] = await Promise.all([
      tx.support.count({
        where: {
          creatorProfileId: support.creatorProfileId,
          status: 'COMPLETED',
        },
      }),
      tx.support.count({
        where: {
          creatorProfileId: support.creatorProfileId,
          status: 'COMPLETED',
          id: { not: support.id },
          ...supporterIdentityFilter,
        },
      }),
    ]);

    await tx.creatorProfile.update({
      where: { id: support.creatorProfileId },
      data: {
        totalSupports: completedSupports,
        totalSupporters:
          previousCompletedSupport === 0 ? { increment: 1 } : undefined,
      },
    });

    if (support.campaignId) {
      await tx.tikTokCampaign.update({
        where: { id: support.campaignId },
        data: {
          revenue: { increment: support.amount },
          conversions: { increment: 1 },
        },
      });
    }

    if (support.deepLinkId) {
      await tx.deepLink.update({
        where: { id: support.deepLinkId },
        data: {
          conversions: { increment: 1 },
          revenue: { increment: support.amount },
        },
      });
    }

    if (support.isFeatureRequest) {
      await tx.featureRequest.upsert({
        where: { supportId: support.id },
        create: {
          supportId: support.id,
          creatorProfileId: support.creatorProfileId,
          message: support.message,
        },
        update: {
          message: support.message,
        },
      });
    }

    await tx.notification.create({
      data: {
        userId: support.creatorProfile.user.id,
        type: 'SUPPORT_RECEIVED',
        title: support.reward
          ? `${support.supporterName} unlocked "${support.reward.title}"!`
          : support.poll
            ? `${support.supporterName} voted in "${support.poll.question}"!`
            : support.isFeatureRequest
              ? `${support.supporterName} sent a feature request!`
              : `${support.supporterName} bought you ${support.coffeeCount} coffee${support.coffeeCount > 1 ? 's' : ''}! ☕`,
        body:
          support.message ??
          `ETB ${Number(support.amount).toFixed(2)} received`,
        referenceId: support.id,
      },
    });

    if (support.rewardId && support.supporterId) {
      await tx.notification.create({
        data: {
          userId: support.supporterId,
          type: 'REWARD_UNLOCKED',
          title: `Reward unlocked: ${support.reward?.title ?? 'Reward'}`,
          body:
            input.rewardDelivery?.deliveryMessage ??
            'Your reward is now available in your account.',
          referenceId: support.rewardId,
        },
      });
    }

    if (support.supporterId && support.rewardId) {
      await this.ensureFanBadge(
        tx,
        support.supporterId,
        support.creatorProfileId,
        'VIP',
      );
    }

    if (support.supporterId && previousCompletedSupport + 1 >= 3) {
      await this.ensureFanBadge(
        tx,
        support.supporterId,
        support.creatorProfileId,
        'TOP_FAN',
      );
    }
  }

  private async ensureFanBadge(
    tx: Prisma.TransactionClient,
    userId: string,
    creatorProfileId: string,
    badge: 'VIP' | 'TOP_FAN',
  ) {
    const existingBadge = await tx.fanBadge.findFirst({
      where: {
        userId,
        creatorProfileId,
        badge,
      },
      select: { id: true },
    });

    if (!existingBadge) {
      await tx.fanBadge.create({
        data: {
          userId,
          creatorProfileId,
          badge,
        },
      });
    }
  }
}
