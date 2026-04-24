import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = Router();
router.use(authenticate);

// GET /api/users/profile
router.get('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user!.id)
      .single();

    if (error || !data) return res.status(404).json({ message: 'User not found' });
    return res.json(data);
  } catch {
    return res.status(500).json({ message: 'Failed to get profile' });
  }
});

// GET /api/users/leaderboard
router.get('/leaderboard', async (_req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar, chips, level, total_wins, total_games')
      .order('chips', { ascending: false })
      .limit(100);

    if (error) throw error;
    return res.json(data ?? []);
  } catch {
    return res.status(500).json({ message: 'Failed to get leaderboard' });
  }
});

// PATCH /api/users/wallet-address
router.patch('/wallet-address', async (req: AuthRequest, res: Response) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ message: 'Invalid wallet address' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ wallet_address: walletAddress })
      .eq('id', req.user!.id);

    if (error) throw error;
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: 'Failed to update wallet' });
  }
});

export default router;
