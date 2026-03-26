import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @ApiOperation({ summary: 'Get my wallet balances' })
  @Get()
  getWallet(@GetUser('sub') userId: string) {
    return this.walletService.getWallet(userId);
  }

  @ApiOperation({ summary: 'Get wallet transaction history' })
  @Get('transactions')
  getTransactions(@GetUser('sub') userId: string) {
    return this.walletService.getTransactions(userId);
  }

  @ApiOperation({ summary: 'Request a withdrawal' })
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @Post('withdraw')
  @HttpCode(HttpStatus.CREATED)
  requestWithdrawal(@GetUser('sub') userId: string, @Body() dto: RequestWithdrawalDto) {
    return this.walletService.requestWithdrawal(userId, dto);
  }

  @ApiOperation({ summary: 'Get my withdrawal history' })
  @Get('withdrawals')
  getWithdrawals(@GetUser('sub') userId: string) {
    return this.walletService.getWithdrawals(userId);
  }
}
