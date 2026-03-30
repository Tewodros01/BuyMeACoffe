import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { WalletModule } from '../wallet/wallet.module';
import { SupportOutboxProcessorService } from './support-outbox-processor.service';
import { SupportOutboxService } from './support-outbox.service';
import { SupportPaymentService } from './support-payment.service';
import { SupportPollService } from './support-poll.service';
import { SupportProjectionService } from './support-projection.service';
import { SupportRewardService } from './support-reward.service';
import { SupportTransitionService } from './support-transition.service';
import { SupportValidationService } from './support-validation.service';
import { SupportWalletService } from './support-wallet.service';

@Module({
  imports: [WalletModule, TelegramModule],
  providers: [
    SupportValidationService,
    SupportPaymentService,
    SupportTransitionService,
    SupportWalletService,
    SupportRewardService,
    SupportPollService,
    SupportOutboxService,
    SupportProjectionService,
    SupportOutboxProcessorService,
  ],
  exports: [
    SupportValidationService,
    SupportPaymentService,
    SupportOutboxService,
  ],
})
export class SupportProcessingModule {}
