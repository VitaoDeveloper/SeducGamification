import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TIPO_USUARIO, UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { carregarGrupoDoProfessor } from '../shared/acesso-competicao.util.js';
import { SinteseCalculoService } from '../sinteses/sintese-calculo.service.js';

export interface MateriaDoAluno {
  componenteCurricularId: string;
  nome: string;
  valor: number;
}

export interface ColegaDeGrupo {
  alunoId: string;
  nome: string;
  /** Síntese bimestral do colega no bimestre (escala 0-10). */
  valor: number | null;
  materias: MateriaDoAluno[];
}

export interface IntegranteDoGrupo {
  alunoId: string;
  nome: string;
  /** Síntese bimestral do integrante no bimestre (escala 0-10). */
  valor: number | null;
}

export interface BimestreIndividual {
  bimestreId: string;
  numero: number;
  valor: number | null;
  materias: MateriaDoAluno[];
}

export interface BimestreIndividualComparado extends BimestreIndividual {
  grupo: { grupoId: string; nome: string } | null;
  colegasDeGrupo: ColegaDeGrupo[];
}

export interface BimestreGrupo {
  bimestreId: string;
  numero: number;
  valor: number | null;
  integrantes: IntegranteDoGrupo[];
}

export interface GrupoComparativo {
  grupoId: string;
  nome: string;
  /** Pontuação final (soma dos bimestres, até 40), separada da escala 0-10. */
  pontuacaoFinal: number | null;
  bimestres: Array<{ bimestreId: string; numero: number; valor: number | null }>;
}

interface DadosDaCompeticao {
  bimestres: Array<{ id: string; numero: number }>;
  sinteseAluno: Array<{ bimestreId: string; alunoId: string; valor: number }>;
  sinteseAlunoComponente: Array<{
    bimestreId: string;
    alunoId: string;
    componenteCurricularId: string;
    valor: number;
    nomeMateria: string;
  }>;
  membros: Array<{ bimestreId: string; grupoId: string; alunoId: string }>;
  sinteseGrupo: Array<{ bimestreId: string; grupoId: string; valor: number }>;
  grupos: Array<{ id: string; nome: string }>;
  nomePorAluno: Map<string, string>;
}

