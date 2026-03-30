import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class WalletBalanceService {
  async reserveWithdrawalFunds(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Prisma.Decimal,
  ) {
    const walletUpdate = await tx.wallet.updateMany({
      where: {
        userId,
        isActive: true,
        availableBalance: { gte: amount },
      },
      data: {
        availableBalance: { decrement: amount },
        lockedBalance: { increment: amount },
      },
    });

    if (walletUpdate.count !== 1) {
      throw new BadRequestException(
        'Insufficient available balance or wallet is inactive',
      );
    }

    return this.getSnapshot(tx, userId);
  }

  async creditPendingSupport(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Prisma.Decimal,
  ) {
    const wallet = await tx.wallet.update({
      where: { userId },
      data: {
        pendingBalance: { increment: amount },
        totalEarned: { increment: amount },
      },
      select: {
        availableBalance: true,
        pendingBalance: true,
        lockedBalance: true,
      },
    });

    this.assertNonNegativeBalances(wallet);
    return wallet;
  }

  async settlePendingSupport(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Prisma.Decimal,
  ) {
    const walletUpdate = await tx.wallet.updateMany({
      where: {
        userId,
        isActive: true,
        pendingBalance: { gte: amount },
      },
      data: {
        pendingBalance: { decrement: amount },
        availableBalance: { increment: amount },
      },
    });

    if (walletUpdate.count !== 1) {
      throw new ConflictException(
        'Unable to settle support: wallet state is inconsistent',
      );
    }

    return this.getSnapshot(tx, userId);
  }

  async completeWithdrawal(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Prisma.Decimal,
  ) {
    const wallet = await this.getSnapshot(tx, userId);
    if (wallet.lockedBalance.lt(amount)) {
      throw new ConflictException('Locked balance is insufficient');
    }

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        lockedBalance: { decrement: amount },
      },
      select: {
        availableBalance: true,
        pendingBalance: true,
        lockedBalance: true,
      },
    });

    this.assertNonNegativeBalances(updatedWallet);
    return updatedWallet;
  }

  async rejectWithdrawal(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Prisma.Decimal,
  ) {
    const wallet = await this.getSnapshot(tx, userId);
    if (wallet.lockedBalance.lt(amount)) {
      throw new ConflictException('Locked balance is insufficient');
    }

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        lockedBalance: { decrement: amount },
        availableBalance: { increment: amount },
      },
      select: {
        availableBalance: true,
        pendingBalance: true,
        lockedBalance: true,
      },
    });

    this.assertNonNegativeBalances(updatedWallet);
    return updatedWallet;
  }

  private async getSnapshot(tx: Prisma.TransactionClient, userId: string) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: {
        availableBalance: true,
        pendingBalance: true,
        lockedBalance: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    this.assertNonNegativeBalances(wallet);
    return wallet;
  }

  private assertNonNegativeBalances(wallet: {
    availableBalance: Prisma.Decimal;
    pendingBalance: Prisma.Decimal;
    lockedBalance: Prisma.Decimal;
  }) {
    if (
      wallet.availableBalance.lt(0) ||
      wallet.pendingBalance.lt(0) ||
      wallet.lockedBalance.lt(0)
    ) {
      throw new ConflictException('Wallet balance invariants were violated');
    }
  }
}
