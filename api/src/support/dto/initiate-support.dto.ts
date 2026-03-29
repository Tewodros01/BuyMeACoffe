import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class InitiateSupportDto {
  @ApiProperty({
    example: 'Abebe Bikila',
    description: 'Supporter display name',
  })
  @IsString()
  @MaxLength(100)
  supporterName!: string;

  @ApiPropertyOptional({ example: 'abebe@example.com' })
  @IsOptional()
  @IsEmail()
  supporterEmail?: string;

  @ApiPropertyOptional({ example: 'Keep up the great work! 🙏' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    example: 'cm8xyz123reward',
    description: 'Optional reward to unlock with this payment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rewardId?: string;

  @ApiPropertyOptional({
    example: 'cm8abc123campaign',
    description: 'Optional TikTok campaign attribution ID',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaignId?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this support should be added to the creator feature queue',
  })
  @IsOptional()
  @IsBoolean()
  isFeatureRequest?: boolean;

  @ApiPropertyOptional({
    example: 'cm8poll123',
    description: 'Optional paid poll ID to vote in',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pollId?: string;

  @ApiPropertyOptional({
    example: 'cm8option123',
    description: 'Optional paid poll option ID to vote for',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pollOptionId?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Number of coffees to buy for a normal support payment (1–50)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  coffeeCount?: number;
}
