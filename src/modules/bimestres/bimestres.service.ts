import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { SituacaoBimestre } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carregarBimestreDoProfessor } from '../shared/acesso-competicao.util.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import {
  carregarMateriasComPesos,
  montarMensagemMateriasPendentes,
  selecionarMateriasPendentes,
} from '../shared/pesos-bimestre.util.js';
import type { ModeloAvaliacaoParaCalculo } from '../sinteses/sintese-calculo.service.js';
import { SinteseCalculoService } from '../sinteses/sintese-calculo.service.js';

// O encerramento grava as três tabelas de síntese de uma vez. A transação
// interativa precisa de folga para não estourar o tempo padrão do Prisma em
// turmas grandes.
const TIMEOUT_TRANSACAO_MS = 30_000;

export interface SinteseAlunoComponenteGravada {
  bimestreId: string;
  alunoId: string;
  componenteCurricularId: string;
  materiaNome: string;
  valor: number;
}

export interface SinteseAlunoGravada {
  bimestreId: string;
  alunoId: string;
  nome: string;
  valor: number;
}

export interface SinteseGrupoGravada {
  bimestreId: string;
  grupoId: string;
  nome: string;
  integrantes: number;
  valor: number;
}

export interface GrupoEmpatado {
  grupoId: string;
  nome: string;
  valor: number;
}

export interface EmpateBimestre {
  bimestreId: string;
  valor: number;
  grupos: GrupoEmpatado[];
}

export interface PontuacaoFinalAluno {
  alunoId: string;
  nome: string;
  valor: number;
}

export interface PontuacaoFinalGrupo {
  grupoId: string;
  nome: string;
  valor: number;
}

export interface PontuacoesFinais {
  alunos: PontuacaoFinalAluno[];
  grupos: PontuacaoFinalGrupo[];
}

export interface EncerramentoBimestre {
  bimestreId: string;
  numero: number;
  situacao: SituacaoBimestre;
  encerradoEm: string;
  totais: {
    alunos: number;
    materias: number;
    grupos: number;
  };
  sinteseAlunoComponente: SinteseAlunoComponenteGravada[];
  sinteseAluno: SinteseAlunoGravada[];
  sinteseGrupo: SinteseGrupoGravada[];
  gruposSemIntegrantes: Array<{ grupoId: string; nome: string }>;
  empates: EmpateBimestre[];
  competicaoConcluida: boolean;
  pontuacoesFinais: PontuacoesFinais | null;
}

interface ComponenteComLancamentos {
  componenteCurricularId: string;
  pesoPercentual: number;
  lancamentosPorAluno: Map<string, string>;
}

interface ComponentesDaMateria {
  componenteCurricularId: string;
  materiaNome: string;
  componentes: ComponenteComLancamentos[];
}

