import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SalvaTurnoDto {
  @IsString()
  @MaxLength(30_000)
  messaggio: string;

  @IsString()
  @MaxLength(100_000)
  risposta: string;

  @IsOptional()
  @IsString()
  conversazione_evolus?: string;

  @IsOptional()
  @IsObject()
  metadati?: Record<string, unknown>;
}
