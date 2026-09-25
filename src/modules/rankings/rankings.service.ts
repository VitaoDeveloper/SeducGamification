import { Injectable } from '@nestjs/common';
import { SituacaoBimestre } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carregarCompeticaoDoProfessor } from '../shared/acesso-competicao.util.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import { SinteseCalculoService } from '../sinteses/sintese-calculo.service.js';

export interface ItemRanking {
  posicao: number;
  valor: number;
  empate: boolean;
}

export interface ItemRankingGrupo extends ItemRanking {
  grupoId: string;
  nome: string;
}

export interface ItemRankingAluno extends ItemRanking {
  alunoId: string;
  nome: string;
}

@Injectable()
export class RankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sinteseCalculo: SinteseCalculoService,
  ) {}

  /** Ranking parcial (por bimestre) ou anual (por bimestreId ausente). */
  async ranking(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
    bimestreId?: string,
  ): Promise<{
    tipo: 'parcial' | 'anual';
    competicaoId: string;
    bimestreId: string | null;
    bimestresEncerrados: number;
    completo: boolean;
    itens: ItemRankingGrupo[];
  }> {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );

    const [bimestresEncerrados, totalBimestres] = await Promise.all([
      this.prisma.bimestre.count({
        where: { competicaoId, situacao: SituacaoBimestre.ENCERRADO },
      }),
      this.prisma.bimestre.count({ where: { competicaoId } }),
    ]);

    if (bimestreId) {
      const sinteses = await this.prisma.sinteseGrupo.findMany({
        where: {
          bimestreId,
          bimestre: { competicaoId },
        },
        select: { grupoId: true, valor: true, grupo: { select: { nome: true } } },
      });
      return {
        tipo: 'parcial',
        competicaoId,
        bimestreId,
        bimestresEncerrados,
        completo: bimestresEncerrados === totalBimestres,
        itens: this.montarItensGrupos(sinteses),
      };
    }

    return this.rankingAnual(
      competicaoId,
      bimestresEncerrados,
      totalBimestres,
    );
  }

  /** Ranking individual anual pela média das sínteses bimestrais do aluno. */
  async rankingIndividual(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
  ): Promise<{
    tipo: 'individual';
    competicaoId: string;
    bimestresEncerrados: number;
    completo: boolean;
    itens: ItemRankingAluno[];
  }> {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );

    const [bimestresEncerrados, totalBimestres, sinteses] = await Promise.all([
      this.prisma.bimestre.count({
        where: { competicaoId, situacao: SituacaoBimestre.ENCERRADO },
      }),
      this.prisma.bimestre.count({ where: { competicaoId } }),
      this.prisma.sinteseAluno.findMany({
        where: { bimestre: { competicaoId } },
        select: {
          alunoId: true,
          valor: true,
          aluno: { select: { nome: true } },
        },
        orderBy: { bimestre: { numero: 'asc' } },
      }),
    ]);

    const sintesesPorAluno = new Map<string, number[]>();
    const nomePorAluno = new Map<string, string>();
    for (const sintese of sinteses) {
      const valores = sintesesPorAluno.get(sintese.alunoId);
      if (valores) {
        valores.push(Number(sintese.valor));
      } else {
        sintesesPorAluno.set(sintese.alunoId, [Number(sintese.valor)]);
        nomePorAluno.set(sintese.alunoId, sintese.aluno.nome);
      }
    }

    const alunos = [...sintesesPorAluno.entries()].map(
      ([alunoId, valores]) => ({
        alunoId,
        nome: nomePorAluno.get(alunoId) ?? alunoId,
        valor: this.sinteseCalculo.calcularPontuacaoFinalAluno(valores),
      }),
    );

    return {
      tipo: 'individual',
      competicaoId,
      bimestresEncerrados,
      completo: bimestresEncerrados === totalBimestres,
      itens: this.anotarPosicoes(alunos),
    };
  }

  private async rankingAnual(
    competicaoId: string,
    bimestresEncerrados: number,
    totalBimestres: number,
  ): Promise<{
    tipo: 'anual';
    competicaoId: string;
    bimestreId: null;
    bimestresEncerrados: number;
    completo: boolean;
    itens: ItemRankingGrupo[];
  }> {
    const sinteses = await this.prisma.sinteseGrupo.findMany({
      where: { bimestre: { competicaoId } },
      select: { grupoId: true, valor: true, grupo: { select: { nome: true } } },
      orderBy: { bimestre: { numero: 'asc' } },
    });

    const sintesesPorGrupo = new Map<string, number[]>();
    const nomePorGrupo = new Map<string, string>();
    for (const sintese of sinteses) {
      const valores = sintesesPorGrupo.get(sintese.grupoId);
      if (valores) {
        valores.push(Number(sintese.valor));
      } else {
        sintesesPorGrupo.set(sintese.grupoId, [Number(sintese.valor)]);
        nomePorGrupo.set(sintese.grupoId, sintese.grupo.nome);
      }
    }

    const grupos = [...sintesesPorGrupo.entries()].map(
      ([grupoId, valores]) => ({
        grupoId,
        nome: nomePorGrupo.get(grupoId) ?? grupoId,
        valor: this.sinteseCalculo.calcularPontuacaoFinalGrupo(valores),
      }),
    );

    return {
      tipo: 'anual',
      competicaoId,
      bimestreId: null,
      bimestresEncerrados,
      completo: bimestresEncerrados === totalBimestres,
      itens: this.anotarPosicoes(grupos),
    };
  }

  private montarItensGrupos(
    sinteses: ReadonlyArray<{
      grupoId: string;
      valor: unknown;
      grupo: { nome: string };
    }>,
  ): ItemRankingGrupo[] {
    return this.anotarPosicoes(
      sinteses.map((sintese) => ({
        grupoId: sintese.grupoId,
        nome: sintese.grupo.nome,
        valor: Number(sintese.valor),
      })),
    );
  }

  private anotarPosicoes<T extends { valor: number; nome: string }>(
    linhas: readonly T[],
  ): Array<T & ItemRanking> {
    const ordenadas = [...linhas].sort(
      (a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome),
    );
    const quantidade = ordenadas.length;

    const resultado: Array<T & ItemRanking> = [];
    for (let indice = 0; indice < quantidade; indice++) {
      const linha = ordenadas[indice] as T;
      const anterior = indice > 0 ? ordenadas[indice - 1].valor : null;
      const proximo =
        indice < quantidade - 1 ? ordenadas[indice + 1].valor : null;
      const empate =
        (anterior !== null && linha.valor === anterior) ||
        (proximo !== null && linha.valor === proximo);
      const posicao =
        indice > 0 && linha.valor === ordenadas[indice - 1].valor
          ? resultado[indice - 1].posicao
          : indice + 1;
      resultado.push({ ...linha, posicao, empate });
    }
    return resultado;
  }
}