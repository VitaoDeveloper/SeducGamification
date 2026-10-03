import type { Prisma } from '../../generated/prisma/client.js';
import type { TipoEscala } from '../../generated/prisma/enums.js';

/**
 * A escola com o modelo de avaliação, como as rotas a devolvem.
 *
 * O modelo é o que decide o formato do lançamento de nota — escala numérica de 1 a
 * 10 ou os rótulos conceituais do CPS da ETEC — e quem preenche o campo precisa
 * dele para mostrar o campo certo e recusar valor fora da escala antes de enviar.
 * Sem ele na resposta, o cliente só pode chutar um modelo, e o chute erra a turma
 * inteira: o `LancamentosService` valida contra o modelo do banco, então uma
 * escola numérica receberia um seletor de conceitos, o professor digitaria "R" e a
 * gravação seria recusada com 400. É o mesmo modelo que o `encerrarBimestre` lê
 * para converter o rótulo em número — a mesma fonte, agora visível para o cliente.
 *
 * As duas peças moram aqui porque três services as usam
 * (`SalasService.criar`, `SalasService.listarDoProfessor` e
 * `EscolasService.listarDoProfessor`) e três `select` escritos à mão divergiriam
 * entre si — que é justamente a classe de bug que a rota fechada elimina.
 *
 * Os níveis viajam porque a conversão do rótulo em número é a do banco: um "MB" que
 * a tela não soubesse converter viraria uma nota que a conta não fecharia.
 */

/**
 * Os campos da escola que as rotas de sala e de escola mandam, com o modelo.
 *
 * É um `select` da escola (e não o `select` da escola já embrulhado), porque é
 * usado nos dois lugares onde a escola aparece: dentro do `include` de uma sala e
 * dentro do `select` de um vínculo. Os dois esperam a mesma forma, e um `select`
 * escrito duas vezes é um `select` que diverge.
 */
export const ESCOLA_COM_MODELO_DE_AVALIACAO = {
  id: true,
  nome: true,
  modeloAvaliacao: {
    select: {
      tipoEscala: true,
      nivelEscalas: {
        select: { rotulo: true, valorNumerico: true },
      },
    },
  },
} satisfies Prisma.EscolaSelect;

/** Nível da escala como o banco devolve, com `valorNumerico` em `Decimal`. */
interface NivelDoBanco {
  rotulo: string
  valorNumerico: Prisma.Decimal | number | string
}

/** A escola no formato do `select` acima, antes de virar resposta da rota. */
interface EscolaDoBanco {
  id: string
  nome: string
  modeloAvaliacao: {
    tipoEscala: TipoEscala
    nivelEscalas: NivelDoBanco[]
  }
}

/** Nível da escala como a interface recebe: rótulo e o número que ele vale. */
export interface NivelDaEscala {
  rotulo: string
  valorNumerico: number
}

export interface EscolaComModeloDeAvaliacao {
  id: string
  nome: string
  modeloAvaliacao: {
    tipoEscala: TipoEscala
    nivelEscalas: NivelDaEscala[]
  }
}

/**
 * Normaliza a escola do banco para a resposta da rota.
 *
 * Só o `Decimal` muda de forma: o `valorNumerico` vai para a tela como número, e
 * não como a string em que o `JSON.stringify` do `Decimal` transformaria. Sem a
 * conversão, a conta da prévia (que é feita no navegador, Etapa 06) receberia
 * `"8"` onde espera `8` — e a conversão fica num lugar só, em vez de repetida em
 * cada tela que lê o modelo.
 */
export function comModeloDeAvaliacao(
  escola: EscolaDoBanco,
): EscolaComModeloDeAvaliacao {
  return {
    id: escola.id,
    nome: escola.nome,
    modeloAvaliacao: {
      tipoEscala: escola.modeloAvaliacao.tipoEscala,
      nivelEscalas: escola.modeloAvaliacao.nivelEscalas.map((nivel) => ({
        rotulo: nivel.rotulo,
        valorNumerico: Number(nivel.valorNumerico),
      })),
    },
  }
}