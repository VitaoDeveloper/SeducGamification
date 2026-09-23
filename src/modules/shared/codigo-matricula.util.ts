export type TipoCodigoMatricula = 'professor' | 'aluno';

const TABELA_POR_TIPO: Record<TipoCodigoMatricula, string> = {
  professor: 'professores',
  aluno: 'alunos',
};

const LIMITE_SEQUENCIAL_POR_ANO = 999;

export interface BancoCodigoMatricula {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export function parseCodigoMatricula(
  codigo: string,
): { ano: number; sequencial: number } | null {
  const match = /^(\d{2})(\d{3})$/.exec(codigo);
  if (!match) return null;
  return { ano: Number(match[1]), sequencial: Number(match[2]) };
}

export function proximoCodigoMatricula(
  ano: number,
  ultimoCodigoDoAno: string | null,
): string {
  const anoDoisDigitos = ano % 100;
  let sequencial = 1;
  const ultimo = ultimoCodigoDoAno
    ? parseCodigoMatricula(ultimoCodigoDoAno)
    : null;
  if (ultimo && ultimo.ano === anoDoisDigitos) {
    sequencial = ultimo.sequencial + 1;
  }
  if (sequencial > LIMITE_SEQUENCIAL_POR_ANO) {
    throw new Error(
      `Limite de ${LIMITE_SEQUENCIAL_POR_ANO} códigos de matrícula atingido no ano ${anoDoisDigitos}.`,
    );
  }
  return `${String(anoDoisDigitos).padStart(2, '0')}${String(sequencial).padStart(3, '0')}`;
}

/**
 * Aloca o próximo código de matrícula no padrão AANO + 3 dígitos (ex.: 26001).
 *
 * Segurança contra colisão em cadastros concorrentes: a leitura do maior código
 * e o INSERT do registro devem ocorrer DENTRO da mesma transação, pois a função
 * toma um advisory lock TRANSACIONAL do Postgres (pg_advisory_xact_lock), que só
 * é liberado no commit/rollback. Assim, enquanto a transação A ainda não gravou,
 * a transação B fica bloqueada no lock e relê o estado atualizado.
 */
export async function gerarCodigoMatricula(
  banco: BancoCodigoMatricula,
  ano: number,
  tipo: TipoCodigoMatricula,
): Promise<string> {
  const tabela = TABELA_POR_TIPO[tipo];
  const anoDoisDigitos = String(ano % 100).padStart(2, '0');
  const lockKey = `codigo_matricula:${tabela}:${anoDoisDigitos}`;

  await banco.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
    lockKey,
  );

  const registros = await banco.$queryRawUnsafe<Array<{ codigo_matricula: string }>>(
    `SELECT codigo_matricula FROM "${tabela}" WHERE codigo_matricula LIKE $1 ORDER BY codigo_matricula DESC LIMIT 1`,
    `${anoDoisDigitos}%`,
  );

  return proximoCodigoMatricula(ano, registros[0]?.codigo_matricula ?? null);
}