import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WithdrawalStatus } from 'generated/prisma/client';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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
