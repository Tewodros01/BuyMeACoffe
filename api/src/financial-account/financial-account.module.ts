import { Module } from '@nestjs/common';
import { FinancialAccountController } from './financial-account.controller';
import { FinancialAccountService } from './financial-account.service';

@Module({
  controllers: [FinancialAccountController],
  providers: [FinancialAccountService],
  exports: [FinancialAccountService],
})
export class FinancialAccountModule {}
