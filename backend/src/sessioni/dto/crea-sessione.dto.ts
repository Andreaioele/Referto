import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreaSessioneDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titolo?: string;
}
