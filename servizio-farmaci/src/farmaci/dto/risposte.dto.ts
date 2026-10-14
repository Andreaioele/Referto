import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Classi usate solo per descrivere le risposte nella documentazione OpenAPI. */

export class ProdottoDto {
  @ApiProperty({ example: '024840', description: 'Codice del farmaco AIFA (COD_FARMACO)' }) cod: string;
  @ApiProperty({ example: 'CARDIOASPIRIN' }) nome: string;
  @ApiProperty({ example: 'BAYER S.P.A.' }) ditta: string;
  @ApiProperty({ example: 'acido acetilsalicilico' }) principio_attivo: string;
  @ApiProperty({ example: 'B01AC06' }) atc: string;
  @ApiProperty({ type: [String] }) forme: string[];
  @ApiProperty() fornitura: string;
  @ApiProperty({ type: [String] }) confezioni: string[];
  @ApiProperty() n_confezioni: number;
  @ApiProperty({ description: 'Foglietto illustrativo ufficiale (Banca Dati Farmaci AIFA)' }) foglietto_url: string;
  @ApiProperty({ description: 'Riassunto delle caratteristiche del prodotto (AIFA)' }) rcp_url: string;
}

export class RisultatoDto {
  @ApiProperty({ example: 'Cardioaspirin 100 mg', description: 'Il nome ricevuto nella richiesta' })
  nome: string;

  @ApiProperty({ description: 'false se il nome non corrisponde a nessun farmaco del prontuario AIFA' })
  trovato: boolean;

  @ApiPropertyOptional({ example: 'acido acetilsalicilico' }) principio_attivo?: string;
  @ApiPropertyOptional({ example: 'B01AC06' }) atc?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Classificazione ATC dal gruppo anatomico al farmacologico',
    example: ['sangue e organi emopoietici', 'antitrombotici', "antiaggreganti piastrinici, esclusa l'eparina"],
  })
  categoria?: string[];

  @ApiPropertyOptional({
    description: "Frase pronta con i soli dati AIFA (che cos'è e categoria), senza dosi né consigli",
  })
  descrizione?: string;

  @ApiPropertyOptional({
    enum: ['nome commerciale', 'unico con questo principio attivo', 'da scegliere'],
    description: '"da scegliere": il nome non identifica un solo farmaco e il servizio non sceglie',
  })
  corrispondenza?: string;

  @ApiPropertyOptional({ type: ProdottoDto, nullable: true, description: 'Il farmaco, solo se univoco' })
  farmaco?: ProdottoDto | null;

  @ApiPropertyOptional({ description: 'Perché il farmaco non è univoco' }) perche?: string;
  @ApiPropertyOptional({ type: [ProdottoDto] }) alternative?: ProdottoDto[];
  @ApiPropertyOptional() alternative_totali?: number;
}

export class FonteDto {
  @ApiProperty() fonte: string;
  @ApiProperty({ example: '2026-10-13' }) aggiornato: string;
}

export class RispostaCercaDto {
  @ApiProperty({ type: FonteDto }) fonte: FonteDto;
  @ApiProperty({ type: [RisultatoDto] }) risultati: RisultatoDto[];
}
