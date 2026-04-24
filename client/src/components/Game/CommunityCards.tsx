import { Card } from '../../types';
import CardComponent from './CardComponent';

interface Props {
  cards: Card[];
  phase: string;
}

export default function CommunityCards({ cards, phase }: Props) {
  const placeholders = Math.max(0, 5 - cards.length);

  return (
    <div className="flex items-center gap-2">
      {cards.map((card, i) => (
        <CardComponent
          key={i}
          card={card}
          size="md"
          animated
          delay={i * 200}
        />
      ))}
      {/* Placeholder slots */}
      {[...Array(placeholders)].map((_, i) => (
        <div
          key={`ph-${i}`}
          className="w-14 h-20 rounded-md border-2 border-dashed border-white/10"
          style={{ background: 'rgba(0,0,0,0.2)' }}
        />
      ))}
    </div>
  );
}
