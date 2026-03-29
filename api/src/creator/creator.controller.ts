import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatorService } from './creator.service';
import { CreateDeepLinkDto } from './dto/create-deep-link.dto';
import { CreateTikTokCampaignDto } from './dto/create-tiktok-campaign.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { TrackDeepLinkVisitDto } from './dto/track-deep-link-visit.dto';
import { UpdateCreatorProfileDto } from './dto/update-creator-profile.dto';

@ApiTags('creator')
@Controller('creator')
export class CreatorController {
  constructor(private readonly creatorService: CreatorService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get or create my creator profile' })
  @Get('profile')
  getMyProfile(@GetUser('sub') userId: string) {
    return this.creatorService.getOrCreateProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my creator profile' })
  @Patch('profile')
  updateProfile(
    @GetUser('sub') userId: string,
    @Body() dto: UpdateCreatorProfileDto,
  ) {
    return this.creatorService.updateProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my dashboard stats' })
  @Get('dashboard')
  getDashboard(@GetUser('sub') userId: string) {
    return this.creatorService.getDashboard(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a TikTok campaign for attribution tracking' })
  @Post('campaigns')
  createCampaign(
    @GetUser('sub') userId: string,
    @Body() dto: CreateTikTokCampaignDto,
  ) {
    return this.creatorService.createCampaign(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get TikTok campaign analytics for the current creator' })
  @Get('campaigns')
  getCampaignAnalytics(@GetUser('sub') userId: string) {
    return this.creatorService.getCampaignAnalytics(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a deep link for creator attribution tracking' })
  @Post('links')
  createDeepLink(@GetUser('sub') userId: string, @Body() dto: CreateDeepLinkDto) {
    return this.creatorService.createDeepLink(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get deep link analytics for the current creator' })
  @Get('links')
  getDeepLinks(@GetUser('sub') userId: string) {
    return this.creatorService.getDeepLinks(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a paid poll for supporter participation' })
  @Post('polls')
  createPoll(@GetUser('sub') userId: string, @Body() dto: CreatePollDto) {
    return this.creatorService.createPoll(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active polls and voting stats for the current creator' })
  @Get('polls')
  getPolls(@GetUser('sub') userId: string) {
    return this.creatorService.getPolls(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get paid feature requests queued for the current creator' })
  @Get('feature-requests')
  getFeatureRequests(@GetUser('sub') userId: string) {
    return this.creatorService.getFeatureRequests(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get fan badges earned by supporters for the current creator' })
  @Get('fan-badges')
  getFanBadges(@GetUser('sub') userId: string) {
    return this.creatorService.getFanBadges(userId);
  }

  @ApiOperation({ summary: 'Track a public click for a TikTok campaign link' })
  @Post(':slug/campaigns/:campaignId/click')
  trackCampaignClick(
    @Param('slug') slug: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.creatorService.trackCampaignClick(slug, campaignId);
  }

  @ApiOperation({ summary: 'Track and resolve a public deep link visit' })
  @Post('links/:linkSlug/visit')
  trackDeepLinkVisit(
    @Param('linkSlug') linkSlug: string,
    @Body() dto: TrackDeepLinkVisitDto,
  ) {
    return this.creatorService.trackDeepLinkVisit(linkSlug, dto);
  }

  @ApiOperation({ summary: 'Get public creator page by slug' })
  @Get(':slug')
  getPublicProfile(@Param('slug') slug: string) {
    return this.creatorService.getPublicProfile(slug);
  }

  @ApiOperation({ summary: 'Get recent supporters for a creator' })
  @Get(':slug/supporters')
  getRecentSupporters(@Param('slug') slug: string) {
    return this.creatorService.getRecentSupporters(slug);
  }
}
