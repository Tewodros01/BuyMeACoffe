import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreatePollOptionDto {
  @ApiProperty({ example: 'Tutorial' })
  @IsString()
  @MaxLength(80)
  text!: string;
}

export class CreatePollDto {
  @ApiProperty({ example: 'What should I post next?' })
  @IsString()
  @MaxLength(200)
  question!: string;

  @ApiProperty({ example: 10, description: 'Price in ETB per paid vote' })
  @IsNumber()
  @Min(1)
  price!: number;

  @ApiProperty({
    type: [CreatePollOptionDto],
    example: [{ text: 'Comedy' }, { text: 'Story' }, { text: 'Tutorial' }],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CreatePollOptionDto)
  options!: CreatePollOptionDto[];
}
