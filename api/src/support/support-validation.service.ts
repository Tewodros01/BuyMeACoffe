import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InitiateSupportDto } from './dto/initiate-support.dto';

const PLATFORM_FEE_RATE = 0.05;

export type SupportInitiationContext = {
  profile: {
    id: string;
    pageTitle: string;
    coffeePrice: Prisma.Decimal;
    user: { id: string; firstName: string };
  };
  reward: {
    id: string;
    title: string;
    price: Prisma.Decimal;
    maxQuantity: number | null;
    claimedCount: number;
  } | null;
  campaign: {
    id: string;
    videoId: string;
    title: string | null;
  } | null;
  deepLink: {
    id: string;
    slug: string;
    source: string;
    campaignTag: string | null;
    videoId: string | null;
  } | null;
  poll: {
    id: string;
    question: string;
    price: Prisma.Decimal;
  } | null;
  pollOption: {
    id: string;
    text: string;
  } | null;
  coffeeCount: number;
  amount: number;
  platformFee: number;
  netAmount: number;
};

@Injectable()
export class SupportValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async prepareInitiationContext(
    slug: string,
    dto: InitiateSupportDto,
    supporterId?: string,
  ): Promise<SupportInitiationContext> {
    const profile = await this.prisma.creatorProfile.findFirst({
      where: { slug, isPublished: true, user: { deletedAt: null } },
      include: {
        user: { select: { id: true, firstName: true } },
      },
    });
    if (!profile) throw new NotFoundException('Creator not found');

    const reward = dto.rewardId
      ? await this.prisma.reward.findFirst({
          where: {
            id: dto.rewardId,
            creatorProfileId: profile.id,
            isActive: true,
          },
          select: {
            id: true,
            title: true,
            price: true,
            maxQuantity: true,
            claimedCount: true,
          },
        })
      : null;

    if (dto.rewardId && !reward) {
      throw new NotFoundException('Reward not found');
    }

    const campaign = dto.campaignId
      ? await this.prisma.tikTokCampaign.findFirst({
          where: {
            id: dto.campaignId,
            creatorProfileId: profile.id,
          },
          select: {
            id: true,
            videoId: true,
            title: true,
          },
        })
      : null;

    if (dto.campaignId && !campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const deepLink = dto.deepLinkSlug
      ? await this.prisma.deepLink.findFirst({
          where: {
            slug: dto.deepLinkSlug,
            creatorProfileId: profile.id,
          },
          select: {
            id: true,
            slug: true,
            source: true,
            campaignTag: true,
            videoId: true,
          },
        })
      : null;

    if (dto.deepLinkSlug && !deepLink) {
      throw new NotFoundException('Deep link not found');
    }

    if (dto.rewardId && dto.pollId) {
      throw new ConflictException(
        'A support cannot unlock a reward and cast a paid vote at the same time',
      );
    }

    const poll = dto.pollId
      ? await this.prisma.poll.findFirst({
          where: {
            id: dto.pollId,
            creatorProfileId: profile.id,
            isActive: true,
          },
          select: {
            id: true,
            question: true,
            price: true,
          },
        })
      : null;

    if (dto.pollId && !poll) {
      throw new NotFoundException('Poll not found');
    }

    if (
      (dto.pollId && !dto.pollOptionId) ||
      (!dto.pollId && dto.pollOptionId)
    ) {
      throw new BadRequestException(
        'Both pollId and pollOptionId are required',
      );
    }

    const pollOption = dto.pollOptionId
      ? await this.prisma.pollOption.findFirst({
          where: {
            id: dto.pollOptionId,
            pollId: dto.pollId,
          },
          select: {
            id: true,
            text: true,
          },
        })
      : null;

    if (dto.pollOptionId && !pollOption) {
      throw new NotFoundException('Poll option not found');
    }

    if ((reward || poll) && supporterId == null) {
      throw new UnauthorizedException(
        'You must be signed in to unlock rewards or cast paid votes',
      );
    }

    if (
      reward?.maxQuantity != null &&
      reward.claimedCount >= reward.maxQuantity
    ) {
      throw new ConflictException('This reward is sold out');
    }

    if (reward && supporterId) {
      const existingUnlock = await this.prisma.unlockedReward.findFirst({
        where: {
          userId: supporterId,
          rewardId: reward.id,
        },
        select: { id: true },
      });

      if (existingUnlock) {
        throw new ConflictException('You have already unlocked this reward');
      }
    }

    if (dto.isFeatureRequest && !dto.message?.trim()) {
      throw new BadRequestException(
        'A feature request must include a message for the creator',
      );
    }

    const coffeePrice = Number(profile.coffeePrice);
    const coffeeCount = reward || poll ? 1 : (dto.coffeeCount ?? 1);
    const amount = reward
      ? Number(reward.price)
      : poll
        ? Number(poll.price)
        : coffeePrice * coffeeCount;
    const platformFee = parseFloat((amount * PLATFORM_FEE_RATE).toFixed(2));
    const netAmount = parseFloat((amount - platformFee).toFixed(2));

    return {
      profile: {
        id: profile.id,
        pageTitle: profile.pageTitle,
        coffeePrice: profile.coffeePrice,
        user: profile.user,
      },
      reward,
      campaign,
      deepLink,
      poll,
      pollOption,
      coffeeCount,
      amount,
      platformFee,
      netAmount,
    };
  }
}
