create table if not exists public.quotes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  quote jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create index if not exists quotes_updated_at_idx
  on public.quotes (owner_id, updated_at desc);

alter table public.quotes enable row level security;

revoke all on public.quotes from anon;
grant select, insert, update, delete on public.quotes to authenticated;

drop policy if exists "admin can access own quotes" on public.quotes;
create policy "admin can access own quotes"
  on public.quotes
  for all
  to authenticated
  using (
    owner_id = (select auth.uid())
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'fresamaster0@gmail.com'
  )
  with check (
    owner_id = (select auth.uid())
    and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'fresamaster0@gmail.com'
  );
