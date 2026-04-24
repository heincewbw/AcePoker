export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  chips: number;
  usdtBalance: number;
  walletAddress?: string;
  level: number;
  totalWins: number;
  totalGames: number;
}

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  value: number;
  hidden?: boolean;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface GamePlayer {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  chips: number;
  holeCards: Card[];
  currentBet: number;
  totalBetThisRound: number;
  isFolded: boolean;
  isAllIn: boolean;
  isActive: boolean;
  seatIndex: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  lastAction?: PlayerAction;
  hand?: HandResult;
}

export interface HandResult {
  rank: string;
  rankValue: number;
  tiebreakers: number[];
  bestCards: Card[];
  description: string;
}

export interface GameState {
  id: string;
  tableId: string;
  phase: GamePhase;
  players: GamePlayer[];
  communityCards: Card[];
  pot: number;
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  minRaise: number;
  roundNumber: number;
  winners?: Array<{ playerId: string; amount: number; hand?: HandResult }>;
  lastAction?: { playerId: string; action: PlayerAction; amount?: number };
}

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
}

export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: string;
}

export interface Transaction {
  _id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'win' | 'loss' | 'refund';
  amount: number;
  currency: 'USDT' | 'CHIPS';
  txHash?: string;
  network?: string;
  walletAddress?: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  description?: string;
  createdAt: string;
}
