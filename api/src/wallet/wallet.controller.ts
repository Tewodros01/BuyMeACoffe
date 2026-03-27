import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from 'generated/prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BulkUpdateWithdrawalsDto } from './dto/bulk-update-withdrawals.dto';
import { ListAdminAuditLogsDto } from './dto/list-admin-audit-logs.dto';
import { UpdateWithdrawalStatusDto } from './dto/update-withdrawal-status.dto';
import { ListAdminWithdrawalsDto } from './dto/list-admin-withdrawals.dto';
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

  @ApiOperation({ summary: 'Admin: update withdrawal status' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/withdrawals')
  listAdminWithdrawals(@Query() query: ListAdminWithdrawalsDto) {
    return this.walletService.listAdminWithdrawals(query);
  }

  @ApiOperation({ summary: 'Admin: dashboard metrics for withdrawals' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/metrics')
  getAdminMetrics() {
    return this.walletService.getAdminMetrics();
  }

  @ApiOperation({ summary: 'Admin: audit log viewer' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/audit-logs')
  listAdminAuditLogs(@Query() query: ListAdminAuditLogsDto) {
    return this.walletService.listAdminAuditLogs(query);
  }

  @ApiOperation({ summary: 'Admin: bulk update withdrawals' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/withdrawals/bulk-status')
  @HttpCode(HttpStatus.OK)
  bulkUpdateWithdrawals(
    @GetUser('sub') actorUserId: string,
    @Body() dto: BulkUpdateWithdrawalsDto,
  ) {
    return this.walletService.bulkUpdateWithdrawals(actorUserId, dto);
  }

  @ApiOperation({ summary: 'Admin: update withdrawal status' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/withdrawals/:id/status')
  @HttpCode(HttpStatus.OK)
  updateWithdrawalStatus(
    @GetUser('sub') actorUserId: string,
    @Param('id') withdrawalId: string,
    @Body() dto: UpdateWithdrawalStatusDto,
  ) {
    return this.walletService.updateWithdrawalStatus(
      actorUserId,
      withdrawalId,
      dto,
    );
  }
}
