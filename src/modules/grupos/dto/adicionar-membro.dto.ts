import { IsUUID } from 'class-validator';

export class AdicionarMembroDto {
  @IsUUID('loose')
  alunoId!: string;

  @IsUUID('loose')
  bimestreId!: string;
}