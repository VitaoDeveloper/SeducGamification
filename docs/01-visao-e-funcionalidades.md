# Sistema de Competições Gamificadas — Visão e Funcionalidades

**Versão:** 0.8 (rascunho vivo)
**Escopo desta fase:** arquitetura, funcionalidades e comportamentos.
**Fora de escopo por ora:** escolha de stack técnico.
**Documentos relacionados:** `02-entidades-e-relacionamentos.md`, `03-regras-de-calculo.md`

---

## 1. Contexto

O sistema nasce junto com a tese de mestrado de um professor. A pesquisa exige métodos de **motivação estudantil** e **acolhimento dos jovens**, fazendo-os sentir que vale a pena estudar. Para isso, o professor usa uma **metodologia de gamificação** baseada em competições entre equipes de alunos.

## 2. Problema

- Hoje, dados, grupos e atividades são registrados em **Google Sheets e Excel**.
- Esse registro dá trabalho ao professor.
- Outros professores, que poderiam aplicar a metodologia, não a aplicam por falta de conhecimento técnico das ferramentas.

## 3. Objetivo

Oferecer um sistema, análogo a um sistema acadêmico, em que:

- o **professor** cria e monitora as competições por meio de interfaces intuitivas;
- os **alunos** visualizam os resultados.

Critério de sucesso: um professor sem conhecimento técnico consegue aplicar a metodologia sem depender de planilhas.

## 4. Atores

| Ator | O que faz | Interface | Status |
|---|---|---|---|
| Mantenedor (admin) | Cadastra as entidades primordiais, que ditam a organização do sistema: escolas, modelos de avaliação, docentes e o vínculo professor–escola | **Direto no banco de dados, sem interface gráfica** | Confirmado |
| Professor | Cria salas e alunos, se inscreve em salas, atribui componentes curriculares, cria competições e grupos, define componentes de pontuação e pesos, lança pontuações, resolve empates e emite relatórios | GUI | Confirmado |
| Aluno | Visualiza rankings e emite os próprios relatórios | GUI | Confirmado |
| Outros (coordenação, responsáveis...) | — | — | A validar |

## 5. Regras de negócio confirmadas

### 5.1 Salas, professores e alunos

| # | Regra |
|---|---|
| RN1 | O vínculo professor–escola é feito pelo **mantenedor**. |
| RN2 | O vínculo professor–sala é feito **pelos próprios professores**. Ao cadastrar uma sala e seus alunos, outros professores podem **se inscrever** para ministrar competições nela. Não há limite de salas por professor, por ora. |
| RN3 | O professor cadastra os **componentes curriculares** ao criar a sala e atribui à sala **todos os que leciona** para ela. Pode lecionar componentes diferentes para salas diferentes. Exemplo: Interfaces para o 2º DS; Gestão Empresarial para o 3º ADM. |
| RN4 | Cada aluno pertence a **uma única sala por vez**. |
| RN5 | Salas e alunos são cadastrados **pelo professor**. |

### 5.2 Competição

| # | Regra |
|---|---|
| RN6 | Cada competição acontece entre grupos de **uma única sala**. |
| RN7 | A competição engloba o desempenho dos integrantes em **todos os componentes curriculares** que o professor cadastrou para a sala. |
| RN8 | Os grupos são criados a cada nova competição. |
| RN9 | O aluno pode trocar de equipe. Vale a composição do grupo **no encerramento do bimestre**. Aluno que entra no meio do ano é colocado em um grupo pelo professor; bimestres já encerrados não mudam. |
| RN10 | A cada bimestre, o professor define os **componentes de pontuação** (caderno, projetos, provas, trabalhos etc.). Os pesos são **percentuais que somam 100%**. |
| RN11 | As **predefinições de avaliação** (componentes e pesos) pertencem às preferências do professor e podem ser reutilizadas. |
| RN12 | Não há elementos de gamificação além de **pontos e rankings**. |

### 5.3 Pontuação

