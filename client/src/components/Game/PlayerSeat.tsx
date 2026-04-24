import { useEffect, useState } from 'react';
import { Card, GamePlayer, GameState } from '../../types';
import CardComponent from './CardComponent';
import { soundManager } from '../../utils/sounds';

interface Props {
  player: GamePlayer;
  isCurrentTurn: boolean;
  isWinner: boolean;
  gameState: GameState | null;
  position: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  isSelf: boolean;
  onAutoFold?: () => void;
}

const TURN_SECONDS = 12;

const ACTION_LABELS: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  raise: 'Raise',
  allin: 'All-In',
};

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  fold:  { bg: 'rgba(139,0,0,0.85)',    text: '#fca5a5' },
  check: { bg: 'rgba(15,118,60,0.85)',  text: '#86efac' },
  call:  { bg: 'rgba(30,80,160,0.85)',  text: '#93c5fd' },
  raise: { bg: 'rgba(130,90,10,0.85)',  text: '#fde68a' },
  allin: { bg: 'rgba(90,5,130,0.85)',   text: '#d8b4fe' },
};

const AVATAR_COLORS = [
  ['#b91c1c', '#7f1d1d'],
  ['#1d4ed8', '#1e3a8a'],
  ['#15803d', '#14532d'],
  ['#7c3aed', '#4c1d95'],
  ['#c2410c', '#7c2d12'],
  ['#be185d', '#831843'],
  ['#0f766e', '#134e4a'],
  ['#1d4ed8', '#172554'],
  ['#92400e', '#451a03'],
];

function formatChips(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** Client-side hand strength evaluator (preflop + postflop) */
function getHandHint(holeCards: Card[], communityCards: Card[]): string | null {
  if (!holeCards || holeCards.length < 2 || holeCards.some(c => c.hidden)) return null;
  const RANK_VAL: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  const [c1, c2] = holeCards;

  // Preflop hints
  if (communityCards.length === 0) {
    if (c1.rank === c2.rank) return `Pocket ${c1.rank}s 🔥`;
    if (c1.suit === c2.suit) return 'Suited ♦';
    if (['A', 'K', 'Q', 'J'].includes(c1.rank) && ['A', 'K', 'Q', 'J'].includes(c2.rank)) return 'Big Cards ⭐';
    return null;
  }

  const all = [...holeCards, ...communityCards];
  const rankCount: Record<string, number> = {};
  const suitCount: Record<string, number> = {};
  for (const c of all) {
    rankCount[c.rank] = (rankCount[c.rank] || 0) + 1;
    suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
  }
  const counts = Object.values(rankCount).sort((a, b) => b - a);
  const hasFlush = Object.values(suitCount).some(c => c >= 5);
  const hasFlushDraw = !hasFlush && Object.values(suitCount).some(c => c === 4);

  const uniq = [...new Set(all.map(c => RANK_VAL[c.rank]))].sort((a, b) => a - b);
  let hasStraight = false;
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i + 4] - uniq[i] === 4 && new Set(uniq.slice(i, i + 5)).size === 5) {
      hasStraight = true; break;
    }
  }
  // Wheel (A-2-3-4-5)
  if (!hasStraight && uniq.includes(14) && [2, 3, 4, 5].every(v => uniq.includes(v))) hasStraight = true;

  if (hasFlush && hasStraight) return 'Straight Flush! 🌟';
  if (counts[0] === 4) return 'Four of a Kind! 🔥';
  if (counts[0] === 3 && counts[1] >= 2) return 'Full House! 💪';
  if (hasFlush) return 'Flush! ♠';
  if (hasStraight) return 'Straight! ⬆';
  if (counts[0] === 3) return 'Three of a Kind!';
  if (counts[0] === 2 && counts[1] === 2) {
    const paired = Object.entries(rankCount).filter(([, c]) => c >= 2).map(([r]) => r);
    return holeCards.some(c => paired.includes(c.rank)) ? 'Two Pair' : 'Two Pair (Board)';
  }
  if (counts[0] === 2) {
    const pr = Object.entries(rankCount).find(([, c]) => c >= 2)?.[0];
    return holeCards.some(c => c.rank === pr) ? 'Pair in Hand ✓' : 'Board Pair';
  }
  if (hasFlushDraw) return 'Flush Draw 🎯';
  // Straight draw (4 outs in a window of 5)
  for (let i = 0; i <= uniq.length - 4; i++) {
    if (uniq[i + 3] - uniq[i] <= 4) return 'Straight Draw';
  }
  return null;
}

