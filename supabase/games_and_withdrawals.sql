-- ============================================================
--  AcePoker – Game Audit & Withdrawal Integrity Migration
--  Run this ONCE in Supabase SQL Editor after chip_ledger.sql
--  https://app.supabase.com → SQL Editor → New query
-- ============================================================

-- 1. GAMES TABLE: one row per completed hand (game instance)
create table if not exists games (
  id            uuid primary key,          -- game state.id from PokerGame
  table_id      text not null,
  round_number  int not null,
  small_blind   bigint not null,
  big_blind     bigint not null,
  pot           bigint not null,
  player_ids    uuid[] not null,           -- all participants
  winner_ids    uuid[] not null,           -- winners
  winners_json  jsonb not null,            -- [{playerId, userId, amount, hand}]
  community_cards jsonb,
  started_at    timestamptz,
  ended_at      timestamptz default now() not null
);

create index if not exists games_table_id_idx   on games (table_id, ended_at desc);
create index if not exists games_ended_at_idx   on games (ended_at desc);
create index if not exists games_winner_ids_gin on games using gin (winner_ids);
create index if not exists games_player_ids_gin on games using gin (player_ids);

alter table games enable row level security;
-- participants can read games they played in
create policy "Players can view own games"
  on games for select
  using (auth.uid() = any(player_ids));


-- 2. ADD game_id COLUMN to chip_ledger for tight linking
alter table chip_ledger
  add column if not exists game_id uuid references games(id) on delete set null;

create index if not exists chip_ledger_game_id_idx on chip_ledger (game_id);


-- 3. WITHDRAWALS TABLE: pending/approved/rejected withdrawals
create table if not exists withdrawals (
  id              bigserial primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  amount_chips    bigint not null,         -- chips being withdrawn
  amount_usdt     numeric(18,6) not null,  -- USDT equivalent
  destination     text not null,           -- wallet/bank destination
  status          text not null default 'pending',
                    -- 'pending' | 'approved' | 'rejected' | 'paid'
  audit_passed    boolean not null,        -- did ledger audit pass?
  audit_report    jsonb,                   -- detailed validation output
  rejection_reason text,
  created_at      timestamptz default now() not null,
  resolved_at     timestamptz
);

create index if not exists withdrawals_user_id_idx on withdrawals (user_id, created_at desc);
create index if not exists withdrawals_status_idx on withdrawals (status);

alter table withdrawals enable row level security;
create policy "Users view own withdrawals"
  on withdrawals for select
  using (auth.uid() = user_id);


-- 4. USER WITHDRAW LOCK: set to true if audit fails; admin must clear
alter table profiles
  add column if not exists withdraw_locked  boolean default false,
  add column if not exists withdraw_lock_reason text;
