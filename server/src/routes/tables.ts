import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { tableManager } from '../socket/tableManager';

const router = Router();

// GET /api/tables - list all public tables
router.get('/', (_req, res: Response) => {
  const tables = tableManager.getAllTableInfos();
  return res.json(tables);
});

// GET /api/tables/:id
router.get('/:id', (req, res: Response) => {
  const table = tableManager.getTableInfo(req.params.id);
  if (!table) return res.status(404).json({ message: 'Table not found' });
  return res.json(table);
});

// POST /api/tables - create a new table
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      name = 'New Table',
      smallBlind = 500,
      bigBlind = 1000,
      maxPlayers = 6,
      minBuyIn = 10000,
      maxBuyIn = 1000000,
    } = req.body;

    if (smallBlind >= bigBlind) {
      return res.status(400).json({ message: 'Small blind must be less than big blind' });
    }

    const table = tableManager.createTable({
      name,
      smallBlind,
      bigBlind,
      maxPlayers: Math.min(Math.max(maxPlayers, 2), 9),
      minBuyIn,
      maxBuyIn,
      createdBy: req.user!.id,
    });

    return res.status(201).json(table);
  } catch {
    return res.status(500).json({ message: 'Failed to create table' });
  }
});

export default router;
