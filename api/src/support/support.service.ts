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

    const coffeePrice = Number(profile.coffeePrice);
    const amount = coffeePrice * dto.coffeeCount;
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
        description: `${dto.coffeeCount} coffee${dto.coffeeCount > 1 ? 's' : ''} for ${profile.user.firstName}`,
      },
    });

    await this.prisma.support.create({
      data: {
        creatorProfileId: profile.id,
        supporterId: supporterId ?? null,
        supporterName: dto.supporterName,
        supporterEmail: dto.supporterEmail,
        message: dto.message,
        coffeeCount: dto.coffeeCount,
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

    const paymentApplied = await this.prisma.$transaction(async (tx) => {
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

      await tx.notification.create({
        data: {
          userId: creatorUserId,
          type: 'SUPPORT_RECEIVED',
          title: `${support.supporterName} bought you ${support.coffeeCount} coffee${support.coffeeCount > 1 ? 's' : ''}! ☕`,
          body:
            support.message ??
            `ETB ${Number(support.amount).toFixed(2)} received`,
          referenceId: support.id,
        },
      });

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
    return { status: 'completed' };
  }
}