| # | Regra |
|---|---|
| RN13 | A **síntese bimestral do aluno** é a média ponderada dos componentes. Com vários componentes curriculares, o **ranking final é uma média das sínteses de todas as matérias atribuídas**. *(detalhes na pergunta 1)* |
| RN14 | A **síntese bimestral do grupo** é a média das sínteses dos integrantes. |
| RN15 | A pontuação final do **aluno** é a **média simples** das quatro sínteses. A pontuação final do **grupo** é a **soma** das quatro sínteses bimestrais do grupo, **sem média**. |
| RN16 | Rankings: **anual dos grupos** (pontuação final do grupo), **parcial de cada bimestre** e **individual** dos alunos. |
| RN17 | Existem **dois modelos de avaliação**: numérico (1 a 10) e CPS ETEC (I = 3, R = 5, B = 8, MB = 10). Cada escola tem **um único modelo**. |
| RN18 | Os componentes seguem o modelo da escola. A síntese é **sempre numérica**. |
| RN19 | Componente sem lançamento vale **0**. |
| RN20 | Pontuações e sínteses são numéricas, com até **duas casas decimais**, **arredondadas**. |

### 5.4 Bimestres e desempate

| # | Regra |
|---|---|
| RN21 | O professor informa **início e fim de cada bimestre** ao criar a competição. O encerramento é **automático na data final**. |
| RN22 | Lançamentos, pesos, composição dos grupos e sínteses só podem ser alterados **durante o respectivo bimestre**. Depois disso ficam congelados. |
| RN23 | Em caso de **empate ao final das sínteses**, o sistema emite **alerta imediato** ao professor, que deve desempatar **até a data limite do fechamento do bimestre**. |
| RN24 | Sem desempate manual, vence o grupo com melhor pontuação nos componentes de maior peso: compara-se a **média dos integrantes** em cada componente, **do maior peso para o menor**. |
| RN25 | A mesma regra vale para o **ranking anual**, com prazo no fechamento do último bimestre. |

### 5.5 Acesso

| # | Regra |
|---|---|
| RN26 | O login é feito pelo **código de matrícula**, gerado automaticamente no cadastro no padrão **26XXX** (X = auto increment). |
| RN27 | Um professor pode atuar em **mais de uma escola**. |

### 5.6 Relatórios e visibilidade

| # | Regra |
|---|---|
| RN28 | Existem quatro relatórios: **individual**, **individual comparado aos demais integrantes do grupo**, **coletivo** e **coletivo comparado aos demais grupos**. |
| RN29 | O **aluno** emite apenas o **seu** relatório individual e os do **seu grupo**. |
| RN30 | O **professor** emite o individual de **qualquer aluno** e os relatórios de **qualquer grupo**. |
| RN31 | Todos os dados são visíveis, **sem anonimato**. |
| RN32 | Relatórios são exportados em **PDF**, a qualquer estágio da competição, com gráficos e todos os dados. |
| RN33 | Nas comparações anuais, compara-se **bimestre a bimestre** (mesma escala) e a pontuação final do grupo aparece **à parte**. |

## 6. Funcionalidades da GUI (visão inicial)

O cadastro do mantenedor não entra aqui: é feito direto no banco.

| # | Funcionalidade | Ator | Status |
|---|---|---|---|
| F1 | Entrar com o código de matrícula | Professor e aluno | A detalhar |
| F2 | Criar sala, cadastrar alunos (código gerado automaticamente) e atribuir componentes curriculares | Professor | A detalhar |
| F3 | Inscrever-se em sala existente e atribuir os componentes que leciona | Professor | A detalhar |
| F4 | Criar competição (sala e datas dos quatro bimestres) | Professor | A detalhar |
| F5 | Criar grupos, atribuir alunos e trocar aluno de equipe | Professor | A detalhar |
| F6 | Definir componentes de pontuação e pesos (somando 100%) a cada bimestre | Professor | A detalhar |
| F7 | Salvar e reutilizar predefinições de avaliação | Professor | A detalhar |
| F8 | Lançar pontuação dos alunos por componente, conforme o modelo da escola | Professor | A detalhar |
| F9 | Calcular sínteses, pontuações finais e rankings (parcial, anual e individual) | Sistema | A detalhar |
| F10 | Encerrar o bimestre na data final e congelar as sínteses | Sistema | A detalhar |
| F11 | Alertar empate, permitir desempate manual e aplicar o critério automático | Sistema e professor | A detalhar |
| F12 | Emitir os relatórios em PDF, conforme o perfil | Professor e aluno | A detalhar |
| F13 | Ver os rankings | Professor e aluno | A detalhar |

