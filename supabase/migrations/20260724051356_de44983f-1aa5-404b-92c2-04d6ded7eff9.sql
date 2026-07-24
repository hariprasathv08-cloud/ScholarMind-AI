
drop function if exists public.match_document_chunks(extensions.halfvec, uuid, int);
drop function if exists public.match_document_chunks(halfvec, uuid, int);

create or replace function public.match_document_chunks(
  query_embedding extensions.halfvec,
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
language sql stable set search_path = public, extensions as $$
  select c.id, c.document_id, c.chunk_index, c.page, c.content,
         1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.document_chunks c
  where c.document_id = match_document_id
    and c.embedding is not null
  order by c.embedding operator(extensions.<=>) query_embedding
  limit match_count
$$;
grant execute on function public.match_document_chunks(extensions.halfvec, uuid, int) to authenticated;
