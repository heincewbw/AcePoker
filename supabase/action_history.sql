-- =============================================================
-- ADD hand action history to games table
-- Run once in Supabase SQL Editor.
-- =============================================================

alter table games
  add column if not exists action_history jsonb not null default '[]'::jsonb;
