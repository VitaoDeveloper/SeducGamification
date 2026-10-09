import { IsNotEmpty, IsString } from 'class-validator';

export class CriarComponenteCurricularDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;
}
