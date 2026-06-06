// CBOE delayed-quotes adapter. No API key required.
// Endpoint: https://cdn.cboe.com/api/global/delayed_quotes/options/{SYMBOL}.json
// For indices CBOE uses an underscore prefix (e.g. _SPX).

import type { OptionChain, OptionContract, QuoteSnapshot } from "./types";

const INDEX_SYMBOLS = new Set([
  "SPX", "NDX", "RUT", "VIX", "DJX", "XSP", "OEX", "MXEF", "SPXW",
]);

function cboeSymbol(symbol: string): string {
  const s = symbol.toUpperCase();
  return INDEX_SYMBOLS.has(s) ? `_${s}` : s;
}

interface RawCboe {
  data: {
    symbol: string;
    security_type?: string;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    prev_day_close: number;
    bid?: number;
    ask?: number;
    last_trade_price?: number;
    current_price?: number;
    volume?: number;
    options: Array<{
      option: string; // e.g. "AAPL250620C00150000"
      bid: number;
      ask: number;
      last_trade_price: number;
      iv: number;
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
      rho: number;
      open_interest: number;
      volume: number;
      prev_day_open_interest?: number;
      theo?: number;
    }>;
  };
}

// Parse OCC-style option symbol: ROOT YYMMDD C/P STRIKE*1000(8 digits)
function parseOptionSymbol(opt: string): {
  root: string;
  expiration: string;
  side: "C" | "P";
  strike: number;
} | null {
  // Find the 6-digit date followed by C or P followed by 8-digit strike
  const m = opt.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  const [, root, ymd, side, strikeRaw] = m;
  const yy = parseInt(ymd.slice(0, 2), 10);
  const mm = ymd.slice(2, 4);
  const dd = ymd.slice(4, 6);
  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
  const expiration = `${yyyy}-${mm}-${dd}`;
  const strike = parseInt(strikeRaw, 10) / 1000;
  return { root, expiration, side: side as "C" | "P", strike };
}

async function fetchCboeRaw(symbol: string): Promise<RawCboe | null> {
  const sym = cboeSymbol(symbol);
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AplusOptions/1.0; +https://aplus.example)",
        Accept: "application/json",
      },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as RawCboe;
    if (!json?.data?.options) return null;
    return json;
  } catch {
    return null;
  }
}

export async function getCboeQuote(symbol: string): Promise<QuoteSnapshot | null> {
  const raw = await fetchCboeRaw(symbol);
  if (!raw) return null;
  const d = raw.data;
  const spot = d.current_price ?? d.last_trade_price ?? d.close ?? 0;
  const prevClose = d.prev_day_close ?? spot;
  const change = spot - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  return {
    symbol: symbol.toUpperCase(),
    spot,
    prevClose,
    change,
    changePct,
    asOf: new Date().toISOString(),
    source: "cboe",
  };
}

export async function getCboeChain(symbol: string): Promise<OptionChain | null> {
  const raw = await fetchCboeRaw(symbol);
  if (!raw) return null;
  const d = raw.data;
  const spot = d.current_price ?? d.last_trade_price ?? d.close ?? 0;
  const contracts: OptionContract[] = [];
  const expSet = new Set<string>();

  for (const o of d.options) {
    const parsed = parseOptionSymbol(o.option);
    if (!parsed) continue;
    expSet.add(parsed.expiration);
    contracts.push({
      symbol: o.option,
      side: parsed.side,
      strike: parsed.strike,
      expiration: parsed.expiration,
      bid: o.bid ?? 0,
      ask: o.ask ?? 0,
      last: o.last_trade_price ?? 0,
      iv: o.iv ?? 0,
      delta: o.delta ?? 0,
      gamma: o.gamma ?? 0,
      theta: o.theta ?? 0,
      vega: o.vega ?? 0,
      rho: o.rho ?? 0,
      openInterest: o.open_interest ?? 0,
      volume: o.volume ?? 0,
      prevDayOI: o.prev_day_open_interest,
      theoretical: o.theo,
    });
  }

  const expirations = Array.from(expSet).sort();
  return {
    underlying: symbol.toUpperCase(),
    spot,
    asOf: new Date().toISOString(),
    expirations,
    contracts,
  };
}
