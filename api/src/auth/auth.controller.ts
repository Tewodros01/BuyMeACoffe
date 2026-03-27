import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { GetUser } from './decorators/get-user.decorators';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TelegramLoginDto, TelegramSendMessageDto } from './dto/telegram.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  clearSessionCookies,
  generateCsrfToken,
  getCookie,
  REFRESH_COOKIE,
  setSessionCookies,
  type SessionCookieOptions,
} from '../common/utils/cookie.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email or username already exists' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })  // 5 registrations per minute
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService
      .register(registerDto, { userAgent, ipAddress })
      .then((result) => this.respondWithSession(res, result));
  }

  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Throttle({ short: { ttl: 60000, limit: 10 } })  // 10 login attempts per minute
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService
      .login(loginDto.email, loginDto.password, { userAgent, ipAddress })
      .then((result) => this.respondWithSession(res, result));
  }

  @ApiOperation({ summary: 'Login or register with Telegram Mini App init data' })
  @ApiResponse({ status: 200, description: 'Telegram login successful' })
  @ApiResponse({ status: 401, description: 'Invalid Telegram init data' })
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  telegramLogin(
    @Body() dto: TelegramLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService
      .loginWithTelegram(dto.initData)
      .then((result) => this.respondWithSession(res, result));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('profile')
  getProfile(@GetUser('sub') userId: string) {
    return this.authService.getUserProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Telegram link status for current user' })
  @Get('telegram/status')
  getTelegramStatus(@GetUser('sub') userId: string) {
    return this.authService.getTelegramStatus(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a bot message to the current user on Telegram' })
  @Post('telegram/message')
  @HttpCode(HttpStatus.OK)
  sendTelegramMessage(
    @GetUser('sub') userId: string,
    @Body() dto: TelegramSendMessageDto,
  ) {
    return this.authService.sendTelegramMessage(
      userId,
      dto.text,
      dto.parseMode,
    );
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() _dto: RefreshDto,
  ) {
    const refreshToken = getCookie(req, REFRESH_COOKIE);
    return this.authService
      .refresh(refreshToken ?? '')
      .then((result) => this.respondWithSession(res, result));
  }

  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() _dto: RefreshDto,
  ) {
    const refreshToken = getCookie(req, REFRESH_COOKIE);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    clearSessionCookies(res, this.getCookieOptions());
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions' })
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  logoutAll(@GetUser('sub') userId: string) {
    return this.authService.logoutAll(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @GetUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active sessions' })
  @Get('sessions')
  getSessions(
    @GetUser('sub') userId: string,
    @Req() req: Request,
  ) {
    return this.authService.getSessions(
      userId,
      getCookie(req, REFRESH_COOKIE),
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a session' })
  @Post('sessions/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revokeSession(@GetUser('sub') userId: string, @Param('id') sessionId: string) {
    return this.authService.revokeSession(userId, sessionId);
  }

  @ApiOperation({ summary: 'Request password reset (sends token)' })
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @ApiOperation({ summary: 'Reset password using token' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  private respondWithSession(
    res: Response,
    payload: {
      access_token: string;
      refresh_token: string;
      accessTokenTtlSeconds: number;
      refreshTokenTtlSeconds: number;
      user: Awaited<ReturnType<AuthService['getUserProfile']>>;
    },
  ) {
    setSessionCookies(
      res,
      {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        csrfToken: generateCsrfToken(),
        accessTtlSeconds: payload.accessTokenTtlSeconds,
        refreshTtlSeconds: payload.refreshTokenTtlSeconds,
      },
      this.getCookieOptions(),
    );

    return { user: payload.user };
  }

  private getCookieOptions(): SessionCookieOptions {
    const secure = !!process.env.COOKIE_SECURE && process.env.COOKIE_SECURE !== 'false'
      ? true
      : process.env.NODE_ENV === 'production';
    const sameSiteRaw = process.env.COOKIE_SAME_SITE?.toLowerCase();
    const sameSite =
      sameSiteRaw === 'none' || sameSiteRaw === 'lax' || sameSiteRaw === 'strict'
        ? sameSiteRaw
        : 'strict';

    return {
      secure,
      sameSite,
      domain: process.env.COOKIE_DOMAIN || undefined,
    };
  }
}
