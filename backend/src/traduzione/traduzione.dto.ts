import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength } from 'class-validator';

export class TraduciDto {
  @ApiProperty({
    type: [String],
    description:
      'Pezzi di testo da tradurre (al massimo 8): parti della risposta di Referto verso l\'inglese, una domanda verso l\'italiano.',
    example: ['Quasi tutti i valori sono nella norma.'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(6000, { each: true })
  testi: string[];

  @ApiProperty({ enum: ['en', 'it'], description: 'Lingua di arrivo.' })
  @IsIn(['en', 'it'])
  lingua: 'en' | 'it';
}

export class TraduzioneDto {
  @ApiProperty() testo: string;
  @ApiProperty({ description: 'false: traduzione non disponibile o scartata dal controllo, `testo` è l\'originale.' })
  tradotto: boolean;
}

export class RispostaTraduciDto {
  @ApiProperty({ type: [TraduzioneDto] }) traduzioni: TraduzioneDto[];
}
