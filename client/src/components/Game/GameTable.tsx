import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, LogOut, Volume2, VolumeX } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { useSocket } from '../../hooks/useSocket';
import { TableInfo, PlayerAction } from '../../types';
import api from '../../utils/api';
import CommunityCards from './CommunityCards';
import PlayerSeat from './PlayerSeat';
import BettingControls from './BettingControls';
import { soundManager } from '../../utils/sounds';
import toast from 'react-hot-toast';

/** Smooth count-up/down animation for numeric values */
function useAnimatedCount(target: number, duration = 450): number {
  const [displayed, setDisplayed] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const start = prevRef.current;
    if (start === target) return;
    const startTime = performance.now();
    let raf: number;
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(start + (target - start) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return displayed;
}

// Seat positions around the oval (percentage-based, 9 seats)
const SEAT_POSITIONS: Array<{ top: string; left: string }> = [
  { top: '88%', left: '50%' },   // 0: bottom-center (self)
  { top: '78%', left: '22%' },   // 1: bottom-left
  { top: '48%', left: '7%'  },   // 2: left
  { top: '16%', left: '18%' },   // 3: top-left
  { top: '8%',  left: '38%' },   // 4: top-left-mid
  { top: '8%',  left: '62%' },   // 5: top-right-mid
  { top: '16%', left: '82%' },   // 6: top-right
  { top: '48%', left: '93%' },   // 7: right
  { top: '78%', left: '78%' },   // 8: bottom-right
];

function formatChips(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const PHASE_LABELS: Record<string, string> = {
  waiting:  'Waiting for players...',
  preflop:  'Pre-Flop',
  flop:     'Flop',
  turn:     'Turn',
  river:    'River',
  showdown: 'Showdown!',
  finished: 'Hand Complete',
};

/** Bokeh ambient light spot */
function BokehSpot({ x, y, size, color, opacity }: { x: number; y: number; size: number; color: string; opacity: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: `${y}%`,
        left: `${x}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        opacity,
        filter: `blur(${size * 0.5}px)`,
        pointerEvents: 'none',
      }}
    />
  );
}

export default function GameTable() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuthStore();
  const { gameState, chatMessages, showWinner, setCurrentTableId, clearGame } = useGameStore();
  const { joinTable, leaveTable, sendAction, sendChat, isConnected } = useSocket();

  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [buyInModal, setBuyInModal] = useState(true);
  const [buyIn, setBuyIn] = useState(0);
  const [seatIndex, setSeatIndex] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Pre-action: action queued while waiting for turn
  const [pendingAction, setPendingAction] = useState<'check_fold' | 'fold' | 'call' | null>(null);
  const prevIsMyTurnRef = useRef(false);

  // Sound effect refs to track changes
  const prevPhaseRef = useRef<string | null>(null);
  const prevTurnKeyRef = useRef<string>('');

  // Chip fly particles
  const feltRef = useRef<HTMLDivElement>(null);
  const chipIdRef = useRef(0);
  const prevLastActionRef = useRef('');
  const [chipFlies, setChipFlies] = useState<Array<{
    id: number; fromX: number; fromY: number; toWinner: boolean; color: string; delay: number;
  }>>([]);

  // Derived: current player identity (needed by effects below)
  const selfPlayer = gameState?.players.find(p => p.userId === user?.id);
  const currentTurnPlayer = gameState?.players[gameState?.currentPlayerIndex ?? -1];
  const isMyTurn = currentTurnPlayer?.userId === user?.id;

  // Fetch table info
  useEffect(() => {
    if (!tableId) return;
    api.get(`/tables/${tableId}`).then(({ data }) => {
      setTableInfo(data);
      setBuyIn(Math.min(data.minBuyIn * 10, data.maxBuyIn));
      setCurrentTableId(tableId);
      // Auto-select first free seat based on live occupiedSeats from server
      const occupied: number[] = data.occupiedSeats ?? [];
      const firstFree = [...Array(data.maxPlayers).keys()].find(i => !occupied.includes(i)) ?? 0;
      setSeatIndex(firstFree);

      // Tournaments: auto-join, skip buy-in modal.  Server assigns seat and
      // starting stack based on tournament registration.
      if (data.isTournament) {
        setBuyInModal(false);
      }
    }).catch(() => {
      toast.error('Table not found');
      navigate('/');
    });
    return () => { clearGame(); };
  }, [tableId]);

  // Phase sound effects
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === prevPhaseRef.current) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = gameState.phase;
    if (!prev) return; // skip on initial mount

    switch (gameState.phase) {
      case 'flop':     soundManager.revealFlop(); break;
      case 'turn':     soundManager.revealCard(); break;
      case 'river':    soundManager.revealCard(); break;
      case 'showdown':
        if (gameState.winners?.length) soundManager.win();
        break;
    }
  }, [gameState?.phase]);

  // Turn change sound (for current player)
  useEffect(() => {
    if (!gameState || gameState.phase === 'waiting') return;
    const key = `${gameState.roundNumber}-${gameState.currentPlayerIndex}`;
    if (key === prevTurnKeyRef.current) return;
    prevTurnKeyRef.current = key;
    // turnStart sound is handled inside PlayerSeat for isSelf
    // Here just play chip sound for other players making bets
    if (gameState.lastAction?.action === 'raise' || gameState.lastAction?.action === 'call') {
      soundManager.chipPlace();
    }
  }, [gameState?.currentPlayerIndex, gameState?.roundNumber]);

  // Auto-execute pre-action when our turn arrives
  useEffect(() => {
    const justBecameMyTurn = isMyTurn && !prevIsMyTurnRef.current;
    prevIsMyTurnRef.current = !!isMyTurn;
    if (!justBecameMyTurn || !selfPlayer || !gameState || !tableId) return;

    // Sitting out: immediately fold/check without waiting for the timer
    if (isSittingOut) {
      const canCheck = gameState.currentBet === selfPlayer.currentBet;
      sendAction(tableId, canCheck ? 'check' : 'fold');
      return;
    }

    if (!pendingAction) return;
    const canCheck = gameState.currentBet === selfPlayer.currentBet;
    let action: PlayerAction | null = null;
    if (pendingAction === 'fold')            action = 'fold';
    else if (pendingAction === 'call')       action = canCheck ? 'check' : 'call';
    else if (pendingAction === 'check_fold') action = canCheck ? 'check' : 'fold';
    if (action) { sendAction(tableId, action); }
    setPendingAction(null);
  }, [isMyTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear pre-action when a new street or new hand starts
  useEffect(() => {
    setPendingAction(null);
  }, [gameState?.phase, gameState?.roundNumber]);

  // Helper: compute pixel offset of a displaySeat from felt centre
  const getSeatOffset = (displaySeat: number): { x: number; y: number } => {
    if (!feltRef.current) return { x: 0, y: 0 };
    const { width, height } = feltRef.current.getBoundingClientRect();
    const pos = SEAT_POSITIONS[displaySeat % SEAT_POSITIONS.length];
    return {
      x: Math.round(parseFloat(pos.left) / 100 * width  - width  / 2),
      y: Math.round(parseFloat(pos.top)  / 100 * height - height / 2),
    };
  };

  // Chip fly: bet/call/raise → pot
  useEffect(() => {
    if (!gameState?.lastAction) return;
    const key = JSON.stringify(gameState.lastAction);
    if (key === prevLastActionRef.current) return;
    prevLastActionRef.current = key;

    const { action, playerId } = gameState.lastAction;
    if (!['call', 'raise', 'allin'].includes(action)) return;

    const actor = gameState.players.find(p => p.userId === playerId || p.id === playerId);
    if (!actor) return;
    const selfSeat = selfPlayer?.seatIndex ?? 0;
    const displaySeat = (actor.seatIndex - selfSeat + (tableInfo?.maxPlayers ?? 9)) % (tableInfo?.maxPlayers ?? 9);
    const { x, y } = getSeatOffset(displaySeat);

    const count = action === 'allin' ? 4 : action === 'raise' ? 2 : 1;
    const color = action === 'allin' ? '#a855f7' : action === 'raise' ? '#f0c040' : '#3b82f6';
    const newFlies = Array.from({ length: count }, (_, i) => ({
      id: ++chipIdRef.current,
      fromX: x + (i - Math.floor(count / 2)) * 12,
      fromY: y + (i % 2 === 0 ? 0 : -8),
      toWinner: false,
      color,
      delay: i * 60,
    }));
    setChipFlies(prev => [...prev, ...newFlies]);
    setTimeout(() => setChipFlies(prev => prev.filter(f => !newFlies.find(n => n.id === f.id))), 1000);
  }, [gameState?.lastAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chip fly: pot → winner
  useEffect(() => {
    if (!showWinner || !gameState?.winners?.length) return;
    const winner = gameState.players.find(p =>
      gameState.winners!.some(w => w.playerId === p.id || w.playerId === p.userId)
    );
    if (!winner) return;
    const selfSeat = selfPlayer?.seatIndex ?? 0;
    const displaySeat = (winner.seatIndex - selfSeat + (tableInfo?.maxPlayers ?? 9)) % (tableInfo?.maxPlayers ?? 9);
    const { x, y } = getSeatOffset(displaySeat);

    const CHIP_COUNT = 28;
    const palette = ['#f0c040', '#fde68a', '#4ade80', '#f0c040', '#fbbf24', '#f0c040', '#facc15', '#86efac'];
    const newFlies = Array.from({ length: CHIP_COUNT }, (_, i) => ({
      id: ++chipIdRef.current,
      fromX: x + (Math.random() - 0.5) * 80,
      fromY: y + (Math.random() - 0.5) * 50,
      toWinner: true,
      color: palette[i % palette.length],
      delay: i * 80,
    }));
    setChipFlies(prev => [...prev, ...newFlies]);
    // lifetime = last chip start (CHIP_COUNT-1)*80 ms + animation duration 2.4 s + buffer
    const totalMs = (CHIP_COUNT - 1) * 80 + 2400 + 400;
    setTimeout(() => setChipFlies(prev => prev.filter(f => !newFlies.find(n => n.id === f.id))), totalMs);
  }, [showWinner]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = () => {
    if (!tableInfo || !user) return;
    if (user.chips < buyIn) { toast.error('Insufficient chips'); return; }
    joinTable(tableInfo.id, buyIn, seatIndex);
    setBuyInModal(false);
    setHasJoined(true);
  };

  // Auto-join tournament tables as soon as tableInfo + socket are ready.
  // Server ignores buyIn and assigns starting_stack + any free seat.
  useEffect(() => {
    if (!tableInfo?.isTournament || !isConnected || hasJoined) return;
    joinTable(tableInfo.id, 0, seatIndex);
    setHasJoined(true);
  }, [tableInfo?.id, tableInfo?.isTournament, isConnected, hasJoined, seatIndex]);

  const handleLeave = async () => {
    leaveTable();
    await refreshUser();
    clearGame();
    navigate('/');
  };

  // Leave next hand: when enabled, automatically leave as soon as current hand
  // ends (phase becomes waiting/finished) so the player won't be dealt in or
  // post blinds for the next round.
  const [leaveNextHand, setLeaveNextHand] = useState(false);
  useEffect(() => {
    if (!leaveNextHand) return;
    const phase = gameState?.phase;
    // Leave immediately if between hands, otherwise wait for hand to end.
    if (!phase || phase === 'waiting' || phase === 'finished') {
      handleLeave();
    }
  }, [leaveNextHand, gameState?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = (action: PlayerAction, amount?: number) => {
    if (!tableId) return;
    sendAction(tableId, action, amount);
    lastActivityRef.current = Date.now();
    setIsSittingOut(false);
    sitOutStartRef.current = null;
    setShowInactiveWarn(false);
  };

  // Inactivity flow:
  //   0–2 min  : playing normally
  //   2 min    : sit-out (folded from hands automatically, warning shown)
  //   2–5 min  : sitting out, countdown shown
  //   5 min    : auto-leave table
  const lastActivityRef = useRef<number>(Date.now());
  const [showInactiveWarn, setShowInactiveWarn] = useState(false);
  const [isSittingOut, setIsSittingOut] = useState(false);
  const sitOutStartRef = useRef<number | null>(null);

  const INACTIVE_SITOUT_MS = 2 * 60 * 1000;  // 2 min → sit out
  const SITOUT_LEAVE_MS   = 3 * 60 * 1000;  // 3 min sitting out → leave
  const WARN_BEFORE_MS    = 30 * 1000;       // warn 30 s before sit-out

  useEffect(() => {
    if (!hasJoined) return;
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;

      if (!isSittingOut) {
        if (idle >= INACTIVE_SITOUT_MS) {
          setIsSittingOut(true);
          sitOutStartRef.current = Date.now();
          toast('Sitting out due to inactivity — you will leave in 3 minutes', {
            icon: '💤', duration: 6000,
          });
        } else if (idle >= INACTIVE_SITOUT_MS - WARN_BEFORE_MS) {
          setShowInactiveWarn(true);
        } else {
          setShowInactiveWarn(false);
        }
      } else {
        const sittingMs = Date.now() - (sitOutStartRef.current ?? Date.now());
        if (sittingMs >= SITOUT_LEAVE_MS) {
          clearInterval(interval);
          toast.error('Left table after 3 minutes of sitting out');
          handleLeave();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [hasJoined, isSittingOut]); // eslint-disable-line react-hooks/exhaustive-deps


  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableId || !chatInput.trim()) return;
    sendChat(tableId, chatInput.trim());
    setChatInput('');
  };

  const toggleSound = () => {
    const enabled = soundManager.toggle();
    setSoundEnabled(enabled);
  };

  // Animated pot value
  const animatedPot = useAnimatedCount(gameState?.pot ?? 0);

  const arrangedPlayers = (() => {
    if (!gameState || !selfPlayer) return gameState?.players || [];
    const selfSeat = selfPlayer.seatIndex;
    return gameState.players.map(p => ({
      ...p,
      displaySeat: ((p.seatIndex - selfSeat + (tableInfo?.maxPlayers ?? 9)) % (tableInfo?.maxPlayers ?? 9)),
    }));
  })();

  if (!tableInfo) {
    return (
      <div className="game-bg min-h-screen flex items-center justify-center">
        <div style={{ color: '#f0c040', fontFamily: 'Cinzel, serif', fontSize: 18 }}>Loading table...</div>
      </div>
    );
  }

  // â”€â”€â”€ BUY-IN MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (buyInModal) {
    return (
      <div className="game-bg min-h-screen flex items-center justify-center px-4">
        <div className="glass-panel p-8 w-full max-w-md">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 style={{ fontFamily: 'Cinzel, serif', color: '#f0c040', fontSize: 22, fontWeight: 700 }}>
              {tableInfo.name}
            </h2>
          </div>
          <p className="text-gray-500 text-sm mb-6">
            Blinds: {formatChips(tableInfo.smallBlind)} / {formatChips(tableInfo.bigBlind)}
          </p>

          {/* Seat grid */}
          <div className="mb-6">
            <label className="text-gray-400 text-sm block mb-2">Choose your seat</label>
            <div className="grid grid-cols-3 gap-2">
              {[...Array(tableInfo.maxPlayers)].map((_, i) => {
                // Use occupiedSeats from REST response — accurate before joining socket
                const taken = (tableInfo.occupiedSeats ?? []).includes(i);
                const selected = seatIndex === i && !taken;
                return (
                  <button
                    key={i}
                    onClick={() => !taken && setSeatIndex(i)}
                    disabled={taken}
                    style={{
                      padding: '8px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      border: selected ? '2px solid #f0c040' : '1px solid rgba(255,255,255,0.1)',
                      background: selected ? 'rgba(201,162,39,0.2)' : taken ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.4)',
                      color: taken ? '#4b5563' : selected ? '#f0c040' : '#d1d5db',
                      cursor: taken ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {taken ? '🚫 Taken' : `Seat ${i + 1}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Buy-in slider */}
          <div className="mb-6">
            <label className="text-gray-400 text-sm block mb-2">
              Buy-in ({formatChips(tableInfo.minBuyIn)} â€“ {formatChips(tableInfo.maxBuyIn)})
            </label>
            <input
              type="range"
              min={tableInfo.minBuyIn}
              max={Math.min(tableInfo.maxBuyIn, user?.chips || 0)}
              step={tableInfo.bigBlind}
              value={buyIn}
              onChange={e => setBuyIn(+e.target.value)}
              className="w-full mb-2"
              style={{ accentColor: '#c9a227' }}
            />
            <div style={{ textAlign: 'center', color: '#f0c040', fontWeight: 700, fontSize: 22, fontFamily: 'Cinzel, serif' }}>
              {formatChips(buyIn)}
            </div>
            <div className="text-center text-gray-500 text-xs mt-1">
              Your balance: {formatChips(user?.chips || 0)}
            </div>
          </div>

          <button
            onClick={handleJoin}
            disabled={!isConnected || (user?.chips || 0) < buyIn}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              color: '#fff',
              background: 'linear-gradient(135deg, #c9a227, #8b6e1a)',
              border: '1px solid rgba(240,192,64,0.4)',
              cursor: !isConnected || (user?.chips || 0) < buyIn ? 'not-allowed' : 'pointer',
              opacity: !isConnected || (user?.chips || 0) < buyIn ? 0.5 : 1,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'Cinzel, serif',
              boxShadow: '0 4px 16px rgba(201,162,39,0.3)',
            }}
          >
            {isConnected ? 'Join Table' : 'Connecting...'}
          </button>
        </div>
      </div>
    );
  }

  // â”€â”€â”€ MAIN GAME TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="game-bg min-h-screen flex flex-col overflow-hidden" style={{ position: 'relative' }}>

      {/* Atmospheric bokeh spots */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <BokehSpot x={8}  y={15} size={200} color="#7b2510" opacity={0.18} />
        <BokehSpot x={88} y={75} size={180} color="#6b1a10" opacity={0.15} />
        <BokehSpot x={50} y={5}  size={150} color="#c9a227" opacity={0.06} />
        <BokehSpot x={15} y={80} size={120} color="#8b3010" opacity={0.12} />
        <BokehSpot x={85} y={20} size={140} color="#7b2010" opacity={0.12} />
        <BokehSpot x={50} y={95} size={160} color="#5c1a08" opacity={0.14} />
      </div>

      {/* â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="game-header relative z-20 flex items-center justify-between px-5 py-2.5" style={{ minHeight: 52 }}>
        {/* Left: Leave + table name */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
          {selfPlayer && (
            <label
              className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
              style={{ color: leaveNextHand ? '#f87171' : '#9ca3af' }}
              title="Automatically leave after this hand ends"
            >
              <input
                type="checkbox"
                checked={leaveNextHand}
                onChange={(e) => setLeaveNextHand(e.target.checked)}
                className="accent-red-500 cursor-pointer"
              />
              <span className="hidden md:inline">Leave next hand</span>
              <span className="md:hidden">Leave next</span>
            </label>
          )}
          {isSittingOut && (
            <button
              onClick={() => {
                setIsSittingOut(false);
                sitOutStartRef.current = null;
                lastActivityRef.current = Date.now();
                setShowInactiveWarn(false);
                toast.success('Welcome back!', { duration: 2000 });
              }}
              className="text-xs px-3 py-1 rounded-lg animate-pulse"
              style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171' }}
            >
              💤 Sitting out — click to return
            </button>
          )}
          {!isSittingOut && showInactiveWarn && (
            <span
              className="text-xs animate-pulse"
              style={{ color: '#fbbf24' }}
              title="You will be removed from the table soon due to inactivity"
            >
              ⚠ Inactive — sitting out soon
            </span>
          )}
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          <div>
            <div style={{ fontFamily: 'Cinzel, serif', color: '#f0c040', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
              {tableInfo.name}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              {formatChips(tableInfo.smallBlind)}/{formatChips(tableInfo.bigBlind)} Â· {PHASE_LABELS[gameState?.phase || 'waiting']}
            </div>
          </div>
        </div>

        {/* Center: AcePoker logo */}
        <div style={{ fontFamily: 'Cinzel, serif', fontWeight: 900, fontSize: 18, color: '#f0c040', letterSpacing: '0.12em', textShadow: '0 0 20px rgba(240,192,64,0.4)' }}>
          â™  ACEPOKER
        </div>

        {/* Right: chips + sound + chat */}
        <div className="flex items-center gap-2">
          {/* Round counter */}
          {gameState && gameState.roundNumber > 0 && (
            <div style={{
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(201,162,39,0.3)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              color: '#c9a227',
              fontWeight: 600,
            }}>
              ROUND {gameState.roundNumber}
            </div>
          )}
          {/* Chip balance */}
          <div className="chip chip-gold" style={{ fontSize: 12 }}>
            ðŸª™ {formatChips(user?.chips || 0)}
          </div>
          {/* Sound toggle */}
          <button className="sound-btn" onClick={toggleSound} title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          {/* Chat toggle */}
          <button className="sound-btn" onClick={() => setShowChat(v => !v)} title="Chat">
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* â”€â”€ MAIN TABLE AREA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 relative flex items-center justify-center z-10" style={{ padding: '12px 32px 0px' }}>

      {/* === 3-LAYER OVAL TABLE — wrapped in perspective for 3D tilt === */}
        {/* Perspective container gives subtle top-down Zynga angle */}
        <div style={{ perspective: '1200px', perspectiveOrigin: '50% 15%' }}>
        <div
          className="poker-table-rail"
          style={{
            position: 'relative',
            width: 'min(94vw, 1000px)',
            height: 'min(72vh, 560px)',
            padding: 14,
            transform: 'rotateX(4deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Gold trim ring */}
          <div
            className="poker-table-gold"
            style={{ width: '100%', height: '100%', padding: 4 }}
          >
            {/* Green felt */}
            <div
              ref={feltRef}
              className="poker-table-felt"
              style={{ width: '100%', height: '100%', position: 'relative' }}
            >
              {/* Watermark */}
              <div className="table-watermark">♠</div>

              {/* Moving felt sheen — overhead lamp illusion */}
              <div
                style={{
                  position: 'absolute',
                  inset: '-30%',
                  borderRadius: '50%',
                  background: 'radial-gradient(ellipse 42% 32% at 50% 50%, rgba(255,255,255,0.07) 0%, transparent 70%)',
                  animation: 'feltSheen 9s ease-in-out infinite',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />

              {/* ── CENTER CONTENT ── */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  zIndex: 10,
                }}
              >
                {/* Pot */}
                {gameState && gameState.pot > 0 && (
                  <div className="pot-display">
                    🪙 POT: {formatChips(animatedPot)}
                  </div>
                )}

                {/* Phase prompt (Zynga "CHECK or BET?" style) */}
                {gameState?.phase !== 'waiting' && gameState?.phase !== 'finished' && (
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'rgba(240,192,64,0.7)',
                    fontFamily: 'Cinzel, serif',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                  }}>
                    {PHASE_LABELS[gameState?.phase || 'waiting']}
                  </div>
                )}

                {/* Community cards */}
                <CommunityCards
                  cards={gameState?.communityCards || []}
                  phase={gameState?.phase || 'waiting'}
                />

                {/* Winner banner */}
                {showWinner && gameState?.winners && gameState.winners.length > 0 && (
                  <div
                    className="winner-banner animate-winnerBanner"
                    style={{
                      position: 'absolute',
                      bottom: -56,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      padding: '8px 20px',
                      color: '#111',
                      fontWeight: 800,
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      zIndex: 20,
                    }}
                  >
                    {gameState.winners.map(w => {
                      const p = gameState.players.find(pl => pl.id === w.playerId);
                      return `ðŸ† ${p?.username} wins ${formatChips(w.amount)}${w.hand ? ` (${w.hand.description})` : ''}`;
                    }).join(' Â· ')}
                  </div>
                )}
              </div>

              {/* Chip fly particles — absolute, centred on felt, animated via CSS vars */}
              {chipFlies.map(fly => (
                <div
                  key={fly.id}
                  style={{
                    position: 'absolute',
                    left: '50%', top: '50%',
                    width: fly.toWinner ? 22 : 16,
                    height: fly.toWinner ? 22 : 16,
                    marginLeft: fly.toWinner ? -11 : -8,
                    marginTop: fly.toWinner ? -11 : -8,
                    borderRadius: '50%',
                    background: fly.color,
                    border: '2px solid rgba(255,255,255,0.55)',
                    boxShadow: `0 0 14px ${fly.color}, 0 0 4px rgba(0,0,0,0.5)`,
                    zIndex: 50,
                    pointerEvents: 'none',
                    ['--fx' as string]: `${fly.fromX}px`,
                    ['--fy' as string]: `${fly.fromY}px`,
                    animation: fly.toWinner
                      ? `chipFlyFromCenter 2.4s ${fly.delay}ms cubic-bezier(0.22,1,0.36,1) both`
                      : `chipFlyToCenter 0.7s ${fly.delay}ms cubic-bezier(0.4,0,0.2,1) both`,
                  } as React.CSSProperties}
                />
              ))}

              {/* ── DEALER / SB / BB TOKENS on felt surface ── */}
              {gameState?.phase !== 'waiting' && arrangedPlayers.map((player: any) => {
                const label = player.isDealer ? 'D' : player.isSmallBlind ? 'SB' : player.isBigBlind ? 'BB' : null;
                if (!label) return null;
                const pos = SEAT_POSITIONS[player.displaySeat % SEAT_POSITIONS.length];
                const sx = parseFloat(pos.left);
                const sy = parseFloat(pos.top);
                // 42% toward center — keeps token inside the oval
                const tx = (sx + (50 - sx) * 0.42).toFixed(1);
                const ty = (sy + (50 - sy) * 0.42).toFixed(1);
                const cfg = label === 'D'
                  ? { c1: '#f5f5f5', c2: '#c0c0c0', notch: 'rgba(0,0,0,0.25)', text: '#111111', fs: 14, sz: 36 }
                  : label === 'SB'
                  ? { c1: '#60a5fa', c2: '#1d4ed8', notch: 'rgba(255,255,255,0.3)', text: '#ffffff', fs: 10, sz: 30 }
                  : { c1: '#f87171', c2: '#991b1b', notch: 'rgba(255,255,255,0.3)', text: '#ffffff', fs: 9, sz: 30 };
                return (
                  <div
                    key={`felt-token-${player.id}`}
                    className="absolute animate-chipSpin"
                    style={{
                      top: `${ty}%`,
                      left: `${tx}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 15,
                      filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.95))',
                      pointerEvents: 'none',
                    }}
                  >
                    <svg width={cfg.sz} height={cfg.sz} viewBox="0 0 36 36">
                      {/* Shadow ring */}
                      <circle cx="18" cy="19" r="15" fill="rgba(0,0,0,0.4)" />
                      {/* Outer ring */}
                      <circle cx="18" cy="18" r="17" fill={cfg.c2} />
                      {/* Main face */}
                      <circle cx="18" cy="18" r="15" fill={cfg.c1} />
                      {/* Inner ring */}
                      <circle cx="18" cy="18" r="12" fill="none" stroke={cfg.notch} strokeWidth="1.5" />
                      {/* Notch marks */}
                      {Array.from({ length: 8 }, (_, i) => {
                        const a = (i / 8) * Math.PI * 2;
                        return (
                          <line
                            key={i}
                            x1={(18 + Math.cos(a) * 12).toFixed(1)}
                            y1={(18 + Math.sin(a) * 12).toFixed(1)}
                            x2={(18 + Math.cos(a) * 15).toFixed(1)}
                            y2={(18 + Math.sin(a) * 15).toFixed(1)}
                            stroke={cfg.notch} strokeWidth="2" strokeLinecap="round"
                          />
                        );
                      })}
                      {/* Label */}
                      <text
                        x="18" y="18"
                        textAnchor="middle" dominantBaseline="central"
                        fill={cfg.text}
                        fontSize={cfg.fs}
                        fontWeight="900"
                        fontFamily="Arial Black, Arial, sans-serif"
                      >{label}</text>
                    </svg>
                  </div>
                );
              })}

              {/* Waiting message */}
              {(!gameState || gameState.players.length < 2) && (
                <div style={{
                  position: 'absolute',
                  bottom: '18%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  color: 'rgba(240,192,64,0.6)',
                  fontSize: 13,
                }}>
                  <div>Waiting for players...</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.3)' }}>Need at least 2 players</div>
                </div>
              )}
            </div>
          </div>

          {/* ── PLAYER SEATS OVERLAY ──────────────────────────────────────────
               Positioned inside poker-table-rail but OUTSIDE poker-table-felt
               so overflow:hidden oval doesn't clip avatars or timer rings.
               inset: 18px = 14px rail padding + 4px gold padding → exact
               coordinate space as the felt (same %, same center point). */}
          <div
            style={{
              position: 'absolute',
              top: 18, left: 18, right: 18, bottom: 18,
            }}
          >
            {arrangedPlayers.map((player: any) => {
              const pos = SEAT_POSITIONS[player.displaySeat % SEAT_POSITIONS.length];
              const isCurrentTurn =
                gameState?.phase !== 'waiting' &&
                gameState?.phase !== 'finished' &&
                currentTurnPlayer?.id === player.id;
              const isWinner = gameState?.winners?.some(w => w.playerId === player.id) || false;
              return (
                <PlayerSeat
                  key={player.id}
                  player={player}
                  isCurrentTurn={isCurrentTurn}
                  isWinner={isWinner}
                  gameState={gameState}
                  position={pos}
                  isSelf={player.userId === user?.id}
                  onAutoFold={player.userId === user?.id ? () => {
                    handleAction('fold');
                    // Immediately enter sit-out so next hands are skipped
                    // until the player clicks an action themselves.
                    setIsSittingOut(true);
                    sitOutStartRef.current = Date.now();
                    toast('Sitting out — click any action to return', { icon: '💤', duration: 4000 });
                  } : undefined}
                />
              );
            })}
          </div>
        </div>
        </div>{/* end perspective wrapper */}
      </div>

      {/* ── BOTTOM ACTION AREA (zero-height — controls are fixed overlays) ── */}
      <div style={{ height: 0 }} />

      {/* ── BETTING CONTROLS (fixed bottom bar, Zynga style) ── */}
      {/* Only show when it IS this player's turn AND they have been dealt in
          (hole cards present, not folded, active). Prevents buttons from
          flashing for a player who just sat down mid-hand.
          Hidden when sitting out — actions are auto-executed instead. */}
      {isMyTurn && selfPlayer && gameState
        && selfPlayer.isActive
        && !selfPlayer.isFolded
        && !isSittingOut
        && (selfPlayer.holeCards?.length ?? 0) > 0
        && gameState.phase !== 'waiting'
        && gameState.phase !== 'finished'
        && gameState.phase !== 'showdown' && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: 'linear-gradient(0deg, rgba(5,1,2,0.96) 0%, rgba(5,1,2,0.7) 80%, transparent 100%)',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <BettingControls
            gameState={gameState}
            currentPlayer={{ chips: selfPlayer.chips, currentBet: selfPlayer.currentBet }}
            onAction={handleAction}
          />
        </div>
      )}

      {/* ── PRE-ACTION PANEL (fixed right side, Zynga-style while waiting) ── */}
      {!isMyTurn && selfPlayer && !selfPlayer.isFolded
        && selfPlayer.isActive
        && (selfPlayer.holeCards?.length ?? 0) > 0
        && gameState?.phase !== 'waiting'
        && gameState?.phase !== 'finished'
        && gameState?.phase !== 'showdown' && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: 'linear-gradient(0deg, rgba(5,1,2,0.96) 0%, rgba(5,1,2,0.7) 80%, transparent 100%)',
          padding: '8px 32px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}>
          <div style={{ color: '#6b7280', fontSize: 10, fontFamily: 'Cinzel, serif', letterSpacing: '0.12em' }}>
            WAITING FOR {currentTurnPlayer?.username?.toUpperCase() ?? '...'}
          </div>
          <div className="flex items-end justify-center gap-5">
            {/* CHECK / FOLD */}
            <div className="flex flex-col items-center gap-1">
              <span style={{ color: '#86efac', fontSize: 11, fontWeight: 600 }}>Check/Fold</span>
              <button
                onClick={() => setPendingAction(a => a === 'check_fold' ? null : 'check_fold')}
                style={{
                  width: 62, height: 62, borderRadius: '50%', cursor: 'pointer', transition: 'all 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: pendingAction === 'check_fold' ? 'radial-gradient(circle at 35% 35%, #20b870, #0d7a45)' : 'rgba(13, 122, 69, 0.25)',
                  border: pendingAction === 'check_fold' ? '2.5px solid rgba(80, 220, 140, 0.9)' : '2px solid rgba(80, 220, 140, 0.35)',
                  color: '#86efac',
                  boxShadow: pendingAction === 'check_fold' ? '0 0 20px rgba(13, 122, 69, 0.8)' : '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>

            {/* FOLD */}
            <div className="flex flex-col items-center gap-1">
              <span style={{ color: '#fca5a5', fontSize: 11, fontWeight: 600 }}>Fold</span>
              <button
                onClick={() => setPendingAction(a => a === 'fold' ? null : 'fold')}
                style={{
                  width: 62, height: 62, borderRadius: '50%', cursor: 'pointer', transition: 'all 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: pendingAction === 'fold' ? 'radial-gradient(circle at 35% 35%, #e03030, #900000)' : 'rgba(144, 0, 0, 0.25)',
                  border: pendingAction === 'fold' ? '2.5px solid rgba(255, 100, 100, 0.9)' : '2px solid rgba(255, 100, 100, 0.35)',
                  color: '#fca5a5',
                  boxShadow: pendingAction === 'fold' ? '0 0 20px rgba(144, 0, 0, 0.8)' : '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* CALL ANY */}
            <div className="flex flex-col items-center gap-1">
              <span style={{ color: '#93c5fd', fontSize: 11, fontWeight: 600 }}>Call Any</span>
              <button
                onClick={() => setPendingAction(a => a === 'call' ? null : 'call')}
                style={{
                  width: 62, height: 62, borderRadius: '50%', cursor: 'pointer', transition: 'all 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: pendingAction === 'call' ? 'radial-gradient(circle at 35% 35%, #3b82f6, #1d4ed8)' : 'rgba(29, 78, 216, 0.25)',
                  border: pendingAction === 'call' ? '2.5px solid rgba(100, 160, 255, 0.9)' : '2px solid rgba(100, 160, 255, 0.35)',
                  color: '#93c5fd',
                  boxShadow: pendingAction === 'call' ? '0 0 20px rgba(29, 78, 216, 0.8)' : '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                  <line x1="4" y1="12" x2="4" y2="19" />
                </svg>
              </button>
            </div>
          </div>

          {/* Confirmation text */}
          {pendingAction && (
            <div
              className="animate-bouncePop"
              style={{ fontSize: 11, color: 'rgba(240,192,64,0.8)', fontStyle: 'italic', marginTop: 2 }}
            >
              {pendingAction === 'check_fold' ? '✓ Will check, or fold if bet' :
               pendingAction === 'fold'       ? '✓ Will fold when turn comes' :
                                               '✓ Will call any bet'}
            </div>
          )}
        </div>
      )}

      {/* Waiting for players overlay */}
      {(!gameState || gameState.phase === 'waiting') && hasJoined && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(240,192,64,0.5)', fontSize: 13, textAlign: 'center', zIndex: 40,
        }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontWeight: 600 }}>Waiting for more players</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Game starts with 2+ players</div>
        </div>
      )}

      {/* â”€â”€ CHAT PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showChat && (
        <div
          className="glass-panel"
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            width: 300,
            maxHeight: 380,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 30,
          }}
        >
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid rgba(201,162,39,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: '#f0c040', fontWeight: 600, fontSize: 13, fontFamily: 'Cinzel, serif' }}>Chat</span>
            <button onClick={() => setShowChat(false)} style={{ color: '#6b7280', cursor: 'pointer' }}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', maxHeight: 260 }}>
            {chatMessages.length === 0 ? (
              <p style={{ color: '#4b5563', fontSize: 12, textAlign: 'center' }}>No messages yet</p>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 6, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: msg.userId === user?.id ? '#f0c040' : '#60a5fa' }}>
                    {msg.username}:
                  </span>{' '}
                  <span style={{ color: '#d1d5db' }}>{msg.message}</span>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendChat} style={{ padding: '8px 14px', borderTop: '1px solid rgba(201,162,39,0.15)' }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              className="input-poker"
              style={{ fontSize: 13, padding: '8px 12px' }}
              placeholder="Type a message..."
              maxLength={200}
            />
          </form>
        </div>
      )}
    </div>
  );
}