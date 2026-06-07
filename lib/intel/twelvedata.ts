// Twelve Data client — free tier (8 req/min, 800/day). Daily OHLC for the
// Instruments tracker; RSI/MACD are computed locally from these closes.

import { UpstreamError } from "../errors";
import { cacheGet, cacheSet } from "../cache";
import { env } from "./env";

const TTL = 10 * 60_000;

export interface TdSeries {
  symbol: string;
  closes: number[]; // oldest → newest
  price: number;
  changePct: number | null;
}

export async function twelveDataSeries(symbol: string, outputsize = 120): Promise<TdSeries> {
  const key = env.twelveData();
  if (!key) throw new UpstreamError("twelvedata", 401, "TWELVE_DATA_API_KEY not set");

  const cacheKey = `td:${symbol}:${outputsize}`;
  const cached = cacheGet<TdSeries>(cacheKey, TTL);
  if (cached) return cached;

  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day&outputsize=${outputsize}&apikey=${key}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new UpstreamError("twelvedata", res.status, `TwelveData → ${res.status}`);

  const json = (await res.json()) as {
    status?: string;
    message?: string;
    values?: { datetime: string; close: string }[];
  };
  if (json.status === "error" || !json.values) {
    throw new UpstreamError("twelvedata", 502, json.message || `TwelveData: no data for ${symbol}`);
  }
  // TD returns newest-first; reverse to oldest→newest for indicator math.
  const closes = json.values.map((v) => Number(v.close)).reverse();
  const price = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const changePct = prev ? ((price - prev) / prev) * 100 : null;

  const out: TdSeries = { symbol, closes, price, changePct };
  cacheSet(cacheKey, out);
  return out;
}
