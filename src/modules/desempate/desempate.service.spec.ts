import { describe, expect, it, vi } from 'vitest';
import { TIPO_USUARIO } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SinteseCalculoService } from '../sinteses/sintese-calculo.service.js';
import { DesempateAutomaticoService } from './desempate-automatico.service.js';
import { DesempateService } from './desempate.service.js';

const professorLogado = {
  id: 'p1',
  tipo: TIPO_USUARIO.PROFESSOR,
} as const;

const RANKING = [{ grupoId: 'g1', valor: 8, grupo: { nome: 'Grupo' } }];

interface CriarServiceOpcoes {
  resolvidosPorEscopo?: Map<string | null, { grupoId: string }[]>;
  countDelete?: number;
}

function criarService(opcoes: CriarServiceOpcoes = {}) {
  const resolvidosPorEscopo =
    opcoes.resolvidosPorEscopo ??
    new Map<string | null, { grupoId: string }[]>();

  const prismaMock = {
    competicao: {
      findUnique: vi.fn(async () => ({
        id: 'c1',
        lecionamentoId: 'l1',
        lecionamento: { professorId: 'p1', salaId: 's1' },
      })),
    },
    bimestre: {
      findMany: vi.fn(async () => [{ id: 'b1' }]),
      findUnique: vi.fn(async () => ({ id: 'b1', competicaoId: 'c1' })),
    },
    sinteseGrupo: {
      findMany: vi.fn(async () => RANKING),
    },
    desempate: {
      findMany: vi.fn(
        async ({ where }: { where: { bimestreId: string | null } }) =>
          resolvidosPorEscopo.get(where.bimestreId) ?? [],
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { bimestreId: string | null } }) => {
          resolvidosPorEscopo.set(where.bimestreId, []);
          return { count: opcoes.countDelete ?? 1 };
        },
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        desempate: {
          deleteMany: vi.fn(async () => ({ count: 0 })),
          createMany: vi.fn(async () => ({ count: 1 })),
        },
      }),
    ),
  };

  const sinteseCalculo = {
    detectarEmpates: vi.fn(() => [
      { valor: 8, grupos: [{ grupoId: 'g1', valor: 8 }] },
    ]),
    calcularPontuacaoFinalGrupo: vi.fn((valores: number[]) => valores[0] ?? 0),
  };

  const service = new DesempateService(
    prismaMock as unknown as PrismaService,
    sinteseCalculo as unknown as SinteseCalculoService,
    {} as DesempateAutomaticoService,
  );

  return { service, prisma: prismaMock as any };
}

describe('DesempateService.revogar', () => {
  it('revoga desempate manual: o escopo volta a aparecer em listarPendencias', async () => {
    const { service, prisma } = criarService({
      resolvidosPorEscopo: new Map([['b1', [{ grupoId: 'g1' }]]]),
    });

    const antes = await service.listarPendencias(professorLogado, 'c1');
    expect(antes.some((pendente) => pendente.bimestreId === 'b1')).toBe(false);

    const resultado = await service.revogar(professorLogado, 'c1', 'b1');
    expect(resultado).toEqual({ bimestreId: 'b1', removidos: 1 });
    expect(prisma.desempate.deleteMany).toHaveBeenCalledWith({
      where: { competicaoId: 'c1', bimestreId: 'b1' },
    });

    const depois = await service.listarPendencias(professorLogado, 'c1');
    expect(depois.some((pendente) => pendente.bimestreId === 'b1')).toBe(true);
  });

  it('revoga desempate automático (anual): mesmo comportamento', async () => {
    const { service, prisma } = criarService({
      resolvidosPorEscopo: new Map([[null, [{ grupoId: 'g1' }]]]),
    });

    const antes = await service.listarPendencias(professorLogado, 'c1');
    expect(antes.some((pendente) => pendente.bimestreId === null)).toBe(false);

    const resultado = await service.revogar(professorLogado, 'c1');
    expect(resultado).toEqual({ bimestreId: null, removidos: 1 });
    expect(prisma.desempate.deleteMany).toHaveBeenCalledWith({
      where: { competicaoId: 'c1', bimestreId: null },
    });

    const depois = await service.listarPendencias(professorLogado, 'c1');
    const anual = depois.find((pendente) => pendente.bimestreId === null);
    expect(anual).toBeDefined();
    expect(anual?.tipo).toBe('anual');
  });

  it('revoga escopo sem desempate registrado: não dá erro e retorna removidos 0', async () => {
    const { service } = criarService({ countDelete: 0 });

    const resultado = await service.revogar(professorLogado, 'c1', 'b1');

    expect(resultado).toEqual({ bimestreId: 'b1', removidos: 0 });
  });

  it('após revogar, registrar novo desempate manual no mesmo escopo funciona', async () => {
    const { service } = criarService();

    await service.revogar(professorLogado, 'c1', 'b1');

    const resolver = await service.resolverManualmente(professorLogado, 'c1', {
      bimestreId: 'b1',
      ordem: [{ grupoId: 'g1', posicao: 1 }],
    });

    expect(resolver).toEqual({
      bimestreId: 'b1',
      desempates: [{ grupoId: 'g1', posicao: 1, origem: 'MANUAL' }],
    });
  });
});