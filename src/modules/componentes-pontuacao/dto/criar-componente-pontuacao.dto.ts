import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CriarComponentePontuacaoDto {
  @IsUUID('loose')
  componenteCurricularId!: string;

  @IsString()
  @IsNotEmpty()
  nome!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  pesoPercentual!: number;
}