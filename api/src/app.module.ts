import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ChapaModule } from './chapa/chapa.module';
import configuration from './common/config/configuration';
import { CreatorModule } from './creator/creator.module';
import { FinancialAccountModule } from './financial-account/financial-account.module';
import { NotificationModule } from './notification/notification.module';
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
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CreatorModule,
    SupportModule,
    WalletModule,
    FinancialAccountModule,
    NotificationModule,
    ChapaModule,
    TelegramModule,
  ],
  providers: [
    // Apply rate limiting globally — individual routes can override with @Throttle()
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
