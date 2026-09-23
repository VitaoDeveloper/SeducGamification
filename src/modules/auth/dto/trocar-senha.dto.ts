import { IsNotEmpty, IsString } from 'class-validator';

export class TrocarSenhaDto {
  @IsString()
  @IsNotEmpty()
  senhaAtual!: string;

  @IsString()
  @IsNotEmpty()
  novaSenha!: string;
}