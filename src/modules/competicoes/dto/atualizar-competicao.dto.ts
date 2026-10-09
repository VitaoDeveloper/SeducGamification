import { IsNotEmpty, IsString } from 'class-validator';

export class AtualizarCompeticaoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}