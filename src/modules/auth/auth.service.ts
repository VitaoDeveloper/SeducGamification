import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { TrocarSenhaDto } from './dto/trocar-senha.dto.js';
import {
  JwtPayload,
  TipoUsuario,
  UsuarioAutenticado,
} from './usuario-autenticado.js';

const ROUNDS_HASH_SENHA = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const professor = await this.prisma.professor.findUnique({
      where: { codigoMatricula: dto.codigoMatricula },
      select: { id: true, senhaHash: true },
    });

    if (
      professor &&
      (await compare(dto.senha, professor.senhaHash))
    ) {
      return this.emitirToken(professor.id, 'PROFESSOR');
    }

    const aluno = await this.prisma.aluno.findUnique({
      where: { codigoMatricula: dto.codigoMatricula },
      select: { id: true, senhaHash: true },
    });

    if (aluno && (await compare(dto.senha, aluno.senhaHash))) {
      return this.emitirToken(aluno.id, 'ALUNO');
    }

    throw new UnauthorizedException(
      'Código de matrícula ou senha inválidos.',
    );
  }

  private async emitirToken(
    sub: string,
    tipo: TipoUsuario,
  ): Promise<{ accessToken: string }> {
    const payload: JwtPayload = { sub, tipo };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken };
  }

  me(user: UsuarioAutenticado): UsuarioAutenticado {
    return user;
  }

  async trocarSenha(
    user: UsuarioAutenticado,
    dto: TrocarSenhaDto,
  ): Promise<void> {
    if (user.tipo === 'PROFESSOR') {
      const professor = await this.prisma.professor.findUnique({
        where: { id: user.id },
        select: { id: true, senhaHash: true },
      });
      if (
        !professor ||
        !(await compare(dto.senhaAtual, professor.senhaHash))
      ) {
        throw new UnauthorizedException('Senha atual incorreta.');
      }
      await this.prisma.professor.update({
        where: { id: user.id },
        data: { senhaHash: await hash(dto.novaSenha, ROUNDS_HASH_SENHA) },
      });
      return;
    }

    const aluno = await this.prisma.aluno.findUnique({
      where: { id: user.id },
      select: { id: true, senhaHash: true },
    });
    if (!aluno || !(await compare(dto.senhaAtual, aluno.senhaHash))) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }
    await this.prisma.aluno.update({
      where: { id: user.id },
      data: { senhaHash: await hash(dto.novaSenha, ROUNDS_HASH_SENHA) },
    });
  }
}