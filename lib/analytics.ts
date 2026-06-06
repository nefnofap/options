import type { OptionChain, OptionContract } from "./types";
import { blackScholes, charm as bsCharm, vanna as bsVanna, yearsBetween } from "./greeks";

export interface StrikeAggregate {
  strike: number;
  callOI: number;
  putOI: number;
  callVol: number;
  putVol: number;
  callGamma: number;
  putGamma: number;
  netGamma: number;       // GEX in shares
  netGammaNotional: number; // GEX in $/1% move (per 100-share contract)
  netDelta: number;       // DEX
  netVega: number;        // VEX
  netVanna: number;
  netCharm: number;
  callIV: number;
  putIV: number;
}

export interface ExpirationAggregate {
  expiration: string;
  callOI: number;
  putOI: number;
  totalOI: number;
  callVol: number;
  putVol: number;
  putCallRatio: number;
  netGamma: number;
  netDelta: number;
  netVega: number;
  avgIV: number;
  dte: number;
}

const CONTRACT_MULTIPLIER = 100;

export interface AnalyticsOptions {
  expiration?: string; // filter to a single expiry
  riskFree?: number;
  divYield?: number;
}

export function strikeAggregates(
  chain: OptionChain,
  opts: AnalyticsOptions = {},
): StrikeAggregate[] {
  const r = opts.riskFree ?? 0.045;
  const q = opts.divYield ?? 0;
  const now = new Date();
  const filtered = opts.expiration
    ? chain.contracts.filter((c) => c.expiration === opts.expiration)
    : chain.contracts;

  const map = new Map<number, StrikeAggregate>();

  for (const c of filtered) {
    const T = yearsBetween(now, new Date(`${c.expiration}T20:00:00Z`));
    const sigma = c.iv && c.iv > 0 ? c.iv : 0.3;
    const bs =
      c.delta && c.gamma && c.vega
        ? null
        : blackScholes({ S: chain.spot, K: c.strike, T, r, q, sigma, isCall: c.side === "C" });

    const delta = c.delta || (bs ? bs.delta : 0);
    const gamma = c.gamma || (bs ? bs.gamma : 0);
    const vega = c.vega || (bs ? bs.vega : 0);

    let agg = map.get(c.strike);
    if (!agg) {
      agg = {
        strike: c.strike,
        callOI: 0,
        putOI: 0,
        callVol: 0,
        putVol: 0,
        callGamma: 0,
        putGamma: 0,
        netGamma: 0,
        netGammaNotional: 0,
        netDelta: 0,
        netVega: 0,
        netVanna: 0,
        netCharm: 0,
        callIV: 0,
        putIV: 0,
      };
      map.set(c.strike, agg);
    }

    const oi = c.openInterest;
    const sign = c.side === "C" ? 1 : -1; // dealer-short calls (+gamma exposure to dealers when flipped) — convention: net = call - put

    if (c.side === "C") {
      agg.callOI += oi;
      agg.callVol += c.volume;
      agg.callGamma += gamma * oi;
      agg.callIV = sigma;
    } else {
      agg.putOI += oi;
      agg.putVol += c.volume;
      agg.putGamma += gamma * oi;
      agg.putIV = sigma;
    }

    // GEX convention: dealers are short calls, long puts (very rough). Net gamma exposure = (callGamma - putGamma) * OI * 100 * spot^2 * 0.01
    agg.netGamma += sign * gamma * oi * CONTRACT_MULTIPLIER;
    agg.netDelta += sign * delta * oi * CONTRACT_MULTIPLIER;
    agg.netVega += sign * vega * oi * CONTRACT_MULTIPLIER;
    agg.netVanna +=
      sign *
      bsVanna({ S: chain.spot, K: c.strike, T, r, q, sigma, isCall: c.side === "C" }) *
      oi *
      CONTRACT_MULTIPLIER;
    agg.netCharm +=
      sign *
      bsCharm({ S: chain.spot, K: c.strike, T, r, q, sigma, isCall: c.side === "C" }) *
      oi *
      CONTRACT_MULTIPLIER;
  }

  // Convert net gamma to $/1% move notional
  for (const a of map.values()) {
    a.netGammaNotional = a.netGamma * chain.spot * chain.spot * 0.0001; // gamma * S^2 * 0.01% = per 1% move scaled
  }

  return Array.from(map.values()).sort((a, b) => a.strike - b.strike);
}

