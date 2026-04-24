import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy, Clock, Users, Coins, Check, X } from 'lucide-react';
import { Tournament } from '../../types';
import { useAuthStore } from '../../store/authStore';
import api from '../../utils/api';
import toast from 'react-hot-toast';

function formatChips(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTimeRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'Starting…';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${mins % 60}m`;
  if (mins >= 1) return `${mins}m`;
  return `${Math.floor(ms / 1000)}s`;
}

function formatUTC(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TournamentList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuthStore();
  const [, setTick] = useState(0);

  // Re-render every 10s so countdowns update
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(iv);
  }, []);

  // Auto-navigate when any tournament we registered for starts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tableId: string };
      if (detail?.tableId) navigate(`/table/${detail.tableId}`);
    };
    window.addEventListener('tournament:starting', handler);
    return () => window.removeEventListener('tournament:starting', handler);
  }, [navigate]);

  const { data: tournaments = [], isLoading } = useQuery<Tournament[]>({
    queryKey: ['tournaments'],
    queryFn: async () => {
      const { data } = await api.get('/tournaments');
      return data;
    },
    refetchInterval: 10_000,
  });

  const { data: myRegs = [] } = useQuery<Array<{ tournament_id: string }>>({
    queryKey: ['my-tournament-regs'],
    queryFn: async () => {
      const { data } = await api.get('/tournaments/mine/list');
      return data;
    },
    refetchInterval: 10_000,
  });
  const registeredIds = new Set(myRegs.map(r => r.tournament_id));

  const register = async (t: Tournament) => {
    try {
      await api.post(`/tournaments/${t.id}/register`);
      toast.success(`Registered for ${t.name}`);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['my-tournament-regs'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to register');
    }
  };

  const unregister = async (t: Tournament) => {
    try {
      await api.post(`/tournaments/${t.id}/unregister`);
      toast.success(`Unregistered from ${t.name}`);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['my-tournament-regs'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to unregister');
    }
  };

  if (isLoading) {
    return <div className="text-center text-gray-400 py-12">Loading tournaments…</div>;
  }

  if (tournaments.length === 0) {
    return (
      <div className="text-center text-gray-400 py-12">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>No tournaments scheduled yet — check back soon.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tournaments.map(t => {
        const registered = registeredIds.has(t.id);
        const isRunning = t.status === 'running';
        const isFinished = t.status === 'finished' || t.status === 'cancelled';
        return (
          <div
            key={t.id}
            className="relative rounded-xl border border-yellow-900/30 bg-gradient-to-b from-[#1a0d05] to-[#0d0503] p-4 shadow-lg"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <h3 className="text-lg font-bold text-yellow-400" style={{ fontFamily: 'Cinzel, serif' }}>
                    {t.name}
                  </h3>
                </div>
                <div className="text-xs text-gray-400 mt-1">{formatUTC(t.scheduled_at)}</div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  isRunning
                    ? 'bg-green-900/40 text-green-300 border-green-500/40'
                    : isFinished
                    ? 'bg-gray-900/40 text-gray-400 border-gray-500/40'
                    : 'bg-yellow-900/40 text-yellow-300 border-yellow-500/40'
                }`}
              >
                {t.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mt-3">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Coins className="w-3.5 h-3.5 text-yellow-500" />
                <span>Buy-in: <b className="text-white">{formatChips(t.buy_in)}</b></span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span>{t.registered_count ?? 0}/{t.max_players}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Trophy className="w-3.5 h-3.5 text-orange-400" />
                <span>Prize: <b className="text-white">{formatChips(t.prize_pool || (t.registered_count ?? 0) * t.buy_in)}</b></span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>{t.status === 'scheduled' ? formatTimeRemaining(t.scheduled_at) : isRunning ? 'Running' : '—'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4">
              {isRunning && registered && t.table_id && (
                <button
                  onClick={() => navigate(`/table/${t.table_id}`)}
                  className="w-full px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
                >
                  Join Tournament Table →
                </button>
              )}
              {t.status === 'scheduled' && !registered && (
                <button
                  onClick={() => register(t)}
                  className="w-full px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-black text-sm font-semibold transition-colors"
                >
                  Register ({formatChips(t.buy_in)})
                </button>
              )}
              {t.status === 'scheduled' && registered && (
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-900/40 text-green-300 text-sm border border-green-500/40">
                    <Check className="w-4 h-4" /> Registered
                  </div>
                  <button
                    onClick={() => unregister(t)}
                    className="px-3 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-300 text-sm transition-colors"
                    title="Unregister"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {isFinished && t.winners && t.winners.length > 0 && (
                <div className="text-xs text-gray-400">
                  🥇 {t.winners[0].username} won {formatChips(t.winners[0].prize)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
