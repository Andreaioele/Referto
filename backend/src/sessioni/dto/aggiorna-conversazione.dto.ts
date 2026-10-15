import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AggiornaConversazioneDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  titolo: string;
}
