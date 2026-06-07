// Yahoo Finance fallback for chart history & news only.
// We deliberately avoid the v7 endpoints that now require crumb/cookie.

import type { ChartBar, NewsItem, QuoteSnapshot } from "./types";
import { UpstreamError } from "./errors";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface YahooChartResp {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
        chartPreviousClose: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: unknown;
  };
}

export async function getYahooChart(
  symbol: string,
  range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "5y" = "3mo",
  interval: "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" = "1d",
): Promise<{ symbol: string; bars: ChartBar[]; spot: number; prevClose: number }> {
  const path = `/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=${interval}&includePrePost=false`;
  // Yahoo intermittently blocks one host but not the other — try both.
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastError: UpstreamError | null = null;

  for (const host of hosts) {
    let res: Response;
    try {
      res = await fetch(`https://${host}${path}`, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
        next: { revalidate: 60 },
      });
    } catch (e) {
      lastError = new UpstreamError(
        "yahoo",
        0,
        `Yahoo chart request failed (network/DNS) via ${host}: ${(e as Error).message}`,
      );
      continue;
    }
    if (res.status === 404) {
      throw new UpstreamError("yahoo", 404, `Yahoo has no chart data for "${symbol}".`);
    }
    if (!res.ok) {
      lastError = new UpstreamError(
        "yahoo",
        res.status,
        `Yahoo chart returned HTTP ${res.status} for ${symbol} via ${host}${
          res.status === 401 || res.status === 403 ? " (likely crumb/cookie gating)" : ""
        }.`,
      );
      continue; // try the next host
    }
    const json = (await res.json()) as YahooChartResp;
    const r = json.chart?.result?.[0];
    if (!r) {
      lastError = new UpstreamError("yahoo", res.status, `Yahoo chart payload for ${symbol} was empty via ${host}.`);
      continue;
    }
    const ts = r.timestamp || [];
    const q = r.indicators?.quote?.[0];
    if (!q) {
      throw new UpstreamError("yahoo", res.status, `Yahoo chart payload for ${symbol} had no quote series.`);
    }
    const bars: ChartBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open[i];
      const h = q.high[i];
      const l = q.low[i];
      const c = q.close[i];
      const v = q.volume[i];
      if (o == null || h == null || l == null || c == null) continue;
      bars.push({ t: ts[i], o, h, l, c, v: v ?? 0 });
    }
    return {
      symbol: r.meta.symbol,
      bars,
      spot: r.meta.regularMarketPrice,
      prevClose: r.meta.chartPreviousClose,
    };
  }

  throw (
    lastError ??
    new UpstreamError("yahoo", 502, `Yahoo chart unavailable for ${symbol}.`)
  );
}

// Derive a quote from the chart endpoint (no crumb required).
export async function getYahooQuoteFromChart(
  symbol: string,
): Promise<QuoteSnapshot> {
  const chart = await getYahooChart(symbol, "5d", "1d");
  const spot = chart.spot;
  const prevClose = chart.prevClose;
  const change = spot - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  return {
    symbol: symbol.toUpperCase(),
    spot,
    prevClose,
    change,
    changePct,
    asOf: new Date().toISOString(),
    source: "yahoo",
  };
}

interface YahooNewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  summary?: string;
}

interface YahooNewsResp {
  news?: YahooNewsItem[];
}

export async function getYahooNews(symbol: string): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    symbol,
  )}&newsCount=20&quotesCount=0`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as YahooNewsResp;
    const items = json.news || [];
    return items.map((n) => ({
      id: n.uuid,
      title: n.title,
      url: n.link,
      source: n.publisher,
      publishedAt: new Date(n.providerPublishTime * 1000).toISOString(),
      summary: n.summary,
    }));
  } catch {
    return [];
  }
}
