-- OneStopDutch database schema.
-- Safe to rerun: tables, policies, indexes and functions are replaced cleanly.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "Users can read their own data" on public.user_data;
create policy "Users can read their own data"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own data" on public.user_data;
create policy "Users can insert their own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own data" on public.user_data;
create policy "Users can update their own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own data" on public.user_data;
create policy "Users can delete their own data"
  on public.user_data for delete
  using (auth.uid() = user_id);

-- Grammar RAG chunks (Gemini text-embedding-004: 768 dimensions).
create extension if not exists vector with schema extensions;

create table if not exists public.grammar_chunks (
  id bigint generated always as identity primary key,
  source text not null,
  page integer not null,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now()
);

-- Migrate old local 1024-dimension embeddings only when needed.
do $$
declare
  current_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into current_type
  from pg_attribute a
  where a.attrelid = 'public.grammar_chunks'::regclass
    and a.attname = 'embedding'
    and not a.attisdropped;

  if current_type is distinct from 'extensions.vector(768)' then
    drop index if exists public.grammar_chunks_embedding_idx;
    alter table public.grammar_chunks
      alter column embedding type extensions.vector(768)
      using array_fill(0::real, ARRAY[768])::extensions.vector(768);
    truncate table public.grammar_chunks;
  end if;
end $$;

create index if not exists grammar_chunks_embedding_idx
  on public.grammar_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists grammar_chunks_source_page_idx
  on public.grammar_chunks (source, page);

alter table public.grammar_chunks enable row level security;

drop policy if exists "Authenticated users can read grammar chunks" on public.grammar_chunks;
create policy "Authenticated users can read grammar chunks"
  on public.grammar_chunks for select
  using (auth.role() = 'authenticated');

-- Similarity search used by the hosted chat backend.
drop function if exists public.match_grammar_chunks(extensions.vector);
create or replace function public.match_grammar_chunks(
  query_embedding extensions.vector(768),
  match_count integer default 5
)
returns table (
  id bigint,
  content text,
  page integer,
  similarity double precision
)
language sql
stable
as $$
  select
    id,
    content,
    page,
    1 - (embedding <=> query_embedding) as similarity
  from public.grammar_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_grammar_chunks(extensions.vector, integer)
  to authenticated, service_role;

-- Per-user AI model preferences.
create table if not exists public.user_ai_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_model text not null,
  last_model text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_preferences enable row level security;

drop policy if exists "Users can read their own AI preferences" on public.user_ai_preferences;
create policy "Users can read their own AI preferences"
  on public.user_ai_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own AI preferences" on public.user_ai_preferences;
create policy "Users can insert their own AI preferences"
  on public.user_ai_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own AI preferences" on public.user_ai_preferences;
create policy "Users can update their own AI preferences"
  on public.user_ai_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
