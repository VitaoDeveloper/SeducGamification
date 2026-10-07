# Etapa 05 (API) — Editar e excluir grupo

**Módulo:** `src/modules/grupos/`
**Reaproveitar:** `exigirProfessor`, `carregarGrupoDoProfessor`.

## Contexto

`GruposService` já tem `criarGrupo`, `adicionarMembro`, `removerMembro` e `listarGruposComMembros` — a remoção de membro individual já existe (é o único caso de edição/exclusão já implementado em todo o sistema). Falta: renomear o grupo e excluir o grupo inteiro.

## Endpoints novos

### `PATCH /grupos/:id`

- DTO: `nome: string`.
- Sempre permitido, para o professor dono da competição do grupo.

### `DELETE /grupos/:id`

- Permitido **só se o grupo não tiver nenhum `MembroGrupo`, em nenhum bimestre** (passado ou presente) — um grupo "vazio". Se tiver, `409 Conflict` orientando a remover os membros primeiro (via `DELETE /grupos/:id/membros/:alunoId`, que já existe) — **mas atenção:** como a remoção de membro já é bloqueada em bimestre encerrado (regra já existente em `GruposService.carregarBimestreDaCompeticao`), um grupo com membros só de bimestres **encerrados** nunca poderá ser esvaziado por ali; nesse caso, documentar explicitamente que o grupo também não pode ser excluído (é histórico gravado, mesma régua usada em todo o resto do sistema).

## Tarefas

1. DTO `AtualizarGrupoDto` (`nome`).
2. `GruposService.atualizarGrupo(user, grupoId, dto)`: `carregarGrupoDoProfessor`, `prisma.grupoCompetidor.update`.
3. `GruposService.excluirGrupo(user, grupoId)`: `carregarGrupoDoProfessor`, `prisma.membroGrupo.count({ where: { grupoId } })`; bloquear se > 0; senão `prisma.grupoCompetidor.delete` (cascata segura, pois sabemos que não há membro; também não deveria haver `Desempate` apontando para um grupo sem membro, mas não custa documentar essa suposição no código).
4. Controller: `@Patch(':id')` e `@Delete(':id')` em `GruposController`.

## Testes (Vitest)

- Renomear grupo funciona.
- Excluir grupo sem nenhum membro em nenhum bimestre funciona.
- Excluir grupo com membro no bimestre atual é bloqueado (orientando a remover o membro antes).
- Excluir grupo cujo único histórico é de um bimestre já encerrado é bloqueado, mesmo sem membro no bimestre aberto atual.

## Critérios de aceite

- Testes acima passam.
- Um grupo criado por engano, sem nenhum aluno adicionado, pode ser removido sem passar pelo banco.

## Fora de escopo

Excluir um grupo "forçando" a saída de todos os membros automaticamente (o professor precisa fazer isso explicitamente, aluno por aluno, pelo endpoint que já existe).
