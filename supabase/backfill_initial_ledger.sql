-- ============================================================
--  AcePoker – Backfill initial1 baseline for existing users
--  Run this ONCE after games_and_withdrawals.sql
--
--  Rolling 3-level baseline system:
--    initial1 = active baseline (audit starts here)
--    initial2 = previous baseline (kept for historical trace)
--    initial3 = oldest baseline (kept for historical trace)
--
--  On every withdraw the baselines rotate:
--    initial3 ← initial2, initial2 ← initial1, initial1 ← new balance
--
--  This script seeds initial1 = current chips for every user that
--  has chips but no baseline row yet.
-- ============================================================

-- Ensure only ONE row per baseline event per user
create unique index if not exists chip_ledger_user_baseline_uniq
  on chip_ledger (user_id, event)
  where event in ('initial1', 'initial2', 'initial3');

-- Seed initial1 for existing users
insert into chip_ledger (user_id, username, event, amount, balance_after, detail, created_at)
select
  p.id,
  p.username,
  'initial1',
  p.chips,
  p.chips,
  'Backfilled initial1 baseline (pre-audit-system)',
  now()
from profiles p
where p.chips > 0
  and not exists (
    select 1 from chip_ledger l
    where l.user_id = p.id
      and l.event in ('initial1', 'initial2', 'initial3')
  );

-- Verification query (run manually to confirm zero drift after backfill):
-- select
--   p.id, p.username, p.chips as profile_chips,
--   coalesce((
--     select amount from chip_ledger
--     where user_id = p.id and event = 'initial1'
--   ), 0) as initial1_amount,
--   coalesce((
--     select sum(amount) from chip_ledger l
--     where l.user_id = p.id
--       and l.created_at > coalesce(
--         (select created_at from chip_ledger
--          where user_id = p.id and event = 'initial1'),
--         '1970-01-01'::timestamptz
--       )
--   ), 0) as post_baseline_sum
-- from profiles p
-- where p.chips > 0;
