import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FarmacoRichiestoDto {
  @ApiProperty({
    description: 'Nome del farmaco esattamente come è scritto nel referto, anche con il dosaggio.',
    example: 'Cardioaspirin 100 mg',
  })
  @IsString()
  @Length(1, 120)
  nome: string;

  @ApiPropertyOptional({
    description: "Principio attivo, se l'agente lo conosce. Serve per i nomi esteri non presenti in Italia.",
    example: 'acido acetilsalicilico',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  principio_attivo?: string;
}

export class CercaFarmaciDto {
  @ApiProperty({
    type: [FarmacoRichiestoDto],
    description:
      'Solo i nomi dei farmaci trovati nel referto, mai il testo del referto: il servizio non riceve dati sanitari.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FarmacoRichiestoDto)
  farmaci: FarmacoRichiestoDto[];

  @ApiPropertyOptional({
    description: 'Quante alternative restituire quando il nome non identifica un solo farmaco.',
    default: 5,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  limite_alternative?: number;
}
