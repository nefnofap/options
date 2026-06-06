export type OptionSide = "C" | "P";

export interface OptionContract {
  symbol: string;
  side: OptionSide;
  strike: number;
  expiration: string; // YYYY-MM-DD
  bid: number;
  ask: number;
  last: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  openInterest: number;
  volume: number;
  prevDayOI?: number;
  theoretical?: number;
}

export interface OptionChain {
  underlying: string;
  spot: number;
  asOf: string;
  expirations: string[];
  contracts: OptionContract[];
}

export interface QuoteSnapshot {
  symbol: string;
  spot: number;
  prevClose: number;
  change: number;
  changePct: number;
  asOf: string;
  source: "cboe" | "yahoo";
}

export interface ChartBar {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
}
