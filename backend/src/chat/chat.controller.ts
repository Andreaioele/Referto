import { Body, Controller, Headers, Post, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Pubblico } from '../sicurezza/chiave-api.guard';
import { ChatDto } from './chat.dto';
import { LimiteRichiesteGuard } from './limite-richieste.guard';
import { ServizioChat } from './servizio-chat';

/** Intervallo dei commenti che tengono aperta la connessione mentre il modello lavora. */
const INTERVALLO_ATTESA_MS = 15000;

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly servizio: ServizioChat) {}

  /**
   * Inoltra il messaggio al Mother agent (su Evolus o ricostruito qui, vedi MOTORE_CHAT) e ritrasmette la risposta al browser
   * come Server-Sent Events: righe "data: {...}" con tipo "testo", poi "fine"
   * (con l'id della conversazione e da_cache) oppure "errore". Con MongoDB la
   * spiegazione di un referto già visto arriva dalla cache e conversazioni e
   * trace si salvano (ServizioChat). Il contenuto dei messaggi non va nei log.
   */
  @Post()
  @Pubblico()
  @UseGuards(LimiteRichiesteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Invia un messaggio al Mother agent e ricevi la risposta in streaming' })
  @ApiProduces('text/event-stream')
  @ApiHeader({ name: 'X-Utente-Id', required: false, description: 'Utente della conversazione; senza, l\'utente predefinito.' })
  async chat(
    @Body() richiesta: ChatDto,
    @Headers('x-utente-id') utente: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.servizio.configurato()) {
      throw new ServiceUnavailableException('Il servizio di spiegazione non è configurato.');
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const interruzione = new AbortController();
    res.on('close', () => interruzione.abort());
    const attesa = setInterval(() => res.write(': attesa\n\n'), INTERVALLO_ATTESA_MS);
    try {
      const eventi = this.servizio.rispondi({ ...richiesta, utente }, interruzione.signal);
      for await (const evento of eventi) {
        if (interruzione.signal.aborted) break;
        res.write(`data: ${JSON.stringify(evento)}\n\n`);
      }
    } finally {
      clearInterval(attesa);
      res.end();
    }
  }
}
