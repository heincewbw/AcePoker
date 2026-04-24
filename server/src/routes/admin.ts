/**
 * GET /api/admin/chip-ledger
 *
 * Audit trail for chip balance changes.
 * Requires the requesting user to be an admin (email in ADMIN_EMAILS env var).
 *
 * Query params:
 *   userId   – filter by a specific user's UUID
 *   email    – filter by email (resolved to UUID via profiles)
 *   event    – filter by event type (buyin | win | lose | refund | …)
 *   tableId  – filter by table
 *   from     – ISO date start  (default: 30 days ago)
 *   to       – ISO date end    (default: now)
 *   limit    – rows per page   (default 50, max 200)
 *   page     – 1-indexed page  (default 1)
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = Router();
router.use(authenticate);

// Simple admin guard — list admin emails in ADMIN_EMAILS="a@b.com,c@d.com"
async function isAdmin(userId: string): Promise<boolean> {
  const adminList = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (adminList.length === 0) return true; // no restriction in dev

  const { data } = await supabase.auth.admin.getUserById(userId);
  return adminList.includes(data.user?.email?.toLowerCase() ?? '');
}

// GET /api/admin/chip-ledger
router.get('/chip-ledger', async (req: AuthRequest, res: Response) => {
  try {
    if (!await isAdmin(req.user!.id)) {
      return res.status(403).json({ message: 'Admin only' });
    }

    const limit  = Math.min(parseInt(req.query.limit  as string) || 50, 200);
    const page   = Math.max(parseInt(req.query.page   as string) || 1,  1);
    const from_  = req.query.from   as string | undefined;
    const to_    = req.query.to     as string | undefined;
    const event_ = req.query.event  as string | undefined;
    const tableId_ = req.query.tableId as string | undefined;
    let   userId_ = req.query.userId as string | undefined;

    // Resolve email → userId
    if (!userId_ && req.query.email) {
      const { data: authList } = await supabase.auth.admin.listUsers();
      const found = authList?.users?.find(
        u => u.email?.toLowerCase() === (req.query.email as string).toLowerCase()
      );
      if (found) userId_ = found.id;
    }

    let q = supabase
      .from('chip_ledger')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (userId_)  q = q.eq('user_id', userId_);
    if (event_)   q = q.eq('event',   event_);
    if (tableId_) q = q.eq('table_id', tableId_);
    if (from_)    q = q.gte('created_at', new Date(from_).toISOString());
    if (to_)      q = q.lte('created_at', new Date(to_).toISOString());

    const { data, error, count } = await q;
    if (error) throw error;

    return res.json({ rows: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    console.error('chip-ledger error:', err);
    return res.status(500).json({ message: 'Failed to fetch ledger' });
  }
});

// GET /api/admin/chip-ledger/summary
// Per-user summary: total won, total lost, net change
router.get('/chip-ledger/summary', async (req: AuthRequest, res: Response) => {
  try {
    if (!await isAdmin(req.user!.id)) {
      return res.status(403).json({ message: 'Admin only' });
    }

    // Aggregate from Supabase via RPC or manual grouping
    const { data, error } = await supabase
      .from('chip_ledger')
      .select('user_id, username, event, amount');

    if (error) throw error;

    const summary: Record<string, {
      userId: string; username: string;
      totalBuyin: number; totalWin: number; totalRefund: number; netChange: number;
    }> = {};

    for (const row of data ?? []) {
      if (!summary[row.user_id]) {
        summary[row.user_id] = {
          userId: row.user_id, username: row.username,
          totalBuyin: 0, totalWin: 0, totalRefund: 0, netChange: 0,
        };
      }
      const s = summary[row.user_id];
      if (row.event === 'buyin')   s.totalBuyin   += Math.abs(row.amount);
      if (row.event === 'win')     s.totalWin     += row.amount;
      if (row.event === 'refund' || row.event === 'disconnect_refund') s.totalRefund += row.amount;
      s.netChange += row.amount;
    }

    return res.json(Object.values(summary).sort((a, b) => b.netChange - a.netChange));
  } catch (err) {
    console.error('chip-ledger summary error:', err);
    return res.status(500).json({ message: 'Failed to fetch summary' });
  }
});

export default router;
