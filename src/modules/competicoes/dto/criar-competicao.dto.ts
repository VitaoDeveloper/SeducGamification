import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CriarBimestreDto } from './criar-bimestre.dto.js';

export class CriarCompeticaoDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsUUID('loose')
  lecionamentoId!: string;

  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => CriarBimestreDto)
  bimestres!: CriarBimestreDto[];
}