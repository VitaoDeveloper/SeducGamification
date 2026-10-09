import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlunosService } from './alunos.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

function criarService(overrides: {
  matricula?: unknown;
  sala?: unknown;
  vinculo?: unknown;
  lancamentoCount?: number;
  membroCount?: number;
  updateResult?: unknown;
}) {
  const prismaMock = {
    matricula: {
      findFirst: vi.fn(async () => overrides.matricula ?? null),
    },
    sala: {
      findUnique: vi.fn(async () => overrides.sala ?? null),
    },
    vinculoProfessor: {
      findUnique: vi.fn(async () => overrides.vinculo ?? null),
    },
    aluno: {
      update: vi.fn(async () => overrides.updateResult ?? null),
      delete: vi.fn(async () => {}),
    },
    lancamento: {
      count: vi.fn(async () => overrides.lancamentoCount ?? 0),
    },
    membroGrupo: {
      count: vi.fn(async () => overrides.membroCount ?? 0),
    },
  } as unknown as PrismaService;

  const service = new AlunosService(prismaMock);
  return { service, prisma: prismaMock as any };
}

describe('AlunosService.atualizar', () => {
  it('edita o nome de um aluno matriculado em sala da escola do professor', async () => {
    const { service, prisma } = criarService({
      matricula: { salaId: 's1' },
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      updateResult: { id: 'a1', nome: 'Ana Souza' },
    });

    const resultado = await service.atualizar(professorLogado, 'a1', {
      nome: 'Ana Souza',
    });

    expect(prisma.aluno.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { nome: 'Ana Souza' },
    });
    expect(resultado.nome).toBe('Ana Souza');
  });

  it('bloqueia edição de aluno de sala de escola sem vínculo com o professor', async () => {
    const { service } = criarService({
      matricula: { salaId: 's1' },
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: null,
    });

    await expect(
      service.atualizar(professorLogado, 'a1', { nome: 'Novo' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lança NotFoundException se o aluno não está matriculado em sala alguma', async () => {
    const { service } = criarService({ matricula: null });

    await expect(
      service.atualizar(professorLogado, 'a1', { nome: 'Novo' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AlunosService.excluir', () => {
  it('exclui aluno recém-criado, sem lançamento nem grupo', async () => {
    const { service, prisma } = criarService({
      matricula: { salaId: 's1' },
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      lancamentoCount: 0,
      membroCount: 0,
    });

    await service.excluir(professorLogado, 'a1');

    expect(prisma.lancamento.count).toHaveBeenCalledWith({
      where: { alunoId: 'a1' },
    });
    expect(prisma.membroGrupo.count).toHaveBeenCalledWith({
      where: { alunoId: 'a1' },
    });
    expect(prisma.aluno.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('bloqueia exclusão de aluno com lançamento', async () => {
    const { service, prisma } = criarService({
      matricula: { salaId: 's1' },
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      lancamentoCount: 1,
      membroCount: 0,
    });

    await expect(service.excluir(professorLogado, 'a1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.aluno.delete).not.toHaveBeenCalled();
  });

  it('bloqueia exclusão de aluno que é (ou foi) membro de grupo, sem lançamento', async () => {
    const { service, prisma } = criarService({
      matricula: { salaId: 's1' },
      sala: { id: 's1', escolaId: 'e1' },
      vinculo: { professorId: 'p1' },
      lancamentoCount: 0,
      membroCount: 1,
    });

    await expect(service.excluir(professorLogado, 'a1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.aluno.delete).not.toHaveBeenCalled();
  });
});