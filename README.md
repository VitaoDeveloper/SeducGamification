# Seduc Gamification

Sistema de **competições gamificadas** entre equipes de alunos, construído para apoiar uma pesquisa de mestrado sobre **motivação estudantil**. Ele substitui o trabalho manual feito em planilhas (Google Sheets e Excel) por uma API que permite ao professor **criar e monitorar competições** e ao aluno **visualizar resultados e emitir relatórios** — sem depender de conhecimento técnico.

Este documento é o guia do projeto: apresenta a visão geral, a arquitetura, o modelo de dados, as regras de negócio e de cálculo, a referência completa da API com exemplos e os procedimentos de desenvolvimento e validação.

---

## Sumário

- [1. Visão geral](#1-visão-geral)
- [2. Funcionalidades](#2-funcionalidades)
- [3. Stack tecnológica](#3-stack-tecnológica)
- [4. Estrutura do projeto](#4-estrutura-do-projeto)
- [5. Atores e fluxo de uso](#5-atores-e-fluxo-de-uso)
- [6. Domínio de dados](#6-domínio-de-dados)
- [7. Regras de negócio](#7-regras-de-negócio)
- [8. Regras de cálculo](#8-regras-de-cálculo)
- [9. Autenticação e acesso](#9-autenticação-e-acesso)
- [10. Configuração e execução](#10-configuração-e-execução)
- [11. Referência da API](#11-referência-da-api)
- [12. Sequência de uso recomendada](#12-sequência-de-uso-recomendada)
- [13. Procedimentos de desenvolvimento e validação](#13-procedimentos-de-desenvolvimento-e-validação)
- [14. Documentação complementar](#14-documentação-complementar)

---

## 1. Visão geral

Um professor aplica uma metodologia de gamificação: a turma é dividida em **equipes** que competem ao longo dos **quatro bimestres** do ano letivo. O desempenho é medido por componentes de pontuação (provas, cadernos, projetos, trabalhos) definidos pelo professor a cada bimestre, com pesos percentuais.

A entrada são **lançamentos de notas** no modelo de avaliação da escola (numérico 1 a 10 ou conceitual CPS ETEC: I, R, B, MB). A partir deles, o sistema calcula **sínteses** individuais e de equipe, detecta **empates**, permite **desempates** manuais ou automáticos, monta **rankings** (parcial, anual e individual) e gera **relatórios** em JSON e PDF.

Princípios do projeto:

- **Imparcialidade e neutralidade:** o sistema apenas registra fatos e aplica regras de cálculo determinísticas e documentadas. Não introduz elementos de gamificação além de pontos e rankings (RN12).
- **Congelamento por bimestre:** após o encerramento de um bimestre, lançamentos, pesos, composição das equipes e sínteses não podem mais ser alterados (RN22).
- **Dados sempre visíveis, sem anonimato** (RN31). Por envolver menores de idade, é recomendável alinhar o uso com a escola e o orientador da pesquisa (LGPD e, se aplicável, comitê de ética).

---

## 2. Funcionalidades

| Área | Funcionalidade |
|---|---|
| Autenticação | Login por **código de matrícula**, consulta do usuário autenticado e troca de senha |
| Salas | Criação e listagem de salas (turmas) de uma escola |
| Lecionamentos | Inscrição do professor em uma sala com os componentes curriculares (matérias) que leciona nela |
| Alunos | Cadastro (com código de matrícula e senha inicial gerados) e listagem por sala |
| Competições | Criação (com as datas dos quatro bimestres), detalhe e listagem por lecionamento |
| Grupos | Criação de equipes, admissão e remoção de membros **por bimestre**, listagem com membros |
| Componentes de pontuação | Criação, listagem e validação de pesos percentuais (devem somar 100% por matéria no bimestre) |
| Lançamentos | Nota individual ou em lote por componente, de acordo com o modelo da escola |
| Encerramento de bimestre | Cálculo e gravação das sínteses, congelamento e detecção de empates |
| Rankings | Parcial (bimestre), anual (grupos) e individual (alunos), com posições e flag de empate |
| Desempate | Manual (o professor define as posições) e automático (critério por maior peso), com consulta de pendências |
| Relatórios | Individual, comparativo de grupo, coletivo e comparativo de grupos — em JSON e PDF |

> **No escopo do alpha:** o cadastro de escolas, modelos de avaliação, professores e vínculos professor–escola é feito pelo **mantenedor, direto no banco de dados** — não há GUI nem endpoint para isso.

---

## 3. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js |
| Linguagem | TypeScript (ESM, `"type": "module"`) |
| Framework | NestJS 12 |
| ORM | Prisma 7 (cliente gerado em `src/generated/prisma`), com `@prisma/adapter-pg` |
| Banco de dados | PostgreSQL |
| Autenticação | JWT (`@nestjs/jwt`, expiração de 8 h) + `bcryptjs` (hash em 10 rounds) |
| Documentos/PDF | `pdfmake` 0.3.11 (geração de PDF no servidor, sem Chromium) |
| Validação | `class-validator` + `class-transformer` (ValidationPipe global, `whitelist` e `forbidNonWhitelisted`) |
| Testes | Vitest (unit e e2e via supertest) |
| Lint | oxlint |
| Gerenciador de pacotes | pnpm |
| Observabilidade | `@nestjs/observe` (opcional; requer `appKey`/`appSecret`) |

---

## 4. Estrutura do projeto

```
.
├── .env.example                 # Variáveis de ambiente (DATABASE_URL, JWT_SECRET)
├── package.json                 # Scripts e dependências
├── prisma/
│   ├── schema.prisma            # Modelo de dados (Prisma)
│   ├── seed.ts                  # Seed idempotente de catálogo e professor de exemplo
│   └── migrations/              # Migrações aplicadas
├── prisma.config.ts             # Configuração do Prisma 7
├── src/
│   ├── main.ts                  # Bootstrap do NestJS (porta da env PORT ou 3000)
│   ├── app.module.ts            # Módulo raiz, ValidationPipe global, ObserveModule
│   ├── app.controller.ts        # GET / (health simples)
│   ├── generated/prisma/        # Cliente Prisma gerado (não editar)
│   └── modules/
│       ├── auth/                # Login, JWT, guarda, troca de senha
│       ├── salas/               # Salas
│       ├── lecionamentos/       # Inscrição do professor na sala
│       ├── alunos/              # Alunos e matrículas
│       ├── competicoes/         # Competições e bimestres
│       ├── grupos/              # Equipes e membros por bimestre
│       ├── componentes-pontuacao/  # Componentes e pesos
│       ├── lancamentos/         # Lançamento de notas (individual e lote)
│       ├── bimestres/           # Encerramento do bimestre (sínteses)
│       ├── sinteses/            # Classe pura de cálculo das sínteses
│       ├── rankings/            # Rankings parcial, anual e individual
│       ├── desempate/           # Desempate manual e automático
│       ├── relatorios/          # Relatórios em JSON
│       ├── relatorios-pdf/      # Relatórios em PDF (pdfmake)
│       ├── prisma/              # PrismaService (conexão)
│       └── shared/              # Utilitários de acesso e regras compartilhadas
├── docs/                        # Especificações de domínio (rascunho vivo)
├── test/                        # Testes e2e
├── vitest.config.ts             # Configuração dos testes unitários
└── vitest.config.e2e.ts         # Configuração dos testes e2e
```

---

## 5. Atores e fluxo de uso

| Ator | O que faz | Interface |
|---|---|---|
| **Mantenedor (admin)** | Cadastra escolas, modelos de avaliação, docentes e o vínculo professor–escola | Direto no banco de dados (sem GUI) |
| **Professor** | Cria salas e alunos, inscreve-se em salas, atribui matérias, cria competições e grupos, define pesos, lança notas, encerra bimestres, resolve empates e emite relatórios | API (futura GUI) |
| **Aluno** | Visualiza resultados e emite **o próprio** relatório individual e os do próprio grupo | API (futura GUI) |

**Fluxo típico do professor:**

1. O mantenedor cadastra a escola, o modelo de avaliação, o professor e o vínculo.
2. O professor cria uma **sala** e cadastra os **alunos** (recebem código de matrícula e senha inicial gerados).
3. O professor se **inscreve na sala** (lecionamento), informando as **matérias** que leciona nela.
4. O professor cria uma **competição** com as datas dos **quatro bimestres**.
5. O professor cria os **grupos** e atribui os alunos por bimestre.
6. A cada bimestre, o professor define os **componentes de pontuação e pesos** e **lança as notas**.
7. Ao final do bimestre, o professor **encerra o bimestre** (as sínteses são gravadas e congeladas).
8. Havendo **empate**, o professor desempata manualmente ou dispara o critério **automático**.
9. A qualquer momento, gera **rankings** e **relatórios** (JSON ou PDF).

---

## 6. Domínio de dados

As entidades centrais:

| Entidade | Papel |
|---|---|
| `ModeloAvaliacao` / `NivelEscala` | Catálogo de escalas: **numérica** (1 a 10) e **CPS ETEC** (I=3, R=5, B=8, MB=10), cada uma com seus níveis |
| `Escola` | Instituição. Tem **um único** modelo de avaliação |
| `Professor` | Docente. Identificado pelo código de matrícula; pode atuar em várias escolas |
| `VinculoProfessor` | Professor × Escola (feito pelo mantenedor) |
| `Sala` | Turma de uma escola em um ano letivo. Criada por um professor (`professorCriadorId`) |
| `Aluno` | Estudante. Pertence a **uma única sala por vez** |
| `Matricula` | Aluno × Sala |
| `Lecionamento` | Inscrição de um professor em uma sala, com as **matérias** que leciona nela. Origem da competição |
| `ComponenteCurricular` | Matéria (ex.: Interfaces, Gestão Empresarial) |
| `Competicao` | Disputa entre equipes de uma sala, ligada a um lecionamento; engloba **todas** as matérias |
| `Bimestre` | Um dos **quatro** períodos da competição, com `dataInicio`/`dataFim` e `situacao` (`ABERTO`/`ENCERRADO`) |
| `GrupoCompetidor` | Equipe que disputa a competição |
| `MembroGrupo` | Aluno × Grupo **por bimestre** (permite troca de equipe; vale a composição no encerramento) |
| `ComponentePontuacao` | Atividade avaliada com `pesoPercentual`, ligada a um bimestre e a uma matéria |
| `Lancamento` | Nota de um aluno em um componente, no modelo da escola (`valorNoModelo`) |
| `SinteseAlunoComponente` | Síntese do aluno por matéria no bimestre (gravada ao encerrar) |
| `SinteseAluno` | Síntese bimestral do aluno (média entre matérias) |
| `SinteseGrupo` | Síntese bimestral do grupo (média dos integrantes) |
| `Desempate` | Posição definida pelo professor (manual) ou pelo critério automático; `bimestreId` nulo = ranking anual |
| `PredefinicaoAvaliacao` / `PredefinicaoComponente` | Conjuntos de componentes e pesos reutilizáveis (preferências do professor) |

> O diagrama completo com relacionamentos e cardinalidades está em `docs/02-entidades-e-relacionamentos.md`.

---

## 7. Regras de negócio

Resumo das regras confirmadas (fonte: `docs/01-visao-e-funcionalidades.md`):

### Salas, professores e alunos

- **RN1** O vínculo professor–escola é feito pelo mantenedor.
- **RN2** O vínculo professor–sala é feito pelos próprios professores (inscrição). Sem limite de salas por professor.
- **RN3** O professor atribui à sala **todos** os componentes curriculares que leciona nela.
- **RN4** Cada aluno pertence a uma única sala por vez.
- **RN5** Salas e alunos são cadastrados pelo professor.

### Competição, grupos e pontuação

- **RN6–RN7** A competição acontece entre grupos de uma única sala e engloba **todas** as matérias do lecionamento.
- **RN8–RN9** Grupos são criados a cada competição. Vale a composição **no encerramento do bimestre**; bimestres encerrados não mudam.
- **RN10** Os componentes de pontuação têm pesos percentuais que **somam 100%**.
- **RN12** Não há gamificação além de pontos e rankings.
- **RN17–RN18** Dois modelos de avaliação (numérico e CPS ETEC); a síntese é **sempre numérica**.
- **RN19** Componente sem lançamento vale **0**.
- **RN20** Pontuações com até duas casas decimais, arredondadas.

### Bimestres e desempate

- **RN21** O encerramento ocorre na data final do bimestre.
- **RN22** Com o bimestre encerrado, lançamentos, pesos, composição e sínteses ficam congelados.
- **RN23–RN25** Empates geram alerta; o professor desempata manualmente ou vence o critério automático (melhor média nos componentes de maior peso). Vale também para o ranking anual.

### Acesso e relatórios

- **RN26** Login por código de matrícula (padrão `26XXX`), gerado automaticamente no cadastro.
- **RN27** Um professor pode atuar em mais de uma escola.
- **RN28–RN30** Quatro relatórios; o aluno emite **apenas** o seu e o do seu grupo; o professor emite de qualquer aluno/grupo.
- **RN31** Dados visíveis, sem anonimato.
- **RN32** Relatórios exportados em PDF a qualquer estágio.

### Validações implementadas no código

- Todo endpoint (exceto `POST /auth/login`) exige token JWT válido.
- Ações de escrita e consultas de ranking exigem o perfil **PROFESSOR** (`403` para alunos).
- Professores só acessam recursos das escolas às quais estão vinculados e das competições que criaram (`403`/`404`).
- Um aluno só entra em grupo se estiver **matriculado na sala** da competição e em **no máximo um grupo por bimestre** (`409`).
- Componentes de pontuação e lançamentos só podem ser criados/alteraados em bimestre **aberto** (`409`).
- O encerramento exige que todas as matérias somem **100%** de pesos (`400` com a lista de pendências).
- Código de matrícula: padrão `ANO2 + 3 dígitos` (ex.: `26001`), com limite de **999 por ano**, alocado com `pg_advisory_xact_lock` para evitar colisões em cadastros concorrentes.

---

## 8. Regras de cálculo

Todas as fórmulas (fonte: `docs/03-regras-de-calculo.md`, implementadas em `src/modules/sinteses/sintese-calculo.service.ts`):

**1. Conversão para número** — conforme o modelo da escola:

| Modelo | Lançamento | Valor numérico |
|---|---|---|
| Numérico | Nota de 1 a 10 (ex.: `8.5`) | Valor direto |
| CPS ETEC | I, R, B, MB | 3, 5, 8, 10 |

**2. Síntese do aluno por matéria** — média ponderada dos componentes:

```
S(b, c) = Σ (nota_i × peso_i / 100)
```

> Componente sem lançamento vale **0** (RN19).

**3. Síntese bimestral do aluno** — média simples entre as matérias:

```
S(b) = (S(b, 1) + S(b, 2) + ... + S(b, C)) / C
```

**4. Síntese bimestral do grupo** — média das sínteses dos integrantes:

```
G(b) = média(S(b) dos integrantes)
```

**5. Pontuação final do aluno** (ranking individual) — média das sínteses:

```
M = (S(1) + S(2) + S(3) + S(4)) / 4
```

**6. Pontuação final do grupo** (ranking anual) — **soma** das sínteses, sem média (até 40):

```
P = G(1) + G(2) + G(3) + G(4)
```

**Rankings** — parcial (pela síntese do grupo no bimestre), anual (pela pontuação final do grupo) e individual (pela pontuação final do aluno). Posições iguais para valores iguais (ex.: `1, 1, 3`) e sinalização de empate (`empate: true`).

**Arredondamento:** cada etapa arredonda para **duas casas decimais** (`Number(valor.toFixed(2))`).

### Exemplo didático

Aluno com duas matérias (modelo numérico), pesos **Prova 50%, Caderno 20%, Projeto 30%**:

```
Matéria 1 — notas 8, 10 e 6:   S = 8×0,5 + 10×0,2 + 6×0,3 = 7,80
Matéria 2 — notas 9, 10 e 7:   S = 9×0,5 + 10×0,2 + 7×0,3 = 8,60
Síntese bimestral:  S = (7,80 + 8,60) / 2 = 8,20
```

Modelo CPS ETEC, mesmos pesos, conceitos B/MB/R (8/10/5):

```
S = 8×0,5 + 10×0,2 + 5×0,3 = 7,50
```

Grupo de três integrantes com sínteses 8,20 / 7,50 / 9,10:

```
G = (8,20 + 7,50 + 9,10) / 3 = 8,266... → 8,27
```

**Desempate automático** (RN24/RN25): grupos empatados são comparados **matéria por matéria, da de maior peso somado para a menor**; o grupo com melhor média dos integrantes no componente vence. Se o empate persistir após todas as matérias, ele é considerado **real (residual)** e nenhum registro é gravado.

---

## 9. Autenticação e acesso

- **Login:** `POST /auth/login` com `codigoMatricula` e `senha` (vale para professor e aluno). Resposta: `{ "accessToken": "<JWT>" }`.
- **Token:** enviar no cabeçalho `Authorization: Bearer <accessToken>`.
- **Validade:** 8 horas. O token carrega `sub` (id) e `tipo` (`PROFESSOR` | `ALUNO`).
- **Senha inicial do aluno:** é o próprio código de matrícula (ex.: aluno `26001` entra com senha `26001`) — recomenda-se trocar no primeiro acesso via `POST /auth/trocar-senha`.
- **Proteção:** todos os endpoints, exceto o login, passam pelo `AuthGuard` (401 sem token ou com token inválido/expirado).
- **Perfil professor:** endpoints de criação/listagem/rankings exigem perfil professor (403 para alunos). Os únicos endpoints abertos ao **aluno** são os relatórios (próprio/do próprio grupo).

---

## 10. Configuração e execução

### Pré-requisitos

- Node.js (versão compatível com NestJS 12 / TypeScript 6)
- pnpm
- PostgreSQL (ou um serviço compatível, como o Neon)

### Passos

```bash
# 1) Instalar dependências
pnpm install

# 2) Preparar o ambiente
cp .env.example .env
#    DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/SEDUC_GAMIFICATION
#    JWT_SECRET=um-segredo-longo-e-aleatorio

# 3) Aplicar as migrações (cria as tabelas)
pnpm prisma migrate dev

# 4) Popular o catálogo e criar o professor de exemplo
pnpm prisma db seed
#    → Seed concluído. Professor de exemplo: "Professor Exemplo"
#      | matrícula: <ano AA><3 dígitos> | senha inicial: <a própria matrícula>

# 5) Rodar a aplicação (watch mode)
pnpm start:dev
```

A API sobe em `http://localhost:3000` (ou na porta da variável `PORT`). `GET /` responde com uma mensagem simples de health check.

> **Nota sobre o seed:** ele é **idempotente**. Cria os modelos **Numérico** e **CPS ETEC**, a escola **Escola Estadual de Exemplo** (modelo ETEC), o professor **Professor Exemplo** (se não existir) e o vínculo professor–escola. Se o professor já existir, reutiliza o código de matrícula existente.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | String de conexão do PostgreSQL |
| `JWT_SECRET` | Sim | Segredo para assinar/verificar os tokens JWT |
| `PORT` | Não | Porta HTTP (padrão **3000**) |

---

## 11. Referência da API

Convenções usadas nos exemplos:

- Todos os exemplos usam `Authorization: Bearer <token>`.
- Identificadores (`{id}`, `{salaId}`, ...) são **UUIDs**.
- Data e hora no formato **ISO 8601** (ex.: `2026-02-10T00:00:00.000Z`).
- Erros: a API devolve os códigos HTTP padrão do Nest — `400` Bad Request (validação/regra), `401` não autenticado, `403` sem permissão, `404` não encontrado, `409` conflito (ex.: bimestre encerrado).

### 11.1 Autenticação

#### `POST /auth/login`

Autentica professor ou aluno pelo código de matrícula.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "codigoMatricula": "26001", "senha": "26001" }'
```

```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIs..." }
```

#### `GET /auth/me`

Retorna quem está autenticado: `{ "id": "...", "tipo": "PROFESSOR" | "ALUNO" }`.

#### `POST /auth/trocar-senha`

```bash
curl -X POST http://localhost:3000/auth/trocar-senha \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "senhaAtual": "26001", "novaSenha": "nova-senha" }'
```

Responderá `200` sem corpo em caso de sucesso.

### 11.2 Salas

#### `POST /salas` — cria uma sala (professor vinculado à escola)

```json
{ "nome": "2º DS", "anoLetivo": 2026, "escolaId": "00000000-0000-0000-0000-000000000003" }
```

Validações: `nome` obrigatório, `anoLetivo` entre 2000 e 2100, `escolaId` UUID e professor **vinculado** à escola.

#### `GET /salas` — lista as salas das escolas do professor autenticado

```json
[
  { "id": "...", "nome": "2º DS", "anoLetivo": 2026, "escolaId": "...", "professorCriadorId": "...", "escola": { "id": "...", "nome": "Escola Estadual de Exemplo" } }
]
```

### 11.3 Lecionamentos (inscrição do professor na sala)

#### `POST /salas/{salaId}/inscricao`

O professor informa as matérias que leciona na sala:

```json
{ "componentes": ["Interfaces", "Programação Web"] }
```

Regras: professor precisa estar vinculado à escola; nomes são deduplicados; `409` se o professor já estiver inscrito na sala. Resposta inclui o lecionamento, as matérias e os dados do professor.

#### `GET /salas/{salaId}/lecionamentos`

Lista os professores inscritos na sala com suas matérias.

### 11.4 Alunos

#### `POST /salas/{salaId}/alunos`

```json
{ "nome": "Maria da Silva" }
```

O código de matrícula é gerado automaticamente (padrão `26XXX`, sequencial por ano) e a **senha inicial é o próprio código**. O aluno é matriculado na sala.

```json
{ "id": "...", "nome": "Maria da Silva", "codigoMatricula": "26001", ... }
```

#### `GET /salas/{salaId}/alunos`

Lista os alunos da sala (id, nome, código de matrícula) em ordem alfabética.

### 11.5 Competições

#### `POST /competicoes`

Cria uma competição com exatamente **quatro bimestres**:

```json
{
  "nome": "Competição 2026",
  "lecionamentoId": "<uuid>",
  "bimestres": [
    { "numero": 1, "dataInicio": "2026-02-02T00:00:00.000Z", "dataFim": "2026-04-10T00:00:00.000Z" },
    { "numero": 2, "dataInicio": "2026-04-21T00:00:00.000Z", "dataFim": "2026-06-30T00:00:00.000Z" },
    { "numero": 3, "dataInicio": "2026-08-03T00:00:00.000Z", "dataFim": "2026-09-30T00:00:00.000Z" },
    { "numero": 4, "dataInicio": "2026-10-05T00:00:00.000Z", "dataFim": "2026-12-18T00:00:00.000Z" }
  ]
}
```

Validações: quatro bimestres, números 1 a 4 sem repetição, `dataFim > dataInicio` e bimestres sem sobreposição em ordem crescente.

#### `GET /competicoes/{id}` — detalhe com bimestres e grupos

#### `GET /lecionamentos/{lecionamentoId}/competicoes` — competições do lecionamento

### 11.6 Grupos

#### `POST /competicoes/{id}/grupos` — cria uma equipe

```json
{ "nome": "Equipe Alfa" }
```

#### `POST /grupos/{id}/membros` — adiciona um aluno a um grupo **no bimestre** informado

```json
{ "alunoId": "<uuid>", "bimestreId": "<uuid>" }
```

Regras: aluno deve estar matriculado na sala da competição; `409` se já estiver em algum grupo da competição **naquele bimestre** ou se o bimestre estiver **encerrado**.

#### `DELETE /grupos/{id}/membros/{alunoId}?bimestreId=<uuid>`

Remove o aluno do grupo no bimestre (parâmetro obrigatório; bimestre deve estar aberto). Responde `204`.

#### `GET /competicoes/{id}/grupos?bimestreId=<uuid>`

Lista os grupos com membros. Se `bimestreId` for omitido, usa o **último bimestre aberto** da competição.

### 11.7 Componentes de pontuação e pesos

#### `POST /bimestres/{id}/componentes-pontuacao`

```json
{
  "componenteCurricularId": "<uuid da matéria>",
  "nome": "Prova",
  "pesoPercentual": 50
}
```

Validações: matéria deve pertencer ao lecionamento da competição; `pesoPercentual` entre 0.01 e 100, com até duas casas; a soma da matéria no bimestre não pode passar de 100%; bimestre **encerrado** está bloqueado (`409`).

#### `GET /bimestres/{id}/componentes-pontuacao`

Retorna as matérias com a soma de pesos e `todasFechadas` (100% por matéria em todas).

#### `POST /bimestres/{id}/componentes-pontuacao/validar`

```json
{ "fechado": false, "materiasPendentes": [ { "componenteCurricularId": "...", "materiaNome": "Interfaces", "somaPesoPercentual": 70, "faltaParaFechar": 30 } ] }
```

### 11.8 Lançamentos de notas

#### `POST /componentes-pontuacao/{id}/lancamentos`

```json
{ "alunoId": "<uuid>", "valorNoModelo": "8.5" }
```

O `valorNoModelo` depende do modelo da escola:

- **Numérico:** número de **1 a 10**, com até duas casas (ex.: `"1"`, `"8.5"`, `"10"`).
- **CPS ETEC:** um dos rótulos (`"I"`, `"R"`, `"B"`, `"MB"`).

A nota é um `upsert`: lançar de novo para o mesmo aluno **substitui** o valor anterior. Responder `409` em bimestre encerrado; `400` para aluno fora da sala ou valor fora do modelo.

#### `POST /componentes-pontuacao/{id}/lancamentos/lote`

```json
{
  "lancamentos": [
    { "alunoId": "<uuid>", "valorNoModelo": "8.5" },
    { "alunoId": "<uuid>", "valorNoModelo": "MB" }
  ]
}
```

Grava em uma única transação.

#### `GET /componentes-pontuacao/{id}/lancamentos`

Lista os lançamentos do componente com os dados do aluno.

### 11.9 Encerramento do bimestre

#### `POST /bimestres/{id}/encerrar`

Dispara o cálculo das sínteses e congela o bimestre. Em uma única transação (timeout de 30 s):

1. Valida se **todas** as matérias somam 100% de pesos;
2. Grava `SinteseAlunoComponente` (aluno × matéria), `SinteseAluno` (bimestral) e `SinteseGrupo`;
3. Muda a situação para `ENCERRADO`;
4. Detecta e retorna os **empates** do ranking parcial;
5. Se for o 4º bimestre, calcula e retorna as **pontuações finais** (`competicaoConcluida: true`).

Exemplo resumido da resposta:

```json
{
  "bimestreId": "...",
  "numero": 1,
  "situacao": "ENCERRADO",
  "encerradoEm": "2026-04-10T18:00:00.000Z",
  "totais": { "alunos": 3, "materias": 2, "grupos": 2 },
  "sinteseAluno": [ { "bimestreId": "...", "alunoId": "...", "nome": "Maria da Silva", "valor": 8.2 } ],
  "sinteseGrupo": [ { "bimestreId": "...", "grupoId": "...", "nome": "Equipe Alfa", "integrantes": 2, "valor": 8.27 } ],
  "empates": [ { "bimestreId": "...", "valor": 8.2, "grupos": [ { "grupoId": "...", "nome": "Equipe Alfa", "valor": 8.2 } ] } ],
  "competicaoConcluida": false,
  "pontuacoesFinais": null
}
```

### 11.10 Rankings

#### `GET /competicoes/{id}/ranking?bimestreId=<uuid>`

- **Com** `bimestreId`: ranking **parcial** daquele bimestre.
- **Sem** `bimestreId`: ranking **anual** (pontuação final dos grupos = soma).

```json
{
  "tipo": "parcial",
  "competicaoId": "...",
  "bimestreId": "...",
  "bimestresEncerrados": 1,
  "completo": false,
  "itens": [
    { "posicao": 1, "valor": 8.27, "empate": false, "grupoId": "...", "nome": "Equipe Alfa" },
    { "posicao": 2, "valor": 7.9, "empate": false, "grupoId": "...", "nome": "Equipe Beta" }
  ]
}
```

Desempates já gravados (manual ou automático) substituem a posição simples e removem o flag de empate.

#### `GET /competicoes/{id}/ranking-individual`

Ranking individual anual (média das sínteses bimestrais de cada aluno).

### 11.11 Desempate

#### `GET /competicoes/{id}/desempate/pendencias`

Lista os empates dos bimestres **encerrados** + o anual que ainda não foram resolvidos.

#### `POST /competicoes/{id}/desempate`

Desempate **manual** (RN24). `bimestreId` ausente ou `null` = empate do ranking **anual**:

```json
{
  "bimestreId": "<uuid>",
  "ordem": [ { "grupoId": "<uuid>", "posicao": 1 }, { "grupoId": "<uuid>", "posicao": 2 } ]
}
```

Validações: a ordem deve formar **exatamente** um empate detectado no ranking; sem repetições de grupo ou posição; a resolução do mesmo escopo substitui a anterior. Desempate manual tem origem `MANUAL`.

#### `POST /competicoes/{id}/desempate/aplicar-automatico?bimestreId=<uuid>`

Dispara o critério **automático**: compara os grupos empatados matéria por matéria, da maior para a menor soma de pesos; vence quem tem maior média dos integrantes. Origem `AUTOMATICO`. Empates residuais (iguais em tudo) são devolvidos em `residuais` e nada é gravado. No alpha, o disparo é manual — não há job agendado.

### 11.12 Relatórios (JSON e PDF)

Todas as rotas aceitam professor (qualquer aluno/grupo da competição) e aluno (apenas o próprio/do próprio grupo).

| Formato | Endpoint (JSON) | Endpoint (PDF) |
|---|---|---|
| Individual do aluno | `GET /alunos/{id}/relatorio-individual?competicaoId=<uuid>` | `GET /alunos/{id}/relatorio-individual.pdf?...` |
| Individual comparado ao grupo | `GET /alunos/{id}/relatorio-comparativo-grupo?competicaoId=<uuid>` | `GET /alunos/{id}/relatorio-comparativo-grupo.pdf?...` |
| Coletivo do grupo | `GET /grupos/{id}/relatorio` | `GET /grupos/{id}/relatorio.pdf` |
| Coletivo comparado aos grupos | `GET /grupos/{id}/relatorio-comparativo` | `GET /grupos/{id}/relatorio-comparativo.pdf` |

O `competicaoId` é opcional nos relatórios de aluno; é obrigatório apenas quando o aluno participa de mais de uma competição. O retorno do individual contém `pontuacaoFinal` (média das sínteses), os bimestres com `materias` e suas sínteses. O coletivo traz a síntese de cada bimestre e os integrantes; a pontuação final do grupo (soma) aparece separadamente. Os PDFs são baixados com `Content-Type: application/pdf` e nome `relatorio-*.pdf`.

---

## 12. Sequência de uso recomendada

1. **Provisionar o ambiente** (mantenedor, no banco): escola, modelo de avaliação, professor, vínculo.
2. **Criar a sala** → `POST /salas`.
3. **Cadastrar os alunos** → `POST /salas/{salaId}/alunos` (guarde os códigos de matrícula).
4. **Inscrever-se e definir as matérias** → `POST /salas/{salaId}/inscricao`.
5. **Criar a competição** com as datas → `POST /competicoes`.
6. **Criar grupos e alocar membros por bimestre** → `POST /competicoes/{id}/grupos` e `POST /grupos/{id}/membros`.
7. **Definir componentes de pontuação e pesos** por bimestre → `POST /bimestres/{id}/componentes-pontuacao`, conferindo com `/validar` até fechar 100% em todas as matérias.
8. **Lançar as notas** → `POST /componentes-pontuacao/{id}/lancamentos` (ou `/lote`).
9. **Encerrar o bimestre** → `POST /bimestres/{id}/encerrar` (reveja os empates devolvidos).
10. **Resolver empates** → `POST /competicoes/{id}/desempate` (manual) ou `.../aplicar-automatico`.
11. **Consultar rankings e gerar relatórios** (JSON ou PDF) a qualquer momento.

---

## 13. Procedimentos de desenvolvimento e validação

Scripts disponíveis (`package.json`):

```bash
pnpm install            # instala as dependências
pnpm build              # compilação de produção (nest build)
pnpm start:dev          # execução em modo watch
pnpm start:prod         # executa o build (node dist/main)
pnpm lint               # oxlint --type-aware src/ test/
pnpm format             # prettier --write src e test
pnpm test               # testes unitários (vitest run)
pnpm test:watch         # testes unitários em modo watch
pnpm test:cov           # testes unitários com cobertura
pnpm test:e2e           # testes de integração (vitest --config ./vitest.config.e2e.ts)
```

**Validação completa recomendada antes de enviar uma alteração:**

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

> **Notas sobre a execução:**
> - Testes e2e executam em arquivos serializados (`fileParallelism: false`) e usam um banco PostgreSQL real (há um `testTimeout` de 20 s e casos maiores precisam de timeout explícito, de 60 a 90 s).
> - Ao subir a aplicação, o módulo `@nestjs/observe` pode exibir um aviso de telemetria (precisa de `appKey`/`appSecret` em `src/app.module.ts`); é inofensivo em desenvolvimento.
> - A geração de PDF via pdfmake pode imprimir um aviso do V8 sobre `--localstorage-file`; também é inofensivo.

---

## 14. Documentação complementar

A pasta `docs/` contém o **rascunho vivo** da especificação de domínio, fonte das regras implementadas:

| Documento | Conteúdo |
|---|---|
| `01-visao-e-funcionalidades.md` | Contexto, atores, funcionalidades da GUI, regras de negócio (RN1–RN33) e glossário |
| `02-entidades-e-relacionamentos.md` | Modelo conceitual, diagrama ER, quem cadastra o quê, integridade |
| `03-regras-de-calculo.md` | Fórmulas, modelos de avaliação, desempate e exemplos ilustrativos |

As especificações são complementares a este README: o README descreve o **estado atual** do sistema (a API), enquanto os documentos descrevem **visão e regras de domínio** em evolução.