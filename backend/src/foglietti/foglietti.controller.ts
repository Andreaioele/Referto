import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { LimiteRichiesteGuard } from '../chat/limite-richieste.guard';
import { Pubblico } from '../sicurezza/chiave-api.guard';
import { FogliettiService, type RispostaDomanda } from './foglietti.service';

export class DomandaDto {
  @ApiProperty({ description: 'Domanda della persona sul foglio illustrativo', maxLength: 500 })
  @IsString()
  @Length(2, 500)
  domanda: string;

  @ApiPropertyOptional({ description: 'Confezione prescritta, per scegliere il foglio giusto se il PDF ne ha più di uno' })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  forma?: string;
}

/**
 * Fogli illustrativi ufficiali AIFA per i pazienti: rotte pubbliche (le usa
 * il browser), a differenza di /api/farmaci che è riservata agli agenti.
 */
@ApiTags('foglietti')
@Controller('foglietti')
export class FogliettiController {
  constructor(private readonly foglietti: FogliettiService) {}

  @Get(':cod')
  @Pubblico()
  @ApiOperation({ summary: 'Dati del foglio illustrativo: farmaco, pagine e sezioni con la loro pagina' })
  @ApiParam({ name: 'cod', example: '027161' })
  @ApiQuery({ name: 'forma', required: false, description: 'Confezione prescritta (es. "10.000 U.I./ml gocce orali")' })
  async info(@Param('cod') cod: string, @Query('forma') forma?: string) {
    const { farmaco, pagine, titolo, sezioni } = await this.foglietti.foglio(cod, String(forma ?? '').slice(0, 120));
    return {
      cod: farmaco.cod,
      nome: farmaco.nome,
      ditta: farmaco.ditta,
      principio_attivo: farmaco.principio_attivo,
      url_aifa: farmaco.foglietto_url,
      pagine,
      titolo_foglio: titolo,
      sezioni: sezioni.map(({ numero, titolo, pagina }) => ({ numero, titolo, pagina })),
    };
  }

  @Get(':cod/pdf')
  @Pubblico()
  @ApiOperation({ summary: 'Il PDF ufficiale del foglio illustrativo, servito dallo stesso dominio' })
  @ApiProduces('application/pdf')
  async pdf(@Param('cod') cod: string, @Res() res: Response): Promise<void> {
    const { pdf } = await this.foglietti.foglietto(cod);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="foglietto-${cod}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(pdf));
  }

  @Post(':cod/domande')
  @HttpCode(200)
  @Pubblico()
  @UseGuards(LimiteRichiesteGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Risponde a una domanda usando solo il foglio illustrativo',
    description:
      'Sceglie in modo deterministico i brani del foglio vicini alla domanda e li passa al Mother agent, che ' +
      'deve rispondere solo con quelli e citare la sezione. Se l\'agente non risponde, restituisce il brano.',
  })
  domanda(@Param('cod') cod: string, @Body() richiesta: DomandaDto): Promise<RispostaDomanda> {
    return this.foglietti.domanda(cod, richiesta.domanda, richiesta.forma);
  }
}
