import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import type { PaymentSupport } from './support-payment.service';

@Injectable()
export class SupportRewardService {
  async applyRewardEntitlements(
    tx: Prisma.TransactionClient,
    support: PaymentSupport,
  ) {
    if (!support.rewardId) {
      return;
    }

    if (!support.supporterId) {
      throw new ConflictException(
        'Authenticated supporter is required to unlock a reward',
      );
    }

    const rewardClaimCount = await tx.$executeRaw(Prisma.sql`
      UPDATE "rewards"
      SET "claimedCount" = "claimedCount" + 1
      WHERE "id" = ${support.rewardId}
        AND "isActive" = true
        AND (
          "maxQuantity" IS NULL
          OR "claimedCount" < "maxQuantity"
        )
    `);

    if (rewardClaimCount !== 1) {
      throw new ConflictException('This reward is no longer available');
    }

    await tx.unlockedReward.create({
      data: {
        userId: support.supporterId,
        rewardId: support.rewardId,
        supportId: support.id,
      },
    });

    const authoritativeClaimCount = await tx.unlockedReward.count({
      where: { rewardId: support.rewardId },
    });

    await tx.reward.update({
      where: { id: support.rewardId },
      data: { claimedCount: authoritativeClaimCount },
    });
  }

  buildRewardDeliveryPayload(
    reward: {
      contentUrl: string | null;
      telegramLink: string | null;
      title: string;
    } | null,
  ) {
    if (!reward) {
      return null;
    }

    return {
      title: reward.title,
      contentUrl: reward.contentUrl,
      telegramLink: reward.telegramLink,
      deliveryMessage: reward.contentUrl
        ? 'Your content is ready to view now.'
        : reward.telegramLink
          ? 'Your Telegram access is ready now.'
          : 'The creator has been notified to deliver your reward.',
    };
  }
}
