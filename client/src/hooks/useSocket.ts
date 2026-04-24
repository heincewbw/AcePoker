import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { GameState, ChatMessage } from '../types';
import toast from 'react-hot-toast';

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

let socket: Socket | null = null;
// Number of mounted components currently using the hook.  Socket is created
// on first mount and only torn down when the last consumer unmounts.  This
// prevents the "ghost kick" bug where navigating between Lobby and GameTable
// (both using useSocket) would briefly open a second socket, causing the
// server's single-session guard to kick the user's own previous session.
let refCount = 0;
let currentToken: string | null = null;

/** Emits table:leave then disconnects. Call before clearing auth state. */
export function disconnectSocket() {
  if (socket) {
    socket.emit('table:leave');
    socket.disconnect();
    socket = null;
    currentToken = null;
    refCount = 0;
  }
}

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const { setGameState, addChatMessage, setConnected, setShowWinner } = useGameStore();
  const mounted = useRef(false);

  useEffect(() => {
    if (!token) return;

    // If token changed (re-login as another user), tear the socket down so
    // a fresh one is opened with the new credentials.
    if (socket && currentToken && currentToken !== token) {
      socket.disconnect();
      socket = null;
      refCount = 0;
    }

    // First consumer creates the shared socket and wires all listeners.
    if (!socket) {
      currentToken = token;
      socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:5000', {
        auth: { token },
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        setConnected(true);
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('game:state', (state: GameState) => {
        setGameState(state);
        if (state.phase === 'finished') {
          setShowWinner(true);
          setTimeout(() => setShowWinner(false), 5000);
        }
      });

      socket.on('game:ended', (state: GameState) => {
        setGameState(state);
        setShowWinner(true);
        setTimeout(() => setShowWinner(false), 6000);
      });

      socket.on('table:player_joined', ({ username }: { username: string }) => {
        toast(`${username} joined the table`, { icon: '🪑' });
      });

      socket.on('table:player_left', ({ username }: { username: string }) => {
        toast(`${username} left the table`, { icon: '👋' });
      });

      socket.on('chat:message', (msg: ChatMessage) => {
        addChatMessage(msg);
      });

      socket.on('error', ({ message }: { message: string }) => {
        toast.error(message);
      });

      socket.on('auth:kicked', ({ message }: { message: string }) => {
        // Show a soft warning but do NOT force logout automatically.  Network
        // reconnects and server restarts can race with the single-session
        // guard and produce false kicks.  If the user really did log in on
        // another device, the old tab's socket will just stop receiving state
        // updates; they can refresh or log out manually.
        toast(message || 'Session replaced elsewhere.', {
          icon: '⚠️',
          duration: 4000,
        });
      });

      socket.on('tournament:starting', ({ tournamentId, tableId, name, prizePool }: any) => {
        toast.success(`🏆 ${name} is starting! Joining table…`, { duration: 5000 });
        window.dispatchEvent(new CustomEvent('tournament:starting', {
          detail: { tournamentId, tableId, name, prizePool },
        }));
      });

      socket.on('tournament:blind_up', ({ level, smallBlind, bigBlind }: any) => {
        toast(`⬆ Blinds up — Level ${level} (${smallBlind}/${bigBlind})`, { icon: '🏆' });
      });

      socket.on('tournament:eliminated', ({ username, position }: any) => {
        toast(`${username} eliminated (${position}${ordinalSuffix(position)} place)`, { icon: '💀' });
      });

      socket.on('tournament:finished', ({ winners, prizePool }: any) => {
        const top = winners?.[0];
        if (top) {
          toast.success(
            `🏆 Tournament winner: ${top.username} — ${top.prize} chips (prize pool ${prizePool})`,
            { duration: 8000 }
          );
        }
      });

      socket.on('tournament:cancelled', () => {
        toast.error('Tournament was cancelled — buy-in refunded', { duration: 6000 });
      });
    }

    if (!mounted.current) {
      refCount++;
      mounted.current = true;
    }

    return () => {
      if (mounted.current) {
        refCount--;
        mounted.current = false;
      }
      // Only disconnect when no consumers are left AND we've actually dropped
      // to zero (next render cycle can bounce between 0 and 1 in StrictMode).
      if (refCount <= 0 && socket) {
        socket.disconnect();
        socket = null;
        currentToken = null;
        refCount = 0;
        setConnected(false);
      }
    };
  }, [token]);

  return {
    joinTable: (tableId: string, buyIn: number, seatIndex: number) => {
      socket?.emit('table:join', { tableId, buyIn, seatIndex });
    },
    leaveTable: () => {
      socket?.emit('table:leave');
    },
    sendAction: (tableId: string, action: string, amount?: number) => {
      socket?.emit('game:action', { tableId, action, amount });
    },
    sendChat: (tableId: string, message: string) => {
      socket?.emit('chat:message', { tableId, message });
    },
    sitOut: (tableId: string) => {
      socket?.emit('player:sitout', { tableId });
    },
    returnFromSitOut: (tableId: string) => {
      socket?.emit('player:return', { tableId });
    },
    isConnected: socket?.connected ?? false,
  };
}
