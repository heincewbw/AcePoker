import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { GameState, ChatMessage } from '../types';
import toast from 'react-hot-toast';

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
