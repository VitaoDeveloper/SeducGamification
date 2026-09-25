/**
 * Helpers puros de montagem dos documentos PDF (sem dependência de pdfmake),
 * mantidos isolados para facilitar testes unitários.
 */

export type Alinhamento = 'left' | 'center' | 'right' | 'justify';

export interface Celula {
  text: string;
  style?: string;
  alignment?: Alinhamento;
  bold?: boolean;
  color?: string;
  fillColor?: string;
  fontSize?: number;
}

export interface ItemCanvas {
  type: 'rect' | 'line' | 'text';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color?: string;
  lineColor?: string;
  lineWidth?: number;
  text?: string;
  alignment?: Alinhamento;
  width?: number;
  fontSize?: number;
}

export interface ConteudoInterno {
  text?: string | ConteudoInterno[];
  style?: string | string[];
  fontSize?: number;
  bold?: boolean;
  color?: string;
  alignment?: Alinhamento;
  margin?: number[];
  columns?: ConteudoInterno[];
  table?: {
    headerRows: number;
    widths: Array<number | '*'>;
    body: Array<Array<string | Celula>>;
  };
  layout?: string;
  canvas?: ItemCanvas[];
  fillColor?: string;
}

export interface SerieGrafico {
  rotulo: string;
  cor: string;
  valores: ReadonlyArray<number | null>;
}

/**
 * Formata um valor numérico para exibição (pt-BR): inteiros sem casas
 * decimais, decimais com vírgula e nulos como "—".
 */
export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) {
    return '—';
  }
  const arredondado = Math.round(valor * 100) / 100;
  if (Number.isInteger(arredondado)) {
    return String(arredondado);
  }
  return String(arredondado).replace('.', ',');
}

/**
 * Sinalização de "resultado parcial" (mesma semântica dos rankings): quando a
 * competição ainda tem bimestres não encerrados, o documento deixa explícito
 * que os valores podem não refletir o desempenho completo. Retorna null
 * quando a competição está completa.
 */
export function montarAvisoParcial(
  bimestresEncerrados: number,
  totalBimestres: number,
): ConteudoInterno | null {
  if (bimestresEncerrados >= totalBimestres) {
    return null;
  }
  const texto =
    bimestresEncerrados === 0
      ? 'Resultado parcial — nenhum bimestre encerrado ainda; os valores podem não refletir o desempenho completo.'
      : `Resultado parcial — apenas ${bimestresEncerrados} de ${totalBimestres} bimestres encerrados.`;
  return {
    table: {
      headerRows: 0,
      widths: ['*'],
      body: [[{ text: texto, style: 'avisoParcial', fillColor: '#FEF3C7' }]],
    },
    layout: 'noBorders',
    margin: [0, 2, 0, 8],
  };
}

/** Tabela simples com cabeçalho tipado e linhas horizontais leves. */
export function montarTabelaSimples(
  colunas: readonly string[],
  linhas: ReadonlyArray<ReadonlyArray<Celula | string>>,
): ConteudoInterno {
  const corpo: Array<Array<string | Celula>> = [
    colunas.map((titulo) => ({ text: titulo, style: 'cabecalhoTabela' })),
    ...linhas.map((linha) => [...linha]),
  ];
  return {
    table: {
      headerRows: 1,
      widths: colunas.map(() => '*' as const),
      body: corpo,
    },
    layout: 'lightHorizontalLines',
    margin: [0, 2, 0, 10],
    fontSize: 9,
  };
}

/** Dimensões internas do gráfico de barras (expostas para os testes). */
export const DIMENSOES_GRAFICO = {
  largura: 470,
  margemEsquerda: 42,
  margemDireita: 6,
  alturaTotal: 205,
  areaTopo: 16,
  alturaRotulosX: 16,
  alturaLegenda: 18,
  corEixo: '#D1D5DB',
  corRotulo: '#374151',
} as const;

function corDaSerie(indice: number): string {
  const paleta = ['#4F46E5', '#F59E0B', '#10B981', '#EF4444'];
  return paleta[indice % paleta.length] ?? '#6B7280';
}

