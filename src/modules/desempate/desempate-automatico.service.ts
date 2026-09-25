import { Injectable } from '@nestjs/common';

export interface GrupoEmpatadoParaOrdenar {
  grupoId: string;
  nome: string;
  valor: number;
}

export interface MateriaComPeso {
  id: string;
  nome: string;
  /** Soma dos pesos dos componentes de pontuação da matéria no período. */
  peso: number;
}

export interface EntradaDesempateAutomatico {
  /** Grupos empatados, na ordem original (nome asc) do ranking. */
  grupos: ReadonlyArray<GrupoEmpatadoParaOrdenar>;
  /** Matérias do lecionamento com a soma de pesos no período avaliado. */
  materias: ReadonlyArray<MateriaComPeso>;
  /**
   * Grupo -> matéria -> média dos integrantes no componente, no período
   * avaliado (parcial: um bimestre; anual: todos os bimestres encerrados).
   */
  mediasPorGrupoPorMateria: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

export interface ResultadoDesempateAutomatico {
  ordem: GrupoEmpatadoParaOrdenar[];
  /**
   * Falso quando o empate persiste mesmo depois de comparar todas as matérias
   * (condição residual): a ordem original é preservada e nenhum desempate é
   * gravado.
   */
  desempatado: boolean;
}

@Injectable()
export class DesempateAutomaticoService {
  /**
   * Ordena os grupos empatados comparando matéria por matéria, da de maior
   * peso somado para a de menor (descartes d'empate da RN23). O grupo com a
   * maior média dos integrantes num componente vence a posição; em caso de
   * igualdade, parte-se para o próximo componente. A ordenação é estável: se
   * persistir o empate após esgotar todas as matérias (empate real), a ordem
   * original é mantida e `desempatado` vem falso.
   */
  ordenar(
    entrada: EntradaDesempateAutomatico,
  ): ResultadoDesempateAutomatico {
    const materiasOrdenadas = [...entrada.materias]
      .filter((materia) => materia.peso > 0)
      .sort(
        (a, b) =>
          b.peso - a.peso || a.nome.localeCompare(b.nome),
      );

    const comparar = (
      a: GrupoEmpatadoParaOrdenar,
      b: GrupoEmpatadoParaOrdenar,
    ): number => {
      for (const materia of materiasOrdenadas) {
        const mediaA =
          entrada.mediasPorGrupoPorMateria.get(a.grupoId)?.get(materia.id) ?? 0;
        const mediaB =
          entrada.mediasPorGrupoPorMateria.get(b.grupoId)?.get(materia.id) ?? 0;
        if (mediaA !== mediaB) {
          return mediaB - mediaA;
        }
      }
      return 0;
    };

    const ordem = [...entrada.grupos].sort(comparar);

    let desempatado = false;
    for (let indice = 1; indice < ordem.length; indice++) {
      if (comparar(ordem[indice - 1], ordem[indice]) !== 0) {
        desempatado = true;
        break;
      }
    }

    return { ordem, desempatado };
  }
}