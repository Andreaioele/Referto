import { Body, Controller, Delete, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Pubblico } from '../sicurezza/chiave-api.guard';
import { CreaSessioneDto } from './dto/crea-sessione.dto';
import { CreaUtenteDto } from './dto/crea-utente.dto';
import { SalvaTurnoDto } from './dto/salva-turno.dto';
import { SessioniService } from './sessioni.service';

@Controller('sessioni')
@Pubblico()
export class SessioniController {
  constructor(private readonly sessioni: SessioniService) {}

  /* ── Utenti ── */

  @Post('utenti')
  async creaUtente(@Body() dto: CreaUtenteDto) {
    const utente = await this.sessioni.creaUtente(dto.nickname);
    return { id: utente.id, nickname: utente.nickname };
  }

  @Get('utenti/:id')
  async trovaUtente(@Param('id') id: string) {
    const utente = await this.sessioni.trovaUtente(id);
    return { id: utente.id, nickname: utente.nickname };
  }

  /* ── Sessioni ── */

  @Post()
  async creaSessione(@Headers('x-utente-id') utenteId: string, @Body() dto: CreaSessioneDto) {
    this.verificaUtente(utenteId);
    const sessione = await this.sessioni.creaSessione(utenteId, dto.titolo);
    return { id: sessione.id, titolo: sessione.titolo };
  }

  @Get()
  async listaSessioni(@Headers('x-utente-id') utenteId: string) {
    this.verificaUtente(utenteId);
    const sessioni = await this.sessioni.listaSessioni(utenteId);
    return sessioni.map((s) => ({
      id: s.id,
      titolo: s.titolo,
      creata: s.creata,
      n_turni: s.turni.length,
      anteprima: s.turni.at(-1)?.risposta.slice(0, 100) ?? '',
    }));
  }

  @Get(':id')
  async dettaglioSessione(@Headers('x-utente-id') utenteId: string, @Param('id') id: string) {
    this.verificaUtente(utenteId);
    const sessione = await this.sessioni.dettaglioSessione(utenteId, id);
    return {
      id: sessione.id,
      titolo: sessione.titolo,
      creata: sessione.creata,
      turni: sessione.turni.map((t) => ({
        messaggio: t.messaggio,
        risposta: t.risposta,
        timestamp: t.timestamp,
        metadati: t.metadati,
      })),
    };
  }

  @Post(':id/turni')
  async salvaTurno(
    @Headers('x-utente-id') utenteId: string,
    @Param('id') sessioneId: string,
    @Body() dto: SalvaTurnoDto,
  ) {
    this.verificaUtente(utenteId);
    const sessione = await this.sessioni.salvaTurno(utenteId, sessioneId, dto);
    return { n_turni: sessione.turni.length };
  }

  @Delete(':id')
  async eliminaSessione(@Headers('x-utente-id') utenteId: string, @Param('id') id: string) {
    this.verificaUtente(utenteId);
    await this.sessioni.eliminaSessione(utenteId, id);
    return { eliminata: true };
  }

  private verificaUtente(utenteId: string | undefined): asserts utenteId is string {
    if (!utenteId) throw new UnauthorizedException('Intestazione X-Utente-Id mancante');
  }
}
