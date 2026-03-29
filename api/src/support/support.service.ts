import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma/client';
import { ChapaService } from '../chapa/chapa.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { InitiateSupportDto } from './dto/initiate-support.dto';

const PLATFORM_FEE_RATE = 0.05;

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  async initiate(slug: string, dto: InitiateSupportDto, supporterId?: string) {
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

    if ((dto.pollId && !dto.pollOptionId) || (!dto.pollId && dto.pollOptionId)) {
      throw new BadRequestException('Both pollId and pollOptionId are required');
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
    const coffeeCount = reward || poll ? 1 : dto.coffeeCount ?? 1;
    const amount = reward
      ? Number(reward.price)
      : poll
        ? Number(poll.price)
        : coffeePrice * coffeeCount;
    const platformFee = parseFloat((amount * PLATFORM_FEE_RATE).toFixed(2));
    const netAmount = parseFloat((amount - platformFee).toFixed(2));

    const txRef = this.chapa.generateTxRef('bmac');
    const apiUrl = this.config.get<string>('apiUrl') ?? 'http://localhost:3000';
    const frontendUrl =
      this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';

    const [firstName, ...rest] = dto.supporterName.trim().split(' ');
    const lastName = rest.join(' ') || 'Supporter';

    const chapaRes = await this.chapa.initializePayment({
      amount,
      currency: 'ETB',
      email: dto.supporterEmail ?? `${txRef}@guest.bmac.et`,
      first_name: firstName,
      last_name: lastName,
      tx_ref: txRef,
      callback_url: `${apiUrl}/api/v1/supports/webhook`,
      return_url: `${frontendUrl}/payment/success?ref=${txRef}`,
      customization: {
        title: profile.pageTitle,
        description: reward
          ? `Unlock "${reward.title}" from ${profile.user.firstName}`
          : poll
            ? `Vote on "${poll.question}" for ${profile.user.firstName}`
            : dto.isFeatureRequest
              ? `Send a feature request to ${profile.user.firstName}`
              : `${coffeeCount} coffee${coffeeCount > 1 ? 's' : ''} for ${profile.user.firstName}`,
      },
    });

    await this.prisma.support.create({
      data: {
        creatorProfileId: profile.id,
        rewardId: reward?.id,
        campaignId: campaign?.id,
        pollId: poll?.id,
        pollOptionId: pollOption?.id,
        supporterId: supporterId ?? null,
        supporterName: dto.supporterName,
        supporterEmail: dto.supporterEmail,
        message: dto.message,
        isFeatureRequest: dto.isFeatureRequest ?? false,
        coffeeCount,
        amount: new Prisma.Decimal(amount),
        platformFee: new Prisma.Decimal(platformFee),
        netAmount: new Prisma.Decimal(netAmount),
        chapaRef: txRef,
        chapaCheckoutUrl: chapaRes.data.checkout_url,
        status: 'PENDING',
      },
    });

    return {
      checkoutUrl: chapaRes.data.checkout_url,
      txRef,
      amount,
      platformFee,
      netAmount,
      currency: 'ETB',
    };
  }

  async handleWebhook(rawBody: string, signature: string) {
    if (!this.chapa.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let payload: { trx_ref?: string; tx_ref?: string; status?: string };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    const txRef = payload.trx_ref ?? payload.tx_ref;
    if (!txRef) throw new BadRequestException('Missing tx_ref');

    // Idempotency: reject duplicate webhook events
    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: 'CHAPA',
          externalId: txRef,
          eventType: payload.status ?? 'unknown',
          payload: payload as object,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingEvent = await this.prisma.webhookEvent.findUnique({
          where: { externalId: txRef },
          select: { processedAt: true },
        });
        if (existingEvent?.processedAt) {
          this.logger.warn(`Duplicate webhook for txRef: ${txRef}`);
          return { status: 'already_processed' };
        }
      }
      throw error;
    }

    try {
      const result = await this.processPayment(txRef);

      await this.prisma.webhookEvent.update({
        where: { externalId: txRef },
        data: { processedAt: new Date(), error: null },
      });

      return result;
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { externalId: txRef },
        data: {
          error:
            error instanceof Error ? error.message : 'Unknown webhook error',
        },
      });
      throw error;
    }
  }

  async verifyAndComplete(txRef: string) {
    const support = await this.prisma.support.findUnique({
      where: { chapaRef: txRef },
      select: { status: true },
    });
    if (!support) throw new NotFoundException('Support record not found');
    if (support.status === 'COMPLETED') return { status: 'completed' };
    return this.processPayment(txRef);
  }

  private async processPayment(txRef: string) {
    const support = await this.prisma.support.findUnique({
      where: { chapaRef: txRef },
      include: {
        creatorProfile: {
          select: { id: true, user: { select: { id: true } } },
        },
        campaign: {
          select: {
            id: true,
            videoId: true,
            title: true,
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
      },
    });

    if (!support) throw new NotFoundException('Support record not found');
    if (support.status === 'COMPLETED' && support.walletCredited) {
      return { status: 'already_completed' };
    }

    const verification = await this.chapa.verifyPayment(txRef);
    const verifiedAmount = new Prisma.Decimal(verification.data.amount);

    if (
      verification.data.status !== 'success' ||
      verification.data.tx_ref !== txRef
    ) {
      await this.prisma.support.update({
        where: { chapaRef: txRef },
        data: { status: 'FAILED' },
      });
      return { status: 'failed' };
    }

    if (
      verification.data.currency !== support.currency ||
      !verifiedAmount.equals(support.amount)
    ) {
      throw new ConflictException(
        'Verified payment details do not match the support request',
      );
    }

    const creatorUserId = support.creatorProfile.user.id;
    const netAmount = support.netAmount;
    const rewardDelivery =
      support.rewardId != null && support.supporterId != null
        ? this.buildRewardDeliveryPayload(support.reward)
        : null;

    const paymentApplied = await this.prisma.$transaction(async (tx) => {
      if (support.rewardId && support.supporterId) {
        const unlockExists = await tx.unlockedReward.findFirst({
          where: {
            userId: support.supporterId,
            rewardId: support.rewardId,
          },
          select: { id: true },
        });

        if (unlockExists) {
          throw new ConflictException('Reward already unlocked for this user');
        }
      }

      if (support.pollId && support.supporterId) {
        const voteExists = await tx.paidVote.findFirst({
          where: {
            supportId: support.id,
          },
          select: { id: true },
        });

        if (voteExists) {
          throw new ConflictException('This paid vote has already been recorded');
        }
      }

      const completion = await tx.support.updateMany({
        where: {
          chapaRef: txRef,
          walletCredited: false,
        },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
          walletCredited: true,
        },
      });
      if (completion.count !== 1) {
        return false;
      }

      if (support.rewardId) {
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
      }

      if (support.pollId && support.pollOptionId && support.supporterId) {
        await tx.pollOption.update({
          where: { id: support.pollOptionId },
          data: {
            votes: { increment: 1 },
          },
        });

        await tx.paidVote.create({
          data: {
            pollId: support.pollId,
            optionId: support.pollOptionId,
            userId: support.supporterId,
            supportId: support.id,
          },
        });
      }

      const wallet = await tx.wallet.update({
        where: { userId: creatorUserId },
        data: {
          availableBalance: { increment: netAmount },
          totalEarned: { increment: netAmount },
        },
        select: { availableBalance: true },
      });

      await tx.walletTransaction.create({
        data: {
          wallet: { connect: { userId: creatorUserId } },
          type: 'CREDIT',
          reason: 'SUPPORT_RECEIVED',
          amount: netAmount,
          balanceAfter: wallet.availableBalance,
          referenceId: support.id,
          referenceType: 'support',
        },
      });

      const supporterIdentityFilter =
        support.supporterId != null
          ? { supporterId: support.supporterId }
          : support.supporterEmail
            ? { supporterEmail: support.supporterEmail }
            : {
                supporterName: support.supporterName,
              };

      const previousCompletedSupport = await tx.support.count({
        where: {
          creatorProfileId: support.creatorProfileId,
          status: 'COMPLETED',
          id: { not: support.id },
          ...supporterIdentityFilter,
        },
      });

      await tx.creatorProfile.update({
        where: { id: support.creatorProfileId },
        data: {
          totalSupports: { increment: 1 },
          totalSupporters:
            previousCompletedSupport === 0 ? { increment: 1 } : undefined,
        },
      });

      if (support.campaignId) {
        await tx.tikTokCampaign.update({
          where: { id: support.campaignId },
          data: {
            revenue: { increment: support.amount },
          },
        });
      }

      if (support.isFeatureRequest) {
        await tx.featureRequest.create({
          data: {
            supportId: support.id,
            creatorProfileId: support.creatorProfileId,
            message: support.message,
          },
        });
      }

      await tx.notification.create({
        data: {
          userId: creatorUserId,
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
        await tx.unlockedReward.create({
          data: {
            userId: support.supporterId,
            rewardId: support.rewardId,
            supportId: support.id,
          },
        });

        await tx.notification.create({
          data: {
            userId: support.supporterId,
            type: 'REWARD_UNLOCKED',
            title: `Reward unlocked: ${support.reward?.title ?? 'Reward'}`,
            body:
              rewardDelivery?.deliveryMessage ??
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

      return true;
    });

    if (!paymentApplied) {
      return { status: 'already_completed' };
    }

    this.telegram
      .notifyCreatorOfSupport({
        creatorUserId,
        supporterName: support.supporterName,
        coffeeCount: support.coffeeCount,
        amount: Number(support.amount),
        message: support.message ?? undefined,
      })
      .catch((err) => this.logger.error('Telegram notify failed', err));

    this.logger.log(
      `Payment completed: ${txRef} — ETB ${support.amount.toFixed(2)}`,
    );
    return {
      status: 'completed',
      rewardUnlocked: Boolean(support.rewardId && support.supporterId),
      rewardDelivery,
      campaign: support.campaign,
      poll: support.poll,
      pollOption: support.pollOption,
      featureRequestQueued: support.isFeatureRequest,
    };
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

  private buildRewardDeliveryPayload(
    reward:
      | {
          contentUrl: string | null;
          telegramLink: string | null;
          title: string;
        }
      | null,
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
