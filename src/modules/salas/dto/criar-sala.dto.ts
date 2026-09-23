import { IsInt, IsNotEmpty, IsString, IsUUID, Max, Min } from 'class-validator';

export class CriarSalaDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anoLetivo!: number;

  @IsUUID('loose')
  escolaId!: string;
}