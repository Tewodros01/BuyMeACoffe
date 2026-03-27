import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatorService } from './creator.service';
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
