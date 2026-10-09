import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class AtualizarBimestreDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dataInicio?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dataFim?: Date;
}