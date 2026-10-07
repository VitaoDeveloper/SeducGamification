# Etapa 01 (API) — Editar e excluir sala

**Módulo:** `src/modules/salas/`
**Reaproveitar:** `exigirProfessor`, `exigirVinculoProfessorEscola` (`shared/acesso-escolar.util.ts`).

## Contexto

Hoje `SalasService` só tem `criar` e `listarDoProfessor`. Não existe forma de corrigir o nome/ano letivo de uma sala criada com erro, nem de apagar uma sala criada por engano.

## Endpoints novos

### `PATCH /salas/:id`

- DTO: `nome?`, `anoLetivo?` (ambos opcionais, pelo menos um presente).
- Sempre permitido, para qualquer professor vinculado à escola da sala (mesma regra de acesso do `criar`) — editar nome/ano não afeta dados já gravados.

### `DELETE /salas/:id`

- Permitido **só se a sala estiver vazia**: nenhuma `Matricula` e nenhum `Lecionamento` associados.
- Se houver qualquer um dos dois, responder `409 ConflictException` com mensagem explicando o motivo (ex.: "Sala possui alunos matriculados." ou "Sala possui professores inscritos.") — não listar os dois ao mesmo tempo de forma genérica, dizer especificamente qual bloqueio se aplica.

## Tarefas

1. `src/modules/salas/dto/atualizar-sala.dto.ts`: `nome?: string`, `anoLetivo?: number`, ambos com os mesmos validadores do `CriarSalaDto`, mas opcionais.
2. `SalasService.atualizar(user, salaId, dto)`: carrega a sala com `carregarSalaComVinculoEscolar` (já valida existência + vínculo), aplica `prisma.sala.update`.
3. `SalasService.excluir(user, salaId)`: carrega a sala do mesmo jeito, conta `prisma.matricula.count({ where: { salaId } })` e `prisma.lecionamento.count({ where: { salaId } })`; se algum > 0, lança `ConflictException` específica; senão, `prisma.sala.delete`.
4. Controller: `@Patch(':id')` e `@Delete(':id')` em `SalasController`, com `ParseUUIDPipe` no `id`, seguindo o padrão dos métodos existentes.

## Testes (Vitest, `salas.service.spec.ts`)

- Editar nome/ano de uma sala do professor vinculado funciona.
- Editar sala de escola não vinculada ao professor é bloqueado (reaproveita o teste que já deve existir para `criar`, só trocando a ação).
- Excluir uma sala vazia funciona.
- Excluir uma sala com pelo menos um aluno matriculado é bloqueado com a mensagem sobre alunos.
- Excluir uma sala sem alunos mas com um lecionamento é bloqueado com a mensagem sobre professores inscritos.

## Critérios de aceite

- `PATCH` e `DELETE` cobertos pelos testes acima, todos passando.
- Nenhuma mudança na lógica de `criar`/`listarDoProfessor` já existente.

## Fora de escopo

Transferir alunos de uma sala para outra antes de excluir (o professor precisa remover os alunos manualmente primeiro, via a Etapa 03); exclusão forçada/cascata de sala com dados.
