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

// ── Reversal zones ───────────────────────────────────────────────────────────
// Price levels where dealer mechanics make a turn, a stall, or an acceleration
// more likely. Each carries an in-depth, directional read so the UI can say
// "price might reverse here / consolidate / keep going" instead of a bare line.

export type ReversalKind =
  | "resistance" // expect rejection / fade from above
  | "support" // expect a bounce from below
  | "pivot" // regime line — character changes across it
  | "magnet" // price gets pinned / drawn in
  | "breakout"; // beyond this, moves self-reinforce

export type ReversalBias =
  | "reverse-down"
  | "reverse-up"
  | "consolidate"
  | "breakout-up"
  | "breakout-down";

export interface ReversalZone {
  price: number;
  kind: ReversalKind;
  bias: ReversalBias;
  /** Short chart label, e.g. "Call Wall — fade". */
  label: string;
  /** Headline shown in the insight card. */
  title: string;
  /** In-depth, plain-English mechanics + what price might do. */
  detail: string;
  /** Rough conviction 0–1 from |gamma| concentration and proximity to spot. */
  strength: number;
}

const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);

/**
 * Derive reversal/continuation zones from the gamma structure. `longGamma` is
 * total-net-gamma ≥ 0 (dealers dampen) vs short (dealers amplify) — it flips the
 * meaning of every wall, so the narratives below are conditioned on it.
 */