export function expirationAggregates(chain: OptionChain): ExpirationAggregate[] {
  const now = new Date();
  const map = new Map<string, ExpirationAggregate>();
  for (const c of chain.contracts) {
    let agg = map.get(c.expiration);
    if (!agg) {
      const dte = Math.max(
        0,
        Math.round(
          (new Date(`${c.expiration}T20:00:00Z`).getTime() - now.getTime()) /
            (24 * 3600 * 1000),
        ),
      );
      agg = {
        expiration: c.expiration,
        callOI: 0,
        putOI: 0,
        totalOI: 0,
        callVol: 0,
        putVol: 0,
        putCallRatio: 0,
        netGamma: 0,
        netDelta: 0,
        netVega: 0,
        avgIV: 0,
        dte,
      };
      map.set(c.expiration, agg);
    }
    const sign = c.side === "C" ? 1 : -1;
    if (c.side === "C") {
      agg.callOI += c.openInterest;
      agg.callVol += c.volume;
    } else {
      agg.putOI += c.openInterest;
      agg.putVol += c.volume;
    }
    agg.totalOI += c.openInterest;
    agg.netGamma += sign * c.gamma * c.openInterest * CONTRACT_MULTIPLIER;
    agg.netDelta += sign * c.delta * c.openInterest * CONTRACT_MULTIPLIER;
    agg.netVega += sign * c.vega * c.openInterest * CONTRACT_MULTIPLIER;
    agg.avgIV = (agg.avgIV + (c.iv || 0)) / (agg.avgIV ? 2 : 1);
  }
  for (const a of map.values()) {
    a.putCallRatio = a.callOI > 0 ? a.putOI / a.callOI : 0;
  }
  return Array.from(map.values()).sort((a, b) => a.expiration.localeCompare(b.expiration));
}

// Volatility surface: rows = strike, cols = expiration. Used by Volatility & Heatmap tabs.
export interface VolPoint {
  strike: number;
  expiration: string;
  iv: number;
  side: "C" | "P";
}

export function ivSurface(chain: OptionChain): VolPoint[] {
  return chain.contracts
    .filter((c) => c.iv > 0)
    .map((c) => ({
      strike: c.strike,
      expiration: c.expiration,
      iv: c.iv,
      side: c.side,
    }));
}

// Approximate "flow": rank contracts by volume / OI ratio + raw $ premium traded.
export interface FlowEntry {
  contract: OptionContract;
  premium: number;
  volOI: number;
  bias: "C" | "P";
}

export function topFlow(chain: OptionChain, limit = 50): FlowEntry[] {
  const entries: FlowEntry[] = chain.contracts
    .filter((c) => c.volume > 0)
    .map((c) => {
      const mid = (c.bid + c.ask) / 2 || c.last;
      return {
        contract: c,
        premium: mid * c.volume * CONTRACT_MULTIPLIER,
        volOI: c.openInterest > 0 ? c.volume / c.openInterest : c.volume,
        bias: c.side,
      };
    });
  entries.sort((a, b) => b.premium - a.premium);
  return entries.slice(0, limit);
}

// Find zero-gamma flip / max pain.
export function gammaFlip(strikes: StrikeAggregate[]): number | null {
  if (strikes.length === 0) return null;
  let prev = strikes[0];
  for (let i = 1; i < strikes.length; i++) {
    const cur = strikes[i];
    if ((prev.netGamma <= 0 && cur.netGamma > 0) || (prev.netGamma >= 0 && cur.netGamma < 0)) {
      // linear interpolate
      const denom = cur.netGamma - prev.netGamma;
      if (Math.abs(denom) < 1e-9) return cur.strike;
      const t = -prev.netGamma / denom;
      return prev.strike + t * (cur.strike - prev.strike);
    }
    prev = cur;
  }
  return null;
}

export function maxPain(strikes: StrikeAggregate[]): number | null {
  if (strikes.length === 0) return null;
  let best = strikes[0].strike;
  let bestPain = Infinity;
  for (const s of strikes) {
    let pain = 0;
    for (const t of strikes) {
      if (s.strike >= t.strike) pain += (s.strike - t.strike) * t.callOI;
      if (s.strike <= t.strike) pain += (t.strike - s.strike) * t.putOI;
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = s.strike;
    }
  }
  return best;
}
