import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeepLinkDto } from './dto/create-deep-link.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { CreateTikTokCampaignDto } from './dto/create-tiktok-campaign.dto';
import { TrackDeepLinkVisitDto } from './dto/track-deep-link-visit.dto';
import { UpdateCreatorProfileDto } from './dto/update-creator-profile.dto';

const profileUserSelect = {
  username: true,
  firstName: true,
  lastName: true,
  avatar: true,
  bio: true,
} as const;

const profileSelect = {
  id: true,
  slug: true,
  pageTitle: true,
  thankYouMessage: true,
  coverImage: true,
  coffeePrice: true,
  socialLinks: true,
  isPublished: true,
  totalSupporters: true,
  totalSupports: true,
  createdAt: true,
  updatedAt: true,
  user: { select: profileUserSelect },
} as const;

@Injectable()
export class CreatorService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateProfile(userId: string) {
    const existing = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: profileSelect,
    });
    if (existing) return existing;

    // Derive slug from username — guaranteed unique since username is unique
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const slug = await this.generateUniqueSlug(user.username);

    try {
      return await this.prisma.creatorProfile.create({
        data: { userId, slug },
        select: profileSelect,
      });
    } catch {
      // Race condition: another request created the profile between our check and create
      const profile = await this.prisma.creatorProfile.findUnique({
        where: { userId },
        select: profileSelect,
      });
      if (profile) return profile;
      throw new ConflictException('Failed to create creator profile');
    }
  }

  async updateProfile(userId: string, dto: UpdateCreatorProfileDto) {
    await this.getOrCreateProfile(userId);

    // If slug is being updated, ensure it's unique
    if (dto.slug) {
      const existing = await this.prisma.creatorProfile.findUnique({
        where: { slug: dto.slug },
        select: { userId: true },
      });
      if (existing && existing.userId !== userId) {
        throw new ConflictException('This URL is already taken');
      }
    }

    return this.prisma.creatorProfile.update({
      where: { userId },
      data: dto,
      select: profileSelect,
    });
  }

  async getPublicProfile(slug: string) {
    const profile = await this.prisma.creatorProfile.findFirst({
      where: { slug, isPublished: true, user: { deletedAt: null } },
      select: profileSelect,
    });
    if (!profile) throw new NotFoundException('Creator not found');

    const [featuredRewards, activePolls] = await Promise.all([
      this.prisma.reward.findMany({
        where: {
          creatorProfileId: profile.id,
          isActive: true,
          isFeatured: true,
        },
        orderBy: [{ price: 'asc' }, { createdAt: 'desc' }],
        take: 3,
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          price: true,
          maxQuantity: true,
          claimedCount: true,
        },
      }),
      this.prisma.poll.findMany({
        where: {
          creatorProfileId: profile.id,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          question: true,
          price: true,
          options: {
            select: {
              id: true,
              text: true,
              votes: true,
            },
          },
        },
      }),
    ]);

    return { ...profile, featuredRewards, activePolls };
  }

  async getRecentSupporters(slug: string, limit = 10) {
    const profile = await this.prisma.creatorProfile.findFirst({
      where: { slug, isPublished: true, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Creator not found');

    return this.prisma.support.findMany({
      where: { creatorProfileId: profile.id, status: 'COMPLETED' },
      orderBy: { paidAt: 'desc' },
      take: limit,
      select: {
        id: true,
        supporterName: true,
        message: true,
        coffeeCount: true,
        amount: true,
        paidAt: true,
      },
    });
  }

  async getDashboard(userId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        slug: true,
        totalSupporters: true,
        totalSupports: true,
        coffeePrice: true,
      },
    });
    if (!profile) throw new NotFoundException('Creator profile not found');

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: {
        availableBalance: true,
        pendingBalance: true,
        lockedBalance: true,
        totalEarned: true,
        currency: true,
      },
    });

    const recentSupports = await this.prisma.support.findMany({
      where: { creatorProfileId: profile.id, status: 'COMPLETED' },
      orderBy: { paidAt: 'desc' },
      take: 20,
      select: {
        id: true,
        campaignId: true,
        supporterName: true,
        message: true,
        coffeeCount: true,
        amount: true,
        paidAt: true,
      },
    });

    const topCampaigns = await this.prisma.tikTokCampaign.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: [{ revenue: 'desc' }, { clicks: 'desc' }],
      take: 5,
      select: {
        id: true,
        videoId: true,
        title: true,
        clicks: true,
        revenue: true,
        _count: {
          select: {
            supports: {
              where: { status: 'COMPLETED' },
            },
          },
        },
      },
    });

    const [featureRequestCount, activePollCount, fanBadgeCount] =
      await Promise.all([
        this.prisma.featureRequest.count({
          where: { creatorProfileId: profile.id, isUsed: false },
        }),
        this.prisma.poll.count({
          where: { creatorProfileId: profile.id, isActive: true },
        }),
        this.prisma.fanBadge.count({
          where: { creatorProfileId: profile.id },
        }),
      ]);

    const topDeepLinks = await this.prisma.deepLink.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: [{ revenue: 'desc' }, { conversions: 'desc' }, { clicks: 'desc' }],
      take: 5,
      select: {
        id: true,
        slug: true,
        source: true,
        campaignTag: true,
        videoId: true,
        clicks: true,
        uniqueClicks: true,
        conversions: true,
        revenue: true,
      },
    });

    return {
      profile,
      wallet,
      recentSupports,
      topCampaigns,
      topDeepLinks,
      participation: {
        pendingFeatureRequests: featureRequestCount,
        activePolls: activePollCount,
        fanBadgesAwarded: fanBadgeCount,
      },
    };
  }

  async createCampaign(userId: string, dto: CreateTikTokCampaignDto) {
    const profile = await this.getOrCreateProfile(userId);

    try {
      return await this.prisma.tikTokCampaign.create({
        data: {
          creatorProfileId: profile.id,
          videoId: dto.videoId,
          title: dto.title,
        },
        select: {
          id: true,
          videoId: true,
          title: true,
          clicks: true,
          revenue: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch {
      throw new ConflictException('A campaign already exists for this video');
    }
  }

  async getCampaignAnalytics(userId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Creator profile not found');

    const campaigns = await this.prisma.tikTokCampaign.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: [{ revenue: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        videoId: true,
        title: true,
        clicks: true,
        revenue: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            supports: {
              where: { status: 'COMPLETED' },
            },
          },
        },
      },
    });

    const summary = campaigns.reduce(
      (acc, campaign) => {
        acc.totalClicks += campaign.clicks;
        acc.totalRevenue += Number(campaign.revenue);
        acc.totalConversions += campaign._count.supports;
        return acc;
      },
      {
        totalCampaigns: campaigns.length,
        totalClicks: 0,
        totalRevenue: 0,
        totalConversions: 0,
      },
    );

    return {
      summary,
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        videoId: campaign.videoId,
        title: campaign.title,
        clicks: campaign.clicks,
        revenue: campaign.revenue,
        conversions: campaign._count.supports,
        conversionRate:
          campaign.clicks > 0
            ? Number(
                ((campaign._count.supports / campaign.clicks) * 100).toFixed(2),
              )
            : 0,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      })),
    };
  }

  async createDeepLink(userId: string, dto: CreateDeepLinkDto) {
    const profile = await this.getOrCreateProfile(userId);
    const slug = dto.slug
      ? await this.ensureDeepLinkSlugAvailable(dto.slug, profile.id)
      : await this.generateUniqueDeepLinkSlug(profile.slug, dto.source);

    return this.prisma.deepLink.create({
      data: {
        creatorProfileId: profile.id,
        slug,
        source: dto.source.toLowerCase(),
        campaignTag: dto.campaignTag,
        videoId: dto.videoId,
      },
      select: {
        id: true,
        slug: true,
        source: true,
        campaignTag: true,
        videoId: true,
        clicks: true,
        uniqueClicks: true,
        conversions: true,
        revenue: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getDeepLinks(userId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Creator profile not found');

    const links = await this.prisma.deepLink.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: [{ revenue: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        source: true,
        campaignTag: true,
        videoId: true,
        clicks: true,
        uniqueClicks: true,
        conversions: true,
        revenue: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const summary = links.reduce(
      (acc, link) => {
        acc.totalLinks += 1;
        acc.totalClicks += link.clicks;
        acc.totalUniqueClicks += link.uniqueClicks;
        acc.totalConversions += link.conversions;
        acc.totalRevenue += Number(link.revenue);
        return acc;
      },
      {
        totalLinks: 0,
        totalClicks: 0,
        totalUniqueClicks: 0,
        totalConversions: 0,
        totalRevenue: 0,
      },
    );

    return {
      summary,
      links: links.map((link) => ({
        ...link,
        conversionRate:
          link.clicks > 0
            ? Number(((link.conversions / link.clicks) * 100).toFixed(2))
            : 0,
      })),
    };
  }

  async createPoll(userId: string, dto: CreatePollDto) {
    const profile = await this.getOrCreateProfile(userId);

    return this.prisma.poll.create({
      data: {
        creatorProfileId: profile.id,
        question: dto.question,
        price: dto.price,
        options: {
          create: dto.options.map((option) => ({
            text: option.text,
          })),
        },
      },
      select: {
        id: true,
        question: true,
        price: true,
        isActive: true,
        createdAt: true,
        options: {
          select: {
            id: true,
            text: true,
            votes: true,
          },
        },
      },
    });
  }

  async getPolls(userId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Creator profile not found');

    return this.prisma.poll.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        question: true,
        price: true,
        isActive: true,
        createdAt: true,
        options: {
          orderBy: { votes: 'desc' },
          select: {
            id: true,
            text: true,
            votes: true,
          },
        },
        _count: {
          select: {
            paidVotes: true,
          },
        },
      },
    });
  }

  async getFeatureRequests(userId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Creator profile not found');

    return this.prisma.featureRequest.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: [{ isUsed: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        message: true,
        isUsed: true,
        usedAt: true,
        createdAt: true,
        support: {
          select: {
            id: true,
            supporterName: true,
            amount: true,
            paidAt: true,
          },
        },
      },
    });
  }

  async getFanBadges(userId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Creator profile not found');

    return this.prisma.fanBadge.findMany({
      where: { creatorProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        badge: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });
  }

  async trackCampaignClick(slug: string, campaignId: string) {
    const campaign = await this.prisma.tikTokCampaign.findFirst({
      where: {
        id: campaignId,
        creatorProfile: {
          slug,
          isPublished: true,
          user: { deletedAt: null },
        },
      },
      select: {
        id: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    await this.prisma.tikTokCampaign.update({
      where: { id: campaign.id },
      data: {
        clicks: { increment: 1 },
      },
    });

    return { status: 'tracked' };
  }

  async trackDeepLinkVisit(linkSlug: string, dto: TrackDeepLinkVisitDto) {
    const deepLink = await this.prisma.deepLink.findUnique({
      where: { slug: linkSlug },
      select: {
        id: true,
        slug: true,
        source: true,
        campaignTag: true,
        videoId: true,
        creatorProfile: {
          select: {
            slug: true,
            pageTitle: true,
            isPublished: true,
            user: { select: { deletedAt: true } },
          },
        },
      },
    });
    if (
      !deepLink ||
      !deepLink.creatorProfile.isPublished ||
      deepLink.creatorProfile.user.deletedAt != null
    ) {
      throw new NotFoundException('Deep link not found');
    }

    const visitorKey = dto.visitorKey?.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.deepLink.update({
        where: { id: deepLink.id },
        data: {
          clicks: { increment: 1 },
        },
      });

      if (visitorKey) {
        try {
          await tx.deepLinkVisit.create({
            data: {
              deepLinkId: deepLink.id,
              visitorKey,
            },
          });

          await tx.deepLink.update({
            where: { id: deepLink.id },
            data: {
              uniqueClicks: { increment: 1 },
            },
          });
        } catch (error) {
          if (
            !(
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            )
          ) {
            throw error;
          }
        }
      }
    });

    return {
      status: 'tracked',
      deepLink: {
        slug: deepLink.slug,
        source: deepLink.source,
        campaignTag: deepLink.campaignTag,
        videoId: deepLink.videoId,
      },
      creator: {
        slug: deepLink.creatorProfile.slug,
        pageTitle: deepLink.creatorProfile.pageTitle,
      },
    };
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    const sanitized = base
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .slice(0, 30);
    let candidate = sanitized;
    let suffix = 1;

    while (true) {
      const existing = await this.prisma.creatorProfile.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      candidate = `${sanitized.slice(0, 27)}-${suffix++}`;
    }
  }

  private async ensureDeepLinkSlugAvailable(
    slug: string,
    creatorProfileId: string,
  ) {
    const sanitized = slug
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .slice(0, 100);

    const existing = await this.prisma.deepLink.findUnique({
      where: { slug: sanitized },
      select: { creatorProfileId: true },
    });

    if (existing && existing.creatorProfileId !== creatorProfileId) {
      throw new ConflictException('This deep link slug is already taken');
    }

    if (existing && existing.creatorProfileId === creatorProfileId) {
      throw new ConflictException('You already created this deep link slug');
    }

    return sanitized;
  }

  private async generateUniqueDeepLinkSlug(
    creatorSlug: string,
    source: string,
  ): Promise<string> {
    const base = `${creatorSlug}-${source}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .slice(0, 90);
    let candidate = base;
    let suffix = 1;

    while (true) {
      const existing = await this.prisma.deepLink.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      candidate = `${base.slice(0, 86)}-${suffix++}`;
    }
  }
}
