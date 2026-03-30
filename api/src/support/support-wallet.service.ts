import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { WalletBalanceService } from '../wallet/wallet-balance.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';

@Injectable()
export class SupportWalletService {
  constructor(
    private readonly walletLedger: WalletLedgerService,
    private readonly walletBalance: WalletBalanceService,
  ) {}

  async creditPendingSupport(
    tx: Prisma.TransactionClient,
    input: {
      creatorUserId: string;
      supportId: string;
      netAmount: Prisma.Decimal;
      platformFee: Prisma.Decimal;
      currency: string;
    },
  ) {
    const wallet = await this.walletBalance.creditPendingSupport(
      tx,
      input.creatorUserId,
      input.netAmount,
    );

    await this.walletLedger.createWalletTransaction(tx, {
      userId: input.creatorUserId,
      type: 'CREDIT',
      reason: 'SUPPORT_PENDING',
      supportId: input.supportId,
      amount: input.netAmount,
      balances: wallet,
      referenceId: input.supportId,
      referenceType: 'support',
    });

    await tx.platformEarning.upsert({
      where: { supportId: input.supportId },
      create: {
        supportId: input.supportId,
        amount: input.platformFee,
        currency: input.currency,
      },
      update: {
        amount: input.platformFee,
        currency: input.currency,
      },
    });
  }
}
