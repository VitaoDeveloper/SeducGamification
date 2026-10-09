import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LecionamentosService } from './lecionamentos.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

const lecionamentoDoProfessor = {
  id: 'l1',
  salaId: 's1',
  professorId: 'p1',
};

const componenteDoProfessor = {
  id: 'c1',
  lecionamentoId: 'l1',
  lecionamento: { professorId: 'p1' },
};

function criarService(overrides: {
  lecionamento?: unknown;
  duplicado?: unknown;
  componente?: unknown;
  pontuacaoCount?: number;
  componenteCount?: number;
  competicaoCount?: number;
  createResult?: unknown;
  updateResult?: unknown;
}) {
  const prismaMock = {
    lecionamento: {
      findUnique: vi.fn(async () => overrides.lecionamento ?? null),
      delete: vi.fn(async () => {}),
    },
    componenteCurricular: {
      findFirst: vi.fn(async () => overrides.duplicado ?? null),
      findUnique: vi.fn(async () => overrides.componente ?? null),
      count: vi.fn(async () => overrides.componenteCount ?? 0),
      create: vi.fn(async () => overrides.createResult ?? null),
      update: vi.fn(async () => overrides.updateResult ?? null),
      delete: vi.fn(async () => {}),
    },
    componentePontuacao: {
      count: vi.fn(async () => overrides.pontuacaoCount ?? 0),
    },
    competicao: {
      count: vi.fn(async () => overrides.competicaoCount ?? 0),
    },
  } as unknown as PrismaService;

  const service = new LecionamentosService(prismaMock);
  return { service, prisma: prismaMock as any };
}

describe('LecionamentosService.adicionarComponente', () => {
  it('adiciona um componente curricular avulso ao lecionamento', async () => {
    const { service, prisma } = criarService({
      lecionamento: lecionamentoDoProfessor,
      createResult: { id: 'c2', nome: 'Matemática', lecionamentoId: 'l1' },
    });

    const resultado = await service.adicionarComponente(
      professorLogado,
      'l1',
      { nome: 'Matemática' },
    );

    expect(prisma.componenteCurricular.create).toHaveBeenCalledWith({
      data: { lecionamentoId: 'l1', nome: 'Matemática' },
    });
    expect(resultado.nome).toBe('Matemática');
  });

  it('bloqueia nome duplicado no mesmo lecionamento (case-insensitive)', async () => {
    const { service, prisma } = criarService({
      lecionamento: lecionamentoDoProfessor,
      duplicado: { id: 'c1' },
    });

    await expect(
      service.adicionarComponente(professorLogado, 'l1', {
        nome: 'matemática',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.componenteCurricular.findFirst).toHaveBeenCalledWith({
      where: {
        lecionamentoId: 'l1',
        nome: { equals: 'matemática', mode: 'insensitive' },
      },
      select: { id: true },
    });
    expect(prisma.componenteCurricular.create).not.toHaveBeenCalled();
  });

  it('bloqueia quando o lecionamento pertence a outro professor', async () => {
    const { service } = criarService({
      lecionamento: { ...lecionamentoDoProfessor, professorId: 'p2' },
    });

    await expect(
      service.adicionarComponente(professorLogado, 'l1', { nome: 'Física' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('LecionamentosService.renomearComponente', () => {
  it('renomeia mantendo o mesmo id do componente curricular', async () => {
    const { service, prisma } = criarService({
      componente: componenteDoProfessor,
      updateResult: { id: 'c1', nome: 'Matemática Aplicada' },
    });

    const resultado = await service.renomearComponente(professorLogado, 'c1', {
      nome: 'Matemática Aplicada',
    });

    expect(prisma.componenteCurricular.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { nome: 'Matemática Aplicada' },
    });
    expect(resultado.id).toBe('c1');
    expect(resultado.nome).toBe('Matemática Aplicada');
  });

  it('lança NotFoundException se o componente não existe', async () => {
    const { service } = criarService({ componente: null });

    await expect(
      service.renomearComponente(professorLogado, 'c1', { nome: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LecionamentosService.removerComponente', () => {
  it('exclui componente sem pontuação criada', async () => {
    const { service, prisma } = criarService({
      componente: componenteDoProfessor,
      pontuacaoCount: 0,
      componenteCount: 2,
    });

    await service.removerComponente(professorLogado, 'c1');

    expect(prisma.componenteCurricular.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('bloqueia exclusão de componente com pontuação criada', async () => {
    const { service, prisma } = criarService({
      componente: componenteDoProfessor,
      pontuacaoCount: 1,
      componenteCount: 2,
    });

    await expect(
      service.removerComponente(professorLogado, 'c1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.componenteCurricular.delete).not.toHaveBeenCalled();
  });

  it('bloqueia exclusão do último componente curricular do lecionamento', async () => {
    const { service, prisma } = criarService({
      componente: componenteDoProfessor,
      pontuacaoCount: 0,
      componenteCount: 1,
    });

    await expect(
      service.removerComponente(professorLogado, 'c1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.componenteCurricular.delete).not.toHaveBeenCalled();
  });
});

describe('LecionamentosService.desinscrever', () => {
  it('desinscreve lecionamento sem competições', async () => {
    const { service, prisma } = criarService({
      lecionamento: lecionamentoDoProfessor,
      competicaoCount: 0,
    });

    await service.desinscrever(professorLogado, 'l1');

    expect(prisma.lecionamento.delete).toHaveBeenCalledWith({
      where: { id: 'l1' },
    });
  });

  it('bloqueia desinscrição com competições vinculadas', async () => {
    const { service, prisma } = criarService({
      lecionamento: lecionamentoDoProfessor,
      competicaoCount: 1,
    });

    await expect(
      service.desinscrever(professorLogado, 'l1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.lecionamento.delete).not.toHaveBeenCalled();
  });
});
