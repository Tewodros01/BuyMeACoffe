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
  UseGuards,
} from '@nestjs/common';
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
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.register(registerDto, { userAgent, ipAddress });
  }

  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Throttle({ short: { ttl: 60000, limit: 10 } })  // 10 login attempts per minute
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() loginDto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.login(loginDto.email, loginDto.password, { userAgent, ipAddress });
  }

  @ApiOperation({ summary: 'Login or register with Telegram Mini App init data' })
  @ApiResponse({ status: 200, description: 'Telegram login successful' })
  @ApiResponse({ status: 401, description: 'Invalid Telegram init data' })
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  telegramLogin(@Body() dto: TelegramLoginDto) {
    return this.authService.loginWithTelegram(dto.initData);
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
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refresh_token);
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
    @Headers('x-session-token') currentSessionToken?: string,
  ) {
    return this.authService.getSessions(userId, currentSessionToken);
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
}
