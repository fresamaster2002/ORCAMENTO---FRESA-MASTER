create table if not exists public.melhor_envio_oauth (
  id smallint primary key check (id = 1),
  access_token text not null default '',
  refresh_token text not null default '',
  expires_at timestamptz not null default 'epoch',
  pending_state text,
  pending_created_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.melhor_envio_oauth enable row level security;
revoke all on table public.melhor_envio_oauth from anon, authenticated;
grant all on table public.melhor_envio_oauth to service_role;
