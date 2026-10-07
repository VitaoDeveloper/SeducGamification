# Etapa 02 (API) — Componentes curriculares avulsos e desinscrição do lecionamento

**Módulo:** `src/modules/lecionamentos/`
**Reaproveitar:** `exigirProfessor`, `carregarSalaComVinculoEscolar` (acesso-escolar); para o próprio lecionamento, carregar com `professorId` igual ao usuário (o lecionamento já guarda `professorId`).

## Contexto

Hoje o único jeito de criar `ComponenteCurricular` é na inscrição inicial (`POST /salas/:salaId/inscricao`), que roda uma vez só (a segunda tentativa dá 409 "já inscrito"). Isso é exatamente o que você notou: se o professor esquecer uma matéria na hora de se inscrever, ou o nome dela mudar, não existe como corrigir — tem que ser feito direto no banco.

## Endpoints novos

### `POST /lecionamentos/:id/componentes-curriculares`

- DTO: `nome: string`.
- Adiciona **mais um** componente curricular ao lecionamento já existente (sem recriar o lecionamento). Permitido a qualquer momento (não depende de bimestre).
- Bloquear nome duplicado no mesmo lecionamento (case-insensitive), com `409 Conflict`.

### `PATCH /componentes-curriculares/:id`

- DTO: `nome: string`.
- Renomear. Como `ComponentePontuacao` referencia por `componenteCurricularId` (não por nome), renomear não quebra nada já lançado — sempre permitido, para o professor dono do lecionamento.

### `DELETE /componentes-curriculares/:id`

- Permitido **só se não houver nenhum `ComponentePontuacao` criado para essa matéria**, em nenhum bimestre (passado ou presente) — senão a exclusão apagaria lançamentos/sínteses em cascata. Se houver, `409 Conflict` explicando.
- Bloquear também se for o **último** componente curricular do lecionamento (um lecionamento sem nenhuma matéria não faz sentido no modelo) — nesse caso, orientar a usar o endpoint de desinscrição abaixo.

### `DELETE /lecionamentos/:id` (desinscrição do professor da sala)

- Permitido **só se não houver nenhuma `Competicao`** vinculada a esse lecionamento. Se houver, `409 Conflict`.
- Se permitido, apaga o lecionamento e seus componentes curriculares (nada mais depende deles, pela regra acima).

## Tarefas

1. DTOs: `CriarComponenteCurricularDto` (`nome`), `AtualizarComponenteCurricularDto` (`nome`).
2. `LecionamentosService`:
   - `adicionarComponente(user, lecionamentoId, dto)`: carrega o lecionamento e confirma `professorId === user.id` (reaproveitar o padrão de `carregarLecionamentoDoProfessor`, de `shared/acesso-competicao.util.ts`, que já existe e já é usado pela Etapa de competições — importar de lá em vez de duplicar). Checa nome duplicado, cria.
   - `renomearComponente(user, componenteCurricularId, dto)`: carrega o componente com seu `lecionamento.professorId`, valida posse, atualiza.
   - `removerComponente(user, componenteCurricularId)`: idem, mais a contagem de `componentePontuacao` daquele `componenteCurricularId` (bloquear se > 0) e a contagem de componentes curriculares do lecionamento (bloquear exclusão do último).
   - `desinscrever(user, lecionamentoId)`: carrega o lecionamento, conta `competicao` com esse `lecionamentoId` (bloquear se > 0), senão `prisma.lecionamento.delete` (cascata apaga só os componentes curriculares, que já sabemos estarem "vazios" — na verdade nem precisa checar aqui, pois se houvesse `ComponentePontuacao` em algum deles, teria havido `Competicao`, que já bloqueou acima; documentar esse raciocínio num comentário no código para quem ler depois).
3. Controller: `@Post(':id/componentes-curriculares')` em `LecionamentosController` (ou um controller próprio `componentes-curriculares.controller.ts`, se o agente preferir separar); `@Patch`/`@Delete` para o componente individual; `@Delete(':id')` para a desinscrição do lecionamento em si.

## Testes (Vitest)

- Adicionar componente a um lecionamento existente funciona e aparece na listagem (`GET /salas/:salaId/lecionamentos`).
- Adicionar componente com nome já existente no mesmo lecionamento é bloqueado.
- Renomear funciona e não afeta `ComponentePontuacao` já criados com base nele (checar que o `componenteCurricularId` permanece o mesmo).
- Excluir componente sem nenhuma pontuação criada funciona.
- Excluir componente com pontuação já criada (mesmo que o bimestre ainda esteja aberto) é bloqueado.
- Excluir o último componente curricular de um lecionamento é bloqueado, orientando a desinscrição.
- Desinscrever um lecionamento sem competições funciona.
- Desinscrever um lecionamento com pelo menos uma competição é bloqueado.

## Critérios de aceite

- Todos os testes acima passam.
- O cenário mais comum do seu relato — esquecer uma matéria na inscrição — passa a ter solução sem acessar o banco.

## Fora de escopo

Mesclar dois componentes curriculares duplicados criados por engano (precisaria mover os `ComponentePontuacao` de um para o outro — trate como um pedido futuro, se aparecer).
