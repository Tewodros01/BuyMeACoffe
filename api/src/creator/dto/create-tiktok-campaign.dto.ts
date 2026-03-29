import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTikTokCampaignDto {
  @ApiProperty({
    example: '7463829102746382910',
    description: 'The TikTok video ID or stable campaign identifier',
  })
  @IsString()
  @MaxLength(100)
  videoId!: string;

  @ApiPropertyOptional({
    example: 'Full tutorial unlock CTA',
    description: 'Optional label to help creators remember this campaign',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
