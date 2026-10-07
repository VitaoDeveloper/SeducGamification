# Etapa 08 (API) — Revogar uma decisão de desempate

**Módulo:** `src/modules/desempate/`

## Contexto (ajustado após ler o código real — diferente do que a tabela-resumo da auditoria geral sugeria)

Lendo `DesempateService.resolverManualmente`, a "edição" de um desempate manual **já existe**: a função começa com `tx.desempate.deleteMany({ where: { competicaoId, bimestreId: escopo } })` antes de criar os novos registros — ou seja, chamar `POST /competicoes/:id/desempate` de novo, com uma ordem diferente, **já substitui** a decisão anterior daquele escopo (bimestre ou anual). Não é preciso criar um endpoint de edição.

O que falta de verdade é **revogar** uma decisão (manual ou automática) e devolver aquele escopo ao estado "pendente" — hoje não existe nenhum jeito de "desfazer" um desempate já registrado sem simplesmente registrar outro no lugar. É útil, por exemplo, se o professor aplicou o critério automático e, depois, decide que prefere decidir manualmente (ou vice-versa) — hoje ele consegue ir de manual→manual ou registrar automático por cima de um escopo ainda pendente, mas não tem como "limpar" e voltar ao zero.

**Nota sobre prazo:** o doc `03` fala em "até a data limite do fechamento do bimestre", mas no código atual não existe um campo de prazo separado — o bimestre já está `ENCERRADO` no momento em que o empate passa a existir (as sínteses só são gravadas no encerramento). Não há, hoje, nenhuma trava temporal adicional depois disso. Por isso, este endpoint **não impõe** um prazo que não existe em nenhum outro lugar do sistema — se você quiser um prazo de verdade (ex.: "só pode revogar em até 48h após o encerramento"), isso é uma decisão de produto nova, não uma lacuna de CRUD, e fica de fora desta etapa.

## Endpoint novo

### `DELETE /competicoes/:id/desempate`

- Query param: `bimestreId` (opcional, `ParseUUIDPipe` com `optional: true`, mesmo padrão de `aplicarAutomatico`) — ausente/null indica o escopo anual, igual ao resto do módulo.
- Apaga todos os `Desempate` daquele `competicaoId` + `bimestreId` (escopo), independentemente da `origem` (manual ou automático).
- Se não houver nenhum desempate registrado nesse escopo, não é erro — simplesmente não há nada para apagar (idempotente; devolver algo como `{ removidos: 0 }`).

## Tarefas

1. `DesempateService.revogar(user, competicaoId, bimestreId?)`: `exigirProfessor` + `carregarCompeticaoDoProfessor` (mesmo padrão dos outros três métodos do service); se `bimestreId` vier, `exigirBimestreDaCompeticao` (método privado já existente); `const { count } = await this.prisma.desempate.deleteMany({ where: { competicaoId, bimestreId: bimestreId ?? null } })`; retornar `{ bimestreId: bimestreId ?? null, removidos: count }`.
2. Controller: `@Delete(':id/desempate')` em `DesempateController`, com o mesmo `@Query('bimestreId', new ParseUUIDPipe({ optional: true }))` já usado em `aplicarAutomatico`.

## Testes (Vitest, `desempate.service.spec.ts`)

- Revogar um desempate manual existente: o escopo volta a aparecer em `listarPendencias`.
- Revogar um desempate automático existente: mesmo comportamento.
- Revogar um escopo sem nenhum desempate registrado: não dá erro, `removidos: 0`.
- Depois de revogar, registrar um novo desempate manual (ou aplicar o automático) no mesmo escopo funciona normalmente, como se nunca tivesse sido resolvido.

## Critérios de aceite

- Testes acima passam.
- Nenhuma mudança no comportamento já existente de `resolverManualmente` (que já funciona como "editar", via substituição) nem de `aplicarAutomatico`.

## Fora de escopo

Impor um prazo de revogação que não existe hoje em nenhum outro lugar do sistema (ver nota acima); histórico de quem revogou o quê.
