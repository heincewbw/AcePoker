import { v4 as uuidv4 } from 'uuid';
import { Card, CardDeck } from './CardDeck';
import { HandResult, determineWinners } from './HandEvaluator';

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

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface GameState {
  id: string;
  tableId: string;
  phase: GamePhase;
  players: GamePlayer[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
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

export class PokerGame {
  private state: GameState;
  private deck: CardDeck;
  private turnTimeout?: NodeJS.Timeout;
  private onStateChange?: (state: GameState) => void;
  private onGameEnd?: (state: GameState) => void;

  constructor(tableId: string, smallBlind: number, bigBlind: number) {
    this.deck = new CardDeck();
    this.state = {
      id: uuidv4(),
      tableId,
      phase: 'waiting',
      players: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      currentPlayerIndex: 0,
      dealerIndex: 0,
      smallBlindIndex: 0,
      bigBlindIndex: 0,
      smallBlind,
      bigBlind,
      currentBet: 0,
      minRaise: bigBlind,
      roundNumber: 0,
    };
  }

  setCallbacks(
    onStateChange: (state: GameState) => void,
    onGameEnd: (state: GameState) => void
  ) {
    this.onStateChange = onStateChange;
    this.onGameEnd = onGameEnd;
  }

  getState(): GameState {
    return { ...this.state };
  }

  getPublicState(requestingPlayerId?: string): GameState {
    const state = this.getState();
    // Hide hole cards of other players unless showdown
    if (state.phase !== 'showdown' && state.phase !== 'finished') {
      state.players = state.players.map(p => {
        if (p.userId !== requestingPlayerId && p.id !== requestingPlayerId) {
          return { ...p, holeCards: p.holeCards.map(() => ({ suit: 'hearts' as const, rank: '2' as const, value: 0, hidden: true } as any)) };
        }
        return p;
      });
    }
    return state;
  }

  addPlayer(userId: string, username: string, avatar: string, chips: number, seatIndex: number): boolean {
    if (this.state.players.length >= 9) return false;
    if (this.state.players.some(p => p.userId === userId)) return false;
    if (this.state.players.some(p => p.seatIndex === seatIndex)) return false;

    const player: GamePlayer = {
      id: uuidv4(),
      userId,
      username,
      avatar,
      chips,
      holeCards: [],
      currentBet: 0,
      totalBetThisRound: 0,
      isFolded: false,
      isAllIn: false,
      isActive: true,
      seatIndex,
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
    };

    this.state.players.push(player);
    this.state.players.sort((a, b) => a.seatIndex - b.seatIndex);
    this.emit();
    return true;
  }

  removePlayer(userId: string): void {
    this.state.players = this.state.players.filter(p => p.userId !== userId);
    this.emit();
  }

  /**
   * Force-fold a player mid-hand so the hand resolves naturally (pot goes to
   * remaining players).  If only one non-folded player remains after the fold,
   * the showdown is triggered immediately.
   */
  forceRemovePlayer(userId: string): void {
    const player = this.state.players.find(p => p.userId === userId);
    if (!player) return;

    if (!['waiting', 'finished'].includes(this.state.phase)) {
      // Fold them in-place so the pot resolves correctly
      player.isFolded = true;
      player.lastAction = 'fold';

      // If it was their turn, advance to next player
      const activePlayers = this.getActivePlayers();
      if (activePlayers.length === 1 || activePlayers.length === 0) {
        // Only one (or zero) left — go straight to showdown
        this.showdown();
        return;
      }

      // Check if the round is now complete
      if (this.isRoundComplete()) {
        this.advancePhase();
      } else {
        this.nextPlayer();
      }
      this.emit();
    }
  }

  canStartGame(): boolean {
    const activePlayers = this.state.players.filter(p => p.isActive && p.chips >= this.state.bigBlind);
    return activePlayers.length >= 2 && ['waiting', 'finished'].includes(this.state.phase);
  }

  /** Sync a player's chip count from DB so the next round starts with correct stacks. */
  updatePlayerChips(userId: string, chips: number): void {
    const player = this.state.players.find(p => p.userId === userId);
    if (player) player.chips = chips;
  }

  startGame(): void {
    if (!this.canStartGame()) return;

    // New unique game ID per hand for audit trail
    this.state.id = uuidv4();
    this.state.roundNumber++;
    this.deck.reset();
    this.deck.shuffle();

    // Reset player states
    for (const player of this.state.players) {
      player.holeCards = [];
      player.currentBet = 0;
      player.totalBetThisRound = 0;
      player.isFolded = false;
      player.isAllIn = false;
      player.isDealer = false;
      player.isSmallBlind = false;
      player.isBigBlind = false;
      player.lastAction = undefined;
      player.hand = undefined;
    }

    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = 0;
    this.state.winners = undefined;

    const activePlayers = this.state.players.filter(p => p.isActive && p.chips > 0);

    // Rotate dealer
    if (this.state.roundNumber > 1) {
      this.state.dealerIndex = (this.state.dealerIndex + 1) % activePlayers.length;
    }

    const playerCount = activePlayers.length;
    this.state.smallBlindIndex = (this.state.dealerIndex + 1) % playerCount;
    this.state.bigBlindIndex = (this.state.dealerIndex + 2) % playerCount;

    activePlayers[this.state.dealerIndex].isDealer = true;

    // Post blinds
    const sbPlayer = activePlayers[this.state.smallBlindIndex];
    const bbPlayer = activePlayers[this.state.bigBlindIndex];

    sbPlayer.isSmallBlind = true;
    bbPlayer.isBigBlind = true;

    this.placeBet(sbPlayer, this.state.smallBlind);
    this.placeBet(bbPlayer, this.state.bigBlind);

    this.state.currentBet = this.state.bigBlind;
    this.state.minRaise = this.state.bigBlind * 2;

    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      for (const player of activePlayers) {
        player.holeCards.push(this.deck.dealOne());
      }
    }

    // First to act is after big blind
    const firstToAct = (this.state.bigBlindIndex + 1) % playerCount;
    this.state.currentPlayerIndex = firstToAct;
    this.state.phase = 'preflop';

    this.emit();
  }

  processAction(userId: string, action: PlayerAction, amount?: number): boolean {
    const activePlayers = this.getActivePlayers();
    const currentPlayer = activePlayers[this.state.currentPlayerIndex];

    if (!currentPlayer || currentPlayer.userId !== userId) return false;
    if (currentPlayer.isFolded || currentPlayer.isAllIn) return false;

    switch (action) {
      case 'fold':
        currentPlayer.isFolded = true;
        currentPlayer.lastAction = 'fold';
        break;

      case 'check':
        if (this.state.currentBet > currentPlayer.currentBet) return false;
        currentPlayer.lastAction = 'check';
        break;

      case 'call': {
        const callAmount = this.state.currentBet - currentPlayer.currentBet;
        this.placeBet(currentPlayer, callAmount);
        currentPlayer.lastAction = 'call';
        break;
      }

      case 'raise': {
        if (!amount || amount < this.state.minRaise) return false;
        const raiseAmount = amount - currentPlayer.currentBet;
        const prevBetRaise = this.state.currentBet;
        if (raiseAmount >= currentPlayer.chips) {
          // All-in (may or may not be a full raise)
          this.placeBet(currentPlayer, currentPlayer.chips);
          if (currentPlayer.currentBet > this.state.currentBet) {
            const newBet = currentPlayer.currentBet;
            this.state.minRaise = newBet + (newBet - prevBetRaise);
            this.state.currentBet = newBet;
          }
          currentPlayer.isAllIn = true;
          currentPlayer.lastAction = 'allin';
        } else {
          this.placeBet(currentPlayer, raiseAmount);
          this.state.minRaise = amount + (amount - prevBetRaise);
          this.state.currentBet = amount;
          currentPlayer.lastAction = 'raise';
        }
        break;
      }

      case 'allin': {
        const prevBetAllIn = this.state.currentBet;
        const allInAmount = currentPlayer.chips;
        this.placeBet(currentPlayer, allInAmount);
        if (currentPlayer.currentBet > this.state.currentBet) {
          const newBet = currentPlayer.currentBet;
          this.state.minRaise = newBet + (newBet - prevBetAllIn);
          this.state.currentBet = newBet;
        }
        currentPlayer.isAllIn = true;
        currentPlayer.lastAction = 'allin';
        break;
      }
    }

    this.state.lastAction = { playerId: currentPlayer.id, action, amount };

    // Check if round is over
    if (this.isRoundComplete()) {
      this.advancePhase();
    } else {
      this.nextPlayer();
    }

    this.emit();
    return true;
  }

  private placeBet(player: GamePlayer, amount: number): void {
    const actualAmount = Math.min(amount, player.chips);
    player.chips -= actualAmount;
    player.currentBet += actualAmount;
    player.totalBetThisRound += actualAmount;
    this.state.pot += actualAmount;
  }

  private getActivePlayers(): GamePlayer[] {
    return this.state.players.filter(p => p.isActive && !p.isFolded);
  }

  private isRoundComplete(): boolean {
    const activePlayers = this.getActivePlayers();

    // Only 1 (or 0) active player left — everyone else folded
    if (activePlayers.length <= 1) return true;

    const nonAllIn = activePlayers.filter(p => !p.isAllIn);

    // All remaining players are all-in — nothing left to bet
    if (nonAllIn.length === 0) return true;

    // Every non-all-in player must have:
    //   1. matched the current bet, AND
    //   2. had at least one action this street
    // This ensures that when someone raises (or goes all-in with a raise),
    // all other players get a chance to call / fold / re-raise.
    const allBetsEqual = nonAllIn.every(p => p.currentBet === this.state.currentBet);
    const everyoneActed = nonAllIn.every(p => p.lastAction !== undefined);

    return allBetsEqual && everyoneActed;
  }

  private nextPlayer(): void {
    const activePlayers = this.getActivePlayers().filter(p => !p.isAllIn);
    if (activePlayers.length === 0) return;

    let next = (this.state.currentPlayerIndex + 1) % this.getActivePlayers().length;
    const allActive = this.getActivePlayers();

    // Skip folded/all-in players
    let attempts = 0;
    while ((allActive[next]?.isFolded || allActive[next]?.isAllIn) && attempts < allActive.length) {
      next = (next + 1) % allActive.length;
      attempts++;
    }

    this.state.currentPlayerIndex = next;
  }

  private advancePhase(): void {
    // Reset bets for new street
    for (const player of this.state.players) {
      player.currentBet = 0;
      player.lastAction = undefined;
    }
    this.state.currentBet = 0;
    this.state.minRaise = this.state.bigBlind;

    // First to act after dealer (skip folded/all-in)
    const activePlayers = this.getActivePlayers();

    // If only one (or zero) player remains — everyone else folded —
    // end the hand immediately without dealing further community cards.
    if (activePlayers.length <= 1) {
      this.showdown();
      return;
    }

    switch (this.state.phase) {
      case 'preflop':
        this.state.communityCards.push(...this.deck.deal(3)); // flop
        this.state.phase = 'flop';
        break;
      case 'flop':
        this.state.communityCards.push(this.deck.dealOne()); // turn
        this.state.phase = 'turn';
        break;
      case 'turn':
        this.state.communityCards.push(this.deck.dealOne()); // river
        this.state.phase = 'river';
        break;
      case 'river':
        this.showdown();
        return;
    }

    // Position after dealer
    const firstToAct = (this.state.smallBlindIndex) % activePlayers.length;
    this.state.currentPlayerIndex = firstToAct;
  }

  private showdown(): void {
    this.state.phase = 'showdown';

    const activePlayers = this.getActivePlayers();

    if (activePlayers.length === 1) {
      // Only one player left (everyone else folded)
      const winner = activePlayers[0];
      winner.chips += this.state.pot;
      this.state.winners = [{ playerId: winner.id, amount: this.state.pot }];
    } else {
      // Evaluate hands and award pot
      const playerResults = determineWinners(
        activePlayers.map(p => ({ id: p.id, holeCards: p.holeCards })),
        this.state.communityCards
      );

      for (const result of playerResults) {
        const player = this.state.players.find(p => p.id === result.id);
        if (player) player.hand = result.hand;
      }

      const winners = playerResults.filter(r => r.isWinner);
      const winAmount = Math.floor(this.state.pot / winners.length);
      const remainder = this.state.pot - winAmount * winners.length;

      this.state.winners = [];
      for (let i = 0; i < winners.length; i++) {
        const player = this.state.players.find(p => p.id === winners[i].id);
        const bonus = i === 0 ? remainder : 0; // give remainder chip to first winner
        const won = winAmount + bonus;
        if (player) {
          player.chips += won;
          this.state.winners.push({
            playerId: winners[i].id,
            amount: won,
            hand: winners[i].hand,
          });
        }
      }
    }

    this.state.phase = 'finished';
    this.emit();
    if (this.onGameEnd) this.onGameEnd(this.getState());
    // Reset to 'waiting' so canStartGame() allows the next round to start.
    this.state.phase = 'waiting';
  }

  private emit(): void {
    if (this.onStateChange) this.onStateChange(this.getState());
  }

  clearTurnTimeout(): void {
    if (this.turnTimeout) {
      clearTimeout(this.turnTimeout);
      this.turnTimeout = undefined;
    }
  }
}
