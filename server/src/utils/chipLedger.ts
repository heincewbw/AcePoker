import { supabase } from '../config/supabase';

export type ChipEvent =
  | 'initial1'
  | 'initial2'
  | 'initial3'
  | 'buyin'
  | 'win'
  | 'lose'
  | 'refund'
  | 'disconnect_refund'
  | 'pot_returned'
  | 'deposit'
  | 'convert'
  | 'withdraw'
  | 'admin_adjust';

/**
 * Log a chip balance change to the audit ledger.
 * Never throws — failures are logged to console only so they don't
 * interrupt game flow.
 *
 * CRITICAL: every chip mutation in the app MUST call this. The withdrawal
 * validator replays these rows to verify balance integrity.
 */
export async function logChipChange(opts: {
  userId: string;
  username: string;
  event: ChipEvent;
  amount: number;          // positive = gained, negative = spent
  balanceAfter: number;
  tableId?: string;
  gameId?: string;         // PokerGame state.id (uuid) — ties row to a specific hand
  roundNumber?: number;
  detail?: string;
}): Promise<void> {
  try {
    await supabase.from('chip_ledger').insert({
      user_id:       opts.userId,
      username:      opts.username,
      event:         opts.event,
      amount:        opts.amount,
      balance_after: opts.balanceAfter,
      table_id:      opts.tableId ?? null,
      game_id:       opts.gameId ?? null,
      round_number:  opts.roundNumber ?? null,
      detail:        opts.detail ?? null,
    });
  } catch (err) {
    console.error('[chipLedger] Failed to write audit row:', err);
  }
}

