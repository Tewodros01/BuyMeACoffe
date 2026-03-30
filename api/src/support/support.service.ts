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
import { InitiateSupportDto } from './dto/initiate-support.dto';
import { SupportPaymentService } from './support-payment.service';
import { SupportValidationService } from './support-validation.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapa: ChapaService,
    private readonly config: ConfigService,
    private readonly supportValidation: SupportValidationService,
    private readonly supportPayment: SupportPaymentService,
  ) {}

  async initiate(slug: string, dto: InitiateSupportDto, supporterId?: string) {
    const context = await this.supportValidation.prepareInitiationContext(
      slug,
      dto,
      supporterId,
    );

    const txRef = this.chapa.generateTxRef('bmac');
    const apiUrl = this.config.get<string>('apiUrl') ?? 'http://localhost:3000';
    const frontendUrl =
      this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';

    const [firstName, ...rest] = dto.supporterName.trim().split(' ');
    const lastName = rest.join(' ') || 'Supporter';

    const chapaRes = await this.chapa.initializePayment({
      amount: context.amount,
      currency: 'ETB',
      email: dto.supporterEmail ?? `${txRef}@guest.bmac.et`,
      first_name: firstName,
      last_name: lastName,
      tx_ref: txRef,
      callback_url: `${apiUrl}/api/v1/supports/webhook`,
      return_url: `${frontendUrl}/payment/success?ref=${txRef}`,
      customization: {
        title: context.profile.pageTitle,
        description: context.reward
          ? `Unlock "${context.reward.title}" from ${context.profile.user.firstName}`
          : context.poll
            ? `Vote on "${context.poll.question}" for ${context.profile.user.firstName}`
            : dto.isFeatureRequest
              ? `Send a feature request to ${context.profile.user.firstName}`
              : `${context.coffeeCount} coffee${context.coffeeCount > 1 ? 's' : ''} for ${context.profile.user.firstName}`,
      },
    });

    await this.prisma.support.create({
      data: {
        creatorProfileId: context.profile.id,
        rewardId: context.reward?.id,
        campaignId: context.campaign?.id,
        deepLinkId: context.deepLink?.id,
        pollId: context.poll?.id,
        pollOptionId: context.pollOption?.id,
        supporterId: supporterId ?? null,
        supporterName: dto.supporterName,
        supporterEmail: dto.supporterEmail,
        sourcePlatform:
          context.campaign || context.deepLink ? 'TIKTOK' : 'DIRECT',
        message: dto.message,
        isFeatureRequest: dto.isFeatureRequest ?? false,
        coffeeCount: context.coffeeCount,
        amount: new Prisma.Decimal(context.amount),
        platformFee: new Prisma.Decimal(context.platformFee),
        netAmount: new Prisma.Decimal(context.netAmount),
        status: 'PENDING',
        paymentIntent: {
          create: {
            provider: 'CHAPA',
            amount: new Prisma.Decimal(context.amount),
            currency: 'ETB',
            status: 'PENDING',
            attempts: {
              create: {
                attemptNumber: 1,
                status: 'PENDING',
                providerRef: txRef,
                checkoutUrl: chapaRes.data.checkout_url,
                idempotencyKey: txRef,
              },
            },
          },
        },
      },
    });

    return {
      checkoutUrl: chapaRes.data.checkout_url,
      txRef,
      amount: context.amount,
      platformFee: context.platformFee,
      netAmount: context.netAmount,
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
          where: { source_externalId: { source: 'CHAPA', externalId: txRef } },
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
      const result = await this.processPayment(
        txRef,
        payload as Prisma.InputJsonValue,
      );

      await this.prisma.webhookEvent.update({
        where: { source_externalId: { source: 'CHAPA', externalId: txRef } },
        data: { processedAt: new Date(), error: null },
      });

      return result;
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { source_externalId: { source: 'CHAPA', externalId: txRef } },
        data: {
          error:
            error instanceof Error ? error.message : 'Unknown webhook error',
        },
      });
      throw error;
    }
  }

  async verifyAndComplete(txRef: string) {
    const support = await this.prisma.support.findFirst({
      where: {
        paymentIntent: {
          attempts: {
            some: { providerRef: txRef },
          },
        },
      },
      select: { status: true },
    });
    if (!support) throw new NotFoundException('Support record not found');
    if (support.status === 'COMPLETED') {
      return {
        status: 'completed',
        message: 'Your payment has already been confirmed.',
      };
    }
    return this.processPayment(txRef);
  }

  private async processPayment(
    txRef: string,
    rawPayload?: Prisma.InputJsonValue,
  ) {
    const support = await this.supportPayment.getSupportForPayment(txRef);
    if (support.status === 'FAILED') {
      return {
        status: 'failed',
        message:
          'This payment was already marked as failed. In test mode, use one of Chapa’s approved sandbox numbers for the selected payment method.',
      };
    }

    if (support.paymentAppliedAt) {
      return { status: 'already_completed' };
    }

    const verification = await this.chapa.verifyPayment(txRef);
    const verifiedAmount = new Prisma.Decimal(verification.data.amount);

    if (
      verification.data.status !== 'success' ||
      verification.data.tx_ref !== txRef
    ) {
      await this.supportPayment.markPaymentFailed(support, txRef, rawPayload);
      return {
        status: 'failed',
        message:
          'Chapa reported that the payment was not successful. In test mode, use one of Chapa’s approved sandbox numbers for the selected payment method.',
      };
    }

    if (
      verification.data.currency !== support.currency ||
      !verifiedAmount.equals(support.amount)
    ) {
      throw new ConflictException(
        'Verified payment details do not match the support request',
      );
    }

    const { paymentApplied, rewardDelivery } =
      await this.supportPayment.applyCompletedPayment(
        support,
        txRef,
        rawPayload ?? (verification as unknown as Prisma.InputJsonValue),
      );

    if (!paymentApplied) {
      return {
        status: 'already_completed',
        message: 'This payment has already been processed.',
      };
    }

    this.logger.log(
      `Payment completed: ${txRef} — ETB ${support.amount.toFixed(2)}`,
    );
    return {
      status: 'completed',
      message: 'Your payment was verified successfully.',
      rewardUnlocked: Boolean(support.rewardId && support.supporterId),
      rewardDelivery,
      campaign: support.campaign,
      deepLink: support.deepLink,
      poll: support.poll,
      pollOption: support.pollOption,
      featureRequestQueued: support.isFeatureRequest,
    };
  }
}
