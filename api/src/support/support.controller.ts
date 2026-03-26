import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ActiveUser } from '../auth/decorators/get-user.decorators';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { InitiateSupportDto } from './dto/initiate-support.dto';
import { SupportService } from './support.service';

@ApiTags('supports')
@Controller('supports')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiOperation({ summary: 'Initiate a support payment for a creator' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':slug')
  @HttpCode(HttpStatus.CREATED)
  initiate(
    @Param('slug') slug: string,
    @Body() dto: InitiateSupportDto,
    @GetUser() user?: ActiveUser,
  ) {
    return this.supportService.initiate(slug, dto, user?.sub);
  }

  @ApiOperation({ summary: 'Chapa webhook — called by Chapa after payment' })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-chapa-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '{}';
    return this.supportService.handleWebhook(rawBody, signature);
  }

  @ApiOperation({ summary: 'Verify a payment by tx_ref (return_url fallback)' })
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  @Get('verify/:txRef')
  verify(@Param('txRef') txRef: string) {
    return this.supportService.verifyAndComplete(txRef);
  }
}
