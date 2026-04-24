import { create } from 'zustand';
import { GameState, ChatMessage, GamePhase } from '../types';

interface GameStore {
  gameState: GameState | null;
  currentTableId: string | null;
  chatMessages: ChatMessage[];
  isConnected: boolean;
  showWinner: boolean;

  setGameState: (state: GameState) => void;
  setCurrentTableId: (id: string | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setConnected: (v: boolean) => void;
  setShowWinner: (v: boolean) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  currentTableId: null,
  chatMessages: [],
  isConnected: false,
  showWinner: false,

  setGameState: (state) => set({ gameState: state }),
  setCurrentTableId: (id) => set({ currentTableId: id }),
  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages.slice(-99), msg] })),
  setConnected: (v) => set({ isConnected: v }),
  setShowWinner: (v) => set({ showWinner: v }),
  clearGame: () =>
    set({
      gameState: null,
      currentTableId: null,
      chatMessages: [],
      showWinner: false,
    }),
}));
