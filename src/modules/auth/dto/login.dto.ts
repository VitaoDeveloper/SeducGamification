import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  codigoMatricula!: string;

  @IsString()
  @IsNotEmpty()
  senha!: string;
}