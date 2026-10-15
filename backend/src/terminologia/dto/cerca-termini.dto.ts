import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length } from 'class-validator';

export class CercaTerminiDto {
  @ApiProperty({
    type: [String],
    description:
      'Solo le parole o sigle mediche da spiegare, come sono scritte nel referto (al massimo 10): mai il testo del referto.',
    example: ['consolidazione', 'colesterolo LDL'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  termini: string[];
}
