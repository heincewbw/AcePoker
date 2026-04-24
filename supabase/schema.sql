-- Run this in your Supabase SQL Editor (https://app.supabase.com → SQL Editor)
-- 1. Enable UUID extension (already enabled by default)
-- create extension if not exists "uuid-ossp";

-- 2. PROFILES table (extends Supabase auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  avatar      text not null default 'default',
  chips       bigint not null default 10000,
  usdt_balance numeric(20, 6) not null default 0,
  wallet_address text,
  total_wins  integer not null default 0,
  total_games integer not null default 0,
  level       integer not null default 1,
  xp          integer not null default 0,
  is_online   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Auto-create profile on new user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. TRANSACTIONS table
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          text not null check (type in ('deposit','withdrawal','win','loss','refund')),
  amount        numeric(20, 6) not null,
  currency      text not null check (currency in ('USDT','CHIPS')),
  tx_hash       text unique,
  network       text default 'BSC',
  wallet_address text,
  status        text not null default 'pending' check (status in ('pending','confirmed','failed','cancelled')),
  description   text,
  confirmations integer default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists on_transactions_updated on public.transactions;
create trigger on_transactions_updated
  before update on public.transactions
  for each row execute procedure public.handle_updated_at();

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_created_at_idx on public.transactions(created_at desc);

-- 4. Row Level Security
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;

-- Profiles: users can read all profiles (for leaderboard), only update their own
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Transactions: users can only read their own
create policy "transactions_select_own" on public.transactions for select using (auth.uid() = user_id);
-- Server-side service role bypasses RLS — no insert policy needed for client

-- 5. Grant access
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.transactions to authenticated;
