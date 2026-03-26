import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialAccountType } from 'generated/prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFinancialAccountDto {
  @ApiProperty({ enum: FinancialAccountType, example: 'MOBILE_MONEY' })
  @IsEnum(FinancialAccountType)
  type!: FinancialAccountType;

  @ApiProperty({ example: 'telebirr', description: 'telebirr | cbe | awash | dashen | bank_transfer' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  provider!: string;

  @ApiProperty({ example: 'Abebe Bikila' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  accountName!: string;

  @ApiProperty({ example: '0911234567' })
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  @Matches(/^[0-9+\-\s]+$/, { message: 'Account number must contain only digits, +, -, or spaces' })
  accountNumber!: string;

  @ApiPropertyOptional({ example: 'My TeleBirr' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateFinancialAccountDto {
  @ApiPropertyOptional({ example: 'My Main Account' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
