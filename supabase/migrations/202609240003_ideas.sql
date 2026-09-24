create extension if not exists pgcrypto;

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  category text not null default 'Inspiracja' check (char_length(category) between 1 and 80),
  content text not null check (char_length(content) between 1 and 12000),
  source_question text check (source_question is null or char_length(source_question) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ideas enable row level security;

drop policy if exists "admins can read ideas" on public.ideas;
create policy "admins can read ideas"
on public.ideas for select
to authenticated
using (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()));

drop policy if exists "admins can create ideas" on public.ideas;
create policy "admins can create ideas"
on public.ideas for insert
to authenticated
with check (
  exists (select 1 from public.admin_users where admin_users.user_id = auth.uid())
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "admins can update ideas" on public.ideas;
create policy "admins can update ideas"
on public.ideas for update
to authenticated
using (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()));

drop policy if exists "admins can delete ideas" on public.ideas;
create policy "admins can delete ideas"
on public.ideas for delete
to authenticated
using (exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()));

comment on table public.ideas is 'Pomysly SPA zapisywane recznie lub po swiadomym kliknieciu w odpowiedzi doradcy.';