/**
 * Gráfico de barras simples (evolução ao longo dos bimestres), desenhado com
 * primitivas de canvas do pdfmake. Uma categoria por bimestre e uma barra por
 * série. Retorna null quando não há nenhum valor para desenhar.
 */
export function construirGraficoBarras(
  categorias: readonly string[],
  series: readonly SerieGrafico[],
): ConteudoInterno | null {
  if (categorias.length === 0 || series.length === 0) {
    return null;
  }
  const valores = series.flatMap((serie) =>
    serie.valores.filter((valor): valor is number => valor !== null),
  );
  if (valores.length === 0) {
    return null;
  }

  const {
    largura,
    margemEsquerda,
    margemDireita,
    alturaTotal,
    areaTopo,
    alturaRotulosX,
    alturaLegenda,
    corEixo,
    corRotulo,
  } = DIMENSOES_GRAFICO;

  const maximo = Math.max(...valores);
  const passo = maximo <= 10 ? 2 : maximo <= 20 ? 5 : 10;
  const topo = Math.max(10, Math.ceil(maximo / passo) * passo);

  const areaBase = alturaTotal - alturaRotulosX - alturaLegenda;
  const alturaPlot = areaBase - areaTopo;
  const larguraArea = largura - margemEsquerda - margemDireita;
  const larguraSlot = larguraArea / categorias.length;
  const larguraGrupo = Math.min(larguraSlot * 0.72, series.length * 34);
  const larguraBarra = larguraGrupo / series.length;

  const itens: ItemCanvas[] = [];

  for (let tick = 0; tick <= topo; tick += passo) {
    const y = areaBase - (tick / topo) * alturaPlot;
    itens.push({
      type: 'line',
      x1: margemEsquerda,
      y1: y,
      x2: margemEsquerda + larguraArea,
      y2: y,
      lineWidth: tick === 0 ? 0.6 : 0.3,
      lineColor: corEixo,
    });
    itens.push({
      type: 'text',
      text: String(tick),
      x: margemEsquerda - 4,
      width: 30,
      alignment: 'right',
      y: y - 5,
      fontSize: 7,
      color: corRotulo,
    });
  }

  categorias.forEach((categoria, indice) => {
    const xGrupo =
      margemEsquerda +
      indice * larguraSlot +
      (larguraSlot - larguraGrupo) / 2;

    itens.push({
      type: 'text',
      text: categoria,
      x: margemEsquerda + indice * larguraSlot,
      width: larguraSlot,
      alignment: 'center',
      y: areaBase + 6,
      fontSize: 8,
      color: corRotulo,
    });

    series.forEach((serie, indiceSerie) => {
      const valor = serie.valores[indice];
      if (valor === null) {
        return;
      }
      const altura = (valor / topo) * alturaPlot;
      const x = xGrupo + indiceSerie * larguraBarra;
      const y = areaBase - altura;
      itens.push({
        type: 'rect',
        x,
        y,
        w: larguraBarra,
        h: altura,
        color: serie.cor,
      });
      itens.push({
        type: 'text',
        text: formatarNumero(valor),
        x: x - larguraBarra / 2,
        width: larguraBarra * 2,
        alignment: 'center',
        y: y - 11,
        fontSize: 7.5,
        color: serie.cor,
      });
    });
  });

  let xLegenda = margemEsquerda;
  series.forEach((serie, indice) => {
    const cor = serie.cor === undefined ? corDaSerie(indice) : serie.cor;
    itens.push({
      type: 'rect',
      x: xLegenda,
      y: alturaTotal - alturaLegenda + 2,
      w: 10,
      h: 10,
      color: cor,
    });
    itens.push({
      type: 'text',
      text: serie.rotulo,
      x: xLegenda + 14,
      y: alturaTotal - alturaLegenda - 2,
      fontSize: 8,
      color: corRotulo,
      width: 220,
    });
    xLegenda += 24 + serie.rotulo.length * 5;
  });

  return { canvas: itens, margin: [0, 4, 0, 4] };
}