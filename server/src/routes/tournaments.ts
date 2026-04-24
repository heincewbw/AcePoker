import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { logChipChange } from '../utils/chipLedger';

const router = Router();

/**
 * GET /api/tournaments
 * List upcoming + running tournaments (last 48h or future).
 */
router.get('/', async (_req, res: Response) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .gte('scheduled_at', since)
    .lte('scheduled_at', until)
    .in('status', ['scheduled', 'running', 'finished'])
    .order('scheduled_at', { ascending: true });

  if (error) return res.status(500).json({ message: error.message });

  // attach registration counts
  const ids = (data ?? []).map((t: any) => t.id);
  if (ids.length === 0) return res.json([]);

  const { data: regs } = await supabase
    .from('tournament_registrations')
    .select('tournament_id, user_id')
    .in('tournament_id', ids);

  const countByTid = new Map<string, number>();
  for (const r of regs ?? []) {
    countByTid.set(r.tournament_id, (countByTid.get(r.tournament_id) ?? 0) + 1);
  }

  return res.json(
    (data ?? []).map((t: any) => ({
      ...t,
      registered_count: countByTid.get(t.id) ?? 0,
    }))
  );
});

/**
 * GET /api/tournaments/:id/registrations
 * List players registered for a tournament.
 */
router.get('/:id/registrations', async (req, res: Response) => {
  const { data, error } = await supabase
    .from('tournament_registrations')
    .select('user_id, username, finish_position, prize, created_at')
    .eq('tournament_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ message: error.message });
  return res.json(data ?? []);
});

/**
 * GET /api/tournaments/mine
 * List current user's tournament registrations (upcoming).
 */
router.get('/mine/list', authenticate, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('tournament_registrations')
    .select('tournament_id, finish_position, prize, created_at, tournaments!inner(*)')
    .eq('user_id', req.user!.id);

  if (error) return res.status(500).json({ message: error.message });
  return res.json(data ?? []);
});

/**
 * POST /api/tournaments/:id/register
 * Deducts buy-in chips and creates registration row.
 */
router.post('/:id/register', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tournamentId = req.params.id;

  const { data: t, error: tErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();
  if (tErr || !t) return res.status(404).json({ message: 'Tournament not found' });
  if (t.status !== 'scheduled') return res.status(400).json({ message: 'Registration closed' });

  // Check cap
  const { count } = await supabase
    .from('tournament_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  if ((count ?? 0) >= t.max_players) {
    return res.status(400).json({ message: 'Tournament is full' });
  }

  // Already registered?
  const { data: existing } = await supabase
    .from('tournament_registrations')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return res.status(400).json({ message: 'Already registered' });

  // Deduct buy-in
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, chips')
    .eq('id', userId)
    .single();
  if (!profile) return res.status(404).json({ message: 'Profile not found' });
  if (profile.chips < t.buy_in) {
    return res.status(400).json({ message: 'Insufficient chips' });
  }

  const newBalance = profile.chips - t.buy_in;
  await supabase.from('profiles').update({ chips: newBalance }).eq('id', userId);
  await logChipChange({
    userId,
    username: profile.username,
    event: 'buyin',
    amount: -t.buy_in,
    balanceAfter: newBalance,
    detail: `Tournament registration "${t.name}"`,
  });

  await supabase.from('tournament_registrations').insert({
    tournament_id: tournamentId,
    user_id: userId,
    username: profile.username,
  });

  return res.json({ success: true, balance: newBalance });
});

/**
 * POST /api/tournaments/:id/unregister
 * Only allowed before start — refunds buy-in.
 */
router.post('/:id/unregister', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const tournamentId = req.params.id;

  const { data: t } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();
  if (!t) return res.status(404).json({ message: 'Tournament not found' });
  if (t.status !== 'scheduled') {
    return res.status(400).json({ message: 'Too late to unregister' });
  }

  const { data: reg } = await supabase
    .from('tournament_registrations')
    .select('id, username')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!reg) return res.status(400).json({ message: 'Not registered' });

  // Refund
  const { data: profile } = await supabase
    .from('profiles')
    .select('chips, username')
    .eq('id', userId)
    .single();
  if (profile) {
    const newBalance = profile.chips + t.buy_in;
    await supabase.from('profiles').update({ chips: newBalance }).eq('id', userId);
    await logChipChange({
      userId,
      username: profile.username,
      event: 'refund',
      amount: t.buy_in,
      balanceAfter: newBalance,
      detail: `Tournament unregister "${t.name}"`,
    });
  }

  await supabase.from('tournament_registrations').delete().eq('id', reg.id);
  return res.json({ success: true });
});

export default router;