/** Mini stacked chip tower — shows up to 5 layers based on chip count */
function ChipStack({ chips }: { chips: number }) {
  if (chips <= 0) return null;
  const layers = Math.min(5, Math.max(1, Math.ceil(Math.log2(chips / 200 + 1))));
  const COLORS = ['#f0c040', '#3b82f6', '#ef4444', '#22c55e', '#a855f7'];
  const W = 20, STEP = 5, H = 8 + layers * STEP;
  return (
    <svg
      width={W} height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}
    >
      {Array.from({ length: layers }, (_, i) => {
        const col = COLORS[i % COLORS.length];
        const y = H - 4 - i * STEP;
        return (
          <g key={i}>
            <ellipse cx={W / 2} cy={y + 2.5} rx={W / 2 - 1} ry={2.5} fill="rgba(0,0,0,0.4)" />
            <ellipse cx={W / 2} cy={y}       rx={W / 2 - 1} ry={2.5} fill={col} />
            <ellipse cx={W / 2 - 2} cy={y - 0.5} rx={3.5} ry={1.2} fill="rgba(255,255,255,0.22)" />
          </g>
        );
      })}
    </svg>
  );
}

/** Realistic poker dealer/blind chip */
function DealerChip({ label, color1, color2, textColor }: {
  label: string;
  color1: string;
  color2: string;
  textColor: string;
}) {
  const size = 28;
  const r = 13;
  const cx = 14;
  const cy = 14;
  // 8 notches around the edge
  const notches = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x1 = cx + Math.cos(angle) * (r - 1);
    const y1 = cy + Math.sin(angle) * (r - 1);
    const x2 = cx + Math.cos(angle) * (r + 2.5);
    const y2 = cy + Math.sin(angle) * (r + 2.5);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
  });

  return (
    <svg width={size + 6} height={size + 6} viewBox={`0 0 ${size + 6} ${size + 6}`} style={{ display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
      <defs>
        <radialGradient id={`chip-${label}`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={color1} />
          <stop offset="100%" stopColor={color2} />
        </radialGradient>
      </defs>
      {/* Outer ring */}
      <circle cx={cx + 3} cy={cy + 3} r={r + 2} fill={color2} opacity={0.6} />
      {/* Main body */}
      <circle cx={cx + 3} cy={cy + 3} r={r} fill={`url(#chip-${label})`} />
      {/* Inner ring */}
      <circle cx={cx + 3} cy={cy + 3} r={r - 4} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      {/* Notch lines */}
      {notches.map((d, i) => (
        <path key={i} d={d.replace(/(\d+\.?\d*),(\d+\.?\d*)/g, (_, x, y) => `${(parseFloat(x) + 3).toFixed(1)},${(parseFloat(y) + 3).toFixed(1)}`)} stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
      ))}
      {/* Label */}
      <text
        x={cx + 3} y={cy + 3}
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={label.length > 1 ? 7 : 9}
        fontWeight="900"
        fontFamily="Arial, sans-serif"
        letterSpacing="0.5"
      >
        {label}
      </text>
    </svg>
  );
}

/** Circular SVG countdown ring */
function TimerRing({ seconds, active, isSelf }: { seconds: number; active: boolean; isSelf: boolean }) {
  const size = 100;
  const radius = 44;
  const circ = 2 * Math.PI * radius;
  const pct = Math.max(0, seconds / TURN_SECONDS);
  const dashOffset = circ * (1 - pct);
  const isUrgent = seconds <= 3 && seconds > 0;
  const trackColor = isSelf ? 'rgba(240,192,64,0.15)' : 'rgba(255,255,255,0.10)';
  const arcColor = isUrgent ? '#ef4444' : isSelf ? '#f0c040' : '#fb923c';

  if (!active) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: -10,
        left: -10,
        width: size,
        height: size,
        transform: 'rotate(-90deg)',
        filter: isUrgent
          ? 'drop-shadow(0 0 8px #ef4444) drop-shadow(0 0 3px rgba(239,68,68,0.6))'
          : isSelf
          ? 'drop-shadow(0 0 6px rgba(240,192,64,0.7))'
          : 'drop-shadow(0 0 5px rgba(251,146,60,0.6))',
        pointerEvents: 'none',
        zIndex: 20,
      }}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth="4"
      />
      {/* Progress arc */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={arcColor}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
      />
    </svg>
  );
}

