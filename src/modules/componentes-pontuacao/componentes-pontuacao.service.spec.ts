import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComponentesPontuacaoService } from './componentes-pontuacao.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

const bimestreAberto = {
  id: 'b1',
  situacao: 'ABERTO',
  competicaoId: 'c1',
  competicao: {
    lecionamentoId: 'l1',
    lecionamento: { professorId: 'p1', salaId: 's1' },
  },
};

const bimestreEncerrado = {
  ...bimestreAberto,
  situacao: 'ENCERRADO',
};

function criarService(overrides: {
  componente?: unknown;
  bimestre?: unknown;
  soma?: unknown;
  updateResult?: unknown;
}) {
  const prismaMock = {
    componentePontuacao: {
      findUnique: vi.fn(async () => overrides.componente ?? null),
      aggregate: vi.fn(
        async () =>
          overrides.soma ?? { _sum: { pesoPercentual: null } },
      ),
      update: vi.fn(async () => overrides.updateResult ?? null),
      delete: vi.fn(async () => {}),
    },
    bimestre: {
      findUnique: vi.fn(async () => overrides.bimestre ?? null),
    },
  } as unknown as PrismaService;

  const service = new ComponentesPontuacaoService(prismaMock);
  return { service, prisma: prismaMock as any };
}

describe('ComponentesPontuacaoService.atualizar', () => {
  it('edita o nome sem mexer no peso', async () => {
    const { service, prisma } = criarService({
      componente: {
        id: 'cp1',
        bimestreId: 'b1',
        pesoPercentual: 100,
        componenteCurricularId: 'm1',
      },
      bimestre: bimestreAberto,
      updateResult: {
        id: 'cp1',
        nome: 'Avaliação 1',
        pesoPercentual: 100,
        componenteCurricularId: 'm1',
      },
    });

    const resultado = await service.atualizar(professorLogado, 'cp1', {
      nome: 'Avaliação 1',
    });

    expect(prisma.componentePontuacao.aggregate).not.toHaveBeenCalled();
    expect(prisma.componentePontuacao.update).toHaveBeenCalledWith({
      where: { id: 'cp1' },
      data: { nome: 'Avaliação 1' },
    });
    expect(resultado.nome).toBe('Avaliação 1');
  });

  it('edita o peso descontando o objeto editado da soma da matéria', async () => {
    // O componente é o único da matéria (peso 100%). Reduzir para 40% deve
    // ser permitido: 100 (soma atual) - 100 (peso antigo) + 40 = 40 <= 100.
    const { service, prisma } = criarService({
      componente: {
        id: 'cp1',
        bimestreId: 'b1',
        pesoPercentual: 100,
        componenteCurricularId: 'm1',
      },
      bimestre: bimestreAberto,
      soma: { _sum: { pesoPercentual: 100 } },
      updateResult: {
        id: 'cp1',
        nome: 'Avaliação 1',
        pesoPercentual: 40,
        componenteCurricularId: 'm1',
      },
    });

    const resultado = await service.atualizar(professorLogado, 'cp1', {
      pesoPercentual: 40,
    });

    expect(prisma.componentePontuacao.aggregate).toHaveBeenCalled();
    expect(prisma.componentePontuacao.update).toHaveBeenCalledWith({
      where: { id: 'cp1' },
      data: { pesoPercentual: 40 },
    });
    expect(resultado.pesoPercentual).toBe(40);
  });

  it('bloqueia peso que faria a soma da matéria ultrapassar 100%', async () => {
    // Soma atual 100% (este componente 60% + outro 40%). Subir para 70%
    // deixaria 110% — o cálculo desconta o peso antigo e bloqueia.
    const { service, prisma } = criarService({
      componente: {
        id: 'cp1',
        bimestreId: 'b1',
        pesoPercentual: 60,
        componenteCurricularId: 'm1',
      },
      bimestre: bimestreAberto,
      soma: { _sum: { pesoPercentual: 100 } },
    });

    await expect(
      service.atualizar(professorLogado, 'cp1', { pesoPercentual: 70 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.componentePontuacao.update).not.toHaveBeenCalled();
  });

  it('bloqueia edição em bimestre encerrado', async () => {
    const { service, prisma } = criarService({
      componente: {
        id: 'cp1',
        bimestreId: 'b1',
        pesoPercentual: 100,
        componenteCurricularId: 'm1',
      },
      bimestre: bimestreEncerrado,
    });

    await expect(
      service.atualizar(professorLogado, 'cp1', { nome: 'Novo' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.componentePontuacao.update).not.toHaveBeenCalled();
  });
});

describe('ComponentesPontuacaoService.excluir', () => {
  it('exclui em bimestre aberto mesmo com lançamentos (cascata remove as notas)', async () => {
    const { service, prisma } = criarService({
      componente: {
        id: 'cp1',
        bimestreId: 'b1',
        pesoPercentual: 40,
        componenteCurricularId: 'm1',
      },
      bimestre: bimestreAberto,
    });

    await service.excluir(professorLogado, 'cp1');

    expect(prisma.componentePontuacao.delete).toHaveBeenCalledWith({
      where: { id: 'cp1' },
    });
  });

  it('bloqueia exclusão em bimestre encerrado', async () => {
    const { service, prisma } = criarService({
      componente: {
        id: 'cp1',
        bimestreId: 'b1',
        pesoPercentual: 40,
        componenteCurricularId: 'm1',
      },
      bimestre: bimestreEncerrado,
    });

    await expect(
      service.excluir(professorLogado, 'cp1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.componentePontuacao.delete).not.toHaveBeenCalled();
  });
});