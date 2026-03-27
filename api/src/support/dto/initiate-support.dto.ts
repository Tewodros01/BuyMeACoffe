import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

  @ApiProperty({ example: 3, description: 'Number of coffees to buy (1–50)' })
  @IsInt()
  @Min(1)
  @Max(50)
  coffeeCount!: number;
}
