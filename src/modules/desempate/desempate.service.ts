import { BadRequestException, Injectable } from '@nestjs/common';
import { OrigemDesempate, SituacaoBimestre } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carregarCompeticaoDoProfessor } from '../shared/acesso-competicao.util.js';
import { exigirProfessor } from '../shared/acesso-escolar.util.js';
import { SinteseCalculoService } from '../sinteses/sintese-calculo.service.js';
import {
  DesempateAutomaticoService,
  MateriaComPeso,
} from './desempate-automatico.service.js';
import { CriarDesempateDto } from './dto/criar-desempate.dto.js';

export interface GrupoEmpatadoDetalhe {
  grupoId: string;
  nome: string;
  valor: number;
}

export interface EmpateResolvivel {
  tipo: 'parcial' | 'anual';
  bimestreId: string | null;
  valor: number;
  /** Posição inicial do bloco empatado no ranking (ex.: 1,1,3 -> 1). */
  posicao: number;
  grupos: GrupoEmpatadoDetalhe[];
}

interface LinhaDeSintese {
  grupoId: string;
  nome: string;
  valor: number;
}

export interface DesempateGravado {
  grupoId: string;
  posicao: number;
  origem: OrigemDesempate;
}

@Injectable()
export class DesempateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sinteseCalculo: SinteseCalculoService,
    private readonly desempateAutomatico: DesempateAutomaticoService,
  ) {}

  /**
   * Desempate manual (RN24): o professor define a posição de cada grupo
   * empatado. Os grupos informados precisam formar exatamente um empate já
   * detectado no ranking (parcial, se `bimestreId` vier; anual, se vier null ou
   * omitido). A resolução anterior do mesmo escopo é substituída.
   */
  async resolverManualmente(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
    dto: CriarDesempateDto,
  ): Promise<{
    bimestreId: string | null;
    desempates: DesempateGravado[];
  }> {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );

    const escopo = dto.bimestreId ?? null;
    if (escopo) {
      await this.exigirBimestreDaCompeticao(competicaoId, escopo);
    }

    const idsInformados = dto.ordem.map((ordem) => ordem.grupoId);
    if (new Set(idsInformados).size !== idsInformados.length) {
      throw new BadRequestException(
        'A ordem não pode repetir o mesmo grupo mais de uma vez.',
      );
    }
    const posicoes = dto.ordem.map((ordem) => ordem.posicao);
    if (new Set(posicoes).size !== posicoes.length) {
      throw new BadRequestException('As posições do desempate devem ser únicas.');
    }

    const empates = await this.carregarEmpatesDoEscopo(competicaoId, escopo);
    const conjunto = new Set(idsInformados);
    const empate = empates.find(
      (candidato) =>
        candidato.grupos.length === idsInformados.length &&
        candidato.grupos.every((grupo) => conjunto.has(grupo.grupoId)),
    );
    if (!empate) {
      throw new BadRequestException(
        'Os grupos informados não formam exatamente um empate desse ranking.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.desempate.deleteMany({
        where: { competicaoId, bimestreId: escopo },
      });
      await tx.desempate.createMany({
        data: dto.ordem.map((ordem) => ({
          competicaoId,
          bimestreId: escopo,
          grupoId: ordem.grupoId,
          posicao: ordem.posicao,
          origem: OrigemDesempate.MANUAL,
        })),
      });
    });

    return {
      bimestreId: escopo,
      desempates: dto.ordem.map((ordem) => ({
        grupoId: ordem.grupoId,
        posicao: ordem.posicao,
        origem: OrigemDesempate.MANUAL,
      })),
    };
  }

  /**
   * Empates de todos os escopos (cada bimestre encerrado + o anual) que ainda
   * não foram resolvidos, nem manual nem automaticamente. Reaproveita a
   * detecção de empates da etapa de rankings (`detectarEmpates`).
   */
  async listarPendencias(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
  ): Promise<
    Array<{
      tipo: 'parcial' | 'anual';
      bimestreId: string | null;
      valor: number;
      grupos: GrupoEmpatadoDetalhe[];
    }>
  > {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );

    const bimestresEncerrados = await this.prisma.bimestre.findMany({
      where: { competicaoId, situacao: SituacaoBimestre.ENCERRADO },
      select: { id: true },
      orderBy: { numero: 'asc' },
    });

    const escopos: Array<string | null> = [
      ...bimestresEncerrados.map((bimestre) => bimestre.id),
      null,
    ];

    const pendentes: Array<{
      tipo: 'parcial' | 'anual';
      bimestreId: string | null;
      valor: number;
      grupos: GrupoEmpatadoDetalhe[];
    }> = [];

    for (const escopo of escopos) {
      const empates = await this.carregarEmpatesDoEscopo(competicaoId, escopo);
      const gruposResolvidos = await this.carregarGruposResolvidos(
        competicaoId,
        escopo,
      );
      for (const empate of empates) {
        const resolvido = empate.grupos.every((grupo) =>
          gruposResolvidos.has(grupo.grupoId),
        );
        if (!resolvido) {
          pendentes.push({
            tipo: empate.tipo,
            bimestreId: empate.bimestreId,
            valor: empate.valor,
            grupos: empate.grupos,
          });
        }
      }
    }

    return pendentes;
  }

  /**
   * Disparo manual do critério automático (RN25/RN26). No alpha não existe job
   * agendado: o professor (ou um script de teste) chama este endpoint para
   * simular que o prazo esgotou. É um substituto temporário do job por data.
   */
  async aplicarAutomatico(
    user: UsuarioAutenticado | undefined,
    competicaoId: string,
    bimestreId?: string,
  ): Promise<{
    bimestreId: string | null;
    aplicados: number;
    desempates: DesempateGravado[];
    residuais: EmpateResolvivel[];
  }> {
    const professor = exigirProfessor(user);
    await carregarCompeticaoDoProfessor(
      this.prisma,
      professor.id,
      competicaoId,
    );

    const escopo = bimestreId ?? null;
    if (escopo) {
      await this.exigirBimestreDaCompeticao(competicaoId, escopo);
    }

    const empates = await this.carregarEmpatesDoEscopo(competicaoId, escopo);
    const gruposResolvidos = await this.carregarGruposResolvidos(
      competicaoId,
      escopo,
    );

    const desempates: DesempateGravado[] = [];
    const residuais: EmpateResolvivel[] = [];

    for (const empate of empates) {
      if (empate.grupos.every((grupo) => gruposResolvidos.has(grupo.grupoId))) {
        continue;
      }

      const contexto = await this.carregarContextoAutomatico(
        competicaoId,
        escopo,
        empate.grupos,
      );
      const { ordem, desempatado } = this.desempateAutomatico.ordenar({
        grupos: empate.grupos,
        materias: contexto.materias,
        mediasPorGrupoPorMateria: contexto.mediasPorGrupoPorMateria,
      });

      if (!desempatado) {
        // Empate real residual: mantém a ordem original e não grava nada.
        residuais.push(empate);
        continue;
      }

      ordem.forEach((grupo, indice) => {
        desempates.push({
          grupoId: grupo.grupoId,
          posicao: empate.posicao + indice,
          origem: OrigemDesempate.AUTOMATICO,
        });
      });
    }

    if (desempates.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.desempate.createMany({
          data: desempates.map((desempate) => ({
            competicaoId,
            bimestreId: escopo,
            grupoId: desempate.grupoId,
            posicao: desempate.posicao,
            origem: desempate.origem,
          })),
        });
      });
    }

    return {
      bimestreId: escopo,
      aplicados: desempates.length > 0 ? 1 : 0,
      desempates,
      residuais,
    };
  }

  private async carregarEmpatesDoEscopo(
    competicaoId: string,
    bimestreId: string | null,
  ): Promise<EmpateResolvivel[]> {
    const linhas = await this.montarLinhasDoRanking(competicaoId, bimestreId);
    return this.montarEmpates(linhas, bimestreId);
  }

  /**
   * Linhas do ranking do escopo: por bimestre são as sínteses de grupo já
   * gravadas; no anual, cada grupo soma as sínteses dos bimestres encerrados
   * (mesma regra do ranking anual).
   */
  private async montarLinhasDoRanking(
    competicaoId: string,
    bimestreId: string | null,
  ): Promise<LinhaDeSintese[]> {
    if (bimestreId) {
      const sinteses = await this.prisma.sinteseGrupo.findMany({
        where: { bimestreId, bimestre: { competicaoId } },
        select: {
          grupoId: true,
          valor: true,
          grupo: { select: { nome: true } },
        },
      });
      return sinteses.map((sintese) => ({
        grupoId: sintese.grupoId,
        nome: sintese.grupo.nome,
        valor: Number(sintese.valor),
      }));
    }

    const sinteses = await this.prisma.sinteseGrupo.findMany({
      where: { bimestre: { competicaoId } },
      select: {
        grupoId: true,
        valor: true,
        grupo: { select: { nome: true } },
      },
      orderBy: { bimestre: { numero: 'asc' } },
    });

    const valoresPorGrupo = new Map<string, { nome: string; valores: number[] }>();
    for (const sintese of sinteses) {
      const atual = valoresPorGrupo.get(sintese.grupoId);
      if (atual) {
        atual.valores.push(Number(sintese.valor));
      } else {
        valoresPorGrupo.set(sintese.grupoId, {
          nome: sintese.grupo.nome,
          valores: [Number(sintese.valor)],
        });
      }
    }

    return [...valoresPorGrupo.entries()].map(([grupoId, grupo]) => ({
      grupoId,
      nome: grupo.nome,
      valor: this.sinteseCalculo.calcularPontuacaoFinalGrupo(grupo.valores),
    }));
  }

  private montarEmpates(
    linhas: ReadonlyArray<LinhaDeSintese>,
    bimestreId: string | null,
  ): EmpateResolvivel[] {
    const empates = this.sinteseCalculo.detectarEmpates(
      linhas.map((linha) => ({ grupoId: linha.grupoId, valor: linha.valor })),
    );

    return empates.map((empate) => ({
      tipo: bimestreId ? 'parcial' : 'anual',
      bimestreId,
      valor: empate.valor,
      posicao: linhas.filter((linha) => linha.valor > empate.valor).length + 1,
      grupos: empate.grupos
        .map((grupo) => ({
          grupoId: grupo.grupoId,
          nome:
            linhas.find((linha) => linha.grupoId === grupo.grupoId)?.nome ??
            grupo.grupoId,
          valor: grupo.valor,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    }));
  }

  private async carregarGruposResolvidos(
    competicaoId: string,
    bimestreId: string | null,
  ): Promise<Set<string>> {
    const desempates = await this.prisma.desempate.findMany({
      where: { competicaoId, bimestreId },
      select: { grupoId: true },
    });
    return new Set(desempates.map((desempate) => desempate.grupoId));
  }

  /**
   * Carrega os dados do critério automático: matérias com a soma de pesos dos
   * componentes no período (maior decide o desempate primeiro) e a média dos
   * integrantes de cada grupo empatado por matéria.
   */
  private async carregarContextoAutomatico(
    competicaoId: string,
    bimestreId: string | null,
    grupos: ReadonlyArray<{ grupoId: string }>,
  ): Promise<{
    materias: MateriaComPeso[];
    mediasPorGrupoPorMateria: Map<string, Map<string, number>>;
  }> {
    const competicao = await this.prisma.competicao.findUnique({
      where: { id: competicaoId },
      select: { lecionamentoId: true },
    });
    if (!competicao) {
      throw new BadRequestException('Competição não encontrada.');
    }

    const materias = await this.prisma.componenteCurricular.findMany({
      where: { lecionamentoId: competicao.lecionamentoId },
      select: { id: true, nome: true },
    });
    const materiasIds = materias.map((materia) => materia.id);
    const grupoIds = grupos.map((grupo) => grupo.grupoId);

    const filtroPeriodo = bimestreId
      ? { bimestreId }
      : { bimestre: { competicaoId, situacao: SituacaoBimestre.ENCERRADO } };

    const [componentes, membros, sinteses] = await Promise.all([
      this.prisma.componentePontuacao.findMany({
        where: {
          componenteCurricularId: { in: materiasIds },
          ...filtroPeriodo,
        },
        select: { componenteCurricularId: true, pesoPercentual: true },
      }),
      this.prisma.membroGrupo.findMany({
        where: { grupoId: { in: grupoIds }, ...filtroPeriodo },
        select: { grupoId: true, alunoId: true, bimestreId: true },
      }),
      this.prisma.sinteseAlunoComponente.findMany({
        where: {
          componenteCurricularId: { in: materiasIds },
          ...filtroPeriodo,
        },
        select: {
          alunoId: true,
          bimestreId: true,
          componenteCurricularId: true,
          valor: true,
        },
      }),
    ]);

    const pesoPorMateria = new Map<string, number>();
    for (const componente of componentes) {
      if (!componente.componenteCurricularId) {
        continue;
      }
      pesoPorMateria.set(
        componente.componenteCurricularId,
        (pesoPorMateria.get(componente.componenteCurricularId) ?? 0) +
          Number(componente.pesoPercentual),
      );
    }

    const materiasComPeso = materias
      .map((materia) => ({
        id: materia.id,
        nome: materia.nome,
        peso: pesoPorMateria.get(materia.id) ?? 0,
      }))
      .filter((materia) => materia.peso > 0);

    const valorPorAlunoBimestre = new Map<
      string,
      Map<string, number>
    >();
    for (const sintese of sinteses) {
      const chave = `${sintese.alunoId}|${sintese.bimestreId}`;
      const porMateria = valorPorAlunoBimestre.get(chave) ?? new Map();
      porMateria.set(sintese.componenteCurricularId, Number(sintese.valor));
      valorPorAlunoBimestre.set(chave, porMateria);
    }

    const mediasPorGrupoPorMateria = new Map<string, Map<string, number>>();
    for (const grupoId of grupoIds) {
      const valoresPorMateria = new Map<string, number[]>();
      for (const membro of membros) {
        if (membro.grupoId !== grupoId) {
          continue;
        }
        const porMateria = valorPorAlunoBimestre.get(
          `${membro.alunoId}|${membro.bimestreId}`,
        );
        if (!porMateria) {
          continue;
        }
        for (const [materiaId, valor] of porMateria) {
          const lista = valoresPorMateria.get(materiaId) ?? [];
          lista.push(valor);
          valoresPorMateria.set(materiaId, lista);
        }
      }

      const medias = new Map<string, number>();
      for (const [materiaId, valores] of valoresPorMateria) {
        medias.set(
          materiaId,
          valores.reduce((soma, valor) => soma + valor, 0) / valores.length,
        );
      }
      mediasPorGrupoPorMateria.set(grupoId, medias);
    }

    return { materias: materiasComPeso, mediasPorGrupoPorMateria };
  }

  private async exigirBimestreDaCompeticao(
    competicaoId: string,
    bimestreId: string,
  ): Promise<void> {
    const bimestre = await this.prisma.bimestre.findUnique({
      where: { id: bimestreId },
      select: { competicaoId: true },
    });
    if (!bimestre || bimestre.competicaoId !== competicaoId) {
      throw new BadRequestException(
        'O bimestre informado não pertence a essa competição.',
      );
    }
  }
}