export function reversalZones(
  aggs: StrikeAggregate[],
  spot: number | undefined,
  flip: number | null,
  pain: number | null,
): ReversalZone[] {
  if (aggs.length === 0 || spot == null) return [];
  const { callWall, putWall, strikes } = absorptionProfile(aggs, spot);
  const totalGamma = aggs.reduce((a, s) => a + s.netGammaNotional, 0);
  const longGamma = totalGamma >= 0;
  const maxAbs = aggs.reduce((m, a) => Math.max(m, Math.abs(a.netGammaNotional)), 0) || 1;

  const gammaAt = (strike: number) => {
    const hit = aggs.find((a) => a.strike === strike);
    return hit ? Math.abs(hit.netGammaNotional) : 0;
  };
  // Strength blends gamma concentration with closeness to spot (nearer = sharper).
  const strengthFor = (strike: number) => {
    const conc = gammaAt(strike) / maxAbs;
    const near = Math.exp(-Math.pow((strike - spot) / Math.max(spot * 0.03, 1), 2));
    return Math.min(1, 0.45 * conc + 0.55 * near);
  };

  const zones: ReversalZone[] = [];

  // Call Wall — the dominant positive-gamma strike above spot.
  if (callWall != null && callWall > spot) {
    const d = pct(callWall, spot);
    if (longGamma) {
      zones.push({
        price: callWall,
        kind: "resistance",
        bias: "reverse-down",
        label: "Call Wall — fade",
        title: "Call Wall · likely rejection",
        detail:
          `Heaviest positive gamma sits ${d.toFixed(1)}% up at the Call Wall. In long-gamma, ` +
          `dealers sell into strength as price approaches, so this often caps the move: expect a ` +
          `stall or a fade back toward the flip. A clean close above flips it from a ceiling to a ` +
          `launch pad — until then, treat it as the top of the range.`,
        strength: strengthFor(callWall),
      });
    } else {
      zones.push({
        price: callWall,
        kind: "breakout",
        bias: "breakout-up",
        label: "Call Wall — breach = chase",
        title: "Call Wall · breach triggers upside chase",
        detail:
          `Short gamma above the flip: if spot clears the Call Wall ${d.toFixed(1)}% up, dealers must ` +
          `buy into strength — a self-reinforcing upside chase. Below it, the same wall acts as a ` +
          `magnet/resistance and price may reverse down first. The breach is the tell: reject = fade, ` +
          `accept above = squeeze.`,
        strength: strengthFor(callWall),
      });
    }
  }

  // Put Wall — the dominant negative-gamma strike below spot.
  if (putWall != null && putWall < spot) {
    const d = pct(spot, putWall);
    if (longGamma) {
      zones.push({
        price: putWall,
        kind: "support",
        bias: "reverse-up",
        title: "Put Wall · likely bounce",
        label: "Put Wall — bounce",
        detail:
          `Largest hedging support sits ${d.toFixed(1)}% down at the Put Wall. In long-gamma dealers ` +
          `buy weakness into this level, so dips here tend to be bought — expect a bounce or at least ` +
          `a pause. Only a decisive break below opens an air pocket toward the next strike.`,
        strength: strengthFor(putWall),
      });
    } else {
      zones.push({
        price: putWall,
        kind: "breakout",
        bias: "breakout-down",
        title: "Put Wall · break = flush",
        label: "Put Wall — break = flush",
        detail:
          `Short gamma below the flip: losing the Put Wall ${d.toFixed(1)}% down forces dealers to sell ` +
          `into weakness — an accelerating flush with no mechanical floor until the next strike. While ` +
          `it holds, expect sharp reflex bounces off it; the break is where downside gets violent.`,
        strength: strengthFor(putWall),
      });
    }
  }

  // Gamma flip — the regime pivot.
  if (flip != null) {
    const above = spot > flip;
    const d = pct(spot, flip);
    zones.push({
      price: flip,
      kind: "pivot",
      bias: "consolidate",
      title: above ? "Gamma Flip · support pivot" : "Gamma Flip · reclaim line",
      label: "Gamma Flip — regime pivot",
      detail: above
        ? `Spot is ${Math.abs(d).toFixed(1)}% above the flip, in the stabilising (long-gamma) zone — ` +
          `pullbacks toward it usually get absorbed and reverse up. Lose the flip and the character ` +
          `changes: volatility expands and dips stop holding. Watch it as the line between "buy the ` +
          `dip" and "respect the downside."`
        : `Spot is ${Math.abs(d).toFixed(1)}% below the flip, in the unstable (short-gamma) zone where ` +
          `moves amplify both ways and price tends to whip. Reclaiming the flip flips dealers back to ` +
          `dampening and often marks the reversal up; until then, rallies are suspect and can fail fast.`,
      strength: 0.6,
    });
  }

  // Max pain — the expiry magnet.
  if (pain != null) {
    const d = pct(pain, spot);
    const near = Math.abs(d) < 1.2;
    zones.push({
      price: pain,
      kind: "magnet",
      bias: "consolidate",
      title: near ? "Max Pain · pinning here" : "Max Pain · drift target",
      label: "Max Pain — magnet",
      detail: near
        ? `Spot is right at max pain — the strike where the most option value expires worthless. Into ` +
          `expiry, dealer hedging tends to pin price here, so expect chop / consolidation and fading of ` +
          `extremes rather than a clean trend.`
        : `Max pain sits ${Math.abs(d).toFixed(1)}% ${d >= 0 ? "above" : "below"} spot. As expiry nears, ` +
          `pinning flows often drift price toward it, so it can act as a soft ${d >= 0 ? "upside" : "downside"} ` +
          `target and a place where a run loses steam and consolidates.`,
      strength: 0.4,
    });
  }

  // Secondary interior walls (absorption strikes not already flagged) — interim
  // reversal/consolidation shelves between the big levels.
  const flagged = new Set(zones.map((z) => z.price));
  for (const strike of strikes) {
    if (flagged.has(strike) || strike === callWall || strike === putWall) continue;
    const above = strike > spot;
    const d = pct(strike, spot);
    if (Math.abs(d) < 0.15) continue; // skip ~at-the-money noise
    zones.push({
      price: strike,
      kind: above ? "resistance" : "support",
      bias: "consolidate",
      title: `Absorption shelf ${d >= 0 ? "+" : ""}${d.toFixed(1)}%`,
      label: above ? "Absorption — overhead" : "Absorption — below",
      detail:
        `Secondary gamma concentration ${Math.abs(d).toFixed(1)}% ${above ? "above" : "below"} spot. ` +
        `Not the primary wall, but dealer hedging clusters here, so price often pauses or consolidates ` +
        `at this shelf before deciding — a likely spot for a stall or a minor reversal.`,
      strength: strengthFor(strike) * 0.7,
    });
    flagged.add(strike);
  }

  return zones
    .filter((z) => Number.isFinite(z.price))
    .sort((a, b) => b.price - a.price);
}
