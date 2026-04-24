import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { X, Trophy, TrendingDown, ChevronLeft, ChevronRight, ChevronDown, Clock, Users, Coins } from 'lucide-react';
import api from '../../utils/api';

interface HandEvent {
  type: 'blind' | 'action' | 'phase';
  phase: string;
  userId?: string;
  username?: string;
  action?: string;
  amount?: number;
  cards?: Array<{ suit: string; rank: string }>;
  ts?: number;
}

interface GameRow {
  id: string;
  table_id: string;
  round_number: number;
  small_blind: number;
  big_blind: number;
  pot: number;
  players: number;
  iWon: boolean;
  myWin: number;
  winners_json: Array<{ userId: string; username: string; amount: number; hand?: { description: string } }>;
  community_cards: Array<{ suit: string; rank: string }>;
  action_history?: HandEvent[];
  ended_at: string;
}

const SUITS: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const RED = new Set(['hearts', 'diamonds']);

function MiniCard({ suit, rank }: { suit: string; rank: string }) {
  const isRed = RED.has(suit);
  return (
    <span
      className="inline-flex items-center justify-center rounded text-xs font-bold px-1 py-0.5"
      style={{
        background: '#f8f4e8',
        color: isRed ? '#c0392b' : '#1a1a1a',
        fontSize: 11,
        minWidth: 22,
        border: '1px solid #ddd',
        lineHeight: 1.2,
      }}
    >
      {rank}{SUITS[suit] ?? suit}
    </span>
  );
}

const formatChips = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const PHASE_LABEL: Record<string, string> = {
  preflop: 'Pre-flop',
  flop:    'Flop',
  turn:    'Turn',
  river:   'River',
};

const ACTION_LABEL: Record<string, string> = {
  fold:       'folded',
  check:      'checked',
  call:       'called',
  raise:      'raised',
  allin:      'went all-in',
  smallBlind: 'posted SB',
  bigBlind:   'posted BB',
};

function groupEventsByPhase(events: HandEvent[]) {
  const phases: Array<{ phase: string; events: HandEvent[] }> = [];
  const order = ['preflop', 'flop', 'turn', 'river'];
  for (const p of order) {
    const evs = events.filter(e => e.phase === p);
    if (evs.length) phases.push({ phase: p, events: evs });
  }
  return phases;
}

