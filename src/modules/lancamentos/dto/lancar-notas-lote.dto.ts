import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { LancarNotaDto } from './lancar-nota.dto.js';

export class LancarNotasLoteDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LancarNotaDto)
  lancamentos!: LancarNotaDto[];
}