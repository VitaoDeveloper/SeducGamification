import { describe, expect, it } from 'vitest';
import {
  construirGraficoBarras,
  formatarNumero,
  montarAvisoParcial,
  montarTabelaSimples,
  DIMENSOES_GRAFICO,
  type ItemCanvas,
} from './documento.util.js';

describe('formatarNumero', () => {
  it('formata inteiros sem casas decimais', () => {
    expect(formatarNumero(8)).toBe('8');
    expect(formatarNumero(0)).toBe('0');
    expect(formatarNumero(10)).toBe('10');
  });

  it('formata decimais com vírgula (pt-BR)', () => {
    expect(formatarNumero(8.25)).toBe('8,25');
    expect(formatarNumero(7.5)).toBe('7,5');
  });

  it('representa nulos e indefinidos como travessão', () => {
    expect(formatarNumero(null)).toBe('—');
    expect(formatarNumero(undefined)).toBe('—');
  });
});

describe('montarAvisoParcial', () => {
  it('retorna null quando a competição está completa', () => {
    expect(montarAvisoParcial(4, 4)).toBeNull();
    expect(montarAvisoParcial(5, 4)).toBeNull();
  });

  it('avisa sobre bimestres não encerrados', () => {
    const aviso = montarAvisoParcial(2, 4);
    expect(aviso).not.toBeNull();
    const celula = aviso?.table?.body[0][0] as { text: string };
    expect(celula.text).toContain('Resultado parcial');
    expect(celula.text).toContain('2 de 4');
  });

  it('avisa quando nenhum bimestre foi encerrado', () => {
    const aviso = montarAvisoParcial(0, 4);
    const celula = aviso?.table?.body[0][0] as { text: string };
    expect(celula.text).toContain('nenhum bimestre encerrado');
  });
});

describe('montarTabelaSimples', () => {
  it('cria cabeçalho tipado e mantém as linhas', () => {
    const tabela = montarTabelaSimples(['Matéria', 'Nota'], [
      [{ text: 'Matemática' }, { text: '8,5' }],
    ]);
    expect(tabela.table.headerRows).toBe(1);
    const cabecalho = tabela.table.body[0] as unknown as Array<{
      text: string;
      style: string;
    }>;
    expect(cabecalho[0].text).toBe('Matéria');
    expect(cabecalho[0].style).toBe('cabecalhoTabela');
    expect(tabela.table.body).toHaveLength(2);
  });
});

describe('construirGraficoBarras', () => {
  it('retorna null quando não há valores', () => {
    expect(construirGraficoBarras(['B1'], [{ rotulo: 'A', cor: '#000', valores: [null] }])).toBeNull();
    expect(construirGraficoBarras([], [{ rotulo: 'A', cor: '#000', valores: [] }])).toBeNull();
    expect(construirGraficoBarras(['B1'], [])).toBeNull();
  });

  it('desenha uma barra por valor não nulo, com altura proporcional', () => {
    const grafico = construirGraficoBarras(
      ['B1', 'B2'],
      [{ rotulo: 'Aluno', cor: '#4F46E5', valores: [8, 4] }],
    );
    const barras = grafico!.canvas!.filter(
      (item) =>
        item.type === 'rect' &&
        item.h !== undefined &&
        item.h > 0 &&
        (item.w ?? 0) > 12, // exclui o retângulo da legenda (10x10)
    );
    expect(barras).toHaveLength(2);

    // h(v) = (v/topo)*alturaPlot, com topo = 10 → h(8) = 2*h(4)
    const [barraAlta, barraBaixa] = barras;
    expect(barraBaixa.h! * 2).toBeCloseTo(barraAlta.h!, 5);
    expect(barraBaixa.color).toBe('#4F46E5');
  });

  it('ignora valores nulos e agrupa barras por categoria', () => {
    const grafico = construirGraficoBarras(
      ['B1', 'B2', 'B3'],
      [
        { rotulo: 'Alfa', cor: '#4F46E5', valores: [6, null, 5] },
        { rotulo: 'Beta', cor: '#F59E0B', valores: [2, 3, null] },
      ],
    );
    const barras = grafico!.canvas!.filter(
      (item) =>
        item.type === 'rect' &&
        item.h !== undefined &&
        item.h > 0 &&
        (item.w ?? 0) > 12, // exclui o retângulo da legenda (10x10)
    );
    expect(barras).toHaveLength(4);

    const itens = grafico!.canvas! as ItemCanvas[];
    const rotulosX = itens.filter(
      (item) => item.type === 'text' && item.text === 'B1',
    );
    expect(rotulosX).toHaveLength(1);

    // as duas barras da categoria B1 ficam no mesmo slot (mesmo x delimitador não testado,
    // mas o intervalo de x das barras deve estar dentro da área)
    const D = DIMENSOES_GRAFICO;
    barras.forEach((barra) => {
      expect(barra.x!).toBeGreaterThanOrEqual(D.margemEsquerda);
      expect(barra.x! + barra.w!).toBeLessThanOrEqual(D.largura);
    });
  });

  it('desenha linhas de grade e marca a linha base (eixo x)', () => {
    const grafico = construirGraficoBarras(
      ['B1'],
      [{ rotulo: 'Alfa', cor: '#4F46E5', valores: [4] }],
    );
    const linhas = grafico!.canvas!.filter((item) => item.type === 'line');
    // topo=10, passo=2 → grades em 0..10 = 6 linhas
    expect(linhas).toHaveLength(6);
    const base = linhas.find((linha) => linha.lineWidth === 0.6);
    expect(base).toBeDefined();
    expect(base!.y1).toBe(base!.y2);
  });
});