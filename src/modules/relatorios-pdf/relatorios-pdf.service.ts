import { Injectable } from '@nestjs/common';
import { SituacaoBimestre } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  RelatorioColetivoGrupoResponse,
  RelatorioComparativoGruposResponse,
  RelatorioComparativoGrupoResponse,
  RelatorioIndividualResponse,
} from '../relatorios/relatorios.service.js';
import { RelatoriosService } from '../relatorios/relatorios.service.js';
import {
  construirGraficoBarras,
  formatarNumero,
  montarAvisoParcial,
  montarTabelaSimples,
  type Celula,
  type ConteudoInterno,
  type SerieGrafico,
} from './documento.util.js';
import { gerarPdf } from './pdfmake.factory.js';

interface EstadoBimestres {
  encerrados: number;
  total: number;
}

@Injectable()
export class RelatoriosPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relatorios: RelatoriosService,
  ) {}

  async individual(
    user: UsuarioAutenticado | undefined,
    alunoId: string,
    competicaoId?: string,
  ): Promise<Buffer> {
    const dados = await this.relatorios.relatorioIndividual(user, alunoId, competicaoId);
    const estado = await this.estadoBimestres(dados.competicaoId);
    return gerarPdf(
      this.montarDocumento({
        titulo: 'Relatório individual',
        destinatario: dados.nome,
        competicaoNome: dados.competicaoNome,
        estado,
        conteudo: this.conteudoIndividual(dados),
      }),
    );
  }

  async comparativoGrupo(
    user: UsuarioAutenticado | undefined,
    alunoId: string,
    competicaoId?: string,
  ): Promise<Buffer> {
    const dados = await this.relatorios.relatorioComparativoGrupo(user, alunoId, competicaoId);
    const estado = await this.estadoBimestres(dados.competicaoId);
    return gerarPdf(
      this.montarDocumento({
        titulo: 'Relatório comparativo com o grupo',
        destinatario: dados.nome,
        competicaoNome: dados.competicaoNome,
        estado,
        conteudo: this.conteudoComparativoGrupo(dados),
      }),
    );
  }

  async grupo(user: UsuarioAutenticado | undefined, grupoId: string): Promise<Buffer> {
    const dados = await this.relatorios.relatorioGrupo(user, grupoId);
    const estado = await this.estadoBimestres(dados.competicaoId);
    return gerarPdf(
      this.montarDocumento({
        titulo: 'Relatório coletivo do grupo',
        destinatario: dados.nome,
        competicaoNome: dados.competicaoNome,
        estado,
        conteudo: this.conteudoGrupo(dados),
      }),
    );
  }

  async comparativoGrupos(
    user: UsuarioAutenticado | undefined,
    grupoId: string,
  ): Promise<Buffer> {
    const dados = await this.relatorios.relatorioComparativoGrupos(user, grupoId);
    const estado = await this.estadoBimestres(dados.competicaoId);
    return gerarPdf(
      this.montarDocumento({
        titulo: 'Relatório comparativo entre grupos',
        destinatario: dados.nome,
        competicaoNome: dados.competicaoNome,
        estado,
        conteudo: this.conteudoComparativoGrupos(dados),
      }),
    );
  }

  private async estadoBimestres(competicaoId: string): Promise<EstadoBimestres> {
    const [encerrados, total] = await Promise.all([
      this.prisma.bimestre.count({
        where: { competicaoId, situacao: SituacaoBimestre.ENCERRADO },
      }),
      this.prisma.bimestre.count({ where: { competicaoId } }),
    ]);
    return { encerrados, total };
  }

  private montarDocumento(opts: {
    titulo: string;
    destinatario: string;
    competicaoNome: string;
    estado: EstadoBimestres;
    conteudo: readonly ConteudoInterno[];
  }): object {
    const aviso = montarAvisoParcial(opts.estado.encerrados, opts.estado.total);
    return {
      pageSize: 'A4',
      pageMargins: [40, 46, 40, 40],
      header: {
        columns: [
          { text: opts.competicaoNome, style: 'cabecalhoCompeticao' },
          { text: 'SeducGamification · Relatórios', style: 'cabecalhoMarca', alignment: 'right' },
        ],
        margin: [40, 16, 40, 0],
      },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: `Emitido em ${new Date().toLocaleDateString('pt-BR')}`, style: 'rodape' },
          { text: `Página ${currentPage} de ${pageCount}`, style: 'rodape', alignment: 'right' },
        ],
        margin: [40, 12, 40, 0],
      }),
      content: [
        { text: opts.titulo, style: 'titulo' },
        { text: opts.destinatario, style: 'destinatario' },
        ...(aviso ? [aviso] : []),
        ...opts.conteudo,
      ],
      styles: {
        titulo: { fontSize: 18, bold: true, color: '#111827', margin: [0, 0, 0, 2] },
        destinatario: { fontSize: 12, color: '#374151', margin: [0, 0, 0, 8] },
        cabecalhoCompeticao: { fontSize: 10, bold: true, color: '#4F46E5' },
        cabecalhoMarca: { fontSize: 10, color: '#6B7280' },
        rodape: { fontSize: 8, color: '#9CA3AF' },
        secao: { fontSize: 12, bold: true, color: '#111827', margin: [0, 10, 0, 4] },
        cabecalhoTabela: {
          fontSize: 9,
          bold: true,
          color: '#111827',
          fillColor: '#EEF2FF',
          margin: [3, 2, 3, 2],
        },
        avisoParcial: { fontSize: 9, bold: true, color: '#92400E', margin: [4, 3, 4, 3] },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    };
  }

  private conteudoIndividual(
    dados: RelatorioIndividualResponse,
  ): ConteudoInterno[] {
    const linhas: Array<Array<Celula>> = dados.bimestres.map((bimestre) => [
      { text: `Bimestre ${bimestre.numero}` },
      { text: formatarNumero(bimestre.valor), alignment: 'right' },
    ]);
    linhas.push([
      { text: 'Pontuação final (média)', bold: true },
      { text: formatarNumero(dados.pontuacaoFinal), bold: true, alignment: 'right' },
    ]);

    const grafico = construirGraficoBarras(
      dados.bimestres.map((bimestre) => `B${bimestre.numero}`),
      [
        {
          rotulo: dados.nome,
          cor: '#4F46E5',
          valores: dados.bimestres.map((bimestre) => bimestre.valor),
        },
      ],
    );

    const detalhes = dados.bimestres.flatMap((bimestre) => [
      { text: `Bimestre ${bimestre.numero} — matérias`, style: 'secao' },
      montarTabelaSimples(
        ['Matéria', 'Nota (0–10)'],
        bimestre.materias.map((materia) => [
          { text: materia.nome },
          { text: formatarNumero(materia.valor), alignment: 'right' },
        ]),
      ),
    ]);

    return [
      { text: 'Sínteses por bimestre', style: 'secao' },
      montarTabelaSimples(['Bimestre', 'Síntese (0–10)'], linhas),
      { text: 'Evolução ao longo dos bimestres', style: 'secao' },
      grafico ??
        ({ text: 'Sem dados de bimestres encerrados para exibir o gráfico.', color: '#6B7280' } as ConteudoInterno),
      ...detalhes,
    ];
  }

  private conteudoComparativoGrupo(
    dados: RelatorioComparativoGrupoResponse,
  ): ConteudoInterno[] {
    const linhas: Array<Array<Celula>> = dados.bimestres.map((bimestre) => [
      { text: `Bimestre ${bimestre.numero}` },
      { text: formatarNumero(bimestre.valor), alignment: 'right' },
      { text: bimestre.grupo?.nome ?? '—' },
      {
        text:
          bimestre.colegasDeGrupo.length > 0
            ? bimestre.colegasDeGrupo
                .map(
                  (colega) =>
                    `${colega.nome} (${formatarNumero(colega.valor)})`,
                )
                .join(' · ')
            : '—',
        fontSize: 8,
      },
    ]);
    linhas.push([
      { text: 'Pontuação final (média)', bold: true },
      { text: formatarNumero(dados.pontuacaoFinal), bold: true, alignment: 'right' },
      { text: '' },
      { text: '' },
    ]);

    const grafico = construirGraficoBarras(
      dados.bimestres.map((bimestre) => `B${bimestre.numero}`),
      [
        {
          rotulo: dados.nome,
          cor: '#4F46E5',
          valores: dados.bimestres.map((bimestre) => bimestre.valor),
        },
      ],
    );

    const detalhes = dados.bimestres.flatMap((bimestre) => [
      { text: `Bimestre ${bimestre.numero} — matérias`, style: 'secao' },
      montarTabelaSimples(
        ['Matéria', 'Nota (0–10)'],
        bimestre.materias.map((materia) => [
          { text: materia.nome },
          { text: formatarNumero(materia.valor), alignment: 'right' },
        ]),
      ),
    ]);

    return [
      { text: 'Síntese por bimestre', style: 'secao' },
      montarTabelaSimples(
        ['Bimestre', 'Síntese aluno (0–10)', 'Grupo', 'Colegas de grupo'],
        linhas as Array<Array<Celula | string>>,
      ),
      { text: 'Evolução ao longo dos bimestres', style: 'secao' },
      grafico ??
        ({ text: 'Sem dados de bimestres encerrados para exibir o gráfico.', color: '#6B7280' } as ConteudoInterno),
      ...detalhes,
    ];
  }

  private conteudoGrupo(dados: RelatorioColetivoGrupoResponse): ConteudoInterno[] {
    const linhas: Array<Array<Celula>> = dados.bimestres.map((bimestre) => [
      { text: `Bimestre ${bimestre.numero}` },
      { text: formatarNumero(bimestre.valor), alignment: 'right' },
      {
        text:
          bimestre.integrantes.length > 0
            ? bimestre.integrantes
                .map(
                  (integrante) =>
                    `${integrante.nome} (${formatarNumero(integrante.valor)})`,
                )
                .join(' · ')
            : '—',
      },
    ]);
    linhas.push([
      { text: 'Pontuação final (soma, até 40)', bold: true },
      { text: formatarNumero(dados.pontuacaoFinal), bold: true, alignment: 'right' },
      { text: '', fontSize: 8 },
    ]);

    const grafico = construirGraficoBarras(
      dados.bimestres.map((bimestre) => `B${bimestre.numero}`),
      [
        {
          rotulo: dados.nome,
          cor: '#10B981',
          valores: dados.bimestres.map((bimestre) => bimestre.valor),
        },
      ],
    );

    return [
      { text: 'Síntese do grupo por bimestre', style: 'secao' },
      montarTabelaSimples(
        ['Bimestre', 'Síntese do grupo (0–10)', 'Integrantes e sinteses'],
        linhas as Array<Array<Celula | string>>,
      ),
      { text: 'Evolução do grupo ao longo dos bimestres', style: 'secao' },
      grafico ??
        ({ text: 'Sem dados de bimestres encerrados para exibir o gráfico.', color: '#6B7280' } as ConteudoInterno),
    ];
  }

  private conteudoComparativoGrupos(
    dados: RelatorioComparativoGruposResponse,
  ): ConteudoInterno[] {
    const linhasDeGrupos = [
      {
        grupoId: dados.grupoId,
        nome: dados.nome,
        porBimestre: dados.bimestres.map((bimestre) => bimestre.valor),
        pontuacaoFinal: dados.pontuacaoFinal,
      },
      ...dados.comparativo.map((grupo) => ({
        grupoId: grupo.grupoId,
        nome: grupo.nome,
        porBimestre: grupo.bimestres.map((bimestre) => bimestre.valor),
        pontuacaoFinal: grupo.pontuacaoFinal,
      })),
    ];

    const colunas = [
      'Grupo',
      ...dados.bimestres.map((bimestre) => `B${bimestre.numero}`),
      'Pont. final',
    ];
    const linhas: Array<Array<Celula>> = linhasDeGrupos.map((grupo) => [
      { text: grupo.nome, bold: grupo.grupoId === dados.grupoId },
      ...grupo.porBimestre.map((valor) => ({
        text: formatarNumero(valor),
        alignment: 'right' as const,
        bold: grupo.grupoId === dados.grupoId,
      })),
      {
        text: formatarNumero(grupo.pontuacaoFinal),
        alignment: 'right',
        bold: grupo.grupoId === dados.grupoId,
      },
    ]);

    const series: SerieGrafico[] = linhasDeGrupos.map((grupo, indice) => ({
      rotulo: grupo.nome,
      cor: ['#4F46E5', '#F59E0B', '#10B981', '#EF4444'][indice % 4] ?? '#6B7280',
      valores: grupo.porBimestre,
    }));

    const grafico = construirGraficoBarras(
      dados.bimestres.map((bimestre) => `B${bimestre.numero}`),
      series,
    );

    return [
      {
        text: 'O relatório realça o grupo atual em negrito.',
        fontSize: 8,
        color: '#6B7280',
      },
      { text: 'Comparativo entre grupos', style: 'secao' },
      montarTabelaSimples(colunas, linhas as Array<Array<Celula | string>>),
      { text: 'Evolução por grupo ao longo dos bimestres', style: 'secao' },
      grafico ??
        ({ text: 'Sem dados de bimestres encerrados para exibir o gráfico.', color: '#6B7280' } as ConteudoInterno),
    ];
  }
}