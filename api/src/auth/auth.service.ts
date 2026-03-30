import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Prisma, Role } from 'generated/prisma/client';
import {
  getPublicApiUrl,
  toPublicAssetUrl,
} from '../common/utils/avatar-url.util';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt-strategy';

const DUMMY_HASH =
  '$2b$10$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXXX';
const MAX_SESSIONS = 5;
const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 60 * 60;
const RESET_TOKEN_PREFIX = 'reset:';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const financialAccountSelect = {
  id: true,
  type: true,
  provider: true,
  accountName: true,
  // accountNumber intentionally excluded — never returned in auth responses
  // use GET /financial-accounts for masked display
  label: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const financialAccountOrderBy: Prisma.FinancialAccountOrderByWithRelationInput[] =
  [{ createdAt: 'asc' }];

const userSelect = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  avatar: true,
  phone: true,
  telegramId: true,
  telegramUsername: true,
  telegramPhotoUrl: true,
  role: true,
  isVerified: true,
  onboardingDone: true,
  defaultFinancialAccountId: true,
  createdAt: true,
  financialAccounts: {
    where: { isActive: true },
    orderBy: financialAccountOrderBy,
    select: financialAccountSelect,
  },
} as const;

type SafeUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type SafeFinancialAccount = SafeUser['financialAccounts'][number] & {
  isDefault: boolean;
};
type SafeUserResponse = Omit<
  SafeUser,
  'financialAccounts' | 'defaultFinancialAccountId'
> & {
  financialAccounts: SafeFinancialAccount[];
};

type TelegramMiniAppUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

