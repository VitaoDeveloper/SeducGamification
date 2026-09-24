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
    const nivel = modelo.nivelEscalas?.find(
      (n) => n.rotulo === valorNoModelo,
    );
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
}