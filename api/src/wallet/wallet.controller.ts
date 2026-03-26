import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WithdrawalMethod } from 'generated/prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from './wallet.service';

class RequestWithdrawalDto {
  @ApiProperty({ example: 500, description: 'Amount in ETB (min 100)' })
  @IsInt()
  @Min(100)
  @Max(100000)
  amount!: number;

  @ApiProperty({ enum: WithdrawalMethod })
  @IsEnum(WithdrawalMethod)
  method!: WithdrawalMethod;

  @ApiProperty({ example: 'fin_account_id' })
  @IsString()
  financialAccountId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

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
