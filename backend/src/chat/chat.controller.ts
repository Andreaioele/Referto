import { Body, Controller, Post, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Pubblico } from '../sicurezza/chiave-api.guard';
import { ChatDto } from './chat.dto';
import { EvolusClient } from './evolus.client';
import { LimiteRichiesteGuard } from './limite-richieste.guard';

/** Intervallo dei commenti che tengono aperta la connessione mentre il modello lavora. */
const INTERVALLO_ATTESA_MS = 15000;

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly evolus: EvolusClient) {}

  /**
   * Inoltra il messaggio al Mother agent e ritrasmette la risposta al browser
   * come Server-Sent Events: righe "data: {...}" con tipo "testo", poi "fine"
   * (con l'id della conversazione) oppure "errore". Il contenuto dei messaggi
   * non viene registrato.
   */
  @Post()
  @Pubblico()
  @UseGuards(LimiteRichiesteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Invia un messaggio al Mother agent e ricevi la risposta in streaming' })
  @ApiProduces('text/event-stream')
  async chat(@Body() richiesta: ChatDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.evolus.configurato()) {
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
      for await (const evento of this.evolus.chiedi(richiesta.messaggio, richiesta.conversazione, interruzione.signal)) {
        if (interruzione.signal.aborted) break;
        res.write(`data: ${JSON.stringify(evento)}\n\n`);
      }
    } finally {
      clearInterval(attesa);
      res.end();
    }
  }
}
