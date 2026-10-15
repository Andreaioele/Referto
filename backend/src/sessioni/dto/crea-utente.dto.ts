import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreaUtenteDto {
  @ApiProperty({ minLength: 2, maxLength: 30 })
  @IsString()
  @Length(2, 30)
  nickname: string;
}
