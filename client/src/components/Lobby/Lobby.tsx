import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Users, Coins, Plus, LogOut, Wallet, RefreshCw, History } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { TableInfo } from '../../types';
import api from '../../utils/api';
import TableCard from './TableCard';
import WalletModal from '../Wallet/WalletModal';
import CreateTableModal from './CreateTableModal';
import HistoryModal from './HistoryModal';
import TournamentList from './TournamentList';
import toast from 'react-hot-toast';

export default function Lobby() {
  const { user, logout, refreshUser } = useAuthStore();
  const navigate = useNavigate();
  const [showWallet, setShowWallet] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tab, setTab] = useState<'tables' | 'tournaments'>('tables');

  useEffect(() => {
    refreshUser();
  }, []);

  const { data: tables = [], isLoading, refetch } = useQuery<TableInfo[]>({
    queryKey: ['tables'],
    queryFn: async () => {
      const { data } = await api.get('/tables');
      return data;
    },
    refetchInterval: 5000,
  });

  const formatChips = (n: number) => {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(ellipse at top, #1a0505 0%, #0d0303 100%)' }}
    >
      {/* Header */}
      <header className="border-b border-yellow-900/30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <h1
            className="text-3xl font-bold"
            style={{
              fontFamily: 'Cinzel, serif',
              background: 'linear-gradient(135deg, #c9a227, #f0c040)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            ♠ AcePoker
          </h1>

          {/* User info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {/* Chips */}
              <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-xl border border-yellow-900/40">
                <Coins className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-300 font-bold text-sm">
                  {formatChips(user?.chips || 0)}
                </span>
              </div>

              {/* USDT */}
              <div className="usdt-badge">
                <span>USDT</span>
                <span>{(user?.usdtBalance || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #3b4a7a, #232d4e)' }}
            >
              <History className="w-4 h-4" />
              History
            </button>

            <button
              onClick={() => setShowWallet(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #26a17b, #1a6e52)' }}
            >
              <Wallet className="w-4 h-4" />
              Deposit USDT
            </button>

            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-black text-sm"
                style={{ background: 'linear-gradient(135deg, #c9a227, #f0c040)' }}
              >
                {user?.username[0].toUpperCase()}
              </div>
              <span className="text-gray-300 text-sm hidden md:block">{user?.username}</span>
            </div>

            <button
              onClick={logout}
              className="text-gray-500 hover:text-red-400 transition-colors p-2"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: <Coins className="w-5 h-5" />, label: 'Your Chips', value: formatChips(user?.chips || 0), color: 'text-yellow-400' },
            { icon: <Trophy className="w-5 h-5" />, label: 'Total Wins', value: user?.totalWins || 0, color: 'text-green-400' },
            { icon: <Users className="w-5 h-5" />, label: 'Games Played', value: user?.totalGames || 0, color: 'text-blue-400' },
          ].map((stat) => (
            <div key={stat.label} className="glass-panel p-4 flex items-center gap-4">
              <div className={`${stat.color} p-2 bg-white/5 rounded-lg`}>{stat.icon}</div>
              <div>
                <p className="text-gray-400 text-xs">{stat.label}</p>
                <p className={`${stat.color} font-bold text-lg`}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tables section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Cinzel, serif' }}>
              {tab === 'tables' ? 'Live Tables' : 'Tournaments'}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {tab === 'tables' ? 'Choose a table and start playing' : 'Daily scheduled MTT — 3 per day'}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center rounded-xl bg-white/5 p-1">
              <button
                onClick={() => setTab('tables')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'tables' ? 'bg-yellow-600 text-black' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Tables
              </button>
              <button
                onClick={() => setTab('tournaments')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  tab === 'tournaments' ? 'bg-yellow-600 text-black' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                Tournaments
              </button>
            </div>
            {tab === 'tables' && (
              <>
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #c9a227, #8b6e1a)' }}
                >
                  <Plus className="w-4 h-4" />
                  Create Table
                </button>
              </>
            )}
          </div>
        </div>

        {tab === 'tournaments' ? (
          <TournamentList />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="table-card p-6 animate-pulse">
                <div className="h-5 bg-white/5 rounded mb-3" />
                <div className="h-4 bg-white/5 rounded mb-2 w-3/4" />
                <div className="h-4 bg-white/5 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onJoin={() => navigate(`/table/${table.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      {showWallet && <WalletModal onClose={() => { setShowWallet(false); refreshUser(); }} />}
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}
      {showCreate && (
        <CreateTableModal
          onClose={() => setShowCreate(false)}
          onCreate={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}
