// Top-level data orchestrator. CBOE primary, Yahoo fallback.
// On total failure these throw UpstreamError so routes can report the real cause.

import { getCboeChain, getCboeQuote } from "./cboe";
import { getYahooChart, getYahooNews, getYahooQuoteFromChart } from "./yahoo";
import { UpstreamError } from "./errors";
import { cacheGet, cacheSet, cachePeek } from "./cache";
import type { ChartBar, NewsItem, OptionChain, QuoteSnapshot } from "./types";

function reason(provider: string, e: unknown): string {
  if (e instanceof UpstreamError) return `${e.source}: ${e.message}`;
  return `${provider}: ${(e as Error).message}`;
}

export async function getQuote(symbol: string): Promise<QuoteSnapshot> {
  const errors: string[] = [];
  try {
    const cboe = await getCboeQuote(symbol);
    if (cboe.spot > 0) return cboe;
    errors.push("cboe: responded but reported no spot price");
  } catch (e) {
    errors.push(reason("cboe", e));
  }
  try {
    const yh = await getYahooQuoteFromChart(symbol);
    if (yh.spot > 0) return yh;
    errors.push("yahoo: responded but reported no spot price");
  } catch (e) {
    errors.push(reason("yahoo", e));
  }
  throw new UpstreamError(
    "quote",
    502,
    `No provider returned a quote for ${symbol}. ${errors.join(" | ")}`,
  );
}

export async function getChain(symbol: string): Promise<OptionChain> {
  // CBOE only — it is the sole source of option chains. Propagates UpstreamError.
  return getCboeChain(symbol);
}

export interface ChartResult {
  symbol: string;
  bars: ChartBar[];
  spot: number;
  prevClose: number;
  stale?: boolean;
}

const CHART_TTL = 60_000;

export async function getChart(
  symbol: string,
  range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "5y" = "3mo",
  interval: "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" = "1d",
): Promise<ChartResult> {
  const key = `chart:${symbol.toUpperCase()}:${range}:${interval}`;
  const fresh = cacheGet<ChartResult>(key, CHART_TTL);
  if (fresh) return { ...fresh, stale: false };
  try {
    const data = await getYahooChart(symbol, range, interval);
    cacheSet(key, data);
    return { ...data, stale: false };
  } catch (e) {
    // Throttled or upstream down: serve the last good data (stale) if we have
    // any, so the chart stays populated instead of erroring out on a 429.
    const stale = cachePeek<ChartResult>(key);
    if (stale) return { ...stale, stale: true };
    throw e;
  }
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  // News is best-effort; never throws (empty list on failure).
  return getYahooNews(symbol);
}
