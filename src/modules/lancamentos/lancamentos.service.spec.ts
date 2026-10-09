import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LancamentosService } from './lancamentos.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

const componenteDoProfessor = {
  id: 'cp1',
  bimestre: {
    situacao: 'ABERTO',
    competicao: {
      lecionamento: {
        professorId: 'p1',
        sala: { id: 's1', escola: { modeloAvaliacao: {} } },
      },
    },
  },
};

const componenteEncerrado = {
  ...componenteDoProfessor,
  bimestre: {
    ...componenteDoProfessor.bimestre,
    situacao: 'ENCERRADO',
  },
};

function criarService(overrides: {
  componente?: unknown;
  deleteError?: unknown;
}) {
  const prismaMock = {
    componentePontuacao: {
      findUnique: vi.fn(async () => overrides.componente ?? null),
    },
    lancamento: {
      delete: vi.fn(async () => {
        if (overrides.deleteError) {
          throw overrides.deleteError;
        }
        return {};
      }),
    },
  } as unknown as PrismaService;

  const service = new LancamentosService(prismaMock);
  return { service, prisma: prismaMock as any };
}

describe('LancamentosService.excluir', () => {
  it('exclui um lançamento existente em bimestre aberto', async () => {
    const { service, prisma } = criarService({
      componente: componenteDoProfessor,
    });

    await service.excluir(professorLogado, 'cp1', 'a1');

    expect(prisma.lancamento.delete).toHaveBeenCalledWith({
      where: {
        componentePontuacaoId_alunoId: {
          componentePontuacaoId: 'cp1',
          alunoId: 'a1',
        },
      },
    });
  });

  it('converte P2025 (lançamento inexistente) em NotFoundException', async () => {
    const { service, prisma } = criarService({
      componente: componenteDoProfessor,
      deleteError: new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: '7.0.0',
      }),
    });

    await expect(
      service.excluir(professorLogado, 'cp1', 'a1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lancamento.delete).toHaveBeenCalledTimes(1);
  });

  it('bloqueia exclusão em bimestre encerrado', async () => {
    const { service, prisma } = criarService({
      componente: componenteEncerrado,
    });

    await expect(
      service.excluir(professorLogado, 'cp1', 'a1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.lancamento.delete).not.toHaveBeenCalled();
  });
});