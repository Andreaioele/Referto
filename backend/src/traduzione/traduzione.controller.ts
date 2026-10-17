import { Body, Controller, HttpCode, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LimiteRichiesteGuard } from '../chat/limite-richieste.guard';
import { Pubblico } from '../sicurezza/chiave-api.guard';
import { RispostaTraduciDto, TraduciDto } from './traduzione.dto';
import { TraduttoreService } from './traduttore.service';

@ApiTags('traduzione')
@Controller('traduzione')
export class TraduzioneController {
  constructor(private readonly traduttore: TraduttoreService) {}

  @Post()
  @HttpCode(200)
  @Pubblico()
  @UseGuards(LimiteRichiesteGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: "Traduce le risposte di Referto in inglese (o una domanda in italiano) per l'interfaccia in inglese",
    description:
      'Il Mother agent scrive sempre in italiano: con l\'interfaccia in inglese il browser manda qui le parti della risposta. ' +
      'Ogni traduzione verso l\'inglese deve avere gli stessi numeri e le stesse citazioni «…» dell\'originale, altrimenti ' +
      'torna l\'originale con tradotto=false. Il contenuto non va nei log.',
  })
  @ApiOkResponse({ type: RispostaTraduciDto })
  async traduci(@Body() richiesta: TraduciDto): Promise<RispostaTraduciDto> {
    if (!this.traduttore.configurato()) throw new ServiceUnavailableException('La traduzione non è configurata.');
    return { traduzioni: await this.traduttore.traduci(richiesta.testi, richiesta.lingua) };
  }
}
