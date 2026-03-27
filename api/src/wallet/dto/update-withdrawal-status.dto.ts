import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WithdrawalStatus } from 'generated/prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const allowedStatuses = ['PROCESSING', 'COMPLETED', 'REJECTED'] as const;

export class UpdateWithdrawalStatusDto {
  @ApiProperty({ enum: allowedStatuses })
  @IsIn(allowedStatuses)
  status!: Exclude<WithdrawalStatus, 'PENDING'>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;
}
