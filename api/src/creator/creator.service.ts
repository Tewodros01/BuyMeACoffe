import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
    return profile;
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
        supporterName: true,
        message: true,
        coffeeCount: true,
        amount: true,
        paidAt: true,
      },
    });

    return { profile, wallet, recentSupports };
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
}
