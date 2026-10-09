import { IsNotEmpty, IsString } from 'class-validator';

export class AtualizarGrupoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}