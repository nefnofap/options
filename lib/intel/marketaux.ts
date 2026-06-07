// MarketAux client — free tier (~100 req/day). News for the Brief + sentiment.

import { UpstreamError } from "../errors";
import { cacheGet, cacheSet } from "../cache";
import { env } from "./env";
import type { NewsItem } from "../types";

const TTL = 10 * 60_000;

export async function marketauxNews(opts?: {
  symbols?: string;
  language?: string;
  limit?: number;
}): Promise<NewsItem[]> {
  const key = env.marketaux();
  if (!key) throw new UpstreamError("marketaux", 401, "MARKETAUX_API_KEY not set");

  const params = new URLSearchParams({
    api_token: key,
    language: opts?.language ?? "en",
    limit: String(opts?.limit ?? 25),
    filter_entities: "true",
  });
  if (opts?.symbols) params.set("symbols", opts.symbols);

  const cacheKey = `marketaux:${params.toString()}`;
  const cached = cacheGet<NewsItem[]>(cacheKey, TTL);
  if (cached) return cached;

  const url = `https://api.marketaux.com/v1/news/all?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new UpstreamError("marketaux", res.status, `MarketAux → ${res.status}`);

  const json = (await res.json()) as {
    data?: {
      uuid: string;
      title: string;
      url: string;
      source: string;
      published_at: string;
      description: string;
    }[];
  };
  const items: NewsItem[] = (json.data ?? []).map((r) => ({
    id: r.uuid,
    title: r.title,
    url: r.url,
    source: r.source || "MarketAux",
    publishedAt: r.published_at,
    summary: r.description,
  }));
  cacheSet(cacheKey, items);
  return items;
}
