import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { UsdtService } from '../blockchain/usdtService';
import { logChipChange } from '../utils/chipLedger';

const router = Router();
router.use(authenticate);

// GET /api/wallet/balance
router.get('/balance', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('chips, usdt_balance, wallet_address')
      .eq('id', req.user!.id)
      .single();

    if (error || !data) return res.status(404).json({ message: 'User not found' });

    return res.json({
      chips: data.chips,
      usdtBalance: data.usdt_balance,
      walletAddress: data.wallet_address,
    });
  } catch {
    return res.status(500).json({ message: 'Failed to get balance' });
  }
});

// GET /api/wallet/transactions
router.get('/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.json({
      transactions: data ?? [],
      total: count ?? 0,
      page,
      pages: Math.ceil((count ?? 0) / limit),
    });
  } catch {
    return res.status(500).json({ message: 'Failed to get transactions' });
  }
});

// POST /api/wallet/deposit/initiate
router.post(
  '/deposit/initiate',
  [
    body('walletAddress').isEthereumAddress(),
    body('amount').isFloat({ min: 1 }),
    body('network').isIn(['BSC', 'ETH', 'POLYGON']).optional(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { walletAddress, amount, network = 'BSC' } = req.body;

      await supabase
        .from('profiles')
        .update({ wallet_address: walletAddress })
        .eq('id', req.user!.id);

      const platformAddress = process.env.PLATFORM_WALLET_ADDRESS;
      if (!platformAddress) {
        return res.status(500).json({ message: 'Deposit not configured' });
      }

      const usdtContractAddress = UsdtService.getContractAddress(network);

      return res.json({
        depositAddress: platformAddress,
        usdtContractAddress,
        network,
        amount,
        memo: `Deposit for user ${req.user!.id}`,
        instructions: `Send exactly ${amount} USDT to ${platformAddress} on ${network} network.`,
      });
    } catch {
      return res.status(500).json({ message: 'Failed to initiate deposit' });
    }
  }
);

// POST /api/wallet/deposit/confirm
router.post(
  '/deposit/confirm',
  [
    body('txHash').notEmpty().trim(),
    body('network').isIn(['BSC', 'ETH', 'POLYGON']).optional(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { txHash, network = 'BSC' } = req.body;

      // Check if already processed
      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('tx_hash', txHash)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ message: 'Transaction already processed' });
      }

      const usdtService = new UsdtService(network);
      const txResult = await usdtService.verifyDeposit(txHash, req.user!.id);

      if (!txResult.valid) {
        return res.status(400).json({ message: txResult.error || 'Invalid transaction' });
      }

      const chipsToAdd = txResult.amount! * 1_000_000;

      // Atomic update: increment chips and usdt_balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('chips, usdt_balance, wallet_address')
        .eq('id', req.user!.id)
        .single();

      if (profileError || !profile) return res.status(404).json({ message: 'User not found' });

      await supabase
        .from('profiles')
        .update({
          chips: profile.chips + chipsToAdd,
          usdt_balance: profile.usdt_balance + txResult.amount!,
        })
        .eq('id', req.user!.id);

      // ── AUDIT: log deposit as chip gain ──
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', req.user!.id)
        .single();
      await logChipChange({
        userId:       req.user!.id,
        username:     userProfile?.username ?? 'unknown',
        event:        'deposit',
        amount:       chipsToAdd,
        balanceAfter: profile.chips + chipsToAdd,
        detail:       `USDT deposit ${txResult.amount} USDT → ${chipsToAdd} chips (tx: ${txHash})`,
      });

      const { data: transaction } = await supabase
        .from('transactions')
        .insert({
          user_id: req.user!.id,
          type: 'deposit',
          amount: txResult.amount,
          currency: 'USDT',
          tx_hash: txHash,
          network,
          wallet_address: profile.wallet_address,
          status: 'confirmed',
          description: `USDT deposit - ${txResult.amount} USDT ? ${chipsToAdd.toLocaleString()} chips`,
          confirmations: txResult.confirmations,
        })
        .select()
        .single();

      return res.json({
        success: true,
        transaction,
        chipsAdded: chipsToAdd,
        newChipsBalance: profile.chips + chipsToAdd,
        newUsdtBalance: profile.usdt_balance + txResult.amount!,
      });
    } catch (err) {
      console.error('Deposit confirm error:', err);
      return res.status(500).json({ message: 'Failed to confirm deposit' });
    }
  }
);

