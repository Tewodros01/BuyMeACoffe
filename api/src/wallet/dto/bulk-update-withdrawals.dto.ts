import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WithdrawalStatus } from 'generated/prisma/client';

export class BulkUpdateWithdrawalsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  withdrawalIds!: string[];

  @ApiProperty({ enum: ['PROCESSING', 'COMPLETED', 'REJECTED'] })
  @IsIn(['PROCESSING', 'COMPLETED', 'REJECTED'])
  status!: Exclude<WithdrawalStatus, 'PENDING'>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
