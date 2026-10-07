# Auditoria de CRUD incompleto — SeducGamification (API + GUI)

**Data da auditoria:** 03/10/2026, direto nos repositórios `VitaoDeveloper/SeducGamification` (API) e `VitaoDeveloper/SeducGamificationWeb` (GUI).
**Método:** leitura de todos os controllers/services da API e de todos os `*.api.ts` da GUI — não é uma estimativa a partir do plano original, é o estado real do código.

## Resultado, em uma frase

A API só expõe **criar** e **listar/ler** para praticamente toda entidade cadastrada pelo professor; a GUI reflete isso fielmente (não há nenhum botão de editar/excluir além de um único caso). A única exceção hoje, nos dois repositórios, é **remover um aluno de um grupo** (`DELETE /grupos/:id/membros/:alunoId`), que já existe e já é usado. Fora isso, zero edição e zero exclusão em qualquer entidade — confirmando exatamente o que você notou.

## Por que isso é delicado aqui (não é só "adicionar um PATCH")

O `schema.prisma` usa `onDelete: Cascade` em praticamente todas as relações. Isso significa que um `DELETE` mal pensado em, por exemplo, uma `Sala`, apagaria em cascata todos os alunos matriculados, lecionamentos, competições, grupos, lançamentos e sínteses daquela sala — inclusive dados de bimestres já **encerrados**, que deveriam ser imutáveis por regra de negócio (doc `03`, RN15/RN17 do plano original). Por isso, cada etapa abaixo não é só "criar o endpoint que falta": é decidir **até onde** a edição/exclusão pode ir sem violar o congelamento de bimestre encerrado nem apagar histórico que já virou síntese oficial.

A regra que usei em todas as etapas, para manter consistência: **nada que já foi usado para calcular uma síntese gravada (bimestre encerrado) pode ser editado ou excluído.** Fora isso, a edição é sempre permitida; a exclusão só é permitida quando o dado está "vazio" (sem dependentes criados em cima dele) — evitando apagamento em cascata de coisas que o professor não pediu para apagar. Cada etapa deixa explícito qual das duas posturas usei e por quê, para você revisar e divergir onde achar que faz mais sentido afrouxar ou apertar a regra.

## Tabela-resumo das lacunas

| # | Entidade | Hoje (API) | Falta | Risco de exclusão (cascata) |
|---|---|---|---|---|
| 01 | Sala | POST, GET | PATCH (nome, ano letivo), DELETE (só se vazia) | Alto — cascata até sínteses |
| 02 | Componente curricular / Lecionamento | POST (só na inscrição inicial) | POST avulso (adicionar depois), PATCH (renomear), DELETE (só se sem pontuação); DELETE do lecionamento (desinscrição, só se sem competição) | Alto — cascata até lançamentos |
| 03 | Aluno | POST, GET | PATCH (nome), DELETE (só se sem histórico de competição) | Alto — cascata até sínteses |
| 04 | Competição | POST, GET | PATCH (nome; datas de um bimestre ainda sem pontuação definida), DELETE (só se nenhum bimestre foi usado) | Alto — cascata até sínteses |
| 05 | Grupo | POST, GET, POST/DELETE membro | PATCH (nome), DELETE (só se sem membros em nenhum bimestre) | Médio — cascata até membros/desempates do grupo |
| 06 | Componente de pontuação | POST, GET, POST validar | PATCH (nome, peso), DELETE — ambos só com bimestre aberto | Médio — cascata até lançamentos do componente |
| 07 | Lançamento | POST (upsert), GET, POST lote | DELETE (apagar um lançamento, distinto de lançar 0) — só com bimestre aberto | Baixo — folha da árvore |
| 08 | Desempate | POST (já funciona como "editar", substitui o escopo), GET pendências, POST automático | DELETE/revogação (voltar o escopo a pendente) — sem prazo adicional, pois o código não tem um campo de prazo separado do encerramento do bimestre | Baixo — folha da árvore |

**Nota sobre o desempate:** ao ler `DesempateService` com atenção (etapa 08), descobri que registrar uma nova ordem manual (`POST /competicoes/:id/desempate`) já **substitui** a decisão anterior daquele escopo — ou seja, "editar" já existe, só não documentado como tal. A lacuna real ali é mais estreita do que a linha acima sugere à primeira vista: só falta revogar (voltar ao estado pendente). Deixei isso detalhado na própria etapa 08.

Escola, modelo de avaliação, docente e vínculo professor-escola **ficam de fora** desta auditoria: são cadastrados pelo mantenedor direto no banco, por decisão de produto já tomada (não é uma lacuna a fechar). Rankings e relatórios são sempre somente leitura, por natureza.

## Como as etapas estão organizadas

Uma entidade por número (01 a 08), cada uma em dois arquivos — `NN-entidade-api.md` e `NN-entidade-gui.md` — para dois commits separados em dois repositórios. A ordem segue o risco e a dependência: primeiro o que é mais isolado (sala, componente curricular), depois o que depende de mais contexto (competição, grupo), terminando no que é mais arriscado por tocar cálculo (componente de pontuação, lançamento, desempate). Processar em ordem; cada etapa assume as anteriores prontas.

Cada etapa segue o mesmo formato das etapas anteriores do projeto: contexto, o(s) endpoint(s) novo(s) com contrato e regras, tarefas de implementação (reaproveitando os utilitários que já existem no código — `exigirProfessor`, `carregarSalaComVinculoEscolar`, `carregarCompeticaoDoProfessor`, `carregarGrupoDoProfessor`, `carregarBimestreDoProfessor`, `carregarMateriasComPesos`, etc.), testes automatizados (Vitest, mesma convenção `*.spec.ts`) e critérios de aceite.

## Índice

| Arquivo API | Arquivo GUI | Entidade |
|---|---|---|
| `01-sala-api.md` | `01-sala-gui.md` | Sala |
| `02-componentes-curriculares-api.md` | `02-componentes-curriculares-gui.md` | Componente curricular / Lecionamento |
| `03-aluno-api.md` | `03-aluno-gui.md` | Aluno |
| `04-competicao-api.md` | `04-competicao-gui.md` | Competição e bimestres |
| `05-grupo-api.md` | `05-grupo-gui.md` | Grupo |
| `06-componente-pontuacao-api.md` | `06-componente-pontuacao-gui.md` | Componente de pontuação |
| `07-lancamento-api.md` | `07-lancamento-gui.md` | Lançamento |
| `08-desempate-api.md` | `08-desempate-gui.md` | Desempate |
