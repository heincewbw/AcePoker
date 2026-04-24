import { supabase } from '../config/supabase';
import { logChipChange } from './chipLedger';

/**
 * Rolling 3-level baseline system for chip ledger audit.
 *
 *   initial1  ← most recent baseline (active; audit starts here)
 *   initial2  ← previous baseline
 *   initial3  ← oldest baseline still retained
 *
 * Invariants:
 *   - Only ONE row per event type per user (unique constraint enforced in SQL).
 *   - Audit sums chip_ledger.amount from initial1's created_at forward.
 *   - On new user:       write initial1 = welcome chips.
 *   - On each withdraw:  rotate (shift all down by one, drop oldest,
 *                        write fresh initial1 = current balance).
 */

/**
 * Rotate baselines: initial3 ← initial2, initial2 ← initial1,
 * initial1 ← newBalance (= profile.chips AFTER the withdraw deduction).
 */
export async function rotateBaseline(opts: {
  userId: string;
  username: string;
  newBalance: number;    // user's chips AFTER the withdraw deduction
}): Promise<void> {
  try {
    const { userId, username, newBalance } = opts;

    // 1. Load current baselines
    const { data: existing } = await supabase
      .from('chip_ledger')
      .select('id, event, amount, created_at, detail')
      .eq('user_id', userId)
      .in('event', ['initial1', 'initial2', 'initial3']);

    const byEvent = Object.fromEntries(
      (existing ?? []).map(r => [r.event, r])
    ) as Record<string, { id: number; amount: number; detail: string | null } | undefined>;

    // 2. Drop oldest (initial3)
    if (byEvent.initial3) {
      await supabase.from('chip_ledger').delete().eq('id', byEvent.initial3.id);
    }

    // 3. Rename initial2 → initial3
    if (byEvent.initial2) {
      await supabase
        .from('chip_ledger')
        .update({ event: 'initial3' })
        .eq('id', byEvent.initial2.id);
    }

    // 4. Rename initial1 → initial2
    if (byEvent.initial1) {
      await supabase
        .from('chip_ledger')
        .update({ event: 'initial2' })
        .eq('id', byEvent.initial1.id);
    }

    // 5. Insert fresh initial1 = newBalance
    await logChipChange({
      userId,
      username,
      event:        'initial1',
      amount:       newBalance,
      balanceAfter: newBalance,
      detail:       `Baseline reset after withdraw. initial1 = ${newBalance}`,
    });
  } catch (err) {
    console.error('[baseline] Failed to rotate baseline:', err);
  }
}
