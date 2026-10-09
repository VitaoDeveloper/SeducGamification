import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompeticoesService } from './competicoes.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

const competicaoDoProfessor = {
  id: 'c1',
  lecionamentoId: 'l1',
  lecionamento: { professorId: 'p1', salaId: 's1' },
};

function criarService(overrides: {
  competicao?: unknown;
  bimestresEncerrados?: number;
  pontuacaoCount?: number;
  membroCount?: number;
  updateResult?: unknown;
}) {
  const prismaMock = {
    competicao: {
      findUnique: vi.fn(async () => overrides.competicao ?? null),
      update: vi.fn(async () => overrides.updateResult ?? null),
      delete: vi.fn(async () => {}),
    },
    bimestre: {
      count: vi.fn(async () => overrides.bimestresEncerrados ?? 0),
    },
    componentePontuacao: {
      count: vi.fn(async () => overrides.pontuacaoCount ?? 0),
    },
    membroGrupo: {
      count: vi.fn(async () => overrides.membroCount ?? 0),
    },
  } as unknown as PrismaService;

  const service = new CompeticoesService(prismaMock);
  return { service, prisma: prismaMock as any };
}

describe('CompeticoesService.atualizar', () => {
  it('edita o nome de uma competição do professor', async () => {
    const { service, prisma } = criarService({
      competicao: competicaoDoProfessor,
      updateResult: { id: 'c1', nome: 'Gincana 2026', lecionamentoId: 'l1' },
    });

    const resultado = await service.atualizar(professorLogado, 'c1', {
      nome: 'Gincana 2026',
    });

    expect(prisma.competicao.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { nome: 'Gincana 2026' },
    });
    expect(resultado.nome).toBe('Gincana 2026');
  });
});

describe('CompeticoesService.excluir', () => {
  it('exclui competição vazia (sem pontuação, sem encerrado, sem grupo com membro)', async () => {
    const { service, prisma } = criarService({
      competicao: competicaoDoProfessor,
      bimestresEncerrados: 0,
      pontuacaoCount: 0,
      membroCount: 0,
    });

    await service.excluir(professorLogado, 'c1');

    expect(prisma.bimestre.count).toHaveBeenCalledWith({
      where: { competicaoId: 'c1', situacao: 'ENCERRADO' },
    });
    expect(prisma.componentePontuacao.count).toHaveBeenCalledWith({
      where: { bimestre: { competicaoId: 'c1' } },
    });
    expect(prisma.membroGrupo.count).toHaveBeenCalledWith({
      where: { grupo: { competicaoId: 'c1' } },
    });
    expect(prisma.competicao.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('bloqueia exclusão com bimestre encerrado', async () => {
    const { service, prisma } = criarService({
      competicao: competicaoDoProfessor,
      bimestresEncerrados: 1,
    });

    await expect(service.excluir(professorLogado, 'c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.competicao.delete).not.toHaveBeenCalled();
  });

  it('bloqueia exclusão com pontuação definida, mesmo sem bimestre encerrado', async () => {
    const { service, prisma } = criarService({
      competicao: competicaoDoProfessor,
      bimestresEncerrados: 0,
      pontuacaoCount: 1,
    });

    await expect(service.excluir(professorLogado, 'c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.competicao.delete).not.toHaveBeenCalled();
  });

  it('bloqueia exclusão com grupo que já tem membro', async () => {
    const { service, prisma } = criarService({
      competicao: competicaoDoProfessor,
      bimestresEncerrados: 0,
      pontuacaoCount: 0,
      membroCount: 1,
    });

    await expect(service.excluir(professorLogado, 'c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.competicao.delete).not.toHaveBeenCalled();
  });
});