import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WithdrawalMethod } from 'generated/prisma/client';

export class RequestWithdrawalDto {
  @ApiProperty({ example: 500, description: 'Amount in ETB (min 100)' })
  @IsInt()
  @Min(100)
  @Max(100000)
  amount!: number;

  @ApiProperty({ enum: WithdrawalMethod })
  @IsEnum(WithdrawalMethod)
  method!: WithdrawalMethod;

  @ApiProperty({ example: 'clx1234abcd', description: 'Financial account ID' })
  @IsString()
  financialAccountId!: string;

  @ApiPropertyOptional({ example: 'Monthly payout' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
