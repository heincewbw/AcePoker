import { Card } from './CardDeck';

export type HandRank =
  | 'Royal Flush'
  | 'Straight Flush'
  | 'Four of a Kind'
  | 'Full House'
  | 'Flush'
  | 'Straight'
  | 'Three of a Kind'
  | 'Two Pair'
  | 'One Pair'
  | 'High Card';

export interface HandResult {
  rank: HandRank;
  rankValue: number;     // 9 = Royal Flush, 0 = High Card
  tiebreakers: number[]; // for comparing same-rank hands
  bestCards: Card[];
  description: string;
}

const HAND_RANK_VALUES: Record<HandRank, number> = {
  'Royal Flush': 9,
  'Straight Flush': 8,
  'Four of a Kind': 7,
  'Full House': 6,
  'Flush': 5,
  'Straight': 4,
  'Three of a Kind': 3,
  'Two Pair': 2,
  'One Pair': 1,
  'High Card': 0,
};

// Generate all C(n,5) combinations
function combinations(cards: Card[], k: number): Card[][] {
  const result: Card[][] = [];
  const combo: Card[] = [];

  function helper(start: number) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i <= cards.length - (k - combo.length); i++) {
      combo.push(cards[i]);
      helper(i + 1);
      combo.pop();
    }
  }

  helper(0);
  return result;
}

function evaluate5CardHand(cards: Card[]): HandResult {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (handle A-2-3-4-5 low straight)
  let isStraight = false;
  let straightHighCard = values[0];
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 5) {
    if (values[0] - values[4] === 4) {
      isStraight = true;
      straightHighCard = values[0];
    }
    // A-2-3-4-5 (wheel)
    if (
      values[0] === 14 &&
      values[1] === 5 &&
      values[2] === 4 &&
      values[3] === 3 &&
      values[4] === 2
    ) {
      isStraight = true;
      straightHighCard = 5;
    }
  }

  // Count occurrences
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const countGroups = Object.entries(counts)
    .map(([val, cnt]) => ({ val: Number(val), cnt }))
    .sort((a, b) => b.cnt - a.cnt || b.val - a.val);

  // Royal Flush
  if (isFlush && isStraight && straightHighCard === 14) {
    return {
      rank: 'Royal Flush',
      rankValue: 9,
      tiebreakers: [14],
      bestCards: sorted,
      description: 'Royal Flush',
    };
  }

  // Straight Flush
  if (isFlush && isStraight) {
    return {
      rank: 'Straight Flush',
      rankValue: 8,
      tiebreakers: [straightHighCard],
      bestCards: sorted,
      description: `Straight Flush, ${sorted[0].rank} high`,
    };
  }

  // Four of a Kind
  if (countGroups[0].cnt === 4) {
    const quad = countGroups[0].val;
    const kicker = countGroups[1].val;
    return {
      rank: 'Four of a Kind',
      rankValue: 7,
      tiebreakers: [quad, kicker],
      bestCards: sorted,
      description: `Four of a Kind, ${rankLabel(quad)}s`,
    };
  }

  // Full House
  if (countGroups[0].cnt === 3 && countGroups[1].cnt === 2) {
    const trips = countGroups[0].val;
    const pair = countGroups[1].val;
    return {
      rank: 'Full House',
      rankValue: 6,
      tiebreakers: [trips, pair],
      bestCards: sorted,
      description: `Full House, ${rankLabel(trips)}s full of ${rankLabel(pair)}s`,
    };
  }

  // Flush
  if (isFlush) {
    return {
      rank: 'Flush',
      rankValue: 5,
      tiebreakers: values,
      bestCards: sorted,
      description: `Flush, ${sorted[0].rank} high`,
    };
  }

  // Straight
  if (isStraight) {
    return {
      rank: 'Straight',
      rankValue: 4,
      tiebreakers: [straightHighCard],
      bestCards: sorted,
      description: `Straight, ${rankLabel(straightHighCard)} high`,
    };
  }

  // Three of a Kind
  if (countGroups[0].cnt === 3) {
    const trips = countGroups[0].val;
    const kickers = countGroups.filter(g => g.cnt === 1).map(g => g.val);
    return {
      rank: 'Three of a Kind',
      rankValue: 3,
      tiebreakers: [trips, ...kickers],
      bestCards: sorted,
      description: `Three of a Kind, ${rankLabel(trips)}s`,
    };
  }

  // Two Pair
  if (countGroups[0].cnt === 2 && countGroups[1].cnt === 2) {
    const highPair = countGroups[0].val;
    const lowPair = countGroups[1].val;
    const kicker = countGroups[2].val;
    return {
      rank: 'Two Pair',
      rankValue: 2,
      tiebreakers: [highPair, lowPair, kicker],
      bestCards: sorted,
      description: `Two Pair, ${rankLabel(highPair)}s and ${rankLabel(lowPair)}s`,
    };
  }

  // One Pair
  if (countGroups[0].cnt === 2) {
    const pair = countGroups[0].val;
    const kickers = countGroups.filter(g => g.cnt === 1).map(g => g.val);
    return {
      rank: 'One Pair',
      rankValue: 1,
      tiebreakers: [pair, ...kickers],
      bestCards: sorted,
      description: `One Pair, ${rankLabel(pair)}s`,
    };
  }

  // High Card
  return {
    rank: 'High Card',
    rankValue: 0,
    tiebreakers: values,
    bestCards: sorted,
    description: `High Card, ${sorted[0].rank}`,
  };
}

function rankLabel(value: number): string {
  const labels: Record<number, string> = {
    14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack',
    10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2',
  };
  return labels[value] || String(value);
}

export function getBestHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  const combos = combinations(allCards, 5);
  let best: HandResult | null = null;

  for (const combo of combos) {
    const result = evaluate5CardHand(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }

  return best!;
}

export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;

  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) {
      return a.tiebreakers[i] - b.tiebreakers[i];
    }
  }
  return 0;
}

export function determineWinners(
  players: Array<{ id: string; holeCards: Card[] }>,
  communityCards: Card[]
): Array<{ id: string; hand: HandResult; isWinner: boolean }> {
  const results = players.map(p => ({
    id: p.id,
    hand: getBestHand(p.holeCards, communityCards),
    isWinner: false,
  }));

  results.sort((a, b) => compareHands(b.hand, a.hand));

  const bestHandValue = results[0].hand.rankValue;
  const bestTiebreakers = results[0].hand.tiebreakers;

  for (const result of results) {
    if (
      result.hand.rankValue === bestHandValue &&
      result.hand.tiebreakers.every((v, i) => v === bestTiebreakers[i])
    ) {
      result.isWinner = true;
    }
  }

  return results;
}