export default function PlayerSeat({ player, isCurrentTurn, isWinner, gameState, position, isSelf, onAutoFold }: Props) {
  const [turnSeconds, setTurnSeconds] = useState(TURN_SECONDS);
  const colors = AVATAR_COLORS[player.seatIndex % AVATAR_COLORS.length];

  // Countdown timer when it's this player's turn
  useEffect(() => {
    if (!isCurrentTurn) {
      setTurnSeconds(TURN_SECONDS);
      return;
    }
    setTurnSeconds(TURN_SECONDS);
    if (isSelf) soundManager.turnStart();

    const interval = setInterval(() => {
      setTurnSeconds(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          // Auto-fold when OWN timer runs out
          if (isSelf) onAutoFold?.();
          return 0;
        }
        if (next <= 3 && isSelf) soundManager.urgentTick();
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isCurrentTurn, isSelf]);

  const actionStyle = player.lastAction ? ACTION_COLORS[player.lastAction] : null;
  const handHint = isSelf && !player.isFolded && gameState?.phase !== 'waiting'
    ? getHandHint(player.holeCards || [], gameState?.communityCards || [])
    : null;

  // Active phases where others have hidden cards
  const isActivePhase = gameState?.phase && !['waiting', 'showdown', 'finished'].includes(gameState.phase);

  return (
    <div
      className="absolute"
      style={{ ...position, zIndex: isSelf ? 5 : 4 }}
    >
    <div className="flex flex-col items-center animate-seatEnter">
      {/* Self: face-up hole cards | Others: 2 face-down cards during active play */}
      {isSelf && (isSelf || gameState?.phase === 'showdown' || gameState?.phase === 'finished') &&
        player.holeCards?.length === 2 && (
          <div className="flex gap-1 mb-1" style={{ filter: player.isFolded ? 'grayscale(1) opacity(0.4)' : undefined }}>
            {player.holeCards.map((card, i) => (
              <CardComponent key={`${gameState?.roundNumber ?? 0}-${i}`} card={card} size="sm" faceDown={card.hidden} animated delay={i * 120} />
            ))}
          </div>
        )}

      {/* Showdown: reveal other players' actual cards */}
      {!isSelf && (gameState?.phase === 'showdown' || gameState?.phase === 'finished') &&
        player.holeCards?.length === 2 && !player.isFolded && (
          <div className="flex gap-1 mb-1">
            {player.holeCards.map((card, i) => (
              <CardComponent key={`${gameState?.roundNumber ?? 0}-${i}`} card={card} size="sm" faceDown={card.hidden} animated delay={i * 150} />
            ))}
          </div>
        )}

      {/* Others: face-down placeholder cards during preflop/flop/turn/river */}
      {!isSelf && !player.isFolded && isActivePhase && (
        <div className="flex gap-1 mb-1" style={{ opacity: 0.92 }}>
          <CardComponent
            key={`${gameState?.roundNumber ?? 0}-0`}
            card={{ suit: 'spades', rank: 'A', value: 14, hidden: true }}
            size="sm" faceDown animated delay={0}
          />
          <CardComponent
            key={`${gameState?.roundNumber ?? 0}-1`}
            card={{ suit: 'spades', rank: 'A', value: 14, hidden: true }}
            size="sm" faceDown animated delay={120}
          />
        </div>
      )}

      {/* Hand strength hint for self */}
      {handHint && (
        <div
          className="animate-bouncePop"
          style={{
            background: 'rgba(240,192,64,0.15)',
            border: '1px solid rgba(240,192,64,0.4)',
            borderRadius: 8,
            padding: '1px 7px',
            fontSize: 9,
            fontWeight: 700,
            color: '#fde68a',
            marginBottom: 2,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(4px)',
          }}
        >
          {handHint}
        </div>
      )}

      {/* Bet badge – Zynga style "B $500K" */}
      {player.currentBet > 0 && (
        <div
          className="bet-badge animate-betBadge mb-1"
          style={{ fontSize: 11 }}
        >
          <span style={{ color: '#93c5fd', fontWeight: 900, marginRight: 2 }}>B</span>
          {formatChips(player.currentBet)}
        </div>
      )}

      {/* Avatar + timer ring */}
      <div className="relative" style={{ width: 80, height: 80 }}>
        {/* Timer ring SVG — extends 10px beyond avatar on all sides */}
        <TimerRing seconds={turnSeconds} active={isCurrentTurn} isSelf={isSelf} />

        {/* Avatar circle */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${colors[0]}, ${colors[1]})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 800,
            fontFamily: 'Georgia, serif',
            textTransform: 'uppercase',
            userSelect: 'none',
            transition: 'box-shadow 0.3s',
            ...(isWinner
              ? { className: 'animate-winnerGlow' } as any
              : {}),
            boxShadow: isWinner
              ? '0 0 0 3px #4ade80, 0 0 24px rgba(74,222,128,0.9), 0 0 48px rgba(74,222,128,0.4)'
              : isCurrentTurn
              ? '0 0 0 3px #f0c040, 0 0 20px rgba(240,192,64,0.8), 0 0 40px rgba(240,192,64,0.35)'
              : '0 0 0 2px rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.6)',
            opacity: player.isFolded ? 0.38 : 1,
            filter: player.isFolded ? 'grayscale(0.8)' : undefined,
          }}
          className={isWinner ? 'animate-winnerGlow' : ''}
        >
          {player.username[0]}
        </div>

        {/* Countdown number — shown on avatar when ≤ 10s remaining */}
        {isCurrentTurn && turnSeconds <= 10 && turnSeconds > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 13,
              fontWeight: 900,
              color: '#ef4444',
              fontFamily: 'Arial Black, sans-serif',
              textShadow: '0 0 6px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,1)',
              zIndex: 25,
              lineHeight: 1,
            }}
          >
            {turnSeconds}
          </div>
        )}

        {/* SB / BB chip badges on avatar (secondary indicator) */}
        {player.isSmallBlind && !player.isDealer && (
          <div
            className="absolute z-10 animate-chipSpin"
            style={{ bottom: -6, right: -6 }}
            title="Small Blind"
          >
            <DealerChip label="SB" color1="#60a5fa" color2="#1d4ed8" textColor="#fff" />
          </div>
        )}
        {player.isBigBlind && !player.isSmallBlind && (
          <div
            className="absolute z-10 animate-chipSpin"
            style={{ bottom: -6, right: -6 }}
            title="Big Blind"
          >
            <DealerChip label="BB" color1="#f87171" color2="#991b1b" textColor="#fff" />
          </div>
        )}

        {/* All-in badge */}
        {player.isAllIn && (
          <div
            className="absolute -bottom-2 left-1/2 z-10"
            style={{
              transform: 'translateX(-50%)',
              background: 'rgba(90,5,130,0.9)',
              color: '#d8b4fe',
              fontSize: 9,
              fontWeight: 900,
              padding: '1px 6px',
              borderRadius: 8,
              border: '1px solid rgba(167,139,250,0.5)',
              whiteSpace: 'nowrap',
            }}
          >
            ALL IN
          </div>
        )}
      </div>

      {/* Name + chips pill */}
      <div
        className="mt-2 flex flex-col items-center gap-0.5"
        style={{ maxWidth: 96 }}
      >
        <div
          style={{
            background: 'rgba(0,0,0,0.65)',
            border: `1px solid ${isSelf ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8,
            padding: '2px 8px',
            maxWidth: 96,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isSelf ? '#f0c040' : '#e5e7eb',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            {player.username}
          </div>
        </div>
        <div className="chip chip-gold" style={{ fontSize: 10, padding: '1px 7px', display: 'flex', alignItems: 'center', gap: 3 }}>
          <ChipStack chips={player.chips} />
          {formatChips(player.chips)}
        </div>
      </div>

      {/* Last action badge */}
      {player.lastAction && actionStyle && (
        <div
          className="mt-1 animate-actionBadge"
          style={{
            background: actionStyle.bg,
            color: actionStyle.text,
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            backdropFilter: 'blur(4px)',
          }}
        >
          {ACTION_LABELS[player.lastAction] || player.lastAction}
        </div>
      )}

      {/* Hand description at showdown */}
      {player.hand && (gameState?.phase === 'showdown' || gameState?.phase === 'finished') && (
        <div
          className="mt-1 animate-bouncePop"
          style={{
            background: 'rgba(201,162,39,0.2)',
            border: '1px solid rgba(201,162,39,0.5)',
            borderRadius: 8,
            padding: '2px 7px',
            fontSize: 10,
            fontWeight: 600,
            color: '#f0c040',
            textAlign: 'center',
            maxWidth: 100,
          }}
        >
          {player.hand.description}
        </div>
      )}

      {/* Thinking dots — visible on other players' turns */}
      {isCurrentTurn && !isSelf && !player.isFolded && (
        <div className="flex gap-1 mt-1">
          {[0, 0.2, 0.4].map((delay, i) => (
            <div
              key={i}
              style={{
                width: 5, height: 5, borderRadius: '50%',
                background: '#f0c040',
                animation: `thinkDot 1.4s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
