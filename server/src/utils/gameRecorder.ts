import { supabase } from '../config/supabase';
import type { GameState } from '../game/PokerGame';

/**
 * Persist a completed game to the `games` table so every hand has a
 * permanent, immutable audit record.  Called from onGameEnd.
 *
 * Never throws — failures are logged only.
 */
export async function recordGame(state: GameState, startedAt?: Date): Promise<void> {
  try {
    const winnerIds  = (state.winners ?? []).map(w => {
      const p = state.players.find(pp => pp.id === w.playerId);
      return p?.userId;
    }).filter(Boolean) as string[];

    const playerIds  = state.players.map(p => p.userId);

    const winnersJson = (state.winners ?? []).map(w => {
      const p = state.players.find(pp => pp.id === w.playerId);
      return {
        playerId: w.playerId,
        userId:   p?.userId,
        username: p?.username,
        amount:   w.amount,
        hand:     w.hand ?? null,
      };
    });

    const { error } = await supabase.from('games').insert({
      id:              state.id,
      table_id:        state.tableId,
      round_number:    state.roundNumber,
      small_blind:     state.smallBlind,
      big_blind:       state.bigBlind,
      pot:             state.pot,
      player_ids:      playerIds,
      winner_ids:      winnerIds,
      winners_json:    winnersJson,
      community_cards: state.communityCards,
      started_at:      startedAt?.toISOString() ?? null,
    });
    if (error) {
      console.error('[gameRecorder] Supabase insert error:', error.message, error.code);
    } else {
      console.log(`[gameRecorder] Game recorded: ${state.id}`);
    }
  } catch (err) {
    console.error('[gameRecorder] Failed to persist game:', err);
  }
}
