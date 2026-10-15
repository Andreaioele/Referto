import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EsitoTermineDto {
  @ApiProperty({ example: 'consolidazioni' })
  richiesto: string;

  @ApiProperty({ description: 'Se il glossario ha una voce per il termine.' })
  trovato: boolean;

  @ApiPropertyOptional({ description: 'Nome della voce del glossario.', example: 'consolidazione' })
  termine?: string;

  @ApiPropertyOptional({ description: 'Definizione così come è nella fonte (prime frasi, al massimo 400 caratteri).' })
  definizione?: string;

  @ApiPropertyOptional({ description: '"it", oppure "en" per le definizioni HPO non tradotte.', example: 'it' })
  lingua?: string;

  @ApiPropertyOptional({ example: 'Wikipedia in italiano (CC BY-SA 4.0)' })
  fonte?: string;

  @ApiPropertyOptional({ nullable: true, example: 'https://it.wikipedia.org/wiki/Rene' })
  url?: string | null;
}

export class RispostaCercaTerminiDto {
  @ApiProperty({ type: [EsitoTermineDto] })
  risultati: EsitoTermineDto[];

  @ApiProperty({ example: { nome: 'Glossario medico a strati', creato: '2026-10-16' } })
  fonte: { nome: string; creato: string };
}
