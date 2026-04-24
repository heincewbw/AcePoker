-- =============================================================
-- TOURNAMENTS - run in Supabase SQL Editor
-- =============================================================

create table if not exists public.tournaments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  buy_in          bigint not null,
  scheduled_at    timestamptz not null,
  started_at      timestamptz,
  finished_at     timestamptz,
  starting_stack  bigint not null default 10000,
  max_players     integer not null default 500,
  status          text not null default 'scheduled' check (status in ('scheduled','running','finished','cancelled')),
  prize_pool      bigint not null default 0,
  table_id        uuid,
  winners         jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists public.tournament_registrations (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  username         text not null,
  finish_position  integer,
  prize            bigint,
  created_at       timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index if not exists tournaments_status_sched_idx on public.tournaments(status, scheduled_at);
create index if not exists tournament_regs_tid_idx on public.tournament_registrations(tournament_id);
create index if not exists tournament_regs_uid_idx on public.tournament_registrations(user_id);

