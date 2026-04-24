import { v4 as uuidv4 } from 'uuid';
import { PokerGame, GameState } from '../game/PokerGame';

export interface TableInfo {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  minBuyIn: number;
  maxBuyIn: number;
  playerCount: number;
  phase: string;
  createdBy: string;
  occupiedSeats: number[];
  isTournament?: boolean;
  tournamentId?: string;
}

export interface TableConfig {
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  minBuyIn: number;
  maxBuyIn: number;
  createdBy: string;
}

interface Table {
  info: TableInfo;
  game: PokerGame;
  socketIds: Map<string, string>; // userId -> socketId
}

class TableManager {
  private tables: Map<string, Table> = new Map();

  constructor() {
    this.seedDefaultTables();
  }

  private seedDefaultTables() {
    const defaults: Omit<TableConfig, 'createdBy'>[] = [
      { name: '🎯 Low Stakes', smallBlind: 250, bigBlind: 500, maxPlayers: 6, minBuyIn: 5000, maxBuyIn: 500000 },
      { name: '💎 Medium Stakes', smallBlind: 1000, bigBlind: 2000, maxPlayers: 6, minBuyIn: 20000, maxBuyIn: 2000000 },
      { name: '🔥 High Stakes', smallBlind: 5000, bigBlind: 10000, maxPlayers: 6, minBuyIn: 100000, maxBuyIn: 10000000 },
      { name: '🏆 VIP Table', smallBlind: 25000, bigBlind: 50000, maxPlayers: 9, minBuyIn: 500000, maxBuyIn: 50000000 },
    ];

    for (const d of defaults) {
      this.createTable({ ...d, createdBy: 'system' });
    }
  }

  createTable(config: TableConfig, opts?: { isTournament?: boolean; tournamentId?: string }): TableInfo {
    const id = uuidv4();
    const game = new PokerGame(id, config.smallBlind, config.bigBlind);

    const info: TableInfo = {
      id,
      name: config.name,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      maxPlayers: config.maxPlayers,
      minBuyIn: config.minBuyIn,
      maxBuyIn: config.maxBuyIn,
      playerCount: 0,
      phase: 'waiting',
      createdBy: config.createdBy,
      occupiedSeats: [],
      isTournament: opts?.isTournament,
      tournamentId: opts?.tournamentId,
    };

    this.tables.set(id, { info, game, socketIds: new Map() });
    return info;
  }

  getTable(tableId: string): Table | undefined {
    return this.tables.get(tableId);
  }

  getGame(tableId: string): PokerGame | undefined {
    return this.tables.get(tableId)?.game;
  }

  getTableInfo(tableId: string): TableInfo | undefined {
    const table = this.tables.get(tableId);
    if (!table) return undefined;
    const gameState = table.game.getState();
    return {
      ...table.info,
      playerCount: gameState.players.length,
      phase: gameState.phase,
      occupiedSeats: gameState.players.map(p => p.seatIndex),
    };
  }

  getAllTableInfos(): TableInfo[] {
    return Array.from(this.tables.values())
      .filter(t => !t.info.isTournament)
      .map(t => {
        const gameState = t.game.getState();
        return {
          ...t.info,
          playerCount: gameState.players.length,
          phase: gameState.phase,
          occupiedSeats: gameState.players.map(p => p.seatIndex),
        };
      });
  }

  addSocketId(tableId: string, userId: string, socketId: string): void {
    this.tables.get(tableId)?.socketIds.set(userId, socketId);
  }

  removeSocketId(tableId: string, userId: string): void {
    this.tables.get(tableId)?.socketIds.delete(userId);
  }

  getSocketIds(tableId: string): string[] {
    return Array.from(this.tables.get(tableId)?.socketIds.values() || []);
  }

  updateGameState(tableId: string, state: GameState): void {
    const table = this.tables.get(tableId);
    if (table) {
      table.info.playerCount = state.players.length;
      table.info.phase = state.phase;
    }
  }
}

export const tableManager = new TableManager();
