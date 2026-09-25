import { describe, expect, it } from 'vitest';
import {
  DesempateAutomaticoService,
  EntradaDesempateAutomatico,
} from './desempate-automatico.service.js';

const servico = new DesempateAutomaticoService();

function medias(
  dados: ReadonlyArray<{ grupoId: string; porMateria: Array<[string, number]> }>,
): Map<string, Map<string, number>> {
  const mapa = new Map<string, Map<string, number>>();
  for (const grupo of dados) {
    mapa.set(grupo.grupoId, new Map(grupo.porMateria));
  }
  return mapa;
}

describe('DesempateAutomaticoService', () => {
  describe('ordenar', () => {
    it('o grupo com maior média na matéria de maior peso fica na frente', () => {
      const entrada: EntradaDesempateAutomatico = {
        grupos: [
          { grupoId: 'beta', nome: 'Beta', valor: 8 },
          { grupoId: 'alfa', nome: 'Alfa', valor: 8 },
        ],
        materias: [
          { id: 'mat', nome: 'Matemática', peso: 100 },
          { id: 'por', nome: 'Português', peso: 100 },
        ],
        mediasPorGrupoPorMateria: medias([
          { grupoId: 'alfa', porMateria: [['mat', 9], ['por', 7]] },
          { grupoId: 'beta', porMateria: [['mat', 8], ['por', 8]] },
        ]),
      };

      const { ordem, desempatado } = servico.ordenar(entrada);

      expect(desempatado).toBe(true);
      expect(ordem.map((grupo) => grupo.grupoId)).toEqual(['alfa', 'beta']);
    });

    it('empate na matéria de maior peso decide na de peso imediatamente menor', () => {
      const entrada: EntradaDesempateAutomatico = {
        grupos: [
          { grupoId: 'alfa', nome: 'Alfa', valor: 8 },
          { grupoId: 'beta', nome: 'Beta', valor: 8 },
        ],
        materias: [
          { id: 'mat', nome: 'Matemática', peso: 90 },
          { id: 'por', nome: 'Português', peso: 80 },
        ],
        mediasPorGrupoPorMateria: medias([
          { grupoId: 'alfa', porMateria: [['mat', 8], ['por', 9]] },
          { grupoId: 'beta', porMateria: [['mat', 8], ['por', 7]] },
        ]),
      };

      const { ordem, desempatado } = servico.ordenar(entrada);

      expect(desempatado).toBe(true);
      expect(ordem.map((grupo) => grupo.grupoId)).toEqual(['alfa', 'beta']);
    });

    it('as matérias são avaliadas pelo peso, não pela ordem de entrada', () => {
      const entrada: EntradaDesempateAutomatico = {
        grupos: [
          { grupoId: 'alfa', nome: 'Alfa', valor: 8 },
          { grupoId: 'beta', nome: 'Beta', valor: 8 },
        ],
        // Português (menor peso) favorece Beta; Matemática decide por Alfa.
        materias: [
          { id: 'por', nome: 'Português', peso: 50 },
          { id: 'mat', nome: 'Matemática', peso: 100 },
        ],
        mediasPorGrupoPorMateria: medias([
          { grupoId: 'alfa', porMateria: [['mat', 9], ['por', 5]] },
          { grupoId: 'beta', porMateria: [['mat', 8], ['por', 10]] },
        ]),
      };

      const { ordem, desempatado } = servico.ordenar(entrada);

      expect(desempatado).toBe(true);
      expect(ordem.map((grupo) => grupo.grupoId)).toEqual(['alfa', 'beta']);
    });

    it('matérias sem componentes no período (peso zero) são ignoradas', () => {
      const entrada: EntradaDesempateAutomatico = {
        grupos: [
          { grupoId: 'alfa', nome: 'Alfa', valor: 8 },
          { grupoId: 'beta', nome: 'Beta', valor: 8 },
        ],
        materias: [
          { id: 'mat', nome: 'Matemática', peso: 100 },
          { id: 'hist', nome: 'História', peso: 0 },
        ],
        mediasPorGrupoPorMateria: medias([
          { grupoId: 'alfa', porMateria: [['mat', 9], ['hist', 2]] },
          { grupoId: 'beta', porMateria: [['mat', 8], ['hist', 10]] },
        ]),
      };

      const { ordem, desempatado } = servico.ordenar(entrada);

      expect(desempatado).toBe(true);
      expect(ordem.map((grupo) => grupo.grupoId)).toEqual(['alfa', 'beta']);
    });

    it('média ausente é tratada como zero e o grupo perde a posição', () => {
      const entrada: EntradaDesempateAutomatico = {
        grupos: [
          { grupoId: 'alfa', nome: 'Alfa', valor: 8 },
          { grupoId: 'beta', nome: 'Beta', valor: 8 },
        ],
        materias: [{ id: 'mat', nome: 'Matemática', peso: 100 }],
        // Beta não tem integrantes com média na matéria.
        mediasPorGrupoPorMateria: medias([
          { grupoId: 'alfa', porMateria: [['mat', 9]] },
        ]),
      };

      const { ordem, desempatado } = servico.ordenar(entrada);

      expect(desempatado).toBe(true);
      expect(ordem.map((grupo) => grupo.grupoId)).toEqual(['alfa', 'beta']);
    });

    it('empate em todas as matérias preserva a ordem original (empate real)', () => {
      const entrada: EntradaDesempateAutomatico = {
        grupos: [
          { grupoId: 'beta', nome: 'Beta', valor: 8 },
          { grupoId: 'alfa', nome: 'Alfa', valor: 8 },
          { grupoId: 'gama', nome: 'Gama', valor: 8 },
        ],
        materias: [
          { id: 'mat', nome: 'Matemática', peso: 100 },
          { id: 'por', nome: 'Português', peso: 100 },
        ],
        mediasPorGrupoPorMateria: medias([
          { grupoId: 'alfa', porMateria: [['mat', 8], ['por', 8]] },
          { grupoId: 'beta', porMateria: [['mat', 8], ['por', 8]] },
          { grupoId: 'gama', porMateria: [['mat', 8], ['por', 8]] },
        ]),
      };

      const { ordem, desempatado } = servico.ordenar(entrada);

      expect(desempatado).toBe(false);
      expect(ordem.map((grupo) => grupo.grupoId)).toEqual([
        'beta',
        'alfa',
        'gama',
      ]);
    });

    it('três grupos: a primeira matéria decisiva ordena e o restante continua', () => {
      const entrada: EntradaDesempateAutomatico = {
        grupos: [
          { grupoId: 'alfa', nome: 'Alfa', valor: 8 },
          { grupoId: 'beta', nome: 'Beta', valor: 8 },
          { grupoId: 'gama', nome: 'Gama', valor: 8 },
        ],
        materias: [
          { id: 'mat', nome: 'Matemática', peso: 100 },
          { id: 'por', nome: 'Português', peso: 100 },
        ],
        mediasPorGrupoPorMateria: medias([
          { grupoId: 'alfa', porMateria: [['mat', 9], ['por', 6]] },
          { grupoId: 'beta', porMateria: [['mat', 8], ['por', 7]] },
          { grupoId: 'gama', porMateria: [['mat', 8], ['por', 6]] },
        ]),
      };

      const { ordem, desempatado } = servico.ordenar(entrada);

      expect(desempatado).toBe(true);
      expect(ordem.map((grupo) => grupo.grupoId)).toEqual([
        'alfa',
        'beta',
        'gama',
      ]);
    });
  });
});