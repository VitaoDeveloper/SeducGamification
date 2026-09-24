import { IsNotEmpty, IsString } from 'class-validator';

export class CriarGrupoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}