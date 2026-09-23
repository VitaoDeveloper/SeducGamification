import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { TIPO_USUARIO } from './usuario-autenticado.js';

describe('AuthService', () => {
  function criarService(overrides: {
    professor?: unknown;
    aluno?: unknown;
  }): {
    service: AuthService;
    prisma: { professor: { findUnique: ReturnType<typeof vi.fn> }; aluno: { findUnique: ReturnType<typeof vi.fn> } };
  } {
    const prismaMock = {
      professor: {
        findUnique: vi.fn(async ({ where }: { where: { codigoMatricula: string } }) => {
          if (overrides.professor && (overrides.professor as { codigoMatricula: string }).codigoMatricula === where.codigoMatricula) {
            return overrides.professor;
          }
          return null;
        }),
      },
      aluno: {
        findUnique: vi.fn(async ({ where }: { where: { codigoMatricula: string } }) => {
          if (overrides.aluno && (overrides.aluno as { codigoMatricula: string }).codigoMatricula === where.codigoMatricula) {
            return overrides.aluno;
          }
          return null;
        }),
      },
    } as unknown as PrismaService;

    const jwtMock = {
      signAsync: vi.fn(async () => 'token.jwt.simulado'),
    } as unknown as JwtService;

    const service = new AuthService(prismaMock, jwtMock);
    return { service, prisma: prismaMock as any };
  }

  it('autentica professor e retorna token', async () => {
    const hashReal = await hash('minha-senha', 4);
    const { service } = criarService({
      professor: { id: 'p1', codigoMatricula: '26001', senhaHash: hashReal },
    });

    const resultado = await service.login({
      codigoMatricula: '26001',
      senha: 'minha-senha',
    });

    expect(resultado.accessToken).toBe('token.jwt.simulado');
  });

  it('autentica aluno quando não encontra professor', async () => {
    const hashReal = await hash('senha-aluno', 4);
    const { service, prisma } = criarService({
      aluno: { id: 'a1', codigoMatricula: '26001', senhaHash: hashReal },
    });

    const resultado = await service.login({
      codigoMatricula: '26001',
      senha: 'senha-aluno',
    });

    expect(prisma.professor.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.aluno.findUnique).toHaveBeenCalledTimes(1);
    expect(resultado.accessToken).toBe('token.jwt.simulado');
  });

  it('lança 401 com senha errada', async () => {
    const hashReal = await hash('certa', 4);
    const { service } = criarService({
      professor: { id: 'p1', codigoMatricula: '26001', senhaHash: hashReal },
    });

    await expect(
      service.login({ codigoMatricula: '26001', senha: 'errada' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lança 401 quando o código não existe', async () => {
    const { service } = criarService({});

    await expect(
      service.login({ codigoMatricula: '26999', senha: 'qualquer' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('me retorna o usuário autenticado', () => {
    const { service } = criarService({});
    const usuario = { id: 'p1', tipo: TIPO_USUARIO.PROFESSOR };
    expect(service.me(usuario)).toEqual(usuario);
  });
});