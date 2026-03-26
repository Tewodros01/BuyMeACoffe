import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'john_doe', description: 'Unique username' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username!: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Password123!', description: 'User password' })
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName!: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Phone number' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid international format',
  })
  phone?: string;

  @ApiPropertyOptional({
    example: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john_doe',
    description: 'Avatar URL',
  })
  @IsOptional()
  @IsString()
  avatar?: string;
}
