// Stooq fallback for daily / weekly OHLC history. Keyless CSV endpoint used only
// when Yahoo throttles (429) the serverless IP, so the coarse-bar engines
// (e.g. the gold thesis) stay populated instead of degrading to zeros.
//
// Endpoint: https://stooq.com/q/d/l/?s=<ticker>&i=<d|w>
// Returns CSV: Date,Open,High,Low,Close,Volume   (or "N/D" / blank when unknown).
// Everything here is defensive: any malformed/empty response throws an
// UpstreamError so getChart can fall through to its stale-cache path. It never
// returns partial garbage.

import type { ChartBar } from "./types";
import { UpstreamError } from "./errors";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Map the app's Yahoo-style symbols to Stooq tickers. Stooq has no micro-gold
// contract, so MGC reuses the COMEX gold future (functionally the same price).
const STOOQ_MAP: Record<string, string> = {
  "GC=F": "gc.f", // COMEX gold continuous future
  "MGC=F": "gc.f", // micro gold → gold future (same price)
  "DX-Y.NYB": "dx.f", // ICE US dollar index future
  "^VIX": "^vix",
  "CL=F": "cl.f", // WTI crude continuous future
};

export function stooqSymbol(symbol: string): string | null {
  return STOOQ_MAP[symbol] ?? null;
}

/** True when Stooq can serve this symbol — lets callers skip a doomed request. */
export function stooqSupports(symbol: string): boolean {
  return symbol in STOOQ_MAP;
}

export async function getStooqDaily(
  symbol: string,
  interval: "1d" | "1wk" = "1d",
  revalidate = 1800,
): Promise<{ symbol: string; bars: ChartBar[]; spot: number; prevClose: number }> {
  const ticker = stooqSymbol(symbol);
  if (!ticker) throw new UpstreamError("stooq", 404, `No Stooq mapping for ${symbol}.`);

  const i = interval === "1wk" ? "w" : "d";
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker)}&i=${i}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate } });
  } catch (e) {
    throw new UpstreamError("stooq", 0, `Stooq request failed for ${symbol}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new UpstreamError("stooq", res.status, `Stooq returned HTTP ${res.status} for ${symbol}.`);

  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  // A valid response starts with a "Date,Open,..." header; "N/D" or HTML means
  // the ticker is unknown or the IP is throttled.
  if (lines.length < 2 || !/^date,/i.test(lines[0])) {
    throw new UpstreamError("stooq", 502, `Stooq returned no parseable CSV for ${symbol}.`);
  }

  const bars: ChartBar[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(",");
    if (cols.length < 5) continue;
    const [d, o, h, l, c, v] = cols;
    const t = Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);
    const O = Number(o);
    const H = Number(h);
    const L = Number(l);
    const C = Number(c);
    const V = Number(v);
    if (![t, O, H, L, C].every((n) => Number.isFinite(n))) continue;
    bars.push({ t, o: O, h: H, l: L, c: C, v: Number.isFinite(V) ? V : 0 });
  }
  if (!bars.length) throw new UpstreamError("stooq", 502, `Stooq CSV had no usable rows for ${symbol}.`);

  const spot = bars[bars.length - 1].c;
  const prevClose = bars.length >= 2 ? bars[bars.length - 2].c : spot;
  return { symbol, bars, spot, prevClose };
}
