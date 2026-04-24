import { Server } from 'socket.io';
import { supabase } from '../config/supabase';
import { tableManager } from '../socket/tableManager';
import { GameState } from './PokerGame';
import { logChipChange } from '../utils/chipLedger';

/**
 * TOURNAMENT MANAGER
 *
 * Auto-schedules 3 tournaments/day with buy-ins 1,000 / 10,000 / 20,000 chips
 * (mapped to $1 / $10 / $20 display).  Each tournament uses a dedicated table
 * created via tableManager; play reuses the existing PokerGame engine with a
 * blind timer that levels-up every 5 minutes.
 *
 * MVP scope:
 *   - single-table tournaments capped at 9 seats
 *   - standard MTT payout: 50/30/20 for top 3 if ≥3 players else winner-takes-all
 *   - registration closes when the tournament starts (no late reg / rebuy)
 *   - if <2 players have registered at start time, the tournament is cancelled
 *     and buy-ins are refunded
 */

// ── SCHEDULE CONFIG (UTC hours) ─────────────────────────────────────────────
const DAILY_TOURNAMENT_SLOTS: Array<{ hour: number; minute: number; buyIn: number; label: string }> = [
  { hour: 10, minute: 0, buyIn: 1_000,  label: '$1 Daily'  },
  { hour: 18, minute: 0, buyIn: 10_000, label: '$10 Daily' },
  { hour: 22, minute: 0, buyIn: 20_000, label: '$20 Daily' },
];

const STARTING_STACK = 10_000;
const TOURNAMENT_MAX_SEATS = 9;
const BLIND_LEVEL_SECONDS = 5 * 60; // 5 minutes
const BLIND_STRUCTURE: Array<{ sb: number; bb: number }> = [
  { sb: 25,   bb: 50    },
  { sb: 50,   bb: 100   },
  { sb: 75,   bb: 150   },
  { sb: 100,  bb: 200   },
  { sb: 150,  bb: 300   },
  { sb: 200,  bb: 400   },
  { sb: 300,  bb: 600   },
  { sb: 500,  bb: 1000  },
  { sb: 1000, bb: 2000  },
  { sb: 2000, bb: 4000  },
  { sb: 4000, bb: 8000  },
  { sb: 8000, bb: 16000 },
];

interface ActiveTournament {
  id: string;
  name: string;
  buyIn: number;
  tableId: string;
  blindLevel: number;
  blindTimer: NodeJS.Timeout;
  eliminationOrder: Array<{ userId: string; username: string; position: number }>;
}

class TournamentManager {
  private io: Server | null = null;
  private active = new Map<string, ActiveTournament>();     // tournamentId → state
  private userToTournament = new Map<string, string>();      // userId → tournamentId (for join bypass)
  private tableToTournament = new Map<string, string>();     // tableId → tournamentId

  init(io: Server): void {
    this.io = io;
    // Ensure schedule populated & check for due tournaments every minute
    this.ensureSchedule().catch(console.error);
    setInterval(() => this.tick().catch(console.error), 60 * 1000);
    console.log('🏆 TournamentManager initialised');
  }

  /**
   * Create tournament rows for today & tomorrow (idempotent via unique slot).
   */
  private async ensureSchedule(): Promise<void> {
    const now = new Date();
    const days = [0, 1]; // today + tomorrow

    for (const d of days) {
      const base = new Date(now);
      base.setUTCDate(base.getUTCDate() + d);

      for (const slot of DAILY_TOURNAMENT_SLOTS) {
        const scheduled = new Date(base);
        scheduled.setUTCHours(slot.hour, slot.minute, 0, 0);
        if (scheduled.getTime() < now.getTime() - 5 * 60 * 1000) continue; // skip old

        // Check if already exists at this exact time
        const { data: existing } = await supabase
          .from('tournaments')
          .select('id')
          .eq('scheduled_at', scheduled.toISOString())
          .eq('buy_in', slot.buyIn)
          .maybeSingle();
        if (existing) continue;

        await supabase.from('tournaments').insert({
          name: slot.label,
          buy_in: slot.buyIn,
          scheduled_at: scheduled.toISOString(),
          starting_stack: STARTING_STACK,
          max_players: TOURNAMENT_MAX_SEATS,
          status: 'scheduled',
          prize_pool: 0,
        });
      }
    }
  }

  private async tick(): Promise<void> {
    await this.ensureSchedule();

    const now = new Date().toISOString();

    // Start tournaments that are past their scheduled time
    const { data: due } = await supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now);