@Injectable()
export class BimestresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sinteseCalculo: SinteseCalculoService,
  ) {}

  /**
   * Encerramento manual (RN22): valida os pesos, grava as sínteses do aluno por
   * matéria, do aluno no bimestre e do grupo, e congela o bimestre. Tudo em uma
   * transação única.
   */
  async encerrar(
    user: UsuarioAutenticado | undefined,
    bimestreId: string,
  ): Promise<EncerramentoBimestre> {
    const professor = exigirProfessor(user);
    const bimestre = await carregarBimestreDoProfessor(
      this.prisma,
      professor.id,
      bimestreId,
    );
    this.exigirBimestreAberto(bimestre.situacao);

    return this.prisma.$transaction(
      async (tx) => {
        const contexto = await tx.bimestre.findUnique({
          where: { id: bimestreId },
          select: { situacao: true },
        });
        if (!contexto) {
          throw new BadRequestException('Bimestre não encontrado.');
        }
        this.exigirBimestreAberto(contexto.situacao);

        const lecionamento = await this.carregarLecionamentoComEscala(
          tx,
          bimestre.lecionamentoId,
        );
        const materias = lecionamento.componentesCurriculares;
        if (materias.length === 0) {
          throw new BadRequestException(
            'O lecionamento da competição não tem nenhuma matéria cadastrada.',
          );
        }

        // 1. Todas as matérias do lecionamento fecham 100% de peso no bimestre.
        const resumo = await carregarMateriasComPesos(
          tx,
          bimestreId,
          bimestre.lecionamentoId,
        );
        const materiasPendentes = selecionarMateriasPendentes(resumo);
        if (materiasPendentes.length > 0) {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message: `Não é possível encerrar o bimestre: ${montarMensagemMateriasPendentes(
              materiasPendentes,
            )}`,
            materiasPendentes,
          });
        }

        // 2. Alunos matriculados na sala da competição.
        const matriculas = await tx.matricula.findMany({
          where: { salaId: bimestre.salaId },
          select: { aluno: { select: { id: true, nome: true } } },
          orderBy: { aluno: { nome: 'asc' } },
        });

        // 3. Componentes de pontuação e lançamentos do bimestre.
        const componentes = await this.carregarComponentesDoBimestre(
          tx,
          bimestreId,
        );
        const componentesPorMateria = new Map<string, ComponentesDaMateria>(
          materias.map((materia) => [
            materia.id,
            {
              componenteCurricularId: materia.id,
              materiaNome: materia.nome,
              componentes: componentes.filter(
                (componente) =>
                  componente.componenteCurricularId === materia.id,
              ),
            },
          ]),
        );

        const modeloAvaliacao = lecionamento.sala.escola.modeloAvaliacao;
        const modelo: ModeloAvaliacaoParaCalculo = {
          tipoEscala: modeloAvaliacao.tipoEscala,
          nivelEscalas: modeloAvaliacao.nivelEscalas.map((nivel) => ({
            rotulo: nivel.rotulo,
            valorNumerico: Number(nivel.valorNumerico),
          })),
        };

        // 4. e 5. Síntese por matéria e síntese bimestral de cada aluno.
        const {
          sinteseAlunoComponente,
          sinteseAluno,
          valorBimestralPorAluno,
        } = this.calcularSintesesDosAlunos(
          bimestreId,
          matriculas.map(({ aluno }) => aluno),
          componentesPorMateria,
          modelo,
        );

        // 6. Síntese do grupo com a composição deste bimestre (RN9).
        const grupos = await tx.grupoCompetidor.findMany({
          where: { competicaoId: bimestre.competicaoId },
          select: {
            id: true,
            nome: true,
            membrosGrupos: {
              where: { bimestreId },
              select: { alunoId: true },
            },
          },
          orderBy: { nome: 'asc' },
        });

        const { sinteseGrupo, gruposSemIntegrantes } =
          this.calcularSintesesDosGrupos(
            bimestreId,
            grupos,
            valorBimestralPorAluno,
          );

        await this.gravarSinteses(tx, bimestreId, {
          sinteseAlunoComponente,
          sinteseAluno,
          sinteseGrupo,
        });

        // 7. Congela o bimestre.
        const bimestreEncerrado = await tx.bimestre.update({
          where: { id: bimestreId },
          data: { situacao: SituacaoBimestre.ENCERRADO },
          select: { numero: true, updatedAt: true },
        });

        // 8. Empates do ranking parcial deste bimestre (resolução na etapa 09).
        const nomeDosGrupos = new Map(
          sinteseGrupo.map((sintese) => [sintese.grupoId, sintese.nome]),
        );
        const empates: EmpateBimestre[] = this.sinteseCalculo
          .detectarEmpates(
            sinteseGrupo.map((sintese) => ({
              grupoId: sintese.grupoId,
              valor: sintese.valor,
            })),
          )
          .map((empate) => ({
            bimestreId,
            valor: empate.valor,
            grupos: empate.grupos
              .map((grupo) => ({
                grupoId: grupo.grupoId,
                nome: nomeDosGrupos.get(grupo.grupoId) ?? grupo.grupoId,
                valor: grupo.valor,
              }))
              .sort((a, b) => a.nome.localeCompare(b.nome)),
          }));

        // 9. Pontuação final dos quatro bimestres, quando a competição fecha.
        const competicaoConcluida = await this.competicaoConcluida(
          tx,
          bimestre.competicaoId,
        );

        return {
          bimestreId,
          numero: bimestreEncerrado.numero,
          situacao: SituacaoBimestre.ENCERRADO,
          encerradoEm: bimestreEncerrado.updatedAt.toISOString(),
          totais: {
            alunos: sinteseAluno.length,
            materias: materias.length,
            grupos: sinteseGrupo.length,
          },
          sinteseAlunoComponente,
          sinteseAluno: ordenarPorValor(sinteseAluno),
          sinteseGrupo: ordenarPorValor(sinteseGrupo),
          gruposSemIntegrantes,
          empates,
          competicaoConcluida,
          pontuacoesFinais: competicaoConcluida
            ? await this.calcularPontuacoesFinais(tx, bimestre.competicaoId)
            : null,
        };
      },
      { timeout: TIMEOUT_TRANSACAO_MS },
    );
  }

  private exigirBimestreAberto(situacao: SituacaoBimestre): void {
    if (situacao !== SituacaoBimestre.ABERTO) {
      throw new ConflictException(
        'Não é possível encerrar um bimestre já encerrado.',
      );
    }
  }

  /** Síntese por matéria e a média bimestral do aluno entre as matérias. */
  private calcularSintesesDosAlunos(
    bimestreId: string,
    alunos: ReadonlyArray<{ id: string; nome: string }>,
    componentesPorMateria: ReadonlyMap<string, ComponentesDaMateria>,
    modelo: ModeloAvaliacaoParaCalculo,
  ): {
    sinteseAlunoComponente: SinteseAlunoComponenteGravada[];
    sinteseAluno: SinteseAlunoGravada[];
    valorBimestralPorAluno: Map<string, number>;
  } {
    const sinteseAlunoComponente: SinteseAlunoComponenteGravada[] = [];
    const sinteseAluno: SinteseAlunoGravada[] = [];
    const valorBimestralPorAluno = new Map<string, number>();

    for (const aluno of alunos) {
      const valoresPorMateria: number[] = [];
      for (const materia of componentesPorMateria.values()) {
        const entradas = materia.componentes.map((componente) => ({
          // Componente sem lançamento vale 0 (RN19).
          valorNoModelo: componente.lancamentosPorAluno.get(aluno.id),
          pesoPercentual: componente.pesoPercentual,
        }));
        const valor = this.sinteseCalculo.calcularSinteseAlunoPorMateria(
          entradas,
          modelo,
        );
        valoresPorMateria.push(valor);
        sinteseAlunoComponente.push({
          bimestreId,
          alunoId: aluno.id,
          componenteCurricularId: materia.componenteCurricularId,
          materiaNome: materia.materiaNome,
          valor,
        });
      }

      const valorBimestral =
        this.sinteseCalculo.calcularSinteseBimestralAluno(valoresPorMateria);
      valorBimestralPorAluno.set(aluno.id, valorBimestral);
      sinteseAluno.push({
        bimestreId,
        alunoId: aluno.id,
        nome: aluno.nome,
        valor: valorBimestral,
      });
    }

    return { sinteseAlunoComponente, sinteseAluno, valorBimestralPorAluno };
  }

  /** Síntese do grupo: média das sínteses bimestrais dos integrantes. */
  private calcularSintesesDosGrupos(
    bimestreId: string,
    grupos: ReadonlyArray<{
      id: string;
      nome: string;
      membrosGrupos: Array<{ alunoId: string }>;
    }>,
    valorBimestralPorAluno: ReadonlyMap<string, number>,
  ): {
    sinteseGrupo: SinteseGrupoGravada[];
    gruposSemIntegrantes: Array<{ grupoId: string; nome: string }>;
  } {
    const sinteseGrupo: SinteseGrupoGravada[] = [];
    const gruposSemIntegrantes: Array<{ grupoId: string; nome: string }> = [];

    for (const grupo of grupos) {
      if (grupo.membrosGrupos.length === 0) {
        gruposSemIntegrantes.push({ grupoId: grupo.id, nome: grupo.nome });
        continue;
      }
      sinteseGrupo.push({
        bimestreId,
        grupoId: grupo.id,
        nome: grupo.nome,
        integrantes: grupo.membrosGrupos.length,
        valor: this.sinteseCalculo.calcularSinteseBimestralGrupo(
          grupo.membrosGrupos.map(
            (membro) => valorBimestralPorAluno.get(membro.alunoId) ?? 0,
          ),
        ),
      });
    }

    return { sinteseGrupo, gruposSemIntegrantes };
  }

  private async carregarLecionamentoComEscala(
    tx: Prisma.TransactionClient,
    lecionamentoId: string,
  ) {
    const lecionamento = await tx.lecionamento.findUnique({
      where: { id: lecionamentoId },
      select: {
        componentesCurriculares: {
          select: { id: true, nome: true },
          orderBy: { nome: 'asc' },
        },
        sala: {
          select: {
            escola: {
              select: {
                modeloAvaliacao: {
                  select: {
                    tipoEscala: true,
                    nivelEscalas: {
                      select: { rotulo: true, valorNumerico: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!lecionamento) {
      throw new BadRequestException('Lecionamento não encontrado.');
    }
    return lecionamento;
  }

  private async carregarComponentesDoBimestre(
    tx: Prisma.TransactionClient,
    bimestreId: string,
  ): Promise<ComponenteComLancamentos[]> {
    const componentes = await tx.componentePontuacao.findMany({
      where: { bimestreId, componenteCurricularId: { not: null } },
      select: {
        componenteCurricularId: true,
        pesoPercentual: true,
        lancamentos: { select: { alunoId: true, valorNoModelo: true } },
      },
      orderBy: [{ pesoPercentual: 'desc' }, { id: 'asc' }],
    });

    return componentes.map((componente) => ({
      componenteCurricularId: componente.componenteCurricularId as string,
      pesoPercentual: Number(componente.pesoPercentual),
      lancamentosPorAluno: new Map(
        componente.lancamentos.map((lancamento) => [
          lancamento.alunoId,
          lancamento.valorNoModelo,
        ]),
      ),
    }));
  }

  private async gravarSinteses(
    tx: Prisma.TransactionClient,
    bimestreId: string,
    dados: {
      sinteseAlunoComponente: SinteseAlunoComponenteGravada[];
      sinteseAluno: SinteseAlunoGravada[];
      sinteseGrupo: SinteseGrupoGravada[];
    },
  ): Promise<void> {
    // Um bimestre só é encerrado uma vez, então ainda não existem sínteses
    // gravadas para ele. Os deletes são defensivos e mantêm a gravação
    // idempotente dentro da própria transação.
    if (dados.sinteseAlunoComponente.length > 0) {
      await tx.sinteseAlunoComponente.deleteMany({ where: { bimestreId } });
      await tx.sinteseAlunoComponente.createMany({
        data: dados.sinteseAlunoComponente.map((sintese) => ({
          bimestreId,
          componenteCurricularId: sintese.componenteCurricularId,
          alunoId: sintese.alunoId,
          valor: sintese.valor,
        })),
      });
    }

    if (dados.sinteseAluno.length > 0) {
      await tx.sinteseAluno.deleteMany({ where: { bimestreId } });
      await tx.sinteseAluno.createMany({
        data: dados.sinteseAluno.map((sintese) => ({
          bimestreId,
          alunoId: sintese.alunoId,
          valor: sintese.valor,
        })),
      });
    }

    if (dados.sinteseGrupo.length > 0) {
      await tx.sinteseGrupo.deleteMany({ where: { bimestreId } });
      await tx.sinteseGrupo.createMany({
        data: dados.sinteseGrupo.map((sintese) => ({
          bimestreId,
          grupoId: sintese.grupoId,
          valor: sintese.valor,
        })),
      });
    }
  }

  private async competicaoConcluida(
    tx: Prisma.TransactionClient,
    competicaoId: string,
  ): Promise<boolean> {
    const [total, encerrados] = await Promise.all([
      tx.bimestre.count({ where: { competicaoId } }),
      tx.bimestre.count({
        where: { competicaoId, situacao: SituacaoBimestre.ENCERRADO },
      }),
    ]);
    return total > 0 && encerrados === total;
  }

  /**
   * Pontuação final de cada aluno (média das sínteses) e de cada grupo (soma),
   * calculada on-the-fly a partir das sínteses já gravadas.
   */
  private async calcularPontuacoesFinais(
    tx: Prisma.TransactionClient,
    competicaoId: string,
  ): Promise<PontuacoesFinais> {
    const [sintesesAluno, sintesesGrupo] = await Promise.all([
      tx.sinteseAluno.findMany({
        where: { bimestre: { competicaoId } },
        select: {
          alunoId: true,
          valor: true,
          aluno: { select: { nome: true } },
        },
        orderBy: { bimestre: { numero: 'asc' } },
      }),
      tx.sinteseGrupo.findMany({
        where: { bimestre: { competicaoId } },
        select: {
          grupoId: true,
          valor: true,
          grupo: { select: { nome: true } },
        },
        orderBy: { bimestre: { numero: 'asc' } },
      }),
    ]);

    const alunos = new Map<string, { nome: string; valores: number[] }>();
    for (const sintese of sintesesAluno) {
      const atual = alunos.get(sintese.alunoId);
      if (atual) {
        atual.valores.push(Number(sintese.valor));
      } else {
        alunos.set(sintese.alunoId, {
          nome: sintese.aluno.nome,
          valores: [Number(sintese.valor)],
        });
      }
    }

    const grupos = new Map<string, { nome: string; valores: number[] }>();
    for (const sintese of sintesesGrupo) {
      const atual = grupos.get(sintese.grupoId);
      if (atual) {
        atual.valores.push(Number(sintese.valor));
      } else {
        grupos.set(sintese.grupoId, {
          nome: sintese.grupo.nome,
          valores: [Number(sintese.valor)],
        });
      }
    }

    return {
      alunos: ordenarPorValor(
        [...alunos.entries()].map(([alunoId, aluno]) => ({
          alunoId,
          nome: aluno.nome,
          valor: this.sinteseCalculo.calcularPontuacaoFinalAluno(aluno.valores),
        })),
      ),
      grupos: ordenarPorValor(
        [...grupos.entries()].map(([grupoId, grupo]) => ({
          grupoId,
          nome: grupo.nome,
          valor: this.sinteseCalculo.calcularPontuacaoFinalGrupo(grupo.valores),
        })),
      ),
    };
  }
}

function ordenarPorValor<T extends { valor: number; nome: string }>(
  linhas: readonly T[],
): T[] {
  return [...linhas].sort(
    (a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome),
  );
}
