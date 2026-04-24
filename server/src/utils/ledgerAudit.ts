import { supabase } from '../config/supabase';

export interface BaselineSnapshot {
  event: 'initial1' | 'initial2' | 'initial3';
  amount: number;
  createdAt: string;
  detail: string | null;
}

export interface AuditReport {
  userId: string;
  currentBalance:      number;
  baselineAmount:      number;   // initial1.amount (active baseline)
  baselineCreatedAt:   string | null;
  postBaselineSum:     number;   // sum of all ledger rows after initial1
  computedBalance:     number;   // baselineAmount + postBaselineSum
  drift:               number;   // currentBalance - computedBalance (should be 0)

  // Historical baselines (for deeper trace)
  baselineHistory:     BaselineSnapshot[]; // [initial1, initial2, initial3]

  // Per-event tallies (post-baseline only)
  totalDeposit:        number;
  totalConvert:        number;
  totalWin:            number;
  totalRefund:         number;
  totalBuyin:          number;   // negative
  totalWithdrawn:      number;   // negative

  suspiciousRows: Array<{
    id: number;
    event: string;
    amount: number;
    reason: string;
  }>;
  unknownWins: Array<{
    id: number;
    amount: number;
    gameId: string | null;
    reason: string;
  }>;
  passed: boolean;
  reasons: string[];
}

/**
 * Audit a user's chip ledger using the rolling 3-level baseline system.
 *
 *   initial1 = active baseline (starting point for audit)
 *   initial2 = previous baseline (kept for historical reference)
 *   initial3 = older baseline (kept for historical reference)
 *
 * Audit formula:
 *   expected = initial1.amount + SUM(ledger rows created AFTER initial1)
 *   must equal profiles.chips
 *
 * Returns { passed: true } if:
 *   1. An initial1 baseline exists
 *   2. currentBalance === initial1.amount + sum(post-baseline rows)   (no drift)
 *   3. Every 'win' row after baseline has a game_id in `games` where user is winner
 *   4. No suspicious rows, no negative balance
 */
export async function auditUserLedger(userId: string): Promise<AuditReport> {
  const report: AuditReport = {
    userId,
    currentBalance:     0,
    baselineAmount:     0,
    baselineCreatedAt:  null,
    postBaselineSum:    0,
    computedBalance:    0,
    drift:              0,
    baselineHistory:    [],
    totalDeposit:       0,
    totalConvert:       0,
    totalWin:           0,
    totalRefund:        0,
    totalBuyin:         0,
    totalWithdrawn:     0,
    suspiciousRows:     [],
    unknownWins:        [],
    passed:             true,
    reasons:            [],
  };

  // 1. Current balance from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('chips')
    .eq('id', userId)
    .single();
  if (!profile) {
    report.passed = false;
    report.reasons.push('Profile not found');
    return report;
  }
  report.currentBalance = profile.chips;

  // 2. Load the 3 baselines
  const { data: baselines } = await supabase
    .from('chip_ledger')
    .select('event, amount, created_at, detail')
    .eq('user_id', userId)
    .in('event', ['initial1', 'initial2', 'initial3'])
    .order('created_at', { ascending: false });

  for (const b of baselines ?? []) {
    report.baselineHistory.push({
      event:     b.event as BaselineSnapshot['event'],
      amount:    b.amount,
      createdAt: b.created_at,
      detail:    b.detail,
    });
  }

  const initial1 = (baselines ?? []).find(b => b.event === 'initial1');
  if (!initial1) {
    report.passed = false;
    report.reasons.push(
      `No initial1 baseline found. User has ${profile.chips} chips but no traceable source. Run backfill migration.`
    );
    return report;
  }

  report.baselineAmount    = initial1.amount;
  report.baselineCreatedAt = initial1.created_at;

  // 3. Load all ledger rows AFTER the initial1 timestamp
  const { data: postRows } = await supabase
    .from('chip_ledger')
    .select('id, event, amount, game_id, table_id, round_number, balance_after, created_at')
    .eq('user_id', userId)
    .gt('created_at', initial1.created_at)
    .order('created_at', { ascending: true });

  // 4. Sum and categorize post-baseline rows
  for (const r of postRows ?? []) {
    report.postBaselineSum += r.amount;

    switch (r.event) {
      case 'deposit':           report.totalDeposit   += r.amount; break;
      case 'convert':           report.totalConvert   += r.amount; break;
      case 'win':               report.totalWin       += r.amount; break;
      case 'refund':
      case 'disconnect_refund':
      case 'pot_returned':      report.totalRefund    += r.amount; break;
      case 'buyin':             report.totalBuyin     += r.amount; break;
      case 'withdraw':          report.totalWithdrawn += r.amount; break;
    }

    if (typeof r.amount !== 'number' || Number.isNaN(r.amount)) {
      report.suspiciousRows.push({
        id: r.id, event: r.event, amount: r.amount,
        reason: 'Invalid amount',
      });
    }
  }

  report.computedBalance = report.baselineAmount + report.postBaselineSum;
  report.drift           = report.currentBalance - report.computedBalance;

  // 5. Verify each 'win' row against games table
  const winRows = (postRows ?? []).filter(r => r.event === 'win' && r.amount > 0);
  const gameIds = [...new Set(winRows.map(r => r.game_id).filter(Boolean))] as string[];

  if (gameIds.length > 0) {
    const { data: games } = await supabase
      .from('games')
      .select('id, winner_ids, winners_json')
      .in('id', gameIds);

    const gameMap = new Map((games ?? []).map(g => [g.id, g]));

    for (const w of winRows) {
      if (!w.game_id) {
        report.unknownWins.push({
          id: w.id, amount: w.amount, gameId: null,
          reason: 'Win event has no game_id',
        });
        continue;
      }
      const g = gameMap.get(w.game_id);
      if (!g) {
        report.unknownWins.push({
          id: w.id, amount: w.amount, gameId: w.game_id,
          reason: 'game_id does not exist in games table',
        });
        continue;
      }
      if (!g.winner_ids?.includes(userId)) {
        report.unknownWins.push({
          id: w.id, amount: w.amount, gameId: w.game_id,
          reason: 'User not listed as winner in games.winner_ids',
        });
        continue;
      }
      const winnerEntry = (g.winners_json ?? []).find(
        (x: { userId: string }) => x.userId === userId
      );
      if (winnerEntry && winnerEntry.amount !== w.amount) {
        report.unknownWins.push({
          id: w.id, amount: w.amount, gameId: w.game_id,
          reason: `Ledger amount ${w.amount} != game win amount ${winnerEntry.amount}`,
        });
      }
    }
  }

  // 6. Verdict
  if (Math.abs(report.drift) > 0) {
    report.passed = false;
    report.reasons.push(
      `Balance drift: profile=${report.currentBalance}, computed (initial1=${report.baselineAmount} + post=${report.postBaselineSum})=${report.computedBalance}, diff=${report.drift}`
    );
  }
  if (report.unknownWins.length > 0) {
    report.passed = false;
    report.reasons.push(
      `${report.unknownWins.length} win event(s) cannot be verified against games table`
    );
  }
  if (report.suspiciousRows.length > 0) {
    report.passed = false;
    report.reasons.push(`${report.suspiciousRows.length} suspicious ledger row(s)`);
  }
  if (report.currentBalance < 0) {
    report.passed = false;
    report.reasons.push('Negative balance');
  }

  return report;
}
