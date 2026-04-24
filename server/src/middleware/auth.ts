import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthRequest extends Request {
  user?: { id: string; username: string };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.status(401).json({ message: 'No token provided' });
      return;
    }

    // Verify JWT issued by Supabase Auth
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      res.status(401).json({ message: 'User profile not found' });
      return;
    }

    req.user = { id: profile.id, username: profile.username };
    next();
  } catch {
    res.status(401).json({ message: 'Authentication failed' });
  }
}

