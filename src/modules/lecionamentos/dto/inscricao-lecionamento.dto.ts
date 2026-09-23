import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class InscricaoLecionamentoDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  componentes!: string[];
}