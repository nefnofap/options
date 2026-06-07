// Finnhub client — free tier. General market news for the sentiment engine.

import { UpstreamError } from "../errors";
import { cacheGet, cacheSet } from "../cache";
import { env } from "./env";
import type { NewsItem } from "../types";

const TTL = 5 * 60_000;

export async function finnhubMarketNews(category = "general"): Promise<NewsItem[]> {
  const key = env.finnhub();
  if (!key) throw new UpstreamError("finnhub", 401, "FINNHUB_API_KEY not set");

  const cacheKey = `finnhub:news:${category}`;
  const cached = cacheGet<NewsItem[]>(cacheKey, TTL);
  if (cached) return cached;

  const url = `https://finnhub.io/api/v1/news?category=${category}&token=${key}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new UpstreamError("finnhub", res.status, `Finnhub news → ${res.status}`);

  const rows = (await res.json()) as {
    id: number;
    headline: string;
    url: string;
    source: string;
    datetime: number;
    summary: string;
  }[];

  const items: NewsItem[] = (rows ?? []).slice(0, 50).map((r) => ({
    id: String(r.id),
    title: r.headline,
    url: r.url,
    source: r.source || "Finnhub",
    publishedAt: new Date(r.datetime * 1000).toISOString(),
    summary: r.summary,
  }));
  cacheSet(cacheKey, items);
  return items;
}
