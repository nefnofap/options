// TAAPI.io client — OPTIONAL. Only used when TAAPI_SECRET is set; otherwise the
// Instruments tracker computes RSI/MACD locally (lib/intel/indicators.ts).
// TAAPI's free tier is heavily rate-limited and crypto-leaning, so local calc
// is the default. Returns null on any failure so callers fall back cleanly.

import { env } from "./env";

const BASE = "https://api.taapi.io";

async function taapiGet(
  indicator: string,
  symbol: string,
  exchange: string,
  extra: Record<string, string> = {},
): Promise<Record<string, number> | null> {
  const secret = env.taapi();
  if (!secret) return null;
  const params = new URLSearchParams({
    secret,
    exchange,
    symbol,
    interval: "1d",
    ...extra,
  });
  try {
    const res = await fetch(`${BASE}/${indicator}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, number>;
  } catch {
    return null;
  }
}

export async function taapiRsi(symbol: string, exchange = "binance"): Promise<number | null> {
  const r = await taapiGet("rsi", symbol, exchange);
  return r && typeof r.value === "number" ? r.value : null;
}

export async function taapiMacd(
  symbol: string,
  exchange = "binance",
): Promise<{ macd: number; signal: number; hist: number } | null> {
  const r = await taapiGet("macd", symbol, exchange);
  if (!r) return null;
  const macd = (r as Record<string, number>).valueMACD;
  const signal = (r as Record<string, number>).valueMACDSignal;
  const hist = (r as Record<string, number>).valueMACDHist;
  if ([macd, signal, hist].some((v) => typeof v !== "number")) return null;
  return { macd, signal, hist };
}
