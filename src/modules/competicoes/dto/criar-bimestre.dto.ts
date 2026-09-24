import { Type } from 'class-transformer';
import { IsDate, IsInt, Max, Min } from 'class-validator';

export class CriarBimestreDto {
  @IsInt()
  @Min(1)
  @Max(4)
  numero!: number;

  @Type(() => Date)
  @IsDate()
  dataInicio!: Date;

  @Type(() => Date)
  @IsDate()
  dataFim!: Date;
}