import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export const LUNGHEZZA_MASSIMA_MESSAGGIO = 30000;

export class ChatDto {
  @ApiProperty({
    description: 'Il testo del referto oppure una domanda. Togliere prima nome, codice fiscale e indirizzo.',
    maxLength: LUNGHEZZA_MASSIMA_MESSAGGIO,
  })
  @IsString()
  @Length(1, LUNGHEZZA_MASSIMA_MESSAGGIO)
  messaggio: string;

  @ApiPropertyOptional({
    description: 'Conversazione da continuare (restituita dall\'evento "fine"): id MongoDB o, senza database, UUID del motore.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, {
    message: 'conversazione non valida',
  })
  conversazione?: string;
}
