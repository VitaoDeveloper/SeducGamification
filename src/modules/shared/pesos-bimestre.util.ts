import type { PrismaService } from '../prisma/prisma.service.js';

export const CEM_PORCENTO = 100;

type BancoComPesos = Pick<
  PrismaService,
  'componenteCurricular' | 'componentePontuacao'
>;

export interface ComponentePontuacaoDoBimestre {
  id: string;
  nome: string;
  pesoPercentual: number;
  componenteCurricularId: string | null;
  createdAt: Date;
}

export interface MateriaComPesos {
  componenteCurricularId: string;
  materiaNome: string;
  somaPesoPercentual: number;
  componentesPontuacao: ComponentePontuacaoDoBimestre[];
}

export interface MateriaPendente {
  componenteCurricularId: string;
  materiaNome: string;
  somaPesoPercentual: number;
  faltaParaFechar: number;
}

/**
 * Regrinha única de fechamento de pesos (RN10): todas as matérias do
 * lecionamento precisam somar 100% no bimestre. A soma é feita em Decimal no
 * banco para não acumular erro de ponto flutuante.
 *
 * Aceita o cliente da transação (`prisma.$transaction`) ou o PrismaService.
 */
export async function carregarMateriasComPesos(
  banco: BancoComPesos,
  bimestreId: string,
  lecionamentoId: string,
): Promise<MateriaComPesos[]> {
  const materias = await banco.componenteCurricular.findMany({
    where: { lecionamentoId },
    select: { id: true, nome: true },
    orderBy: { nome: 'asc' },
  });

  const somas = await banco.componentePontuacao.groupBy({
    by: ['componenteCurricularId'],
    where: { bimestreId, componenteCurricularId: { not: null } },
    _sum: { pesoPercentual: true },
  });
  const somaPorMateria = new Map(
    somas.map((soma) => [
      soma.componenteCurricularId as string,
      Number(soma._sum.pesoPercentual ?? 0),
    ]),
  );

  const componentes = await banco.componentePontuacao.findMany({
    where: { bimestreId },
    select: {
      id: true,
      nome: true,
      pesoPercentual: true,
      componenteCurricularId: true,
      createdAt: true,
    },
    orderBy: { nome: 'asc' },
  });

  return materias.map((materia) => ({
    componenteCurricularId: materia.id,
    materiaNome: materia.nome,
    somaPesoPercentual: somaPorMateria.get(materia.id) ?? 0,
    componentesPontuacao: componentes
      .filter((c) => c.componenteCurricularId === materia.id)
      .map((c) => ({ ...c, pesoPercentual: Number(c.pesoPercentual) })),
  }));
}

export function materiasFechadas(materias: MateriaComPesos[]): boolean {
  return materias.every(
    (materia) => materia.somaPesoPercentual === CEM_PORCENTO,
  );
}

export function selecionarMateriasPendentes(
  materias: MateriaComPesos[],
): MateriaPendente[] {
  return materias
    .filter((materia) => materia.somaPesoPercentual !== CEM_PORCENTO)
    .map((materia) => ({
      componenteCurricularId: materia.componenteCurricularId,
      materiaNome: materia.materiaNome,
      somaPesoPercentual: materia.somaPesoPercentual,
      faltaParaFechar: Number(
        (CEM_PORCENTO - materia.somaPesoPercentual).toFixed(2),
      ),
    }));
}

export function montarMensagemMateriasPendentes(
  materiasPendentes: MateriaPendente[],
): string {
  const detalhe = materiasPendentes
    .map((materia) => `${materia.materiaNome} (${materia.somaPesoPercentual}%)`)
    .join(', ');
  return `Matérias com pesos que não somam ${CEM_PORCENTO}% neste bimestre: ${detalhe}.`;
}
