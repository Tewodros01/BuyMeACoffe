import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateFinancialAccountDto,
  UpdateFinancialAccountDto,
} from './dto/financial-account.dto';
import { FinancialAccountService } from './financial-account.service';

@ApiTags('financial-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('financial-accounts')
export class FinancialAccountController {
  constructor(private readonly service: FinancialAccountService) {}

  @ApiOperation({ summary: 'List my financial accounts' })
  @Get()
  list(@GetUser('sub') userId: string) {
    return this.service.list(userId);
  }

  @ApiOperation({ summary: 'Add a financial account' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @GetUser('sub') userId: string,
    @Body() dto: CreateFinancialAccountDto,
  ) {
    return this.service.create(userId, dto);
  }

  @ApiOperation({ summary: 'Update label or default status' })
  @Patch(':id')
  update(
    @GetUser('sub') userId: string,
    @Param('id') accountId: string,
    @Body() dto: UpdateFinancialAccountDto,
  ) {
    return this.service.update(userId, accountId, dto);
  }

  @ApiOperation({ summary: 'Remove a financial account' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@GetUser('sub') userId: string, @Param('id') accountId: string) {
    return this.service.remove(userId, accountId);
  }
}
