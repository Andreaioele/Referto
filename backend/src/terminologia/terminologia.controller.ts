import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CercaTerminiDto } from './dto/cerca-termini.dto';
import { RispostaCercaTerminiDto } from './dto/risposte.dto';
import { GlossarioService } from './glossario.service';

@ApiTags('terminologia')
@ApiSecurity('chiave-api')
@Controller('terminologia')
export class TerminologiaController {
  constructor(private readonly glossario: GlossarioService) {}

  @Post('cerca')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Spiega le parole mediche di un referto con il glossario',
    description:
      'Riceve solo le parole o sigle da spiegare e restituisce per ciascuna la definizione del glossario a strati ' +
      '(termini curati, HPO, Wikipedia in italiano) con fonte e link. La ricerca è deterministica: il termine più ' +
      'lungo che compare nella parola richiesta, al singolare o al plurale. Non riceve il testo del referto.',
  })
  @ApiOkResponse({ type: RispostaCercaTerminiDto })
  cerca(@Body() richiesta: CercaTerminiDto): RispostaCercaTerminiDto {
    return {
      risultati: this.glossario.cerca(richiesta.termini),
      fonte: { nome: 'Glossario medico a strati', creato: this.glossario.creato },
    };
  }
}
