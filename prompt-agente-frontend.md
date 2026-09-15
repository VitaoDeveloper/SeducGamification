# Prompt para agente de código — Frontend do Sistema de Competições Gamificadas

Cole este prompt em um agente de código (Claude Code, Cursor, etc.) para começar a implementação.

---

## Contexto

Construir o frontend de um sistema escolar simples que gerencia competições gamificadas de atividades curriculares. O backend é 100% Supabase (Postgres + Auth + Realtime) — não existe API própria, o frontend fala direto com o Supabase.

## Stack

- **SvelteKit** (não Svelte puro — precisamos de rotas e SSR simples para login)
- `@supabase/supabase-js` como cliente
- CSS simples, sem framework de UI pesado (o foco é funcionalidade, não design)
- Vite como bundler (padrão do SvelteKit)

## Papéis de usuário

- **Professor**: pode cadastrar atividades curriculares, competições e pontuações
- **Aluno**: só pode visualizar o placar/pontuações, em tempo real

O papel de cada usuário vem da tabela `profiles` (coluna `role`, valores `'aluno'` ou `'professor'`). Isso já está configurado no banco — o frontend só precisa ler esse valor após o login e ajustar a UI.

## Modelo de dados (já existe no Supabase, não recriar)

- `profiles` (id, role, nome)
- `atividades_curriculares` (id, nome, disciplina)
- `competicoes` (id, atividade_id, descricao, data)
- `pontuacoes` (id, aluno_id, competicao_id, pontos, cadastrado_por, criado_em)

## Telas necessárias

1. **Login** (`/login`) — email/senha via Supabase Auth
2. **Placar** (`/placar`) — lista de pontuações em tempo real, agrupadas por competição. Visível para ambos os papéis. Deve usar `supabase.channel()` para escutar INSERTs na tabela `pontuacoes` e atualizar a tela sem reload.
3. **Painel do Professor** (`/painel`, só acessível se `role === 'professor'`) — formulários para:
   - Cadastrar atividade curricular
   - Cadastrar competição (vinculada a uma atividade)
   - Lançar pontuação de um aluno numa competição

## Requisitos técnicos

- Variáveis de ambiente `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` (não expor nada além da anon key — a segurança real está no RLS do banco, não no frontend)
- Redirecionar para `/login` se não houver sessão ativa
- Esconder/bloquear rota `/painel` no client se o `role` não for `professor` (proteção de UX — a proteção real de dados já é o RLS)
- Tratar erros de insert (ex: RLS rejeitando escrita) mostrando mensagem amigável, não só o erro cru do Supabase

## Critério de pronto

- Professor consegue logar, cadastrar atividade → competição → pontuação
- Aluno logado em outra aba vê a pontuação aparecer no placar sem dar refresh
- Aluno não consegue acessar `/painel` nem ver formulários de cadastro

## Fora de escopo por enquanto

- Edição/exclusão de registros
- Design visual refinado
- Testes automatizados
