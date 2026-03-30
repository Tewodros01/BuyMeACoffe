import { Module } from '@nestjs/common';
import { ChapaModule } from '../chapa/chapa.module';
import { WalletModule } from '../wallet/wallet.module';
import { SupportController } from './support.controller';
import { SupportProcessingModule } from './support-processing.module';
import { SupportSettlementService } from './support-settlement.service';
import { SupportService } from './support.service';

@Module({
  imports: [ChapaModule, SupportProcessingModule, WalletModule],
  controllers: [SupportController],
  providers: [SupportService, SupportSettlementService],
})
export class SupportModule {}
