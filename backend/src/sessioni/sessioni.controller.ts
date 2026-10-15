import { Body, Controller, Delete, Get, Headers, Param, Patch } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AggiornaConversazioneDto } from './dto/aggiorna-conversazione.dto';
import { SessioniService } from './sessioni.service';

/**
 * Storico delle conversazioni salvate dalla chat (referto, spiegazione,
 * domande e trace). Le scrive solo il backend, in POST /api/chat; qui si
 * leggono, si rinominano e si eliminano. Contengono il testo dei referti:
 * le rotte chiedono la chiave API (x-api-key) quando CHIAVE_API è impostata.
 */
@ApiTags('sessioni')
@ApiHeader({ name: 'X-Utente-Id', required: false, description: 'Utente; senza, l\'utente predefinito.' })
@Controller('sessioni')
export class SessioniController {
  constructor(private readonly sessioni: SessioniService) {}

  @Get('utente')
  @ApiOperation({ summary: 'L\'utente corrente (login fake: senza X-Utente-Id è l\'utente predefinito)' })
  async utente(@Headers('x-utente-id') richiesto?: string) {
    const id = await this.sessioni.utente(richiesto);
    return { id, nickname: await this.sessioni.nickname(id) };
  }

  @Get('conversazioni')
  @ApiOperation({ summary: 'Conversazioni dell\'utente, dalla più recente (senza testi)' })
  async listaConversazioni(@Headers('x-utente-id') richiesto?: string) {
    const utente = await this.sessioni.utente(richiesto);
    const lista = await this.sessioni.listaConversazioni(utente);
    return lista.map((c) => ({
      id: c._id,
      titolo: c.titolo,
      area: c.area,
      da_cache: c.spiegazione.da_cache,
      domande: c.turni.length,
      creata: c.createdAt,
      aggiornata: c.updatedAt,
    }));
  }

  @Get('conversazioni/:id')
  @ApiOperation({ summary: 'Referto, spiegazione e domande di una conversazione, senza rigenerare nulla' })
  async dettaglioConversazione(@Param('id') id: string, @Headers('x-utente-id') richiesto?: string) {
    const conv = await this.sessioni.dettaglioConversazione(await this.sessioni.utente(richiesto), id);
    return {
      id: conv._id,
      titolo: conv.titolo,
      area: conv.area,
      referto: conv.referto.testo,
      spiegazione: { testo: conv.spiegazione.testo, da_cache: conv.spiegazione.da_cache, trace: conv.spiegazione.trace },
      turni: conv.turni.map((t) => ({ id: t._id, messaggio: t.messaggio, risposta: t.risposta, trace: t.trace, creato: t.createdAt })),
      creata: conv.createdAt,
      aggiornata: conv.updatedAt,
    };
  }

  @Get('conversazioni/:id/trace')
  @ApiOperation({ summary: 'Trace di ogni generazione della conversazione (anche errori e risposte dalla cache)' })
  async traceConversazione(@Param('id') id: string, @Headers('x-utente-id') richiesto?: string) {
    const trace = await this.sessioni.traceConversazione(await this.sessioni.utente(richiesto), id);
    return trace.map(({ _id, utente: _utente, conversazione: _conversazione, ...resto }) => ({ id: _id, ...resto }));
  }

  @Patch('conversazioni/:id')
  @ApiOperation({ summary: 'Rinomina una conversazione' })
  async rinominaConversazione(
    @Param('id') id: string,
    @Body() dto: AggiornaConversazioneDto,
    @Headers('x-utente-id') richiesto?: string,
  ) {
    const conv = await this.sessioni.rinominaConversazione(await this.sessioni.utente(richiesto), id, dto.titolo);
    return { id: conv._id, titolo: conv.titolo };
  }

  @Delete('conversazioni/:id')
  @ApiOperation({ summary: 'Elimina una conversazione e le sue trace' })
  async eliminaConversazione(@Param('id') id: string, @Headers('x-utente-id') richiesto?: string) {
    await this.sessioni.eliminaConversazione(await this.sessioni.utente(richiesto), id);
    return { eliminata: true };
  }
}
