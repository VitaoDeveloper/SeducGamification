import { Injectable } from '@nestjs/common';
import { TipoEscala } from '../../generated/prisma/enums.js';

export interface ModeloAvaliacaoParaCalculo {
  tipoEscala: TipoEscala;
  nivelEscalas?: ReadonlyArray<{
    rotulo: string;
    valorNumerico: number;
  }>;
}

export interface EntradaSinteseMateria {
  valorNoModelo?: string;
  pesoPercentual: number;
}

export interface SinteseGrupoParaEmpatar {
  grupoId: string;
  valor: number;
}

export interface EmpateDeGrupos {
  valor: number;
  grupos: SinteseGrupoParaEmpatar[];
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

@Injectable()
export class SinteseCalculoService {
  converterValorParaNumero(
    modelo: ModeloAvaliacaoParaCalculo,
    valorNoModelo: string,
  ): number {
    if (modelo.tipoEscala === TipoEscala.NUMERICA) {
      return parseFloat(valorNoModelo);
    }
    const nivel = modelo.nivelEscalas?.find((n) => n.rotulo === valorNoModelo);
    return nivel ? nivel.valorNumerico : 0;
  }

  calcularSinteseAlunoPorMateria(
    entradas: ReadonlyArray<EntradaSinteseMateria>,
    modelo: ModeloAvaliacaoParaCalculo,
  ): number {
    let soma = 0;
    for (const entrada of entradas) {
      const nota =
        entrada.valorNoModelo === undefined
          ? 0
          : this.converterValorParaNumero(modelo, entrada.valorNoModelo);
      soma += (nota * entrada.pesoPercentual) / 100;
    }
    return arredondar(soma);
  }

  calcularSinteseBimestralAluno(
    sintesesPorMateria: ReadonlyArray<number>,
  ): number {
    if (sintesesPorMateria.length === 0) {
      return 0;
    }
    const soma = sintesesPorMateria.reduce((total, valor) => total + valor, 0);
    return arredondar(soma / sintesesPorMateria.length);
  }

  calcularSinteseBimestralGrupo(
    sintesesBimestrais: ReadonlyArray<number>,
  ): number {
    if (sintesesBimestrais.length === 0) {
      return 0;
    }
    const soma = sintesesBimestrais.reduce((total, valor) => total + valor, 0);
    return arredondar(soma / sintesesBimestrais.length);
  }

  calcularPontuacaoFinalAluno(
    sintesesBimestrais: ReadonlyArray<number>,
  ): number {
    if (sintesesBimestrais.length === 0) {
      return 0;
    }
    const soma = sintesesBimestrais.reduce((total, valor) => total + valor, 0);
    return arredondar(soma / sintesesBimestrais.length);
  }

  calcularPontuacaoFinalGrupo(
    sintesesBimestrais: ReadonlyArray<number>,
  ): number {
    const soma = sintesesBimestrais.reduce((total, valor) => total + valor, 0);
    return arredondar(soma);
  }

  /**
   * Detecta grupos empatados num ranking parcial, comparando o valor já
   * gravado (RN23). A resolução do empate em si é da etapa de desempate.
   */
  detectarEmpates(
    sinteses: ReadonlyArray<SinteseGrupoParaEmpatar>,
  ): EmpateDeGrupos[] {
    const porValor = new Map<string, SinteseGrupoParaEmpatar[]>();
    for (const sintese of sinteses) {
      const chave = arredondar(sintese.valor).toFixed(2);
      const doValor = porValor.get(chave);
      if (doValor) {
        doValor.push(sintese);
      } else {
        porValor.set(chave, [sintese]);
      }
    }

    return [...porValor.values()]
      .filter((grupos) => grupos.length > 1)
      .map((grupos) => ({
        valor: arredondar(grupos[0].valor),
        grupos: [...grupos].sort((a, b) => a.grupoId.localeCompare(b.grupoId)),
      }))
      .sort((a, b) => b.valor - a.valor);
  }
}
