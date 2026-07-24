
create schema if not exists extensions;
alter extension vector set schema extensions;

-- handle_new_user is only meant to run as a trigger; block direct calls.
revoke all on function public.handle_new_user() from public, anon, authenticated;
