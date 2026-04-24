import { useState } from 'react';
import { GameState, PlayerAction } from '../../types';
import { soundManager } from '../../utils/sounds';

interface Props {
  gameState: GameState;
  currentPlayer: { chips: number; currentBet: number } | null;
  onAction: (action: PlayerAction, amount?: number) => void;
}

function formatChips(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function BettingControls({ gameState, currentPlayer, onAction }: Props) {
  const [raiseAmount, setRaiseAmount] = useState(gameState.minRaise || gameState.bigBlind * 2);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);

  if (!currentPlayer) return null;

  const { currentBet, bigBlind } = gameState;
  const playerBet = currentPlayer.currentBet;
  const playerChips = currentPlayer.chips;
  const callAmount = Math.min(currentBet - playerBet, playerChips);
  const canCheck = currentBet === playerBet;
  const canCall = !canCheck && callAmount > 0;
  const canRaise = playerChips > callAmount;
  const maxRaise = playerChips + playerBet;
  const minRaiseAmount = Math.max(gameState.minRaise, currentBet + bigBlind);

  const QUICK_RAISES = [
    { label: '½ Pot', value: Math.floor(gameState.pot / 2) },
    { label: '¾ Pot', value: Math.floor(gameState.pot * 0.75) },
    { label: 'Pot',   value: gameState.pot },
    { label: '2×',    value: currentBet * 2 },
  ];

  const handleFold = () => { soundManager.fold(); onAction('fold'); };
  const handleCheck = () => { soundManager.check(); onAction('check'); };
  const handleCall = () => { soundManager.call(); onAction('call'); };
  const handleRaise = () => { soundManager.raise(); onAction('raise', raiseAmount); setShowRaiseSlider(false); };
  const handleAllIn = () => { soundManager.allIn(); onAction('allin'); };

  return (
    <div className="flex flex-col items-center gap-3 select-none">

      {/* Raise slider panel */}
      {canRaise && showRaiseSlider && (
        <div
          className="flex flex-col items-center gap-2 px-5 py-3 rounded-2xl animate-floatIn"
          style={{
            background: 'rgba(0,0,0,0.65)',
            border: '1px solid rgba(201,162,39,0.3)',
            backdropFilter: 'blur(8px)',
            minWidth: 320,
          }}
        >
          {/* Quick raise pills */}
          <div className="flex gap-2">
            {QUICK_RAISES.map(({ label, value }) => {
              const v = Math.min(Math.max(value, minRaiseAmount), maxRaise);
              return (
                <button
                  key={label}
                  onClick={() => setRaiseAmount(v)}
                  className={`raise-pill ${raiseAmount === v ? 'active' : ''}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Slider + amount */}
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => setRaiseAmount(a => Math.max(minRaiseAmount, a - bigBlind))}
              style={{ color: '#c9a227', fontSize: 20, fontWeight: 700, lineHeight: 1, padding: '0 4px' }}
            >−</button>
            <input
              type="range"
              min={minRaiseAmount}
              max={maxRaise}
              step={bigBlind}
              value={raiseAmount}
              onChange={e => setRaiseAmount(Number(e.target.value))}
              className="flex-1"
              style={{ accentColor: '#c9a227' }}
            />
            <button
              onClick={() => setRaiseAmount(a => Math.min(maxRaise, a + bigBlind))}
              style={{ color: '#c9a227', fontSize: 20, fontWeight: 700, lineHeight: 1, padding: '0 4px' }}
            >+</button>
          </div>

          <div style={{ color: '#f0c040', fontWeight: 700, fontSize: 18, fontFamily: 'Cinzel, serif' }}>
            {formatChips(raiseAmount)}
          </div>
        </div>
      )}

      {/* Action buttons – Zynga circle style: label ON TOP, circle BELOW */}
      <div className="flex items-end justify-center gap-5">

        {/* FOLD – red circle */}
        <div className="flex flex-col items-center gap-1">
          <span style={{ color: '#fca5a5', fontSize: 11, fontWeight: 600 }}>Fold</span>
          <button className="zynga-btn-fold" onClick={handleFold}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* CHECK / CALL – teal circle (larger) */}
        <div className="flex flex-col items-center gap-1">
          <span style={{ color: '#86efac', fontSize: 11, fontWeight: 600 }}>
            {canCheck ? 'Check' : `Call ${formatChips(callAmount)}`}
          </span>
          {canCheck ? (
            <button className="zynga-btn-check" onClick={handleCheck}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          ) : (
            <button className="zynga-btn-check" onClick={handleCall}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          )}
        </div>

        {/* BET / RAISE – gold circle */}
        {canRaise && (
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: '#fde68a', fontSize: 11, fontWeight: 600 }}>
              {showRaiseSlider ? `${canCheck ? 'Bet' : 'Raise'} ${formatChips(raiseAmount)}` : (canCheck ? 'Bet' : 'Raise')}
            </span>
            <button
              className="zynga-btn-bet"
              onClick={() => {
                if (showRaiseSlider) {
                  handleRaise();
                } else {
                  setShowRaiseSlider(true);
                }
              }}
            >
              {showRaiseSlider ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* ALL-IN – purple small circle */}
        {playerChips > 0 && (
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: '#d8b4fe', fontSize: 10, fontWeight: 600 }}>All-In</span>
            <button className="zynga-btn-allin" onClick={handleAllIn}>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.03em' }}>ALL</span>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.03em' }}>IN</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


