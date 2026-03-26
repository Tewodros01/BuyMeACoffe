import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly apiBase: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.botToken = this.configService.get<string>('telegram.botToken');
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessageToUser(
    userId: string,
    text: string,
    options?: { parseMode?: 'HTML' | 'MarkdownV2' },
  ): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('Telegram bot token not configured');
      return false;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });

    if (!user?.telegramId) return false;

    return this.sendMessage(user.telegramId, text, options);
  }

  async sendMessage(
    chatId: string,
    text: string,
    options?: { parseMode?: 'HTML' | 'MarkdownV2' },
  ): Promise<boolean> {
    if (!this.botToken) return false;

    try {
      await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode ?? 'HTML',
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to send Telegram message', error);
      return false;
    }
  }

  async notifyCreatorOfSupport(params: {
    creatorUserId: string;
    supporterName: string;
    coffeeCount: number;
    amount: number;
    message?: string;
  }): Promise<void> {
    const coffeeEmoji = '☕'.repeat(Math.min(params.coffeeCount, 5));
    const amountFormatted = new Intl.NumberFormat('am-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 0,
    }).format(params.amount);

    let text = `${coffeeEmoji} <b>${params.supporterName}</b> just bought you ${params.coffeeCount} coffee${params.coffeeCount > 1 ? 's' : ''}!\n\n`;
    text += `💰 Amount: <b>${amountFormatted}</b>\n`;

    if (params.message) {
      text += `\n💬 "${params.message}"`;
    }

    await this.sendMessageToUser(params.creatorUserId, text, {
      parseMode: 'HTML',
    });
  }

  async getUserTelegramStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, telegramUsername: true },
    });

    return {
      linked: !!user?.telegramId,
      telegramUsername: user?.telegramUsername ?? null,
    };
  }
}
