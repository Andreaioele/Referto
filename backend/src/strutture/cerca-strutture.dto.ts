import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { TipoStruttura } from './aree';

export const TIPI: TipoStruttura[] = [
  'ospedale',
  'casa-di-cura',
  'ambulatorio',
  'laboratorio',
  'medico-di-famiglia',
  'pediatra',
  'studio-medico',
  'farmacia',
  'consultorio',
  'riabilitazione',
  'dipendenze',
  'centro-trasfusionale',
];

/** Centro di Milano (Duomo): punto di partenza se non se ne indica un altro. */
export const DUOMO = { lat: 45.4642, lon: 9.19 };

/** "strutture": luoghi (ospedali, ambulatori, laboratori...); "professionisti": medici e studi. */
export const CATEGORIE = ['strutture', 'professionisti'] as const;
export type Categoria = (typeof CATEGORIE)[number];

export class CercaStruttureDto {
  @ApiPropertyOptional({ description: 'Con `area`: luoghi o professionisti.', enum: CATEGORIE, default: 'strutture' })
  @IsOptional()
  @IsIn(CATEGORIE)
  categoria?: Categoria;

  @ApiPropertyOptional({
    description: 'Area del referto come la scrive il Mother agent nella riga ARGOMENTO (o il suo id).',
    example: 'Cardiologia',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @ApiPropertyOptional({ description: 'Tipo di struttura, in alternativa all’area.', enum: TIPI })
  @IsOptional()
  @IsIn(TIPI)
  tipo?: TipoStruttura;

  @ApiPropertyOptional({ description: 'Latitudine del punto di partenza (dentro Milano).', example: 45.5041 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(45.38)
  @Max(45.54)
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitudine del punto di partenza (dentro Milano).', example: 9.2225 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(9.04)
  @Max(9.28)
  lon?: number;

  @ApiPropertyOptional({ description: 'Quante strutture per gruppo.', default: 5, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number;
}
