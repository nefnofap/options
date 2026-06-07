// Dealer-positioning interpretation, derived from the standard gamma/vanna/charm
// framework (SpotGamma / MenthorQ / SqueezeMetrics conventions). ALL signs are
// dealer-side, matching analytics.ts's `net = call − put` aggregation.
//
//   • Gamma sign + spot-vs-flip  → the core volatility regime
//   • Vanna sign                 → the vol-conditional (IV up/down) bias
//   • Charm sign                 → near-expiry drift / pin direction
//
// Plus "absorption" levels: high-|gamma| strikes weighted by proximity to spot
// are the walls where dealer hedging mechanically dampens (long gamma) or
// accelerates (short gamma) price.

import type { StrikeAggregate } from "./analytics";

export type RegimeTone = "bull" | "bear" | "neutral";

export interface RegimeRead {
  label: string;
  interpretation: string;
  tone: RegimeTone;
  badges: string[]; // e.g. ["negative gamma", "positive vanna", "positive charm"]
  gamma: number; // total net gamma notional ($/1% move)
  vanna: number;
  charm: number;
  aboveFlip: boolean | null; // null when no flip level
}

const sgn = (x: number, eps = 0) => (x > eps ? 1 : x < -eps ? -1 : 0);

export function interpretRegime(
  aggs: StrikeAggregate[],
  spot: number | undefined,
  flip: number | null,
): RegimeRead {
  const gamma = aggs.reduce((a, s) => a + s.netGammaNotional, 0);
  const vanna = aggs.reduce((a, s) => a + s.netVanna, 0);
  const charm = aggs.reduce((a, s) => a + s.netCharm, 0);

  const g = sgn(gamma);
  const v = sgn(vanna);
  const c = sgn(charm);
  const aboveFlip = spot != null && flip != null ? spot > flip : null;

  const badges = [
    `${g > 0 ? "positive" : g < 0 ? "negative" : "flat"} gamma`,
    `${v > 0 ? "positive" : v < 0 ? "negative" : "flat"} vanna`,
    `${c > 0 ? "positive" : c < 0 ? "negative" : "flat"} charm`,
  ];

  // Flip-zone: total gamma is effectively flat → regime indeterminate.
  const totalAbsGamma = aggs.reduce((a, s) => a + Math.abs(s.netGammaNotional), 0);
  const nearZero = totalAbsGamma > 0 && Math.abs(gamma) / totalAbsGamma < 0.08;

  let label: string;
  let interpretation: string;
  let tone: RegimeTone;

  if (nearZero) {
    label = "Transition / Flip Zone";
    interpretation =
      "Net gamma is near zero — regime indeterminate. Expect a change in volatility character; reduce conviction and widen stops.";
    tone = "neutral";
  } else if (g >= 0) {
    // Long-gamma family
    if (aboveFlip === false) {
      label = "Fragile-Stable (below flip)";
      interpretation =
        "Nominally long-gamma but spot sits under the flip — support is thin and a vol spike can sell it. Don't over-trust the pin.";
      tone = "neutral";
    } else if (v > 0 && c > 0) {
      label = "Grind-Up (Vanna Tailwind)";
      interpretation =
        "Low-vol melt-up: falling IV (vanna) and time decay (charm) both add a steady dealer bid. Buy dips, fade spikes in vol.";
      tone = "bull";
    } else if (v > 0 && c < 0) {
      label = "Topping / Sell-the-News Risk";
      interpretation =
        "Stable but charm is selling; an IV crush can flip vanna flow to dealer selling and cap the rally. Trail longs.";
      tone = "neutral";
    } else {
      label = "Pinned / Stable";
      interpretation =
        "Mean-reverting and vol-suppressed. Dealers buy dips / sell rips — fade extremes and expect a range into the walls.";
      tone = "bull";
    }
  } else {
    // Short-gamma family
    if (aboveFlip === true) {
      label = "Breakout-Up (Wall Breach)";
      interpretation =
        "Short gamma above the flip — if spot clears the Call Wall, dealers must buy into strength: self-reinforcing upside chase.";
      tone = "bull";
    } else if (v > 0) {
      label = "Unstable / Squeeze-Risk";
      interpretation =
        "Amplifying selloff into a positive-vanna wall. A vol-down / IV-crush can force violent reflexive dealer buying — bear-bounce risk.";
      tone = "neutral";
    } else if (c < 0) {
      label = "Crash-Amplify (Air Pocket)";
      interpretation =
        "Most dangerous mix: vol-up forces more selling, charm sells, no mechanical floor. Gap / flush risk — respect downside.";
      tone = "bear";
    } else {
      label = "Whippy / Trend-Day";
      interpretation =
        "Trend-amplifying both ways with minor charm support. Moves run — chase momentum, don't fade.";
      tone = "bear";
    }
  }

  return { label, interpretation, tone, badges, gamma, vanna, charm, aboveFlip };
}

// ── Absorption ───────────────────────────────────────────────────────────────
export interface AbsorptionRead {
  strikes: number[]; // top absorption walls (to outline on the chart)
  callWall: number | null; // largest net positive gamma above spot
  putWall: number | null; // most negative net gamma below spot
}

/**
 * AbsorptionGEX(K) = |netGamma(K)| × proximityWeight(K), where the weight peaks
 * at-the-money and decays with distance (a Gaussian in |spot − K|). Surfaces the
 * strikes currently exerting the most mechanical dampening/acceleration.
 */
export function absorptionProfile(
  aggs: StrikeAggregate[],
  spot: number | undefined,
  topN = 6,
): AbsorptionRead {
  if (aggs.length === 0) return { strikes: [], callWall: null, putWall: null };
  const s = spot ?? aggs[Math.floor(aggs.length / 2)].strike;
  const scale = Math.max(s * 0.02, 1); // ~2% of spot

  const scored = aggs.map((a) => {
    const w = Math.exp(-Math.pow((a.strike - s) / scale, 2));
    return { strike: a.strike, score: Math.abs(a.netGammaNotional) * w };
  });
  const strikes = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .filter((x) => x.score > 0)
    .map((x) => x.strike);

  let callWall: number | null = null;
  let putWall: number | null = null;
  let maxPos = 0;
  let maxNeg = 0;
  for (const a of aggs) {
    if (a.strike >= s && a.netGammaNotional > maxPos) {
      maxPos = a.netGammaNotional;
      callWall = a.strike;
    }
    if (a.strike <= s && a.netGammaNotional < maxNeg) {
      maxNeg = a.netGammaNotional;
      putWall = a.strike;
    }
  }
  return { strikes, callWall, putWall };
}
