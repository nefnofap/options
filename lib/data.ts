// Top-level data orchestrator. CBOE primary, Yahoo fallback.

import { getCboeChain, getCboeQuote } from "./cboe";
import { getYahooChart, getYahooNews, getYahooQuoteFromChart } from "./yahoo";
import type { ChartBar, NewsItem, OptionChain, QuoteSnapshot } from "./types";

export async function getQuote(symbol: string): Promise<QuoteSnapshot | null> {
  const cboe = await getCboeQuote(symbol);
  if (cboe && cboe.spot > 0) return cboe;
  return getYahooQuoteFromChart(symbol);
}

export async function getChain(symbol: string): Promise<OptionChain | null> {
  return getCboeChain(symbol);
}

export async function getChart(
  symbol: string,
  range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "5y" = "3mo",
  interval: "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" = "1d",
): Promise<{ symbol: string; bars: ChartBar[]; spot: number; prevClose: number } | null> {
  return getYahooChart(symbol, range, interval);
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  return getYahooNews(symbol);
}
