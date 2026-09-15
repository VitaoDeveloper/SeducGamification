# Guia de Configuração do Supabase — Sistema de Competições Gamificadas

## 1. Criar o projeto

1. Acesse [supabase.com](https://supabase.com) e crie uma conta (dá pra usar GitHub)
2. Clique em **New Project**, escolha um nome e uma senha forte para o banco (guarde essa senha, é diferente da API key)
3. Aguarde o provisionamento (leva 1-2 minutos)

## 2. Criar as tabelas e regras (SQL Editor)

Vá em **SQL Editor** no menu lateral, cole o bloco abaixo inteiro e clique em **Run**.

```sql
-- Tabela de perfis, ligada ao usuário autenticado do Supabase
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null default 'aluno' check (role in ('aluno','professor')),
  nome text
);

-- Cria o perfil automaticamente quando alguém se cadastra
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, new.raw_user_meta_data->>'nome');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Atividades curriculares
create table public.atividades_curriculares (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  disciplina text
);

-- Competições
create table public.competicoes (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid references public.atividades_curriculares(id),
  descricao text,
  data date default current_date
);

-- Pontuações (a "planilha" do seu diagrama)
create table public.pontuacoes (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references public.profiles(id),
  competicao_id uuid references public.competicoes(id),
  pontos integer not null,
  cadastrado_por uuid references public.profiles(id) default auth.uid(),
  criado_em timestamptz default now()
);

-- Ativa Row Level Security em todas as tabelas
alter table public.profiles enable row level security;
alter table public.atividades_curriculares enable row level security;
alter table public.competicoes enable row level security;
alter table public.pontuacoes enable row level security;

-- Qualquer usuário logado pode LER tudo
create policy "leitura_profiles" on public.profiles for select using (true);
create policy "leitura_atividades" on public.atividades_curriculares for select using (true);
create policy "leitura_competicoes" on public.competicoes for select using (true);
create policy "leitura_pontuacoes" on public.pontuacoes for select using (true);

-- Só professor pode ESCREVER
create policy "escrita_atividades" on public.atividades_curriculares for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'professor')
);
create policy "escrita_competicoes" on public.competicoes for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'professor')
);
create policy "escrita_pontuacoes" on public.pontuacoes for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'professor')
);
```

**O que esse bloco faz, em resumo:** cria as 4 tabelas do seu diagrama, liga automaticamente todo novo usuário a um perfil (`aluno` por padrão), liga o RLS (segurança linha a linha) e define que qualquer um lê, mas só quem tem `role = 'professor'` escreve.

## 3. Ativar o Realtime na tabela de pontuações

Isso é o que faz o placar atualizar sozinho na tela do Aluno.

1. Vá em **Database → Replication**
2. Encontre a tabela `pontuacoes` e ative o toggle de replicação
   *(ou, alternativamente, rode no SQL Editor: `alter publication supabase_realtime add table pontuacoes;`)*

## 4. Configurar autenticação

1. Vá em **Authentication → Providers**
2. Deixe **Email** habilitado (já vem ativado por padrão)
3. Em **Authentication → URL Configuration**, se for testar localmente, adicione `http://localhost:5173` (porta padrão do SvelteKit/Vite) na lista de Redirect URLs
4. Opcional: em **Authentication → Settings**, desative "Confirm email" durante o desenvolvimento, para não precisar confirmar e-mail a cada teste de cadastro

## 5. Transformar um usuário em Professor

Todo novo cadastro entra como `aluno` por padrão (é o que definimos no `default 'aluno'` lá em cima). Para promover alguém a professor, depois que a pessoa já tiver se cadastrado uma vez pelo app:

1. Vá em **SQL Editor** e rode:

```sql
update public.profiles
set role = 'professor'
where id = (select id from auth.users where email = 'email-do-professor@exemplo.com');
```

## 6. Pegar as chaves para o frontend

1. Vá em **Project Settings → API**
2. Copie:
   - **Project URL** → variável `PUBLIC_SUPABASE_URL`
   - **anon public key** → variável `PUBLIC_SUPABASE_ANON_KEY`
3. Essas duas vão num arquivo `.env` na raiz do projeto SvelteKit:

```
PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-aqui
```

**Importante:** a anon key é segura para expor no frontend — ela não dá acesso a nada além do que as políticas de RLS permitem. A senha do banco (passo 1) nunca vai para o frontend.

## 7. Testar se está tudo certo

- Cadastre dois usuários pelo app (ou pela aba **Authentication → Users** do painel)
- Promova um deles a `professor` (passo 5)
- Logado como professor, tente cadastrar uma atividade — deve funcionar
- Logado como aluno, tente cadastrar uma atividade via SQL Editor simulando o insert dele — deve ser **rejeitado** pelo RLS. Se for rejeitado, a segurança está correta.
