import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CercaFarmaciDto } from './dto/cerca-farmaci.dto';
import { cercaFarmaci } from './cerca-farmaci';
import { ProdottoDto, RispostaCercaDto } from './dto/risposte.dto';
import { ProntuarioService } from './prontuario.service';

@ApiTags('farmaci')
@ApiSecurity('chiave-api')
@Controller('farmaci')
export class FarmaciController {
  constructor(private readonly prontuario: ProntuarioService) {}

  @Post('cerca')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Collega al prontuario AIFA i farmaci nominati in un referto',
    description:
      'Riceve solo i nomi dei farmaci (nome commerciale o principio attivo, anche con il dosaggio) e ' +
      'restituisce per ciascuno principio attivo, categoria ATC e una frase pronta. Il collegamento è ' +
      'deterministico: se il nome non identifica un solo farmaco, il servizio non sceglie e restituisce ' +
      'le alternative. Non riceve né conserva il testo del referto.',
  })
  @ApiOkResponse({ type: RispostaCercaDto })
  cerca(@Body() richiesta: CercaFarmaciDto): RispostaCercaDto {
    return cercaFarmaci(this.prontuario, richiesta.farmaci, richiesta.limite_alternative ?? 5);
  }

  @Get(':cod')
  @ApiOperation({ summary: 'Un farmaco del prontuario AIFA per codice (COD_FARMACO)' })
  @ApiParam({ name: 'cod', example: '024840' })
  @ApiOkResponse({ type: ProdottoDto })
  farmaco(@Param('cod') cod: string): ProdottoDto & { categoria: string[] } {
    const farmaco = this.prontuario.farmaco(cod);
    if (!farmaco) throw new NotFoundException(`Nessun farmaco AIFA con codice ${cod}`);
    return farmaco;
  }
}
