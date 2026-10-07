# Etapa 07 (API) — Excluir um lançamento específico

**Módulo:** `src/modules/lancamentos/`
**Reaproveitar:** `exigirProfessor`, a checagem de posse já privada em `LancamentosService.carregarComponenteDoProfessor` e `exigirBimestreAberto`.

## Contexto

`LancamentosService.lancar` já faz `upsert` — ou seja, "editar" uma nota já é possível (relançar sobrescreve). O que falta é **apagar** um lançamento, que é semanticamente diferente de lançar o valor mínimo da escala: hoje, para "desfazer" uma nota lançada por engano para o aluno errado, não existe opção — e lançar "1" (modelo numérico) ou o rótulo mais baixo (conceitual) não é a mesma coisa que "sem nota" (que vale 0 no cálculo, conforme RN14 do doc 01).

## Endpoint novo

### `DELETE /componentes-pontuacao/:id/lancamentos/:alunoId`

- Permitido **só se o bimestre estiver `ABERTO`** (mesma regra de `lancar`).
- Remove o registro de `Lancamento` daquele aluno naquele componente — o aluno volta ao estado "sem nota lançada" (0 no cálculo, mas sem um registro explícito).

## Tarefas

1. `LancamentosService.excluir(user, componentePontuacaoId, alunoId)`: reaproveitar `carregarComponenteDoProfessor` e `exigirBimestreAberto` (os dois métodos privados já existentes), depois `prisma.lancamento.delete({ where: { componentePontuacaoId_alunoId: { componentePontuacaoId, alunoId } } })` — tratar `P2025` (registro não encontrado) convertendo para `NotFoundException` com mensagem clara ("Este aluno não tem nota lançada neste componente.").
2. Controller: `@Delete(':id/lancamentos/:alunoId')` em `LancamentosController` (ou o nome que o controller tiver hoje).

## Testes (Vitest)

- Excluir um lançamento existente funciona; uma nova listagem (`GET .../lancamentos`) não traz mais esse aluno.
- Excluir um lançamento inexistente retorna 404 com mensagem clara.
- Excluir num bimestre encerrado é bloqueado.

## Critérios de aceite

- Testes acima passam.

## Fora de escopo

Histórico/auditoria de quem apagou o quê (fora do alpha).