@Injectable()
export class RelatoriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sinteseCalculo: SinteseCalculoService,
  ) {}

  /**
   * Relatório individual do aluno (RN28): síntese por bimestre,
   * detalhamento por matéria e a pontuação final (média das sínteses).
   */
  async relatorioIndividual(
    user: UsuarioAutenticado | undefined,
    alunoId: string,
    competicaoId?: string,
  ) {
    const contexto = await this.carregarContextoAluno(
      user,
      alunoId,
      competicaoId,
    );
    const dados = await this.carregarDadosDaCompeticao(contexto.competicaoId);
    const sintesesDoAluno = this.sintesesDoAluno(dados, alunoId);

    return {
      tipo: 'individual',
      alunoId: contexto.alunoId,
      nome: contexto.alunoNome,
      competicaoId: contexto.competicaoId,
      competicaoNome: contexto.competicaoNome,
      pontuacaoFinal: this.pontuacaoFinalIndividual(sintesesDoAluno),
      bimestres: dados.bimestres.map((bimestre) =>
        this.montarBimestreIndividual(dados, alunoId, bimestre),
      ),
    };
  }

  /** Relatório individual comparado aos demais integrantes do grupo do aluno. */
  async relatorioComparativoGrupo(
    user: UsuarioAutenticado | undefined,
    alunoId: string,
    competicaoId?: string,
  ) {
    const contexto = await this.carregarContextoAluno(
      user,
      alunoId,
      competicaoId,
    );
    const dados = await this.carregarDadosDaCompeticao(contexto.competicaoId);
    const sintesesDoAluno = this.sintesesDoAluno(dados, alunoId);

    const grupoDoAlunoPorBimestre = new Map<string, string>();
    for (const membro of dados.membros) {
      if (membro.alunoId === alunoId && !grupoDoAlunoPorBimestre.has(membro.bimestreId)) {
        grupoDoAlunoPorBimestre.set(membro.bimestreId, membro.grupoId);
      }
    }

    const nomeDoGrupo = new Map(
      dados.grupos.map((grupo) => [grupo.id, grupo.nome]),
    );

    return {
      tipo: 'comparativo-grupo',
      alunoId: contexto.alunoId,
      nome: contexto.alunoNome,
      competicaoId: contexto.competicaoId,
      competicaoNome: contexto.competicaoNome,
      pontuacaoFinal: this.pontuacaoFinalIndividual(sintesesDoAluno),
      bimestres: dados.bimestres.map((bimestre) => {
        const base = this.montarBimestreIndividual(
          dados,
          alunoId,
          bimestre,
        );
        const grupoId = grupoDoAlunoPorBimestre.get(bimestre.id) ?? null;
        return {
          ...base,
          grupo: grupoId
            ? { grupoId, nome: nomeDoGrupo.get(grupoId) ?? grupoId }
            : null,
          colegasDeGrupo: grupoId
            ? this.colegasDoBimestre(dados, bimestre.id, grupoId, alunoId)
            : [],
        } as BimestreIndividualComparado;
      }),
    };
  }

  /** Relatório coletivo do grupo (RN28): síntese por bimestre e integrantes. */
  async relatorioGrupo(user: UsuarioAutenticado | undefined, grupoId: string) {
    const acesso = await this.carregarAcessoGrupo(user, grupoId);
    const dados = await this.carregarDadosDaCompeticao(acesso.competicaoId);

    return {
      tipo: 'coletivo-grupo',
      grupoId: acesso.grupoId,
      nome: acesso.grupoNome,
      competicaoId: acesso.competicaoId,
      competicaoNome: acesso.competicaoNome,
      pontuacaoFinal: this.pontuacaoFinalDeGrupo(dados, acesso.grupoId),
      bimestres: this.bimestresDoGrupo(dados, acesso.grupoId),
    };
  }

  /**
   * Relatório coletivo do grupo comparado aos demais grupos da competição. A
   * síntese bimestral de cada grupo (escala 0-10) e a pontuação final (soma,
   * até 40) aparecem em campos separados.
   */
  async relatorioComparativoGrupos(
    user: UsuarioAutenticado | undefined,
    grupoId: string,
  ) {
    const acesso = await this.carregarAcessoGrupo(user, grupoId);
    const dados = await this.carregarDadosDaCompeticao(acesso.competicaoId);

    return {
      tipo: 'comparativo-grupos',
      grupoId: acesso.grupoId,
      nome: acesso.grupoNome,
      competicaoId: acesso.competicaoId,
      competicaoNome: acesso.competicaoNome,
      pontuacaoFinal: this.pontuacaoFinalDeGrupo(dados, acesso.grupoId),
      bimestres: this.bimestresDoGrupo(dados, acesso.grupoId),
      comparativo: dados.grupos
        .filter((grupo) => grupo.id !== acesso.grupoId)
        .map((grupo) => ({
          grupoId: grupo.id,
          nome: grupo.nome,
          pontuacaoFinal: this.pontuacaoFinalDeGrupo(dados, grupo.id),
          bimestres: dados.bimestres.map((bimestre) => ({
            bimestreId: bimestre.id,
            numero: bimestre.numero,
            valor: this.valorSinteseGrupo(dados, bimestre.id, grupo.id),
          })),
        })),
    };
  }

  private montarBimestreIndividual(
    dados: DadosDaCompeticao,
    alunoId: string,
    bimestre: { id: string; numero: number },
  ): BimestreIndividual {
    return {
      bimestreId: bimestre.id,
      numero: bimestre.numero,
      valor: this.valorSinteseAluno(dados, bimestre.id, alunoId),
      materias: this.materiasDoAluno(dados, alunoId, bimestre.id),
    };
  }

  private colegasDoBimestre(
    dados: DadosDaCompeticao,
    bimestreId: string,
    grupoId: string,
    alunoId: string,
  ): ColegaDeGrupo[] {
    return dados.membros
      .filter(
        (membro) =>
          membro.bimestreId === bimestreId &&
          membro.grupoId === grupoId &&
          membro.alunoId !== alunoId,
      )
      .map((membro) => ({
        alunoId: membro.alunoId,
        nome: dados.nomePorAluno.get(membro.alunoId) ?? membro.alunoId,
        valor: this.valorSinteseAluno(dados, bimestreId, membro.alunoId),
        materias: this.materiasDoAluno(dados, membro.alunoId, bimestreId),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  private bimestresDoGrupo(
    dados: DadosDaCompeticao,
    grupoId: string,
  ): BimestreGrupo[] {
    return dados.bimestres.map((bimestre) => ({
      bimestreId: bimestre.id,
      numero: bimestre.numero,
      valor: this.valorSinteseGrupo(dados, bimestre.id, grupoId),
      integrantes: dados.membros
        .filter(
          (membro) =>
            membro.bimestreId === bimestre.id && membro.grupoId === grupoId,
        )
        .map((membro) => ({
          alunoId: membro.alunoId,
          nome: dados.nomePorAluno.get(membro.alunoId) ?? membro.alunoId,
          valor: this.valorSinteseAluno(dados, bimestre.id, membro.alunoId),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    }));
  }

  private materiasDoAluno(
    dados: DadosDaCompeticao,
    alunoId: string,
    bimestreId: string,
  ): MateriaDoAluno[] {
    return dados.sinteseAlunoComponente
      .filter(
        (sintese) =>
          sintese.alunoId === alunoId && sintese.bimestreId === bimestreId,
      )
      .map((sintese) => ({
        componenteCurricularId: sintese.componenteCurricularId,
        nome: sintese.nomeMateria,
        valor: sintese.valor,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  private sintesesDoAluno(
    dados: DadosDaCompeticao,
    alunoId: string,
  ): number[] {
    return dados.sinteseAluno
      .filter((sintese) => sintese.alunoId === alunoId)
      .map((sintese) => sintese.valor);
  }

  private pontuacaoFinalIndividual(
    sintesesBimestrais: ReadonlyArray<number>,
  ): number | null {
    if (sintesesBimestrais.length === 0) {
      return null;
    }
    return this.sinteseCalculo.calcularPontuacaoFinalAluno(sintesesBimestrais);
  }

  private pontuacaoFinalDeGrupo(
    dados: DadosDaCompeticao,
    grupoId: string,
  ): number | null {
    const sinteses = dados.sinteseGrupo
      .filter((sintese) => sintese.grupoId === grupoId)
      .map((sintese) => sintese.valor);
    if (sinteses.length === 0) {
      return null;
    }
    return this.sinteseCalculo.calcularPontuacaoFinalGrupo(sinteses);
  }

  private valorSinteseAluno(
    dados: DadosDaCompeticao,
    bimestreId: string,
    alunoId: string,
  ): number | null {
    const sintese = dados.sinteseAluno.find(
      (candidata) =>
        candidata.bimestreId === bimestreId && candidata.alunoId === alunoId,
    );
    return sintese ? sintese.valor : null;
  }

  private valorSinteseGrupo(
    dados: DadosDaCompeticao,
    bimestreId: string,
    grupoId: string,
  ): number | null {
    const sintese = dados.sinteseGrupo.find(
      (candidata) =>
        candidata.bimestreId === bimestreId && candidata.grupoId === grupoId,
    );
    return sintese ? sintese.valor : null;
  }

  private async carregarDadosDaCompeticao(
    competicaoId: string,
  ): Promise<DadosDaCompeticao> {
    const where = { bimestre: { competicaoId } };

    const [bimestres, sinteseAluno, sinteseAlunoComponente, membros, sinteseGrupo, grupos] =
      await Promise.all([
        this.prisma.bimestre.findMany({
          where: { competicaoId },
          select: { id: true, numero: true },
          orderBy: { numero: 'asc' },
        }),
        this.prisma.sinteseAluno.findMany({
          where,
          select: { bimestreId: true, alunoId: true, valor: true },
        }),
        this.prisma.sinteseAlunoComponente.findMany({
          where,
          select: {
            bimestreId: true,
            alunoId: true,
            componenteCurricularId: true,
            valor: true,
            componenteCurricular: { select: { nome: true } },
          },
        }),
        this.prisma.membroGrupo.findMany({
          where,
          select: { bimestreId: true, grupoId: true, alunoId: true },
        }),
        this.prisma.sinteseGrupo.findMany({
          where,
          select: { bimestreId: true, grupoId: true, valor: true },
        }),
        this.prisma.grupoCompetidor.findMany({
          where: { competicaoId },
          select: { id: true, nome: true },
          orderBy: { nome: 'asc' },
        }),
      ]);

    const idsAlunos = new Set<string>();
    for (const sintese of sinteseAluno) {
      idsAlunos.add(sintese.alunoId);
    }
    for (const membro of membros) {
      idsAlunos.add(membro.alunoId);
    }
    const alunos = idsAlunos.size
      ? await this.prisma.aluno.findMany({
          where: { id: { in: [...idsAlunos] } },
          select: { id: true, nome: true },
        })
      : [];
    const nomePorAluno = new Map(alunos.map((aluno) => [aluno.id, aluno.nome]));

    return {
      bimestres,
      sinteseAluno: sinteseAluno.map((sintese) => ({
        bimestreId: sintese.bimestreId,
        alunoId: sintese.alunoId,
        valor: Number(sintese.valor),
      })),
      sinteseAlunoComponente: sinteseAlunoComponente.map((sintese) => ({
        bimestreId: sintese.bimestreId,
        alunoId: sintese.alunoId,
        componenteCurricularId: sintese.componenteCurricularId,
        valor: Number(sintese.valor),
        nomeMateria: sintese.componenteCurricular.nome,
      })),
      membros,
      sinteseGrupo: sinteseGrupo.map((sintese) => ({
        bimestreId: sintese.bimestreId,
        grupoId: sintese.grupoId,
        valor: Number(sintese.valor),
      })),
      grupos,
      nomePorAluno,
    };
  }

  /**
   * Guard do relatório individual do aluno: só o próprio aluno ou um
   * professor da competição em que o aluno está matriculado.
   */
  private async carregarContextoAluno(
    user: UsuarioAutenticado | undefined,
    alunoId: string,
    competicaoId?: string,
  ): Promise<{
    alunoId: string;
    alunoNome: string;
    competicaoId: string;
    competicaoNome: string;
  }> {
    const usuario = this.exigirUsuario(user);

    const aluno = await this.prisma.aluno.findUnique({
      where: { id: alunoId },
      select: { id: true, nome: true },
    });
    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado.');
    }

    const resolvida =
      competicaoId ?? (await this.resolverCompeticaoDoAluno(usuario, alunoId));

    const competicao = await this.prisma.competicao.findUnique({
      where: { id: resolvida },
      select: {
        id: true,
        nome: true,
        lecionamento: { select: { professorId: true, salaId: true } },
      },
    });
    if (!competicao) {
      throw new NotFoundException('Competição não encontrada.');
    }

    const salaDaCompeticao = competicao.lecionamento.salaId;
    if (usuario.tipo === TIPO_USUARIO.PROFESSOR) {
      if (competicao.lecionamento.professorId !== usuario.id) {
        throw new ForbiddenException(
          'Competição pertence a outro professor.',
        );
      }
      const matricula = await this.prisma.matricula.findUnique({
        where: {
          alunoId_salaId: { alunoId, salaId: salaDaCompeticao },
        },
        select: { alunoId: true },
      });
      if (!matricula) {
        throw new NotFoundException(
          'O aluno não está matriculado nessa competição.',
        );
      }
    } else {
      if (usuario.id !== alunoId) {
        throw new ForbiddenException(
          'Aluno só pode acessar o próprio relatório.',
        );
      }
      const participa = await this.alunoParticipaDaCompeticao(
        alunoId,
        resolvida,
        salaDaCompeticao,
      );
      if (!participa) {
        throw new ForbiddenException(
          'O aluno não participa dessa competição.',
        );
      }
    }

    return {
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      competicaoId: competicao.id,
      competicaoNome: competicao.nome,
    };
  }

  /**
   * Guard do relatório do grupo: qualquer aluno que seja ou tenha sido membro
   * do grupo em algum bimestre, ou um professor da competição.
   */
  private async carregarAcessoGrupo(
    user: UsuarioAutenticado | undefined,
    grupoId: string,
  ): Promise<{
    grupoId: string;
    grupoNome: string;
    competicaoId: string;
    competicaoNome: string;
  }> {
    const usuario = this.exigirUsuario(user);

    if (usuario.tipo === TIPO_USUARIO.PROFESSOR) {
      await carregarGrupoDoProfessor(this.prisma, usuario.id, grupoId);
      const grupoDoProfessor = await this.prisma.grupoCompetidor.findUnique({
        where: { id: grupoId },
        select: {
          id: true,
          nome: true,
          competicaoId: true,
          competicao: { select: { nome: true } },
        },
      });
      return {
        grupoId: grupoDoProfessor!.id,
        grupoNome: grupoDoProfessor!.nome,
        competicaoId: grupoDoProfessor!.competicaoId,
        competicaoNome: grupoDoProfessor!.competicao.nome,
      };
    }

    const grupo = await this.prisma.grupoCompetidor.findUnique({
      where: { id: grupoId },
      select: {
        id: true,
        nome: true,
        competicao: { select: { id: true, nome: true } },
      },
    });
    if (!grupo) {
      throw new NotFoundException('Grupo não encontrado.');
    }

    const membro = await this.prisma.membroGrupo.findFirst({
      where: { grupoId: grupo.id, alunoId: usuario.id },
      select: { alunoId: true },
    });
    if (!membro) {
      throw new ForbiddenException(
        'Aluno não pertence (e não pertencia) a esse grupo.',
      );
    }

    return {
      grupoId: grupo.id,
      grupoNome: grupo.nome,
      competicaoId: grupo.competicao.id,
      competicaoNome: grupo.competicao.nome,
    };
  }

  private async resolverCompeticaoDoAluno(
    usuario: UsuarioAutenticado,
    alunoId: string,
  ): Promise<string> {
    const [membras, matriculas] = await Promise.all([
      this.prisma.membroGrupo.findMany({
        where: { alunoId },
        select: { bimestre: { select: { competicaoId: true } } },
      }),
      this.prisma.matricula.findMany({
        where: { alunoId },
        select: {
          sala: {
            select: {
              lecionamentos: {
                select: { competicoes: { select: { id: true } } },
              },
            },
          },
        },
      }),
    ]);

    const candidatas = new Set<string>();
    for (const membro of membras) {
      candidatas.add(membro.bimestre.competicaoId);
    }
    for (const matricula of matriculas) {
      for (const lecionamento of matricula.sala.lecionamentos) {
        for (const competicao of lecionamento.competicoes) {
          candidatas.add(competicao.id);
        }
      }
    }

    const filtradas =
      usuario.tipo === TIPO_USUARIO.PROFESSOR
        ? await this.filtrarCompeticoesDoProfessor([...candidatas], usuario.id)
        : [...candidatas];

    if (filtradas.length === 0) {
      if (usuario.tipo === TIPO_USUARIO.PROFESSOR) {
        throw new ForbiddenException(
          'Nenhuma competição sua contém esse aluno.',
        );
      }
      throw new NotFoundException(
        'O aluno não participa de nenhuma competição.',
      );
    }
    if (filtradas.length > 1) {
      throw new BadRequestException(
        'O aluno participa de mais de uma competição; informe competicaoId.',
      );
    }
    return filtradas[0] as string;
  }

  private async filtrarCompeticoesDoProfessor(
    candidatas: readonly string[],
    professorId: string,
  ): Promise<string[]> {
    if (candidatas.length === 0) {
      return [];
    }
    const competicoes = await this.prisma.competicao.findMany({
      where: {
        id: { in: [...candidatas] },
        lecionamento: { professorId },
      },
      select: { id: true },
    });
    return competicoes.map((competicao) => competicao.id);
  }

  private async alunoParticipaDaCompeticao(
    alunoId: string,
    competicaoId: string,
    salaId: string,
  ): Promise<boolean> {
    const [matricula, membro] = await Promise.all([
      this.prisma.matricula.findUnique({
        where: { alunoId_salaId: { alunoId, salaId } },
        select: { alunoId: true },
      }),
      this.prisma.membroGrupo.findFirst({
        where: { alunoId, bimestre: { competicaoId } },
        select: { alunoId: true },
      }),
    ]);
    return Boolean(matricula) || Boolean(membro);
  }

  private exigirUsuario(
    user: UsuarioAutenticado | undefined,
  ): UsuarioAutenticado {
    if (!user) {
      throw new UnauthorizedException('Autenticação necessária.');
    }
    return user;
  }
}