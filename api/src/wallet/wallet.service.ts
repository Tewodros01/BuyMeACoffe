import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WithdrawalMethod } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MIN_WITHDRAWAL = 100;

export interface RequestWithdrawalDto {
  amount: number;
  method: WithdrawalMethod;
  financialAccountId: string;
  note?: string;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        availableBalance: true,
        lockedBalance: true,
        pendingBalance: true,
        totalEarned: true,
        currency: true,
        isActive: true,
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getTransactions(userId: string, take = 20) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    return this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        reason: true,
        amount: true,
        balanceAfter: true,
        referenceType: true,
        referenceId: true,
        note: true,
        createdAt: true,
      },
    });
  }

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    const wallet = await this.getWallet(userId);

    if (!wallet.isActive) {
      throw new BadRequestException('Wallet is not active');
    }
    if (dto.amount < MIN_WITHDRAWAL) {
      throw new BadRequestException(`Minimum withdrawal is ETB ${MIN_WITHDRAWAL}`);
    }

    const available = Number(wallet.availableBalance);
    if (dto.amount > available) {
      throw new BadRequestException('Insufficient available balance');
    }

    const account = await this.prisma.financialAccount.findFirst({
      where: { id: dto.financialAccountId, userId, isActive: true },
    });
    if (!account) throw new NotFoundException('Financial account not found');

    return this.prisma.$transaction(async (tx) => {
      // Move funds from available → locked while withdrawal is processing
      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: { decrement: dto.amount },
          lockedBalance: { increment: dto.amount },
        },
        select: { availableBalance: true },
      });

      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          financialAccountId: dto.financialAccountId,
          amount: new Prisma.Decimal(dto.amount),
          method: dto.method,
          note: dto.note,
          currency: 'ETB',
        },
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          createdAt: true,
        },
      });

      // Record in ledger
      await tx.walletTransaction.create({
        data: {
          wallet: { connect: { userId } },
          type: 'DEBIT',
          reason: 'WITHDRAWAL',
          amount: new Prisma.Decimal(dto.amount),
          balanceAfter: updatedWallet.availableBalance,
          referenceId: withdrawal.id,
          referenceType: 'withdrawal',
        },
      });

      return withdrawal;
    });
  }

  async getWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        referenceId: true,
        note: true,
        processedAt: true,
        createdAt: true,
        financialAccount: {
          select: { provider: true, accountName: true, label: true },
        },
      },
    });
  }
}
