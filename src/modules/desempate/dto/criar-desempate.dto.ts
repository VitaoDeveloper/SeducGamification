import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrdemDesempateDto {
  @IsUUID('loose')
  grupoId!: string;

  @IsInt()
  @Min(1)
  posicao!: number;
}

export class CriarDesempateDto {
  // Ausente ou null indica o desempate do ranking anual.
  @IsOptional()
  @IsUUID('loose')
  bimestreId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrdemDesempateDto)
  ordem!: OrdemDesempateDto[];
}