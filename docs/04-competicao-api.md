# Etapa 04 (API) — Editar e excluir competição (e corrigir datas de bimestre)

**Módulo:** `src/modules/competicoes/` (e `src/modules/bimestres/`, se as datas ficarem lá — ver item 2).
**Reaproveitar:** `exigirProfessor`, `carregarCompeticaoDoProfessor`, `carregarBimestreDoProfessor`.

## Contexto

`CompeticoesService` só tem `criar`, `detalhe` e `listarDoLecionamento`. Um erro no nome da competição, ou nas datas de um bimestre digitadas errado na criação, hoje não tem conserto.

## Endpoints novos

### `PATCH /competicoes/:id`

- DTO: `nome: string`.
- Sempre permitido, para o professor dono (criador) da competição. Só o nome — as datas são tratadas por bimestre, abaixo (uma competição não "move" seus bimestres de uma vez, cada um tem seu próprio ciclo de vida).

### `PATCH /bimestres/:id`

- DTO: `dataInicio?`, `dataFim?`.
- Permitido **só se o bimestre estiver `ABERTO` e não tiver nenhum `ComponentePontuacao` criado ainda** (mudar a data de um bimestre que já tem pontuação definida é arriscado — o professor já pode ter planejado em cima da data errada; mais seguro travar e deixar claro o motivo). Reaplicar a mesma validação de ordem/sobreposição que já existe em `CompeticoesService.validarBimestres` (extrair para um método/util compartilhado, pois agora é usado em dois lugares — criação e edição individual).
- Validar contra os **outros três bimestres já gravados** da mesma competição (não contra um DTO novo de quatro, como na criação): a nova data não pode sobrepor o bimestre anterior nem o seguinte.

### `DELETE /competicoes/:id`

- Permitido **só se nenhum bimestre estiver `ENCERRADO` e nenhum `ComponentePontuacao` existir em nenhum dos quatro bimestres** — ou seja, a competição foi criada mas ainda não começou a ser usada de fato. Se houver qualquer uso, `409 Conflict`.

## Tarefas

1. Extrair a validação de ordem/sobreposição de datas de `CompeticoesService.validarBimestres` para `shared/datas-bimestre.util.ts`, com uma função que valide um conjunto de 4 bimestres (uso na criação) e outra que valide um bimestre contra os vizinhos já gravados (uso na edição).
2. `CompeticoesService.atualizar(user, competicaoId, dto)`: `carregarCompeticaoDoProfessor`, `prisma.competicao.update`.
3. `CompeticoesService.excluir(user, competicaoId)`: `carregarCompeticaoDoProfessor`, contar bimestres `ENCERRADO` e `componentePontuacao` de todos os bimestres da competição; bloquear se algum > 0; senão `prisma.competicao.delete` (cascata apaga os 4 bimestres vazios e os grupos — ver nota abaixo).
4. **Nota sobre grupos:** se a competição tiver grupos **sem nenhum membro** (criados mas não usados), a exclusão em cascata é segura. Se tiver algum grupo com membro, isso só acontece via o fluxo normal da aplicação (adicionar membro, Etapa 04 do plano original) — adicionar essa contagem (`membroGrupo` de qualquer grupo da competição) à mesma checagem de bloqueio do item 3, para não apagar composição de grupo em cascata silenciosamente.
5. `BimestresService.atualizar(user, bimestreId, dto)` (criar o service se ainda não existir como arquivo próprio — hoje a lógica de bimestre pode estar dentro de `CompeticoesService`, conferir e ajustar a localização conforme o padrão do projeto): `carregarBimestreDoProfessor`, checar `situacao === ABERTO` e `componentePontuacao` count `=== 0`, validar datas contra os vizinhos, `prisma.bimestre.update`.
6. Controllers: `@Patch(':id')` e `@Delete(':id')` em `CompeticoesController`; `@Patch(':id')` no controller de bimestres correspondente.

## Testes (Vitest)

- Editar nome da competição funciona.
- Editar data de um bimestre aberto e sem pontuação funciona; validar contra sobreposição com os vizinhos.
- Editar data de um bimestre com pontuação já criada é bloqueado.
- Editar data de um bimestre encerrado é bloqueado.
- Excluir competição "vazia" (sem pontuação em nenhum bimestre, nenhum encerrado, nenhum grupo com membro) funciona.
- Excluir competição com pelo menos um bimestre encerrado é bloqueado.
- Excluir competição com pontuação definida em algum bimestre (mesmo sem encerrar) é bloqueado.
- Excluir competição com grupo que já tem membro é bloqueado.

## Critérios de aceite

- Testes acima passam.
- O erro mais comum na prática — data de bimestre digitada errado na criação, percebido antes de qualquer lançamento — fica resolvido sem recriar a competição inteira.

## Fora de escopo

Reabrir um bimestre já encerrado; mover uma competição inteira para outro lecionamento/sala.