export default function HistoryModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const LIMIT = 10;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['game-history', page],
    queryFn: async () => {
      const { data } = await api.get(`/games/history?limit=${LIMIT}&page=${page}`);
      return data as { rows: GameRow[]; total: number; page: number; limit: number };
    },
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #1a0608 0%, #0d0203 100%)',
          border: '1px solid rgba(201,162,39,0.25)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-yellow-900/20">
          <h2 className="text-xl font-bold text-yellow-300" style={{ fontFamily: 'Cinzel, serif' }}>
            Game History
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center py-16 text-red-400">
              <p className="font-semibold">Failed to load history.</p>
              <p className="text-sm mt-1 text-gray-500">Pastikan tabel `games` sudah dibuat di Supabase.</p>
            </div>
          )}

          {!isLoading && !isError && (!data?.rows || data.rows.length === 0) && (
            <div className="text-center py-16 text-gray-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No game history yet.</p>
              <p className="text-sm mt-1">Games you play will appear here.</p>
            </div>
          )}

          {data?.rows.map(g => (
            <div
              key={g.id}
              className="rounded-xl px-4 py-3 flex flex-col gap-2"
              style={{
                background: g.iWon
                  ? 'linear-gradient(90deg, rgba(22,160,70,0.12) 0%, rgba(0,0,0,0) 100%)'
                  : 'rgba(255,255,255,0.04)',
                border: g.iWon ? '1px solid rgba(22,160,70,0.25)' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Top row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Win/Lose badge */}
                  {g.iWon ? (
                    <div className="flex items-center gap-1 text-green-400 text-xs font-bold bg-green-900/30 px-2 py-0.5 rounded-full">
                      <Trophy className="w-3 h-3" /> WIN +{formatChips(g.myWin)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-400 text-xs font-bold bg-red-900/20 px-2 py-0.5 rounded-full">
                      <TrendingDown className="w-3 h-3" /> LOSE
                    </div>
                  )}
                  {/* Pot */}
                  <div className="flex items-center gap-1 text-yellow-500 text-xs">
                    <Coins className="w-3 h-3" /> Pot {formatChips(g.pot)}
                  </div>
                  {/* Players */}
                  <div className="flex items-center gap-1 text-gray-400 text-xs">
                    <Users className="w-3 h-3" /> {g.players}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <span className="text-gray-600 text-xs">
                    {g.small_blind}/{g.big_blind} blinds · Round #{g.round_number}
                  </span>
                  <span className="text-gray-500 text-xs">{formatDate(g.ended_at)}</span>
                </div>
              </div>

              {/* Community cards */}
              {g.community_cards && g.community_cards.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {g.community_cards.map((c, i) => (
                    <MiniCard key={i} suit={c.suit} rank={c.rank} />
                  ))}
                </div>
              )}

              {/* Winners */}
              <div className="flex flex-wrap gap-2">
                {g.winners_json?.map(w => (
                  <div key={w.userId} className="flex items-center gap-1.5 text-xs text-gray-300">
                    <Trophy className="w-3 h-3 text-yellow-400 shrink-0" />
                    <span className="font-semibold text-yellow-300">{w.username}</span>
                    <span className="text-gray-500">+{formatChips(w.amount)}</span>
                    {w.hand?.description && (
                      <span className="text-indigo-400">({w.hand.description})</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Hand history (collapsible) */}
              {g.action_history && g.action_history.length > 0 && (
                <div className="mt-1">
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [g.id]: !e[g.id] }))}
                    className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-yellow-400 transition-colors"
                  >
                    <ChevronDown
                      className="w-3 h-3 transition-transform"
                      style={{ transform: expanded[g.id] ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    />
                    {expanded[g.id] ? 'Hide' : 'Show'} hand history ({g.action_history.length} events)
                  </button>
                  {expanded[g.id] && (
                    <div
                      className="mt-2 rounded-lg px-3 py-2 space-y-1.5 text-[11px]"
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      {groupEventsByPhase(g.action_history).map(({ phase, events }) => (
                        <div key={phase}>
                          <div className="text-yellow-500 font-semibold uppercase tracking-wider text-[10px] mb-0.5">
                            {PHASE_LABEL[phase] ?? phase}
                          </div>
                          <div className="space-y-0.5 ml-2">
                            {events.map((ev, idx) => {
                              if (ev.type === 'phase') {
                                return (
                                  <div key={idx} className="flex items-center gap-1.5 text-gray-400">
                                    <span>→ Dealt:</span>
                                    {ev.cards?.map((c, i) => (
                                      <MiniCard key={i} suit={c.suit} rank={c.rank} />
                                    ))}
                                  </div>
                                );
                              }
                              const label = ev.action ? ACTION_LABEL[ev.action] ?? ev.action : '';
                              return (
                                <div key={idx} className="text-gray-300">
                                  <span className="text-indigo-300">{ev.username}</span>{' '}
                                  <span className="text-gray-400">{label}</span>
                                  {ev.amount != null && ev.action !== 'fold' && ev.action !== 'check' && (
                                    <span className="text-yellow-400 ml-1">{formatChips(ev.amount)}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer / pagination */}
        {data && data.total > LIMIT && (
          <div className="px-6 py-3 border-t border-yellow-900/20 flex items-center justify-between">
            <span className="text-gray-500 text-sm">{data.total} games total</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-300" />
              </button>
              <span className="text-gray-400 text-sm min-w-[70px] text-center">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
