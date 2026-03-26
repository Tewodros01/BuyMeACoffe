import { Module } from '@nestjs/common';
import { ChapaModule } from '../chapa/chapa.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [ChapaModule, TelegramModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
