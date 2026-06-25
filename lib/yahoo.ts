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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getYahooChart(
  symbol: string,
  range: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "5y" = "3mo",
  interval: "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" = "1d",
  // How long Vercel's Data Cache may reuse this fetch across requests/users.
  // Daily bars only change at the close, so cache them hard to dodge Yahoo's
  // aggressive per-IP 429 throttling on serverless.
  revalidate = 1800,
): Promise<{ symbol: string; bars: ChartBar[]; spot: number; prevClose: number }> {
  const path = `/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=${interval}&includePrePost=false`;
  // Yahoo intermittently blocks one host but not the other — try both, and
  // retry the pair with backoff if we get rate-limited (429).
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastError: UpstreamError | null = null;
  const MAX_PASSES = 3;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let rateLimited = false;
    for (const host of hosts) {
      let res: Response;
      try {
        res = await fetch(`https://${host}${path}`, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
          },
          next: { revalidate },
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
      if (res.status === 429) {
        rateLimited = true;
        lastError = new UpstreamError("yahoo", 429, `Yahoo rate-limited (429) for ${symbol} via ${host}.`);
        continue; // try the other host, then back off
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
    // Only worth retrying when we were throttled; other errors won't self-heal.
    if (!rateLimited || pass === MAX_PASSES - 1) break;
    await sleep(300 * (pass + 1)); // 300ms, then 600ms
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
