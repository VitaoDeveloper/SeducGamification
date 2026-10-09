import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BimestresService } from './bimestres.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

const bimestreDoProfessor = {
  id: 'b2',
  situacao: 'ABERTO',
  competicaoId: 'c1',
  competicao: {
    lecionamentoId: 'l1',
    lecionamento: { professorId: 'p1', salaId: 's1' },
  },
  numero: 2,
  dataInicio: new Date('2026-05-01T00:00:00.000Z'),
  dataFim: new Date('2026-07-31T00:00:00.000Z'),
};

const bimestreAnterior = {
  numero: 1,
  dataInicio: new Date('2026-02-02T00:00:00.000Z'),
  dataFim: new Date('2026-04-30T00:00:00.000Z'),
};

const bimestrePosterior = {
  numero: 3,
  dataInicio: new Date('2026-08-01T00:00:00.000Z'),
  dataFim: new Date('2026-10-31T00:00:00.000Z'),
};

function criarService(overrides: {
  bimestre?: unknown;
  outrosBimestres?: unknown[];
  pontuacaoCount?: number;
  updateResult?: unknown;
}) {
  const prismaMock = {
    bimestre: {
      findUnique: vi.fn(async () => overrides.bimestre ?? null),
      findMany: vi.fn(async () => overrides.outrosBimestres ?? []),
      update: vi.fn(async () => overrides.updateResult ?? null),
    },
    componentePontuacao: {
      count: vi.fn(async () => overrides.pontuacaoCount ?? 0),
    },
  } as unknown as PrismaService;

  const service = new BimestresService(prismaMock, {} as any);
  return { service, prisma: prismaMock as any };
}

describe('BimestresService.atualizar', () => {
  it('edita datas de um bimestre aberto, sem pontuação, validando contra os vizinhos', async () => {
    const { service, prisma } = criarService({
      bimestre: bimestreDoProfessor,
      outrosBimestres: [bimestreAnterior, bimestrePosterior],
      pontuacaoCount: 0,
      updateResult: {
        id: 'b2',
        numero: 2,
        dataInicio: new Date('2026-05-05T00:00:00.000Z'),
        dataFim: new Date('2026-07-20T00:00:00.000Z'),
      },
    });

    const resultado = await service.atualizar(professorLogado, 'b2', {
      dataInicio: new Date('2026-05-05T00:00:00.000Z'),
      dataFim: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(prisma.bimestre.update).toHaveBeenCalledWith({
      where: { id: 'b2' },
      data: {
        dataInicio: new Date('2026-05-05T00:00:00.000Z'),
        dataFim: new Date('2026-07-20T00:00:00.000Z'),
      },
    });
    expect(resultado.numero).toBe(2);
  });

  it('bloqueia edição de datas sobrepostas com o vizinho anterior', async () => {
    const { service, prisma } = criarService({
      bimestre: bimestreDoProfessor,
      outrosBimestres: [bimestreAnterior, bimestrePosterior],
      pontuacaoCount: 0,
    });

    await expect(
      service.atualizar(professorLogado, 'b2', {
        dataInicio: new Date('2026-04-29T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.bimestre.update).not.toHaveBeenCalled();
  });

  it('bloqueia edição de datas com fim anterior ou igual ao início', async () => {
    const { service, prisma } = criarService({
      bimestre: bimestreDoProfessor,
      outrosBimestres: [bimestreAnterior, bimestrePosterior],
      pontuacaoCount: 0,
    });

    await expect(
      service.atualizar(professorLogado, 'b2', {
        dataInicio: new Date('2026-07-01T00:00:00.000Z'),
        dataFim: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.bimestre.update).not.toHaveBeenCalled();
  });

  it('bloqueia edição de datas de bimestre com pontuação definida', async () => {
    const { service, prisma } = criarService({
      bimestre: bimestreDoProfessor,
      pontuacaoCount: 1,
    });

    await expect(
      service.atualizar(professorLogado, 'b2', {
        dataInicio: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bimestre.update).not.toHaveBeenCalled();
  });

  it('bloqueia edição de datas de bimestre encerrado', async () => {
    const { service, prisma } = criarService({
      bimestre: { ...bimestreDoProfessor, situacao: 'ENCERRADO' },
      pontuacaoCount: 0,
    });

    await expect(
      service.atualizar(professorLogado, 'b2', {
        dataInicio: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bimestre.update).not.toHaveBeenCalled();
  });
});