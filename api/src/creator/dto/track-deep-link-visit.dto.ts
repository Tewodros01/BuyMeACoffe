import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackDeepLinkVisitDto {
  @ApiPropertyOptional({
    example: 'device_12345',
    description: 'Optional stable visitor key for unique click tracking',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  visitorKey?: string;
}
