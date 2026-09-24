import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class LancarNotaDto {
  @IsUUID('loose')
  alunoId!: string;

  @IsString()
  @IsNotEmpty()
  valorNoModelo!: string;
}