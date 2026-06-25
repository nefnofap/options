// Lightweight lexicon sentiment scorer for financial headlines. No external
// dependency or key — the default engine for the (free) News Bias page. If an
// Apify token is configured, lib/intel/data.ts uses the AI actor instead.

import type { Bias } from "./types";

// Domain-tuned word lists. Weights are small; aggregate over a headline.
const BULLISH: Record<string, number> = {
  surge: 2, surges: 2, soar: 2, soars: 2, rally: 2, rallies: 2, jump: 1.5,
  jumps: 1.5, gain: 1, gains: 1, rise: 1, rises: 1, rose: 1, climb: 1,
  climbs: 1, beat: 1.5, beats: 1.5, upgrade: 1.5, upgraded: 1.5, bullish: 2,
  outperform: 1.5, record: 1, high: 0.8, highs: 0.8, strong: 1, strength: 1,
  boost: 1, boosts: 1, optimism: 1.5, optimistic: 1.5, recovery: 1, rebound: 1.5,
  upbeat: 1.5, growth: 1, profit: 1, profits: 1, "top": 0.8, tops: 1, easing: 1,
  cooled: 1, cools: 1, dovish: 1.5, cut: 0.5, cuts: 0.5,
};
const BEARISH: Record<string, number> = {
  plunge: 2, plunges: 2, crash: 2.5, crashes: 2.5, tumble: 2, tumbles: 2,
  slump: 1.5, slumps: 1.5, fall: 1, falls: 1, fell: 1, drop: 1, drops: 1,
  decline: 1, declines: 1, miss: 1.5, misses: 1.5, downgrade: 1.5,
  downgraded: 1.5, bearish: 2, underperform: 1.5, low: 0.8, lows: 0.8,
  weak: 1, weakness: 1, fear: 1.5, fears: 1.5, recession: 2, selloff: 2,
  "sell-off": 2, warning: 1.5, warn: 1.5, warns: 1.5, cut: 0.5, layoff: 1.5,
  layoffs: 1.5, loss: 1, losses: 1, slowdown: 1.5, hawkish: 1.5, hot: 1,
  surged: 0.5, inflation: 0.8, default: 2, crisis: 2, risk: 0.8, risks: 0.8,
};

export interface LexScore {
  score: number; // -1 .. +1
  bias: Bias;
  hits: string[];
}

const NEG = /\b(no|not|never|without|less|lower|cooling)\b/;

export function scoreText(text: string): LexScore {
  const lower = text.toLowerCase();
  const negated = NEG.test(lower);
  const words = lower.replace(/[^a-z0-9\- ]/g, " ").split(/\s+/);
  let raw = 0;
  const hits: string[] = [];
  for (const w of words) {
    if (BULLISH[w]) {
      raw += BULLISH[w];
      hits.push(w);
    } else if (BEARISH[w]) {
      raw -= BEARISH[w];
      hits.push(w);
    }
  }
  if (negated) raw *= -0.5; // crude negation handling
  // Squash to -1..1 with a soft curve.
  const score = Math.max(-1, Math.min(1, raw / 4));
  const bias: Bias = score > 0.12 ? "bullish" : score < -0.12 ? "bearish" : "neutral";
  return { score, bias, hits };
}

// Aggregate sentiment scores are small (per-headline scores are squashed and
// then averaged), so the aggregate band is tighter than the per-headline one.
export function biasOf(score: number): Bias {
  return score > 0.05 ? "bullish" : score < -0.05 ? "bearish" : "neutral";
}