// POST /api/wallet/convert (USDT to chips)
router.post(
  '/convert',
  [body('usdtAmount').isFloat({ min: 1 })],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { usdtAmount } = req.body;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('chips, usdt_balance')
        .eq('id', req.user!.id)
        .single();

      if (error || !profile) return res.status(404).json({ message: 'User not found' });

      if (profile.usdt_balance < usdtAmount) {
        return res.status(400).json({ message: 'Insufficient USDT balance' });
      }

      const chipsToAdd = usdtAmount * 1_000_000;

      await supabase
        .from('profiles')
        .update({
          chips: profile.chips + chipsToAdd,
          usdt_balance: profile.usdt_balance - usdtAmount,
        })
        .eq('id', req.user!.id);

      // ── AUDIT: log convert as chip gain ──
      const { data: u2 } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', req.user!.id)
        .single();
      await logChipChange({
        userId:       req.user!.id,
        username:     u2?.username ?? 'unknown',
        event:        'convert',
        amount:       chipsToAdd,
        balanceAfter: profile.chips + chipsToAdd,
        detail:       `Converted ${usdtAmount} USDT → ${chipsToAdd} chips`,
      });

      await supabase.from('transactions').insert({
        user_id: req.user!.id,
        type: 'deposit',
        amount: usdtAmount,
        currency: 'USDT',
        status: 'confirmed',
        description: `Converted ${usdtAmount} USDT to ${chipsToAdd.toLocaleString()} chips`,
      });

      return res.json({
        success: true,
        chipsAdded: chipsToAdd,
        newChipsBalance: profile.chips + chipsToAdd,
        newUsdtBalance: profile.usdt_balance - usdtAmount,
      });
    } catch {
      return res.status(500).json({ message: 'Conversion failed' });
    }
  }
);

// ============================================================
//  POST /api/wallet/withdraw
//  Requests a withdrawal. Runs full ledger audit FIRST. If the audit
//  fails, the user is withdraw-locked and the request is rejected.
// ============================================================
router.post(
  '/withdraw',
  [
    body('amountChips').isInt({ min: 1 }),
    body('destination').isString().notEmpty().trim(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { amountChips, destination } = req.body as {
        amountChips: number;
        destination: string;
      };

      // ── Load profile ──
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, chips, withdraw_locked, withdraw_lock_reason')
        .eq('id', req.user!.id)
        .single();

      if (!profile) return res.status(404).json({ message: 'User not found' });

      if (profile.withdraw_locked) {
        return res.status(403).json({
          message: 'Withdrawals locked on this account',
          reason:  profile.withdraw_lock_reason ?? 'Flagged by audit',
        });
      }

      if (profile.chips < amountChips) {
        return res.status(400).json({ message: 'Insufficient chip balance' });
      }

      // ── RUN FULL AUDIT ──
      const { auditUserLedger } = await import('../utils/ledgerAudit');
      const report = await auditUserLedger(req.user!.id);

      if (!report.passed) {
        // Lock account and persist rejected withdrawal record
        await supabase
          .from('profiles')
          .update({
            withdraw_locked: true,
            withdraw_lock_reason: report.reasons.join('; ').slice(0, 500),
          })
          .eq('id', req.user!.id);

        await supabase.from('withdrawals').insert({
          user_id:          req.user!.id,
          amount_chips:     amountChips,
          amount_usdt:      amountChips / 1_000_000,
          destination,
          status:           'rejected',
          audit_passed:     false,
          audit_report:     report,
          rejection_reason: report.reasons.join('; '),
          resolved_at:      new Date().toISOString(),
        });

        return res.status(403).json({
          message: 'Withdrawal rejected — ledger audit failed. Your account has been locked. Contact support.',
          auditReport: report,
        });
      }

      // ── AUDIT PASSED — create pending withdrawal ──
      const amountUsdt = amountChips / 1_000_000;

      // Deduct chips immediately so user can't double-spend
      const newBalance = profile.chips - amountChips;
      await supabase
        .from('profiles')
        .update({ chips: newBalance })
        .eq('id', req.user!.id);

      await logChipChange({
        userId:       req.user!.id,
        username:     profile.username,
        event:        'withdraw',
        amount:       -amountChips,
        balanceAfter: newBalance,
        detail:       `Withdrawal requested: ${amountChips} chips → ${amountUsdt} USDT to ${destination}`,
      });

      // ── ROTATE BASELINE ──
      // initial3 ← initial2, initial2 ← initial1, initial1 ← newBalance
      // This resets the audit baseline so the next audit only needs to verify
      // chips earned AFTER this withdraw (huge perf win + tighter scope).
      const { rotateBaseline } = await import('../utils/baseline');
      await rotateBaseline({
        userId:     req.user!.id,
        username:   profile.username,
        newBalance,
      });

      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .insert({
          user_id:      req.user!.id,
          amount_chips: amountChips,
          amount_usdt:  amountUsdt,
          destination,
          status:       'pending',
          audit_passed: true,
          audit_report: report,
        })
        .select()
        .single();

      return res.json({
        success: true,
        withdrawal,
        newChipsBalance: newBalance,
        auditReport: report,
      });
    } catch (err) {
      console.error('withdraw error:', err);
      return res.status(500).json({ message: 'Withdrawal failed' });
    }
  }
);

// GET /api/wallet/audit — user can view their own audit report
router.get('/audit', async (req: AuthRequest, res: Response) => {
  const { auditUserLedger } = await import('../utils/ledgerAudit');
  const report = await auditUserLedger(req.user!.id);
  return res.json(report);
});

export default router;
