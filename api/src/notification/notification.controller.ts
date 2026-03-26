import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @ApiOperation({ summary: 'List my notifications' })
  @Get()
  list(@GetUser('sub') userId: string) {
    return this.service.list(userId);
  }

  @ApiOperation({ summary: 'Get unread notification count' })
  @Get('unread-count')
  unreadCount(@GetUser('sub') userId: string) {
    return this.service.unreadCount(userId);
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@GetUser('sub') userId: string) {
    return this.service.markAllRead(userId);
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@GetUser('sub') userId: string, @Param('id') id: string) {
    return this.service.markRead(userId, id);
  }
}
