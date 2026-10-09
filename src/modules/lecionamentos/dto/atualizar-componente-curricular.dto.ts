import { IsNotEmpty, IsString } from 'class-validator';

export class AtualizarComponenteCurricularDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}
