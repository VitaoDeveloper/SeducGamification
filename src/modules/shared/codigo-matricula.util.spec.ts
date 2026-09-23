import { describe, expect, it } from 'vitest';
import {
  gerarCodigoMatricula,
  parseCodigoMatricula,
  proximoCodigoMatricula,
  type BancoCodigoMatricula,
} from './codigo-matricula.util.js';

function criarBancoFake(estadoInicial: string[] = []) {
  const estado = [...estadoInicial];
  const fila: Array<() => void> = [];
  let travado = false;

  const adquirir = async () => {
    while (travado) {
      await new Promise<void>((resolve) => fila.push(resolve));
    }
    travado = true;
  };

  return {
    estado,
    inserir(codigo: string) {
      estado.push(codigo);
    },
    liberar() {
      travado = false;
      fila.shift()?.();
    },
    async $executeRawUnsafe(): Promise<number> {
      await adquirir();
      return 1;
    },
    async $queryRawUnsafe<T>(
      _query: string,
      prefixo: string,
    ): Promise<T> {
      if (!travado) {
        throw new Error('query executada fora da transação/lock');
      }
      const prefixoLimpo = prefixo.replace(/%$/, '');
      const ultimo = estado
        .filter((c) => c.startsWith(prefixoLimpo))
        .sort()
        .at(-1);
      const rows = ultimo ? [{ codigo_matricula: ultimo }] : [];
      return rows as T;
    },
  };
}

describe('parseCodigoMatricula', () => {
  it('retorna ano e sequencial para código válido', () => {
    expect(parseCodigoMatricula('26001')).toEqual({ ano: 26, sequencial: 1 });
    expect(parseCodigoMatricula('26999')).toEqual({ ano: 26, sequencial: 999 });
  });

  it('retorna null para formatos inválidos', () => {
    expect(parseCodigoMatricula('123')).toBeNull();
    expect(parseCodigoMatricula('1234')).toBeNull();
    expect(parseCodigoMatricula('ABCDE')).toBeNull();
    expect(parseCodigoMatricula('2601')).toBeNull();
  });
});

describe('proximoCodigoMatricula', () => {
  it('gera o primeiro código do ano quando não há registros', () => {
    expect(proximoCodigoMatricula(2026, null)).toBe('26001');
  });

  it('incrementa na sequência normal', () => {
    expect(proximoCodigoMatricula(2026, '26042')).toBe('26043');
  });

  it('recomeça do 001 quando o último código é de outro ano', () => {
    expect(proximoCodigoMatricula(2026, '25099')).toBe('26001');
  });

  it('lança erro ao atingir o limite de 999 códigos no ano', () => {
    expect(() => proximoCodigoMatricula(2026, '26999')).toThrow(/Limite de 999/);
  });
});

describe('gerarCodigoMatricula', () => {
  it('aloca 26001 em uma tabela vazia e usa o prefixo do ano', async () => {
    const banco = criarBancoFake();
    const codigo = await gerarCodigoMatricula(banco, 2026, 'professor');
    expect(codigo).toBe('26001');
  });

  it('incrementa a partir do maior código existente do ano', async () => {
    const banco = criarBancoFake(['26042']);
    const codigo = await gerarCodigoMatricula(banco, 2026, 'aluno');
    expect(codigo).toBe('26043');
  });

  it('evita colisão em dois cadastros concorrentes na mesma transação', async () => {
    const banco = criarBancoFake();
    const transacao = async () => {
      const codigo = await gerarCodigoMatricula(banco, 2026, 'professor');
      banco.inserir(codigo);
      banco.liberar();
      return codigo;
    };

    const [a, b] = await Promise.all([transacao(), transacao()]);

    expect(a).toBe('26001');
    expect(b).toBe('26002');
    expect(new Set([a, b]).size).toBe(2);
  });
});

describe('BancoCodigoMatricula', () => {
  it('o fake atende à interface esperada', () => {
    const banco = criarBancoFake();
    const valido: BancoCodigoMatricula = banco;
    expect(valido).toBeDefined();
  });
});