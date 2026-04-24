import { Users, Coins, TrendingUp } from 'lucide-react';
import { TableInfo } from '../../types';

interface Props {
  table: TableInfo;
  onJoin: () => void;
}

const STAKE_COLORS = {
  low: 'text-green-400 border-green-900',
  medium: 'text-yellow-400 border-yellow-900',
  high: 'text-orange-400 border-orange-900',
  vip: 'text-purple-400 border-purple-900',
};

function getStake(bigBlind: number): keyof typeof STAKE_COLORS {
  if (bigBlind <= 1000) return 'low';
  if (bigBlind <= 5000) return 'medium';
  if (bigBlind <= 20000) return 'high';
  return 'vip';
}

function formatChips(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const PHASE_LABELS: Record<string, string> = {
  waiting: '⏳ Waiting',
  preflop: '🃏 Pre-Flop',
  flop: '🃏 Flop',
  turn: '🃏 Turn',
  river: '🃏 River',
  showdown: '🏆 Showdown',
  finished: '✅ Finished',
};

export default function TableCard({ table, onJoin }: Props) {
  const stake = getStake(table.bigBlind);
  const stakeColor = STAKE_COLORS[stake];
  const isFull = table.playerCount >= table.maxPlayers;

  return (
    <div className="table-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-white text-base">{table.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${stakeColor} bg-black/30 mt-1 inline-block`}>
            {stake.toUpperCase()} STAKES
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {PHASE_LABELS[table.phase] || table.phase}
        </span>
      </div>

      {/* Blinds */}
      <div className="flex items-center gap-2">
        <Coins className="w-4 h-4 text-yellow-500" />
        <span className="text-gray-300 text-sm">
          {formatChips(table.smallBlind)} / {formatChips(table.bigBlind)}
        </span>
      </div>

      {/* Buy-in */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-blue-400" />
        <span className="text-gray-400 text-xs">
          Buy-in: {formatChips(table.minBuyIn)} – {formatChips(table.maxBuyIn)}
        </span>
      </div>

      {/* Players */}
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-green-400" />
        <div className="flex-1 bg-black/40 rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(table.playerCount / table.maxPlayers) * 100}%`,
              background: isFull
                ? 'linear-gradient(90deg, #cc0000, #8b0000)'
                : 'linear-gradient(90deg, #2d6a4f, #1a8a4a)',
            }}
          />
        </div>
        <span className="text-gray-400 text-xs">
          {table.playerCount}/{table.maxPlayers}
        </span>
      </div>

      {/* Join button */}
      <button
        onClick={onJoin}
        disabled={isFull}
        className={`w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all ${
          isFull
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
            : 'hover:scale-105'
        }`}
        style={
          !isFull
            ? {
                background: 'linear-gradient(135deg, #c9a227, #8b6e1a)',
                boxShadow: '0 4px 12px rgba(201,162,39,0.3)',
              }
            : undefined
        }
      >
        {isFull ? 'Table Full' : 'Join Table →'}
      </button>
    </div>
  );
}
