import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TransactionReason,
  TransactionType,
} from 'generated/prisma/client';

const walletBalanceSelect = {
  availableBalance: true,
  pendingBalance: true,
  lockedBalance: true,
} satisfies Prisma.WalletSelect;

export type WalletBalanceSnapshot = Prisma.WalletGetPayload<{
  select: typeof walletBalanceSelect;
}>;

@Injectable()
export class WalletLedgerService {
  async getWalletBalanceSnapshot(tx: Prisma.TransactionClient, userId: string) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: walletBalanceSelect,
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async createWalletTransaction(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      type: TransactionType;
      reason: TransactionReason;
      amount: Prisma.Decimal;
      balances: WalletBalanceSnapshot;
      referenceId?: string;
      referenceType?: string;
      note?: string;
      supportId?: string;
      withdrawalId?: string;
    },
  ) {
    try {
      await tx.walletTransaction.create({
        data: {
          wallet: { connect: { userId: input.userId } },
          type: input.type,
          reason: input.reason,
          ...(input.supportId
            ? { support: { connect: { id: input.supportId } } }
            : {}),
          ...(input.withdrawalId
            ? { withdrawal: { connect: { id: input.withdrawalId } } }
            : {}),
          amount: input.amount,
          availableBalanceAfter: input.balances.availableBalance,
          pendingBalanceAfter: input.balances.pendingBalance,
          lockedBalanceAfter: input.balances.lockedBalance,
          referenceId: input.referenceId,
          referenceType: input.referenceType,
          note: input.note,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = input.supportId
          ? await tx.walletTransaction.findFirst({
              where: {
                supportId: input.supportId,
                reason: input.reason,
              },
              select: { id: true },
            })
          : input.withdrawalId
            ? await tx.walletTransaction.findFirst({
                where: {
                  withdrawalId: input.withdrawalId,
                  reason: input.reason,
                },
                select: { id: true },
              })
            : null;

        if (existing) {
          return;
        }
      }

      throw error;
    }
  }
}
