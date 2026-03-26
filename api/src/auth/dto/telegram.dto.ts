import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TelegramLoginDto {
  @ApiProperty({
    description: 'Raw Telegram Mini App initData string',
    example:
      'query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%7D&auth_date=1710000000&hash=abcdef',
  })
  @IsString()
  initData!: string;
}

export class TelegramSendMessageDto {
  @ApiProperty({ example: 'Welcome to Bingo Wallet!' })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  @ApiPropertyOptional({ example: 'HTML' })
  @IsOptional()
  @IsString()
  parseMode?: 'HTML' | 'MarkdownV2';
}
