import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SalasService } from './salas.service.js';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

function criarService(overrides: {
  sala?: unknown;
  vinculo?: unknown;
  matriculaCount?: number;
  lecionamentoCount?: number;
  updateResult?: unknown;
}) {
  const prismaMock = {
    vinculoProfessor: {
      findUnique: vi.fn(async () => overrides.vinculo ?? null),
    },
    sala: {
      findUnique: vi.fn(async () => overrides.sala ?? null),
      update: vi.fn(async () => overrides.updateResult ?? null),
      delete: vi.fn(async () => {}),
    },
    matricula: {
      count: vi.fn(async () => overrides.matriculaCount ?? 0),
    },
    lecionamento: {
      count: vi.fn(async () => overrides.lecionamentoCount ?? 0),
    },
  } as unknown as PrismaService;

  const service = new SalasService(prismaMock);
  return { service, prisma: prismaMock as any };
}

describe('SalasService', () => {
  it('atualiza nome e ano de uma sala do professor vinculado', async () => {
    const { service, prisma } = criarService({
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      updateResult: {
        id: 's1',
        nome: '3º DS',
        anoLetivo: 2026,
        escolaId: 'e1',
        escola: {
          id: 'e1',
          nome: 'Escola',
          modeloAvaliacao: {
            tipoEscala: 'CPS_ETEC',
            nivelEscalas: [],
          },
        },
      },
    });

    const resultado = await service.atualizar(professorLogado, 's1', {
      nome: '3º DS',
      anoLetivo: 2026,
    });

    expect(prisma.sala.findUnique).toHaveBeenCalled();
    expect(prisma.vinculoProfessor.findUnique).toHaveBeenCalled();
    expect(prisma.sala.update).toHaveBeenCalledTimes(1);
    expect(resultado.nome).toBe('3º DS');
    expect(resultado.anoLetivo).toBe(2026);
  });

  it('bloqueia atualização de sala não vinculada ao professor', async () => {
    const { service } = criarService({
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: null,
    });

    await expect(
      service.atualizar(professorLogado, 's1', { nome: 'Nova' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exclui sala vazia', async () => {
    const { service, prisma } = criarService({
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      matriculaCount: 0,
      lecionamentoCount: 0,
    });

    await service.excluir(professorLogado, 's1');

    expect(prisma.matricula.count).toHaveBeenCalledWith({ where: { salaId: 's1' } });
    expect(prisma.lecionamento.count).toHaveBeenCalledWith({
      where: { salaId: 's1' },
    });
    expect(prisma.sala.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('bloqueia exclusão com alunos matriculados', async () => {
    const { service } = criarService({
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      matriculaCount: 2,
      lecionamentoCount: 0,
    });

    await expect(service.excluir(professorLogado, 's1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('bloqueia exclusão com lecionamentos mas sem alunos', async () => {
    const { service } = criarService({
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      matriculaCount: 0,
      lecionamentoCount: 1,
    });

    await expect(service.excluir(professorLogado, 's1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lança NotFoundException se sala não existe', async () => {
    const { service } = criarService({
      sala: null,
    });

    await expect(
      service.atualizar(professorLogado, 's1', { nome: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
