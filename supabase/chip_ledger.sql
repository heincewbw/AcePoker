-- ============================================================
--  AcePoker – Chip Ledger Audit Table
--  Run this ONCE in Supabase SQL Editor:
--  https://app.supabase.com → SQL Editor → New query
-- ============================================================

create table if not exists chip_ledger (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  username      text not null,
  event         text not null,          -- 'buyin' | 'win' | 'lose' | 'refund' | 'disconnect_refund' | 'pot_leak_fix'
  amount        bigint not null,        -- positive = gained, negative = spent
  balance_after bigint not null,        -- chips balance AFTER this event
  table_id      text,
  round_number  int,
  detail        text,                   -- human-readable description
  created_at    timestamptz default now() not null
);

-- Index for fast per-user queries
create index if not exists chip_ledger_user_id_idx  on chip_ledger (user_id, created_at desc);
create index if not exists chip_ledger_created_at   on chip_ledger (created_at desc);

-- Row Level Security: only service role can write, authenticated users read own rows
alter table chip_ledger enable row level security;

create policy "Users can view own ledger"
  on chip_ledger for select
  using (auth.uid() = user_id);

-- Service role bypasses RLS automatically (no insert policy needed for backend)