    if (due) {
      for (const t of due) {
        await this.startTournament(t).catch(err => console.error('startTournament error:', err));
      }
    }
  }

  private async startTournament(t: any): Promise<void> {
    // Fetch registrations
    const { data: regs } = await supabase
      .from('tournament_registrations')
      .select('user_id, username')
      .eq('tournament_id', t.id);

    const registrations = regs ?? [];

    if (registrations.length < 2) {
      // Cancel & refund anyone registered
      await this.cancelTournament(t.id, 'Not enough players');
      return;
    }

    // Cap at max seats (first-come-first-served by registration order)
    const seated = registrations.slice(0, TOURNAMENT_MAX_SEATS);
    const waitlist = registrations.slice(TOURNAMENT_MAX_SEATS);

    // Refund waitlisted players
    for (const w of waitlist) {
      await this.refundBuyIn(t.id, w.user_id, w.username, t.buy_in);
    }

    // Create the tournament table
    const firstLevel = BLIND_STRUCTURE[0];
    const tableInfo = tableManager.createTable({
      name: `🏆 ${t.name}`,
      smallBlind: firstLevel.sb,
      bigBlind: firstLevel.bb,
      maxPlayers: TOURNAMENT_MAX_SEATS,
      minBuyIn: t.starting_stack,
      maxBuyIn: t.starting_stack,
      createdBy: 'tournament',
    }, { isTournament: true, tournamentId: t.id });

    // Track registered users for join bypass in socketHandler
    for (const r of seated) {
      this.userToTournament.set(r.user_id, t.id);
    }
    this.tableToTournament.set(tableInfo.id, t.id);

    // Update DB
    const prizePool = t.buy_in * seated.length;
    await supabase
      .from('tournaments')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        table_id: tableInfo.id,
        prize_pool: prizePool,
      })
      .eq('id', t.id);

    // Start blind timer
    const activeT: ActiveTournament = {
      id: t.id,
      name: t.name,
      buyIn: t.buy_in,
      tableId: tableInfo.id,
      blindLevel: 0,
      blindTimer: setInterval(() => this.incrementBlindLevel(t.id), BLIND_LEVEL_SECONDS * 1000),
      eliminationOrder: [],
    };
    this.active.set(t.id, activeT);

    // Hook game events
    const game = tableManager.getGame(tableInfo.id)!;
    game.addGameEndListener((state: GameState) => {
      this.handleHandEnd(t.id, state);
    });

    // Notify registered users — clients should navigate to the tournament table
    for (const r of seated) {
      this.io?.to(`user:${r.user_id}`).emit('tournament:starting', {
        tournamentId: t.id,
        tableId: tableInfo.id,
        name: t.name,
        prizePool,
      });
    }

    console.log(`🏆 Tournament "${t.name}" started with ${seated.length} players, prize pool ${prizePool}`);
  }

  private async incrementBlindLevel(tournamentId: string): Promise<void> {
    const t = this.active.get(tournamentId);
    if (!t) return;

    const nextLevel = t.blindLevel + 1;
    if (nextLevel >= BLIND_STRUCTURE.length) return;
    t.blindLevel = nextLevel;

    const { sb, bb } = BLIND_STRUCTURE[nextLevel];
    const game = tableManager.getGame(t.tableId);
    if (!game) return;

    game.setBlinds(sb, bb);
    this.io?.to(t.tableId).emit('tournament:blind_up', {
      tournamentId,
      level: nextLevel + 1,
      smallBlind: sb,
      bigBlind: bb,
    });
    console.log(`🏆 [${t.name}] Blinds → ${sb}/${bb} (level ${nextLevel + 1})`);
  }

  /**
   * Called after every hand finishes.  Tracks eliminations and ends the
   * tournament when only 1 player remains with chips.
   */
  private async handleHandEnd(tournamentId: string, state: GameState): Promise<void> {
    const t = this.active.get(tournamentId);
    if (!t) return;

    const eliminatedThisHand = state.players.filter(
      (p) =>
        p.chips === 0 &&
        !t.eliminationOrder.find(e => e.userId === p.userId)
    );

    // Give them a finish position.  Position = (total_remaining_after_this + 1)
    // so earliest eliminated = highest number (worst finish).
    const totalPlayers = state.players.length;
    for (const elim of eliminatedThisHand) {
      const position = totalPlayers - t.eliminationOrder.length;
      t.eliminationOrder.push({
        userId: elim.userId,
        username: elim.username,
        position,
      });
      this.io?.to(t.tableId).emit('tournament:eliminated', {
        tournamentId,
        userId: elim.userId,
        username: elim.username,
        position,
      });
    }

    const remaining = state.players.filter(p => p.chips > 0);
    if (remaining.length <= 1) {
      await this.finishTournament(tournamentId, remaining[0]);
    }
  }

  private async finishTournament(tournamentId: string, winner?: { userId: string; username: string }): Promise<void> {
    const t = this.active.get(tournamentId);
    if (!t) return;

    clearInterval(t.blindTimer);

    // Fetch tournament
    const { data: tour } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();
    if (!tour) return;

    // Build full finish order: winner (position 1), then eliminationOrder (reverse so lowest index = 2nd place)
    const finishers: Array<{ userId: string; username: string; position: number; prize: number }> = [];
    if (winner) {
      finishers.push({ userId: winner.userId, username: winner.username, position: 1, prize: 0 });
    }
    // eliminationOrder has the LAST eliminated first in terms of position number,
    // actually eliminationOrder[0] has position = totalPlayers, eliminationOrder[last] has position = 2
    // So reverse traversal gives ascending position after winner.
    const eliminationByPosition = [...t.eliminationOrder].sort((a, b) => a.position - b.position);
    for (const e of eliminationByPosition) {
      finishers.push({ userId: e.userId, username: e.username, position: e.position, prize: 0 });
    }

    // Payout: 50/30/20 for top 3 if enough players; else winner-takes-all
    const prizePool = tour.prize_pool;
    if (finishers.length >= 3) {
      finishers[0].prize = Math.floor(prizePool * 0.5);
      finishers[1].prize = Math.floor(prizePool * 0.3);
      finishers[2].prize = prizePool - finishers[0].prize - finishers[1].prize;
    } else if (finishers.length >= 1) {
      finishers[0].prize = prizePool;
    }

    // Credit prizes + update registrations
    for (const f of finishers) {
      if (f.prize > 0) {
        const { data: p } = await supabase
          .from('profiles')
          .select('chips')
          .eq('id', f.userId)
          .single();
        if (p) {
          const newBalance = p.chips + f.prize;
          await supabase.from('profiles').update({ chips: newBalance }).eq('id', f.userId);
          await logChipChange({
            userId: f.userId,
            username: f.username,
            event: 'win',
            amount: f.prize,
            balanceAfter: newBalance,
            detail: `Tournament "${tour.name}" — ${f.position === 1 ? '1st' : f.position === 2 ? '2nd' : '3rd'} place prize`,
          });
        }
      }
      await supabase
        .from('tournament_registrations')
        .update({ finish_position: f.position, prize: f.prize })
        .eq('tournament_id', tournamentId)
        .eq('user_id', f.userId);
    }

    await supabase
      .from('tournaments')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString(),
        winners: finishers,
      })
      .eq('id', tournamentId);

    this.io?.to(t.tableId).emit('tournament:finished', {
      tournamentId,
      winners: finishers,
      prizePool,
    });

    // Cleanup mappings — the table will be closed when everyone leaves
    for (const [userId, tid] of this.userToTournament.entries()) {
      if (tid === tournamentId) this.userToTournament.delete(userId);
    }
    this.tableToTournament.delete(t.tableId);
    this.active.delete(tournamentId);

    console.log(`🏆 Tournament "${tour.name}" finished. Winner: ${winner?.username ?? 'none'} (+${finishers[0]?.prize ?? 0})`);
  }

  private async cancelTournament(tournamentId: string, reason: string): Promise<void> {
    const { data: tour } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();
    if (!tour) return;

    const { data: regs } = await supabase
      .from('tournament_registrations')
      .select('user_id, username')
      .eq('tournament_id', tournamentId);

    for (const r of regs ?? []) {
      await this.refundBuyIn(tournamentId, r.user_id, r.username, tour.buy_in);
    }

    await supabase
      .from('tournaments')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', tournamentId);

    console.log(`🏆 Tournament "${tour.name}" cancelled: ${reason}`);
  }

  private async refundBuyIn(tournamentId: string, userId: string, username: string, buyIn: number): Promise<void> {
    const { data: p } = await supabase
      .from('profiles')
      .select('chips')
      .eq('id', userId)
      .single();
    if (!p) return;
    const newBalance = p.chips + buyIn;
    await supabase.from('profiles').update({ chips: newBalance }).eq('id', userId);
    await logChipChange({
      userId,
      username,
      event: 'refund',
      amount: buyIn,
      balanceAfter: newBalance,
      detail: `Tournament buy-in refunded`,
    });
    this.io?.to(`user:${userId}`).emit('tournament:cancelled', { tournamentId });
  }

  // ── PUBLIC HELPERS USED BY SOCKETHANDLER ──────────────────────────────────

  /** Is this table a tournament table? */
  isTournamentTable(tableId: string): boolean {
    return this.tableToTournament.has(tableId);
  }

  /** Get tournament id for a registered user (if they have one running) */
  getUserTournamentId(userId: string): string | undefined {
    return this.userToTournament.get(userId);
  }

  /** Called after player is added to tournament table — no buy-in deduction needed */
  getStartingStack(): number {
    return STARTING_STACK;
  }
}

export const tournamentManager = new TournamentManager();
export { STARTING_STACK, TOURNAMENT_MAX_SEATS, DAILY_TOURNAMENT_SLOTS };
