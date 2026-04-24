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

/** Emits table:leave then disconnects. Call before clearing auth state. */
export function disconnectSocket() {
  if (socket) {
    socket.emit('table:leave');
    socket.disconnect();
    socket = null;
  }
}

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const { setGameState, addChatMessage, setConnected, setShowWinner } = useGameStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (!token || initialized.current) return;
    initialized.current = true;

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
      toast.error(message || 'You have been signed out.', { duration: 6000 });
      // Force logout so user must re-authenticate
      logout();
    });

    socket.on('tournament:starting', ({ tournamentId, tableId, name, prizePool }: any) => {
      toast.success(`🏆 ${name} is starting! Joining table…`, { duration: 5000 });
      // Navigate through a custom event so any component can react. We use
      // history API directly since react-router nav happens inside components.
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

    return () => {
      socket?.disconnect();
      socket = null;
      initialized.current = false;
      setConnected(false);
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
    isConnected: socket?.connected ?? false,
  };
}
