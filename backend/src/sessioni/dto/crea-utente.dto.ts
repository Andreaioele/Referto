import { IsString, Length } from 'class-validator';

export class CreaUtenteDto {
  @IsString()
  @Length(2, 30)
  nickname: string;
}
