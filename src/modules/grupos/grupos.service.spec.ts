import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GruposService } from './grupos.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

const grupoDoProfessor = {
  id: 'g1',
  competicaoId: 'c1',
  competicao: {
    lecionamento: { professorId: 'p1', salaId: 's1' },
  },
};

function criarService(overrides: {
  grupo?: unknown;
  membroCount?: number;
  updateResult?: unknown;
}) {
  const prismaMock = {
    grupoCompetidor: {
      findUnique: vi.fn(async () => overrides.grupo ?? null),
      update: vi.fn(async () => overrides.updateResult ?? null),
      delete: vi.fn(async () => {}),
    },
    membroGrupo: {
      count: vi.fn(async () => overrides.membroCount ?? 0),
    },
  } as unknown as PrismaService;

  const service = new GruposService(prismaMock);
  return { service, prisma: prismaMock as any };
}

describe('GruposService.atualizarGrupo', () => {
  it('renomeia um grupo do professor', async () => {
    const { service, prisma } = criarService({
      grupo: grupoDoProfessor,
      updateResult: { id: 'g1', nome: 'Equipe Alpha', competicaoId: 'c1' },
    });

    const resultado = await service.atualizarGrupo(professorLogado, 'g1', {
      nome: 'Equipe Alpha',
    });

    expect(prisma.grupoCompetidor.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { nome: 'Equipe Alpha' },
    });
    expect(resultado.nome).toBe('Equipe Alpha');
  });
});

describe('GruposService.excluirGrupo', () => {
  it('exclui grupo sem nenhum membro em nenhum bimestre', async () => {
    const { service, prisma } = criarService({
      grupo: grupoDoProfessor,
      membroCount: 0,
    });

    await service.excluirGrupo(professorLogado, 'g1');

    expect(prisma.membroGrupo.count).toHaveBeenCalledWith({
      where: { grupoId: 'g1' },
    });
    expect(prisma.grupoCompetidor.delete).toHaveBeenCalledWith({
      where: { id: 'g1' },
    });
  });

  it('bloqueia exclusão de grupo com membro no bimestre atual', async () => {
    const { service, prisma } = criarService({
      grupo: grupoDoProfessor,
      membroCount: 1,
    });

    await expect(service.excluirGrupo(professorLogado, 'g1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.grupoCompetidor.delete).not.toHaveBeenCalled();
  });

  it('bloqueia exclusão de grupo cujo único histórico é de bimestre encerrado', async () => {
    // A contagem cobre qualquer bimestre; membros de bimestres encerrados não
    // podem ser removidos pelo endpoint existente, então o grupo fica travado.
    const { service, prisma } = criarService({
      grupo: grupoDoProfessor,
      membroCount: 1,
    });

    await expect(service.excluirGrupo(professorLogado, 'g1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.grupoCompetidor.delete).not.toHaveBeenCalled();
  });
});