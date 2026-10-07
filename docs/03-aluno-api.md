# Etapa 03 (API) — Editar e excluir aluno

**Módulo:** `src/modules/alunos/`
**Reaproveitar:** `exigirProfessor`, `carregarSalaComVinculoEscolar`.

## Contexto

`AlunosService` só tem `criar` e `listarDaSala`. Um erro de digitação no nome, ou um aluno cadastrado por engano, hoje não tem conserto pela interface.

## Endpoints novos

### `PATCH /alunos/:id`

- DTO: `nome: string`.
- Sempre permitido (não mexe no `codigoMatricula` nem na senha), para o professor vinculado à escola da sala em que o aluno está matriculado.

### `DELETE /alunos/:id`

- Permitido **só se o aluno não tiver nenhum `Lancamento` nem nenhum `MembroGrupo`** registrado (ou seja, foi cadastrado mas nunca participou de nada em uma competição) — essa é a definição de "desfazer um cadastro por engano", não de "excluir um aluno ativo". Se houver qualquer um dos dois, `409 Conflict` explicando que o aluno já tem participação registrada.
- Quando permitido, apaga o aluno e sua(s) `Matricula`(s) (cascata, mas já sabemos que não há mais nada pendurado nele).

## Tarefas

1. DTO `AtualizarAlunoDto` (`nome`).
2. `AlunosService.atualizar(user, alunoId, dto)`: carregar o aluno, confirmar que o professor tem vínculo com a escola de **alguma** sala em que o aluno está matriculado (`prisma.matricula.findFirst({ where: { alunoId }, select: { salaId: true } })`, depois `carregarSalaComVinculoEscolar`), atualizar.
3. `AlunosService.excluir(user, alunoId)`: mesma checagem de acesso, mais `prisma.lancamento.count({ where: { alunoId } })` e `prisma.membroGrupo.count({ where: { alunoId } })`; bloquear se algum > 0; senão `prisma.aluno.delete`.
4. Controller: `@Patch(':id')` e `@Delete(':id')` em `AlunosController` (hoje provavelmente só tem as rotas aninhadas em `/salas/:salaId/alunos` — estas duas novas ficam na raiz `/alunos/:id`, já que edição/exclusão não dependem de saber a sala de antemão).

## Testes (Vitest)

- Editar nome de um aluno da sala do professor funciona.
- Editar aluno de uma sala cuja escola o professor não está vinculado é bloqueado.
- Excluir um aluno recém-criado, sem lançamentos nem grupo, funciona.
- Excluir um aluno com pelo menos um lançamento é bloqueado.
- Excluir um aluno que é (ou já foi) membro de algum grupo é bloqueado, mesmo sem lançamento.

## Critérios de aceite

- Testes acima passam.
- O caso de uso real — corrigir o nome de um aluno digitado errado, ou remover um cadastro duplicado feito por engano antes de qualquer lançamento — fica resolvido.

## Fora de escopo

Transferência de aluno entre salas; exclusão de aluno com histórico (isso precisaria de uma decisão de produto sobre o que fazer com sínteses já calculadas — tratar como pedido futuro).
