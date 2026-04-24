import { useEffect, useState } from 'react';
import { Card, Suit } from '../../types';

interface Props {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  animated?: boolean;
  className?: string;
  delay?: number; // ms delay before appearing
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

// Larger suit display for center of card
const SUIT_LARGE: Record<Suit, { symbol: string; color: string }> = {
  hearts:   { symbol: '♥', color: '#cc0000' },
  diamonds: { symbol: '♦', color: '#cc0000' },
  clubs:    { symbol: '♣', color: '#111111' },
  spades:   { symbol: '♠', color: '#111111' },
};

const SIZE = {
  sm: { w: 44, h: 62, rankSize: 13, suitCenter: 22, rankTop: 4, rankLeft: 4 },
  md: { w: 56, h: 80, rankSize: 15, suitCenter: 28, rankTop: 5, rankLeft: 5 },
  lg: { w: 68, h: 96, rankSize: 18, suitCenter: 34, rankTop: 6, rankLeft: 6 },
};

export default function CardComponent({ card, size = 'md', faceDown, animated, className = '', delay = 0 }: Props) {
  const [visible, setVisible] = useState(!animated || delay === 0);
  const [flipped, setFlipped] = useState(false);
  const d = SIZE[size];
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitInfo = SUIT_LARGE[card.suit];

  useEffect(() => {
    if (!animated) return;
    if (delay > 0) {
      const t = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(t);
    }
  }, [animated, delay]);

  useEffect(() => {
    if (!animated || !visible) return;
    // Small delay before flip to face-up
    if (!faceDown && !card.hidden) {
      const t = setTimeout(() => setFlipped(true), 80);
      return () => clearTimeout(t);
    }
  }, [animated, visible, faceDown, card.hidden]);

  if (!visible) return <div style={{ width: d.w, height: d.h }} />;

  const showFaceDown = faceDown || card.hidden || (animated && !flipped);

  const baseStyle: React.CSSProperties = {
    width: d.w,
    height: d.h,
    borderRadius: 7,
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0,
  };

  if (showFaceDown) {
    return (
      <div
        className={`card-back select-none ${animated ? 'animate-dealCard' : ''} ${className}`}
        style={baseStyle}
      >
        {/* Diamond pattern overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 4,
            borderRadius: 4,
            border: '1px solid rgba(201,162,39,0.5)',
          }}
        />
        {/* Center spade */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: d.suitCenter * 0.9,
            color: 'rgba(201,162,39,0.6)',
            userSelect: 'none',
          }}
        >
          ♠
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card-face select-none ${animated && flipped ? 'animate-cardFlip' : ''} ${animated ? '' : ''} ${className}`}
      style={baseStyle}
    >
      {/* Top-left rank + suit */}
      <div
        style={{
          position: 'absolute',
          top: d.rankTop,
          left: d.rankLeft,
          lineHeight: 1.1,
          color: suitInfo.color,
        }}
      >
        <div style={{ fontSize: d.rankSize, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1 }}>
          {card.rank}
        </div>
        <div style={{ fontSize: d.rankSize - 2, lineHeight: 1 }}>
          {SUIT_SYMBOLS[card.suit]}
        </div>
      </div>

      {/* Center suit symbol */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: d.suitCenter,
          color: suitInfo.color,
          userSelect: 'none',
          opacity: 0.85,
        }}
      >
        {SUIT_SYMBOLS[card.suit]}
      </div>

      {/* Bottom-right rank + suit (rotated) */}
      <div
        style={{
          position: 'absolute',
          bottom: d.rankTop,
          right: d.rankLeft,
          lineHeight: 1.1,
          color: suitInfo.color,
          transform: 'rotate(180deg)',
        }}
      >
        <div style={{ fontSize: d.rankSize, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1 }}>
          {card.rank}
        </div>
        <div style={{ fontSize: d.rankSize - 2, lineHeight: 1 }}>
          {SUIT_SYMBOLS[card.suit]}
        </div>
      </div>
    </div>
  );
}

