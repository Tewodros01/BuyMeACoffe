import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCreatorProfileDto {
  @ApiPropertyOptional({
    example: 'my-page',
    description: 'Custom public URL slug',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'Slug can only contain lowercase letters, numbers, hyphens, and underscores',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Buy Tewodros a Coffee ☕' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pageTitle?: string;

  @ApiPropertyOptional({
    example: 'Thank you so much! Your support means everything 🙏',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thankYouMessage?: string;

  @ApiPropertyOptional({ example: 50, description: 'Price of 1 coffee in ETB' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(10000)
  coffeePrice?: number;

  @ApiPropertyOptional({
    example: {
      telegram: 'https://t.me/username',
      youtube: 'https://youtube.com/@channel',
    },
  })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
