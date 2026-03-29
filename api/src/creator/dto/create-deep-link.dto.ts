import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDeepLinkDto {
  @ApiPropertyOptional({
    example: 'abebe-part2',
    description: 'Optional custom slug for the deep link',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiProperty({
    example: 'tiktok',
    description: 'Traffic source for attribution, such as tiktok or instagram',
  })
  @IsString()
  @MaxLength(50)
  source!: string;

  @ApiPropertyOptional({
    example: 'part-2-cta',
    description: 'Optional campaign tag for grouping links',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaignTag?: string;

  @ApiPropertyOptional({
    example: '7463829102746382910',
    description: 'Optional source video identifier',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  videoId?: string;
}
