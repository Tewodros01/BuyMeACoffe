import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Password123!', description: 'User password' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'Password123!', description: 'New password' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'Password123!', description: 'New password' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
