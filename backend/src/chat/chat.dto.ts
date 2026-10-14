import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const LUNGHEZZA_MASSIMA_MESSAGGIO = 30000;

export class ChatDto {
  @ApiProperty({
    description: 'Il testo del referto oppure una domanda. Togliere prima nome, codice fiscale e indirizzo.',
    maxLength: LUNGHEZZA_MASSIMA_MESSAGGIO,
  })
  @IsString()
  @Length(1, LUNGHEZZA_MASSIMA_MESSAGGIO)
  messaggio: string;

  @ApiPropertyOptional({ description: 'Conversazione da continuare (restituita dall\'evento "fine").' })
  @IsOptional()
  @IsUUID()
  conversazione?: string;
}
