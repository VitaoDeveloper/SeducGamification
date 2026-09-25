import { describe, expect, it } from 'vitest';
import { TipoEscala } from '../../generated/prisma/enums.js';
import {
  ModeloAvaliacaoParaCalculo,
  SinteseCalculoService,
} from './sintese-calculo.service.js';

const modeloNumerico: ModeloAvaliacaoParaCalculo = {
  tipoEscala: TipoEscala.NUMERICA,
};

const modeloEtec: ModeloAvaliacaoParaCalculo = {
  tipoEscala: TipoEscala.CPS_ETEC,
  nivelEscalas: [
    { rotulo: 'I', valorNumerico: 3 },
    { rotulo: 'R', valorNumerico: 5 },
    { rotulo: 'B', valorNumerico: 8 },
    { rotulo: 'MB', valorNumerico: 10 },
  ],
};

describe('SinteseCalculoService', () => {
  const servico = new SinteseCalculoService();

  describe('converterValorParaNumero', () => {
    it('modelo numérico converte o valor direto', () => {
      expect(servico.converterValorParaNumero(modeloNumerico, '8.5')).toBe(8.5);
      expect(servico.converterValorParaNumero(modeloNumerico, '10')).toBe(10);
    });

    it('modelo CPS ETEC converte o conceito pelo valorNumerico', () => {
      expect(servico.converterValorParaNumero(modeloEtec, 'I')).toBe(3);
      expect(servico.converterValorParaNumero(modeloEtec, 'R')).toBe(5);
      expect(servico.converterValorParaNumero(modeloEtec, 'B')).toBe(8);
      expect(servico.converterValorParaNumero(modeloEtec, 'MB')).toBe(10);
    });
  });

  describe('calcularSinteseAlunoPorMateria', () => {
    it('pesos 50/20/30 com notas 8/10/6 produz 7.8 (doc 9)', () => {
      const sintese = servico.calcularSinteseAlunoPorMateria(
        [
          { valorNoModelo: '8', pesoPercentual: 50 },
          { valorNoModelo: '10', pesoPercentual: 20 },
          { valorNoModelo: '6', pesoPercentual: 30 },
        ],
        modeloNumerico,
      );
      expect(sintese).toBe(7.8);
    });

    it('mesmas pesos em CPS ETEC com B/MB/R produz 7.5 (doc 9)', () => {
      const sintese = servico.calcularSinteseAlunoPorMateria(
        [
          { valorNoModelo: 'B', pesoPercentual: 50 },
          { valorNoModelo: 'MB', pesoPercentual: 20 },
          { valorNoModelo: 'R', pesoPercentual: 30 },
        ],
        modeloEtec,
      );
      expect(sintese).toBe(7.5);
    });

    it('componente sem lançamento entra como nota 0', () => {
      const sintese = servico.calcularSinteseAlunoPorMateria(
        [
          { valorNoModelo: '8', pesoPercentual: 50 },
          { pesoPercentual: 20 },
          { valorNoModelo: '6', pesoPercentual: 30 },
        ],
        modeloNumerico,
      );
      expect(sintese).toBe(5.8);
    });
  });

  describe('calcularSinteseBimestralAluno', () => {
    it('média das matérias 7.8 e 8.6 produz 8.2 (doc 9)', () => {
      expect(servico.calcularSinteseBimestralAluno([7.8, 8.6])).toBe(8.2);
    });

    it('lista vazia produz 0', () => {
      expect(servico.calcularSinteseBimestralAluno([])).toBe(0);
    });
  });

  describe('calcularSinteseBimestralGrupo', () => {
    it('integrantes 8.2/7.5/9.1 produz 8.27 (dízima arredondada)', () => {
      expect(servico.calcularSinteseBimestralGrupo([8.2, 7.5, 9.1])).toBe(8.27);
    });

    it('lista vazia produz 0', () => {
      expect(servico.calcularSinteseBimestralGrupo([])).toBe(0);
    });
  });

  describe('calcularPontuacaoFinalAluno', () => {
    it('média simples das 4 sínteses', () => {
      expect(servico.calcularPontuacaoFinalAluno([7.8, 8.6, 9.0, 8.4])).toBe(
        8.45,
      );
    });

    it('lista vazia produz 0', () => {
      expect(servico.calcularPontuacaoFinalAluno([])).toBe(0);
    });
  });

  describe('calcularPontuacaoFinalGrupo', () => {
    it('soma das 4 sínteses 8.27/7.60/8.40/7.90 produz 32.17 (doc 9)', () => {
      expect(servico.calcularPontuacaoFinalGrupo([8.27, 7.6, 8.4, 7.9])).toBe(
        32.17,
      );
    });
  });

  describe('detectarEmpates', () => {
    it('grupos com o mesmo valor viram um empate, do maior para o menor', () => {
      const empates = servico.detectarEmpates([
        { grupoId: 'alfa', valor: 7 },
        { grupoId: 'beta', valor: 7 },
        { grupoId: 'gama', valor: 8.2 },
        { grupoId: 'delta', valor: 7 },
      ]);

      expect(empates).toEqual([
        {
          valor: 7,
          grupos: [
            { grupoId: 'alfa', valor: 7 },
            { grupoId: 'beta', valor: 7 },
            { grupoId: 'delta', valor: 7 },
          ],
        },
      ]);
    });

    it('compara o valor já arredondado, então 7 e 7.001 empatam', () => {
      const empates = servico.detectarEmpates([
        { grupoId: 'alfa', valor: 7 },
        { grupoId: 'beta', valor: 7.001 },
      ]);

      expect(empates).toHaveLength(1);
      expect(empates[0].valor).toBe(7);
    });

    it('sem repetição de valor não há empate', () => {
      expect(
        servico.detectarEmpates([
          { grupoId: 'alfa', valor: 7 },
          { grupoId: 'beta', valor: 7.5 },
        ]),
      ).toEqual([]);
    });

    it('lista vazia ou com menos de dois grupos não gera empate', () => {
      expect(servico.detectarEmpates([])).toEqual([]);
      expect(servico.detectarEmpates([{ grupoId: 'alfa', valor: 7 }])).toEqual(
        [],
      );
    });
  });
});
