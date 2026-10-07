# Etapa 06 (API) — Editar e excluir componente de pontuação

**Módulo:** `src/modules/componentes-pontuacao/`
**Reaproveitar:** `exigirProfessor`, `carregarBimestreDoProfessor`, `carregarMateriasComPesos`, `CEM_PORCENTO` (`shared/pesos-bimestre.util.ts`).

## Contexto

`ComponentesPontuacaoService` só tem `criar`, `listar` e `validar`. Corrigir o peso de um componente (ex.: digitou 50 em vez de 30) ou removê-lo hoje não é possível pela API.

## Endpoints novos

### `PATCH /componentes-pontuacao/:id`

- DTO: `nome?`, `pesoPercentual?`.
- Permitido **só se o bimestre do componente estiver `ABERTO`** (mesma regra de `criar`).
- Ao mudar o peso, revalidar a soma da matéria **excluindo o peso antigo deste componente e somando o novo** (não basta checar "soma atual + novo peso", como em `criar` — aqui é "soma atual − peso antigo + peso novo"), contra `CEM_PORCENTO`. Reaproveitar/estender a lógica já existente em `criar`, mas cuidado para não contar o próprio componente duas vezes.

### `DELETE /componentes-pontuacao/:id`

- Permitido **só se o bimestre estiver `ABERTO`**. A exclusão apaga em cascata os `Lancamento` já feitos nesse componente — isso é aceitável porque o bimestre ainda está aberto (nada foi oficializado em síntese), mas a confirmação no front (Etapa 06 GUI) precisa deixar isso bem claro, já que pode apagar notas já lançadas para vários alunos.

## Tarefas

1. DTO `AtualizarComponentePontuacaoDto` (`nome?`, `pesoPercentual?`, mesmos validadores de `CriarComponentePontuacaoDto`, opcionais).
2. `ComponentesPontuacaoService.atualizar(user, componentePontuacaoId, dto)`: carregar o componente com seu bimestre (reaproveitar/estender o include já usado em `criar`/`listar`), `carregarBimestreDoProfessor` para checar posse e `situacao === ABERTO`; se `pesoPercentual` mudou, recalcular a soma da matéria desconsiderando o peso antigo; `prisma.componentePontuacao.update`.
3. `ComponentesPontuacaoService.excluir(user, componentePontuacaoId)`: mesma checagem de posse e bimestre aberto; `prisma.componentePontuacao.delete`.
4. Controller: `@Patch(':id')` e `@Delete(':id')` em `ComponentesPontuacaoController`.

## Testes (Vitest)

- Editar nome sem mexer no peso funciona.
- Editar peso para um valor que mantém a soma da matéria em 100% ou menos funciona.
- Editar peso para um valor que faria a soma ultrapassar 100% é bloqueado (conferir que o cálculo desconta o peso antigo corretamente — esse é o caso mais fácil de errar na implementação, então o teste precisa cobrir especificamente "editar o peso do próprio componente que já estava contribuindo para os 100%").
- Editar/excluir num bimestre encerrado é bloqueado.
- Excluir um componente com lançamentos já feitos, em bimestre ainda aberto, funciona e remove os lançamentos (cascata) — confirmar explicitamente nesse teste que os `Lancamento` somem.

## Critérios de aceite

- Testes acima passam, com atenção especial ao recálculo de soma na edição de peso.

## Fora de escopo

Editar/excluir componente de pontuação de um bimestre já encerrado (mesma régua de congelamento do resto do sistema).