## 7. Glossário

| Termo | Definição |
|---|---|
| Mantenedor | Responsável pelo sistema. Cadastra as entidades primordiais direto no banco. |
| Escola | Instituição cadastrada, com professores vinculados e um modelo de avaliação. |
| Sala | Turma de uma escola (por exemplo, 2º DS). Criada por um professor. |
| Componente curricular (matéria) | Disciplina que o professor leciona para uma sala (por exemplo, Interfaces). |
| Lecionamento (inscrição) | Vínculo entre um professor e uma sala, com os componentes curriculares que ele leciona nela. Origem da competição. |
| Competição | Disputa entre grupos de uma única sala, ligada a um lecionamento. Engloba todos os componentes curriculares do professor na sala. |
| Grupo (equipe) | Conjunto de alunos da sala que disputa uma competição. |
| Componente de pontuação | Atividade avaliada (caderno, projeto, prova, trabalho...) com peso percentual em um bimestre. |
| Modelo de avaliação | Escala usada pela escola: numérica (1 a 10) ou CPS ETEC (I, R, B, MB). |
| Predefinição de avaliação | Conjunto salvo de componentes e pesos, reutilizável em outras competições. |
| Síntese bimestral | Pontuação do aluno ou do grupo em um bimestre. |
| Código de matrícula | Identificador de login, no padrão 26XXX, gerado automaticamente no cadastro. |

## 8. Perguntas em aberto

Em ordem de prioridade.

1. Com várias matérias, o cálculo entendido é: síntese por matéria, média simples entre as matérias, e a pontuação final do grupo é a soma dos quatro bimestres. Está certo? As matérias podem mudar durante o ano?
2. Os pesos dos componentes de pontuação são definidos por matéria (somando 100% em cada matéria, a cada bimestre)?
3. Um mesmo professor pode ter mais de uma competição na mesma sala no ano?
4. Ranking individual: entre todos os alunos da sala, visível a todos, com a mesma regra de desempate?
5. No desempate automático, "componentes de maior peso" são considerados juntando todas as matérias?
6. Código de matrícula: "26" é o ano do cadastro? Quantos dígitos tem o contador (três dígitos limitam a 999 por ano)? Vale também para professores? Como funcionam a senha e o primeiro acesso?
7. Sala compartilhada: qualquer professor da escola pode se inscrever sem aprovação? Quem pode editar a sala e os alunos?

## 9. Notas para a fase técnica

- O cadastro do mantenedor é feito direto no banco: o modelo deve ser fácil de povoar sem tela, e o código de matrícula precisa ser gerado automaticamente também nesse caminho.
- Senhas iniciais dos docentes cadastrados direto no banco precisam ser tratadas com segurança.

## 10. Observações

- A comparação exibe nomes e notas dos colegas de grupo, e os usuários são menores de idade. Vale alinhar com a escola e com o orientador do mestrado (LGPD e, se aplicável, comitê de ética da pesquisa).

## 11. Histórico de versões

| Versão | Mudança |
|---|---|
| 0.1 | Contexto, problema, objetivo e atores iniciais. |
| 0.2 | Regras de negócio e glossário iniciais. |
| 0.3 | Modelos de avaliação vinculados às escolas. |
| 0.4 | Regras de cálculo, atores, acesso e funcionalidades detalhadas. |
| 0.5 | Pontuação do grupo, conversão ETEC, pesos percentuais, troca de equipe, bimestres congelados, ranking parcial, PDF. |
| 0.6 | Pontuação final do grupo passa a ser a soma das sínteses bimestrais, sem média. |
| 0.7 | Componente curricular e lecionamento, cadastros pelo professor, bimestres com datas, regra de desempate, duas casas decimais, quatro relatórios, nome de usuário. |
| 0.8 | Competição engloba todas as matérias do professor na sala, inscrição de professores em salas, mantenedor sem GUI, ranking individual, escopo dos relatórios, login por código de matrícula. |
