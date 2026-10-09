import { IsNotEmpty, IsString } from 'class-validator';

export class AtualizarAlunoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}