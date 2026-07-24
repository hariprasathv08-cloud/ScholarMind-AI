
-- Extensions
create extension if not exists vector;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  page_count int,
  status text not null default 'pending', -- pending | processing | ready | failed
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_created_idx on public.documents(user_id, created_at desc);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "own documents" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Document chunks (gemini-embedding-2 → 3072 dims; use halfvec for HNSW)
create table public.document_chunks (
  id bigserial primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index int not null,
  page int,
  content text not null,
  embedding halfvec(3072),
  created_at timestamptz not null default now()
);
create index document_chunks_doc_idx on public.document_chunks(document_id, chunk_index);
create index document_chunks_hnsw on public.document_chunks using hnsw (embedding halfvec_cosine_ops);
grant select, insert, update, delete on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;
alter table public.document_chunks enable row level security;
create policy "own chunks" on public.document_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "own conversations" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);
create index messages_conv_created_idx on public.messages(conversation_id, created_at);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "own messages" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.tg_touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function public.tg_touch_updated_at();
create trigger conversations_touch before update on public.conversations for each row execute function public.tg_touch_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
                   new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RAG search: cosine similarity over chunks the caller owns (RLS handles user scoping)
create or replace function public.match_document_chunks(
  query_embedding halfvec(3072),
  match_document_id uuid,
  match_count int default 6
)
returns table (
  id bigint,
  document_id uuid,
  chunk_index int,
  page int,
  content text,
  similarity float
)
language sql stable set search_path = public as $$
  select c.id, c.document_id, c.chunk_index, c.page, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.document_id = match_document_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count
$$;
grant execute on function public.match_document_chunks(halfvec, uuid, int) to authenticated;
