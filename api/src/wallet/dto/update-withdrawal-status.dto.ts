import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { WithdrawalStatus } from 'generated/prisma/client';

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
