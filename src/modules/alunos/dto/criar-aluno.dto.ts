import { IsNotEmpty, IsString } from 'class-validator';

export class CriarAlunoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}