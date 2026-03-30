import { Module } from '@nestjs/common';
import { WalletAccountingService } from './wallet-accounting.service';
import { WalletBalanceService } from './wallet-balance.service';
import { WalletController } from './wallet.controller';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { WalletService } from './wallet.service';
import { WithdrawalTransitionService } from './withdrawal-transition.service';

@Module({
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletAccountingService,
    WalletLedgerService,
    WalletBalanceService,
    WithdrawalTransitionService,
    WalletReconciliationService,
  ],
  exports: [
    WalletService,
    WalletAccountingService,
    WalletLedgerService,
    WalletBalanceService,
    WithdrawalTransitionService,
  ],
})
export class WalletModule {}
