// ETF ↔ index ↔ future conversion map. The ETF→index divisors drift over time
// (dividends, expense, index divisor changes), so the UI prefers a LIVE ratio
// computed from real quotes; these static factors are the fallback and a sanity
// anchor. Future "point value" is the $/point of the e-mini contract.

export interface ConvertMap {
  etf: string;
  index: string; // Yahoo symbol for the cash index
  indexLabel: string;
  future: string; // Yahoo symbol for the front e-mini future
  futureLabel: string;
  micro?: string; // micro e-mini label
  approxMultiplier: number; // index ≈ etf * approxMultiplier
  pointValue: number; // $ per index point on the e-mini
}

// Keyed by ETF ticker.
export const CONVERT_MAP: Record<string, ConvertMap> = {
  SPY: {
    etf: "SPY",
    index: "^GSPC",
    indexLabel: "SPX",
    future: "ES=F",
    futureLabel: "ES",
    micro: "MES",
    approxMultiplier: 10,
    pointValue: 50,
  },
  QQQ: {
    etf: "QQQ",
    index: "^NDX",
    indexLabel: "NDX",
    future: "NQ=F",
    futureLabel: "NQ",
    micro: "MNQ",
    approxMultiplier: 41.06, // NDX/QQQ ~ 41.06 (2026, drifts with dividends); live ratio preferred
    pointValue: 20,
  },
  IWM: {
    etf: "IWM",
    index: "^RUT",
    indexLabel: "RUT",
    future: "RTY=F",
    futureLabel: "RTY",
    micro: "M2K",
    approxMultiplier: 10,
    pointValue: 50,
  },
  DIA: {
    etf: "DIA",
    index: "^DJI",
    indexLabel: "DJI",
    future: "YM=F",
    futureLabel: "YM",
    micro: "MYM",
    approxMultiplier: 100,
    pointValue: 5,
  },
};

export function convertTargetFor(symbol: string): ConvertMap | null {
  return CONVERT_MAP[symbol.toUpperCase()] ?? null;
}

/** All ETF tickers we can convert from. */
export const CONVERTIBLE_ETFS = Object.keys(CONVERT_MAP);
