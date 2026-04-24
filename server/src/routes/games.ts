import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = Router();
router.use(authenticate);

/**
 * GET /api/games/history
 * Returns paginated list of games the authenticated user participated in.
 * Query: limit (default 20, max 50), page (default 1)
 */
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const page  = Math.max(parseInt(req.query.page  as string) || 1,  1);

    const { data, error, count } = await supabase
      .from('games')
      .select('id, table_id, round_number, small_blind, big_blind, pot, player_ids, winner_ids, winners_json, community_cards, action_history, started_at, ended_at', { count: 'exact' })
      .contains('player_ids', [req.user!.id])
      .order('ended_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    // Annotate each game: did this user win?
    const userId = req.user!.id;
    const annotated = (data ?? []).map(g => ({
      ...g,
      iWon:    g.winner_ids?.includes(userId) ?? false,
      myWin:   (g.winners_json ?? []).find((w: { userId: string; amount: number }) => w.userId === userId)?.amount ?? 0,
      players: g.player_ids?.length ?? 0,
    }));

    return res.json({ rows: annotated, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('history error:', err);
    return res.status(500).json({ message: 'Failed to fetch game history' });
  }
});

export default router;
