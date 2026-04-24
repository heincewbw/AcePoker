import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { supabase } from '../config/supabase';
import { logChipChange } from '../utils/chipLedger';

const router = Router();

// POST /api/auth/register
router.post(
  '/register',
  [
    body('username').trim().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password } = req.body;

    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (existingProfile) {
        return res.status(409).json({ message: 'Username already taken' });
      }

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          return res.status(409).json({ message: 'Email already in use' });
        }
        return res.status(400).json({ message: error.message });
      }

      const user = data.user!;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      // ── AUDIT: log the welcome-bonus chips as the user's initial1 baseline ──
      // Rolling 3-level baseline: initial1 is the active baseline.
      // On each withdraw the baselines rotate (initial3 ← initial2 ← initial1).
      if (profile && profile.chips > 0) {
        await logChipChange({
          userId:       user.id,
          username:     profile.username,
          event:        'initial1',
          amount:       profile.chips,
          balanceAfter: profile.chips,
          detail:       `Welcome bonus: ${profile.chips} chips on account creation`,
        });
      }

      const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        return res.status(500).json({ message: 'Registration succeeded but login failed' });
      }

      return res.status(201).json({
        token: session.session!.access_token,
        user: formatProfile(user.email!, profile),
      });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ message: 'Registration failed' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      await supabase
        .from('profiles')
        .update({ is_online: true })
        .eq('id', data.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      return res.json({
        token: data.session!.access_token,
        user: formatProfile(data.user.email!, profile),
      });
    } catch {
      return res.status(500).json({ message: 'Login failed' });
    }
  }
);

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ message: 'Invalid token' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    return res.json(formatProfile(data.user.email!, profile));
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user) {
      await supabase.from('profiles').update({ is_online: false }).eq('id', data.user.id);
    }
  }
  return res.json({ success: true });
});

function formatProfile(email: string, profile: Record<string, unknown> | null) {
  return {
    id: profile?.id,
    username: profile?.username,
    email,
    avatar: profile?.avatar ?? 'default',
    chips: profile?.chips ?? 10000,
    usdtBalance: profile?.usdt_balance ?? 0,
    walletAddress: profile?.wallet_address ?? null,
    level: profile?.level ?? 1,
    totalWins: profile?.total_wins ?? 0,
    totalGames: profile?.total_games ?? 0,
  };
}

export default router;