@Injectable()
export class AuthService {
  private readonly refreshTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
  ) {
    this.refreshTtlDays =
      this.configService.get<number>('refreshTtlDays') ?? 30;
  }

  async register(
    dto: RegisterDto,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const { password, avatar, ...userData } = dto;

    let hashedPassword: string;
    try {
      hashedPassword = await bcrypt.hash(password, 10);
    } catch {
      throw new InternalServerErrorException('Failed to process registration');
    }

    const userAvatar =
      avatar ??
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.username}`;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            ...userData,
            password: hashedPassword,
            avatar: userAvatar,
            phone: userData.phone ?? null,
            bio: null,
            telegramId: null,
            telegramUsername: null,
            telegramPhotoUrl: null,
            role: Role.USER,
            isVerified: false,
            onboardingDone: false,
            defaultFinancialAccountId: null,
            deletedAt: null,
          },
          select: userSelect,
        });
        // auto-create default wallet so all wallet-dependent features work immediately
        await tx.wallet.create({
          data: { userId: created.id },
        });
        return created;
      });

      const tokens = await this.issueTokens(
        user.id,
        user.email,
        user.role,
        meta,
      );

      return {
        ...tokens,
        user: this.toSafeUser(user),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[]) ?? [];
        if (target.includes('email'))
          throw new ConflictException('Email already exists');
        if (target.includes('username'))
          throw new ConflictException('Username already exists');
        if (target.includes('phone'))
          throw new ConflictException('Phone number already exists');
        throw new ConflictException('User already exists');
      }
      throw error;
    }
  }

  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email, deletedAt: null },
        select: { ...userSelect, password: true },
      });

      const isMatch = await bcrypt.compare(
        password,
        user?.password ?? DUMMY_HASH,
      );

      if (!user || !isMatch) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const tokens = await this.issueTokens(
        user.id,
        user.email,
        user.role,
        meta,
      );

      return {
        ...tokens,
        user: this.toSafeUser(user),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException('Login failed');
    }
  }

  async loginWithTelegram(initData: string) {
    try {
      const telegramUser = this.validateTelegramInitData(initData);
      const telegramId = String(telegramUser.id);
      const existingUser = await this.prisma.user.findUnique({
        where: { telegramId },
        select: userSelect,
      });

      const user =
        existingUser ??
        (await this.prisma.$transaction(async (tx) => {
          const username = await this.generateTelegramUsername(
            tx,
            telegramUser.username,
            telegramId,
          );
          const email = `tg_${telegramId}@telegram.local`;
          const password = await bcrypt.hash(
            crypto.randomBytes(24).toString('hex'),
            10,
          );
          const created = await tx.user.create({
            data: {
              username,
              email,
              password,
              firstName: telegramUser.first_name,
              lastName: telegramUser.last_name?.trim() || 'Telegram',
              phone: null,
              avatar: telegramUser.photo_url ?? null,
              bio: null,
              telegramId,
              telegramUsername: telegramUser.username ?? null,
              telegramPhotoUrl: telegramUser.photo_url ?? null,
              role: Role.USER,
              isVerified: true,
              onboardingDone: false,
              defaultFinancialAccountId: null,
              deletedAt: null,
            },
            select: userSelect,
          });
          await tx.wallet.create({
            data: { userId: created.id },
          });
          return created;
        }));

      if (existingUser) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name?.trim() || existingUser.lastName,
            avatar: telegramUser.photo_url ?? existingUser.avatar,
            telegramUsername:
              telegramUser.username ?? existingUser.telegramUsername,
            telegramPhotoUrl:
              telegramUser.photo_url ?? existingUser.telegramPhotoUrl,
            telegramId,
            isVerified: true,
          },
        });
      }

      const refreshedUser = existingUser
        ? await this.prisma.user.findUnique({
            where: { telegramId },
            select: userSelect,
          })
        : user;

      if (!refreshedUser) {
        throw new InternalServerErrorException('Telegram login failed');
      }

      const tokens = await this.issueTokens(
        refreshedUser.id,
        refreshedUser.email,
        refreshedUser.role,
        {
          userAgent: 'Telegram Mini App',
          ipAddress: 'telegram',
        },
      );

      return {
        ...tokens,
        user: this.toSafeUser(refreshedUser),
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Telegram login failed');
    }
  }

  async refresh(rawToken: string) {
    try {
      const hashed = this.hashToken(rawToken);

      const session = await this.prisma.session.findUnique({
        where: { refreshToken: hashed },
        include: { user: { select: { ...userSelect, deletedAt: true } } },
      });

      if (!session || session.expiresAt < new Date()) {
        if (session)
          await this.prisma.session.delete({ where: { id: session.id } });
        throw new UnauthorizedException('Refresh token expired or invalid');
      }

      if (session.user.deletedAt !== null) {
        await this.prisma.session.deleteMany({
          where: { userId: session.user.id },
        });
        throw new UnauthorizedException('Account no longer exists');
      }

      await this.prisma.session.delete({ where: { id: session.id } });

      const tokens = await this.issueTokens(
        session.user.id,
        session.user.email,
        session.user.role,
        {
          userAgent: session.userAgent ?? undefined,
          ipAddress: session.ipAddress ?? undefined,
        },
      );

      return {
        ...tokens,
        user: this.toSafeUser(session.user),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException('Token refresh failed');
    }
  }

  async logout(refreshToken: string) {
    try {
      const hashed = this.hashToken(refreshToken);
      await this.prisma.session.deleteMany({ where: { refreshToken: hashed } });
    } catch {
      throw new InternalServerErrorException('Logout failed');
    }
  }

  async logoutAll(userId: string) {
    try {
      await this.prisma.session.deleteMany({ where: { userId } });
    } catch {
      throw new InternalServerErrorException('Logout failed');
    }
  }

  async validateUser(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: userSelect,
      });
      if (!user) throw new UnauthorizedException('User not found');
      return this.toSafeUser(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException('Failed to validate user');
    }
  }

  async getUserProfile(userId: string) {
    return this.validateUser(userId);
  }

  async getTelegramStatus(userId: string) {
    return this.telegramService.getUserTelegramStatus(userId);
  }

  async sendTelegramMessage(
    userId: string,
    text: string,
    parseMode?: 'HTML' | 'MarkdownV2',
  ) {
    return this.telegramService.sendMessageToUser(userId, text, { parseMode });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });
      if (!user) throw new UnauthorizedException('User not found');
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid)
        throw new UnauthorizedException('Current password is incorrect');
      const hashed = await bcrypt.hash(newPassword, 10);
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashed },
      });
      // revoke all sessions so user must re-login
      await this.prisma.session.deleteMany({ where: { userId } });
      return { success: true };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException('Failed to change password');
    }
  }

  async revokeSession(userId: string, sessionId: string) {
    try {
      await this.prisma.session.deleteMany({
        where: { id: sessionId, userId },
      });
      return { success: true };
    } catch {
      throw new InternalServerErrorException('Failed to revoke session');
    }
  }

  async getSessions(userId: string, currentSessionToken?: string) {
    try {
      const normalizedCurrentSessionToken = currentSessionToken?.trim();
      const currentSessionHash = normalizedCurrentSessionToken
        ? this.hashToken(normalizedCurrentSessionToken)
        : null;

      const sessions = await this.prisma.session.findMany({
        where: {
          userId,
          expiresAt: { gt: new Date() },
          refreshToken: { not: { startsWith: RESET_TOKEN_PREFIX } },
        },
        select: {
          id: true,
          refreshToken: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return sessions.map(({ refreshToken, ...session }) => ({
        ...session,
        isCurrent:
          currentSessionHash != null && currentSessionHash === refreshToken,
      }));
    } catch {
      throw new InternalServerErrorException('Failed to fetch sessions');
    }
  }

  // ── Forgot / Reset password ───────────────────────────────────────────────

  async forgotPassword(
    email: string,
  ): Promise<{ message: string; resetToken?: string }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email, deletedAt: null },
        select: { id: true, email: true },
      });
      // Always return success to prevent email enumeration
      if (!user)
        return { message: 'If that email exists, a reset link has been sent.' };

      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = this.hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token in session table reusing the same pattern
      // We use a dedicated prefix so it never collides with refresh tokens
      await this.prisma.session.create({
        data: {
          userId: user.id,
          refreshToken: `${RESET_TOKEN_PREFIX}${hashedToken}`,
          expiresAt,
        },
      });

      const canReturnResetToken =
        process.env.NODE_ENV !== 'production' &&
        process.env.EXPOSE_RESET_TOKEN === 'true';

      // In production you would email rawToken. Only expose it when
      // development explicitly opts into that behavior.
      return canReturnResetToken
        ? {
            message: 'If that email exists, a reset link has been sent.',
            resetToken: rawToken,
          }
        : {
            message: 'If that email exists, a reset link has been sent.',
          };
    } catch {
      throw new InternalServerErrorException(
        'Failed to process password reset',
      );
    }
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    try {
      const hashedToken = this.hashToken(rawToken);
      const session = await this.prisma.session.findFirst({
        where: { refreshToken: `${RESET_TOKEN_PREFIX}${hashedToken}` },
        include: { user: { select: { id: true, deletedAt: true } } },
      });

      if (!session || session.expiresAt < new Date()) {
        if (session)
          await this.prisma.session.delete({ where: { id: session.id } });
        throw new BadRequestException('Reset token is invalid or has expired');
      }

      if (session.user.deletedAt) {
        throw new NotFoundException('Account not found');
      }

      const hashed = await bcrypt.hash(newPassword, 10);

      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: session.userId },
          data: { password: hashed },
        });
        // Invalidate the reset token
        await tx.session.delete({ where: { id: session.id } });
        // Revoke all active sessions so attacker sessions are killed
        await tx.session.deleteMany({ where: { userId: session.userId } });
      });

      return { success: true };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error;
      throw new InternalServerErrorException('Failed to reset password');
    }
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: Role,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    try {
      const payload: JwtPayload = { sub: userId, email, role };
      const access_token = this.jwtService.sign(payload);

      const rawRefresh = crypto.randomBytes(40).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.refreshTtlDays);

      // enforce session cap — delete oldest if over limit
      const sessionCount = await this.prisma.session.count({
        where: {
          userId,
          refreshToken: { not: { startsWith: RESET_TOKEN_PREFIX } },
        },
      });
      if (sessionCount >= MAX_SESSIONS) {
        const oldest = await this.prisma.session.findFirst({
          where: {
            userId,
            refreshToken: { not: { startsWith: RESET_TOKEN_PREFIX } },
          },
          orderBy: { createdAt: 'asc' },
        });
        if (oldest)
          await this.prisma.session.delete({ where: { id: oldest.id } });
      }

      await this.prisma.session.create({
        data: {
          userId,
          refreshToken: this.hashToken(rawRefresh),
          userAgent: meta?.userAgent,
          ipAddress: meta?.ipAddress,
          expiresAt,
        },
      });

      return {
        access_token,
        refresh_token: rawRefresh,
        accessTokenTtlSeconds: this.getAccessTokenTtlSeconds(),
        refreshTokenTtlSeconds: this.refreshTtlDays * 24 * 60 * 60,
      };
    } catch {
      throw new InternalServerErrorException('Failed to issue tokens');
    }
  }

  private toSafeUser(user: SafeUser): SafeUserResponse {
    const { defaultFinancialAccountId, ...safeUser } = user;

    return {
      ...safeUser,
      avatar: this.toPublicAssetUrl(user.avatar),
      financialAccounts: [...user.financialAccounts]
        .map((account) => ({
          ...account,
          isDefault: account.id === defaultFinancialAccountId,
        }))
        .sort(
          (a, b) =>
            Number(b.isDefault) - Number(a.isDefault) ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        ),
    };
  }

  private toPublicAssetUrl(path: string | null): string | null {
    return toPublicAssetUrl(path, getPublicApiUrl(this.configService));
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private validateTelegramInitData(initData: string): TelegramMiniAppUser {
    const botToken = this.configService.get<string>('telegram.botToken');
    if (!botToken) {
      throw new InternalServerErrorException('Telegram bot is not configured');
    }
    if (!initData) {
      throw new BadRequestException('Telegram init data is required');
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const authDateRaw = params.get('auth_date');
    const userRaw = params.get('user');

    if (!hash || !authDateRaw || !userRaw) {
      throw new UnauthorizedException('Invalid Telegram init data');
    }

    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate)) {
      throw new UnauthorizedException('Invalid Telegram auth date');
    }

    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
      throw new UnauthorizedException('Telegram init data has expired');
    }

    const dataCheckString = Array.from(params.entries())
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secret = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const computedHash = crypto
      .createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');

    if (
      hash.length !== computedHash.length ||
      !crypto.timingSafeEqual(
        Buffer.from(computedHash, 'utf8'),
        Buffer.from(hash, 'utf8'),
      )
    ) {
      throw new UnauthorizedException('Invalid Telegram signature');
    }

    let telegramUser: TelegramMiniAppUser;
    try {
      telegramUser = JSON.parse(userRaw) as TelegramMiniAppUser;
    } catch {
      throw new UnauthorizedException('Invalid Telegram user payload');
    }

    if (!telegramUser.id || !telegramUser.first_name) {
      throw new UnauthorizedException('Telegram user payload is incomplete');
    }

    return telegramUser;
  }

  private async generateTelegramUsername(
    tx: Prisma.TransactionClient,
    preferredUsername: string | undefined,
    telegramId: string,
  ) {
    const base = this.sanitizeUsername(preferredUsername) || `tg_${telegramId}`;
    let candidate = base.slice(0, 20);
    let suffix = 1;

    while (true) {
      const existing = await tx.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;

      const nextSuffix = String(suffix++);
      candidate = `${base.slice(0, Math.max(3, 20 - nextSuffix.length))}${nextSuffix}`;
    }
  }

  private sanitizeUsername(value?: string) {
    const sanitized = (value ?? '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20);

    return sanitized.length >= 3 ? sanitized : null;
  }

  private getAccessTokenTtlSeconds() {
    const configured =
      this.configService.get<string>('jwt.expiresIn') ?? '15m';
    return this.parseDurationToSeconds(configured);
  }

  private parseDurationToSeconds(value: string) {
    const trimmed = value.trim();
    const match = /^(\d+)([smhd])$/i.exec(trimmed);

    if (!match) {
      const direct = Number(trimmed);
      return Number.isFinite(direct) && direct > 0
        ? direct
        : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 60 * 60;
      case 'd':
        return amount * 24 * 60 * 60;
      default:
        return DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
    }
  }
}
