import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ChapaModule } from './chapa/chapa.module';
import configuration from './common/config/configuration';
import { CreatorModule } from './creator/creator.module';
import { PrismaModule } from './prisma/prisma.module';
import { SupportModule } from './support/support.module';
import { TelegramModule } from './telegram/telegram.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000,
        limit: 20,
      },
    ]),
    PrismaModule,
    AuthModule,
    CreatorModule,
    SupportModule,
    WalletModule,
    ChapaModule,
    TelegramModule,
  ],
})
export class AppModule {}
