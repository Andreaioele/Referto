import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Pubblico } from '../sicurezza/chiave-api.guard';
import { areaDaEtichetta } from './aree';
import { CercaStruttureDto, DUOMO } from './cerca-strutture.dto';
import { StruttureService } from './strutture.service';

/**
 * Strutture sanitarie di Milano per la sezione "Le mie strutture": rotte
 * pubbliche (le usa il browser), ricevono solo l'area del referto e un punto
 * di partenza, mai il testo del referto.
 */
@ApiTags('strutture')
@Controller('strutture')
export class StruttureController {
  constructor(private readonly strutture: StruttureService) {}

  @Get('aree')
  @Pubblico()
  @ApiOperation({ summary: 'Le aree della classificazione del Mother agent, con fonti e data dei dati' })
  aree() {
    return { aree: this.strutture.aree(), ...this.strutture.info() };
  }

  @Get()
  @Pubblico()
  @ApiOperation({
    summary: "Strutture per l'area del referto (o per tipo), dalla più vicina",
    description:
      "Con `area` (come la scrive il Mother agent nella riga ARGOMENTO) restituisce i gruppi: per `categoria=strutture` specialisti e ospedali, per `categoria=professionisti` studi medici e medici di famiglia o pediatri. Con `tipo` l'elenco di quel tipo. Dati locali di Milano, nessun servizio esterno.",
  })
  cerca(@Query() richiesta: CercaStruttureDto) {
    const lat = richiesta.lat ?? DUOMO.lat;
    const lon = richiesta.lon ?? DUOMO.lon;
    const limite = richiesta.limite ?? 5;
    if (richiesta.area) {
      const area = areaDaEtichetta(richiesta.area);
      if (!area) throw new BadRequestException(`Area sconosciuta: ${richiesta.area}`);
      return this.strutture.perArea(area, lat, lon, limite, richiesta.categoria ?? 'strutture');
    }
    if (richiesta.tipo) return { tipo: richiesta.tipo, ...this.strutture.perTipo(richiesta.tipo, lat, lon, limite) };
    throw new BadRequestException('Indica area oppure tipo.');
  }
}
