import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProntuarioService } from '../farmaci/prontuario.service';
import { Pubblico } from '../sicurezza/chiave-api.guard';

@ApiTags('salute')
@Controller('salute')
export class SaluteController {
  constructor(private readonly prontuario: ProntuarioService) {}

  @Get()
  @Pubblico()
  @ApiOperation({ summary: 'Stato del servizio e versione del prontuario caricato' })
  salute() {
    return { stato: 'ok', ...this.prontuario.info() };
  }
}
