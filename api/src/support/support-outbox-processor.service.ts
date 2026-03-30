import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  SUPPORT_PAYMENT_COMPLETED_EVENT,
  SUPPORT_PAYMENT_COMPLETED_TELEGRAM_EVENT,
} from './support-outbox.service';
import { SupportProjectionService } from './support-projection.service';

const SUPPORT_OUTBOX_BATCH_SIZE = 50;
const SUPPORT_OUTBOX_STALE_CLAIM_MS = 5 * 60 * 1000;

@Injectable()
export class SupportOutboxProcessorService {
  private readonly logger = new Logger(SupportOutboxProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly supportProjection: SupportProjectionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingEvents() {
    const staleBefore = new Date(Date.now() - SUPPORT_OUTBOX_STALE_CLAIM_MS);
    const events = await this.prisma.supportEventOutbox.findMany({
      where: {
        processedAt: null,
        OR: [
          { processingStartedAt: null },
          { processingStartedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: SUPPORT_OUTBOX_BATCH_SIZE,
      select: {
        id: true,
        supportId: true,
        eventType: true,
        payload: true,
      },
    });

    for (const event of events) {
      try {
        const claimed = await this.prisma.supportEventOutbox.updateMany({
          where: {
            id: event.id,
            processedAt: null,
            OR: [
              { processingStartedAt: null },
              { processingStartedAt: { lt: staleBefore } },
            ],
          },
          data: {
            processingStartedAt: new Date(),
            lastError: null,
          },
        });

        if (claimed.count !== 1) {
          continue;
        }

        if (event.eventType === SUPPORT_PAYMENT_COMPLETED_TELEGRAM_EVENT) {
          await this.processTelegramEvent(event.id);
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          const current = await tx.supportEventOutbox.findFirst({
            where: {
              id: event.id,
              processedAt: null,
            },
            select: {
              id: true,
              supportId: true,
              eventType: true,
              payload: true,
            },
          });

          if (!current) {
            return;
          }

          if (current.eventType === SUPPORT_PAYMENT_COMPLETED_EVENT) {
            const payload = (current.payload as {
              rewardDelivery?: { deliveryMessage: string } | null;
            } | null) ?? { rewardDelivery: null };

            await this.supportProjection.applyPaymentCompletedProjection(tx, {
              supportId: current.supportId,
              rewardDelivery: payload.rewardDelivery ?? null,
            });
          }

          await tx.supportEventOutbox.update({
            where: { id: current.id },
            data: {
              processedAt: new Date(),
              processingStartedAt: null,
              lastError: null,
              attemptCount: { increment: 1 },
            },
          });
        });
      } catch (error) {
        this.logger.error(
          `Failed to process support outbox event ${event.id}`,
          error instanceof Error ? error.stack : undefined,
        );

        await this.prisma.supportEventOutbox.update({
          where: { id: event.id },
          data: {
            lastError:
              error instanceof Error ? error.message : 'Unknown outbox error',
            attemptCount: { increment: 1 },
            processingStartedAt: null,
          },
        });
      }
    }
  }

  private async processTelegramEvent(eventId: string) {
    const current = await this.prisma.supportEventOutbox.findFirst({
      where: {
        id: eventId,
        processedAt: null,
      },
      select: {
        id: true,
        payload: true,
      },
    });

    if (!current) {
      return;
    }

    const payload = (current.payload as {
      creatorUserId?: string;
      supporterName?: string;
      coffeeCount?: number;
      amount?: number;
      message?: string | null;
    } | null) ?? {
      creatorUserId: undefined,
      supporterName: undefined,
      coffeeCount: undefined,
      amount: undefined,
      message: undefined,
    };

    if (
      !payload.creatorUserId ||
      !payload.supporterName ||
      payload.coffeeCount == null ||
      payload.amount == null
    ) {
      throw new Error(
        `Support outbox event ${eventId} is missing Telegram payload`,
      );
    }

    const delivery = await this.telegram.notifyCreatorOfSupport({
      creatorUserId: payload.creatorUserId,
      supporterName: payload.supporterName,
      coffeeCount: payload.coffeeCount,
      amount: payload.amount,
      message: payload.message ?? undefined,
    });

    if (!delivery.ok && delivery.retryable) {
      throw new Error(
        `${delivery.reason} for support outbox event ${eventId}`,
      );
    }

    await this.prisma.supportEventOutbox.update({
      where: { id: current.id },
      data: {
        processedAt: new Date(),
        processingStartedAt: null,
        lastError: delivery.ok ? null : delivery.reason,
        attemptCount: { increment: 1 },
      },
    });
  }
}
