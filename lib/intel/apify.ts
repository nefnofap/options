// Apify financial-news-sentiment actor — OPTIONAL. When APIFY_TOKEN is set we
// run the actor synchronously and map its output to our ScoredHeadline shape.
// Best-effort: returns null on failure so the lexicon engine takes over.

import { env } from "./env";
import type { ScoredHeadline, Bias } from "./types";

const ACTOR = "scionic_dev~financial-news-sentiment";

function biasOf(score: number): Bias {
  return score > 0.12 ? "bullish" : score < -0.12 ? "bearish" : "neutral";
}

export async function apifySentiment(query: string): Promise<ScoredHeadline[] | null> {
  const token = env.apify();
  if (!token) return null;
  try {
    const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, maxItems: 25 }),
      // Actor runs can take a while; no Next caching for POST.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows)) return null;
    return rows
      .map((r) => {
        const score = Number(r.sentimentScore ?? r.score ?? 0);
        return {
          title: String(r.title ?? r.headline ?? ""),
          url: String(r.url ?? ""),
          source: String(r.source ?? "Apify"),
          publishedAt: String(r.publishedAt ?? r.date ?? new Date().toISOString()),
          score: Math.max(-1, Math.min(1, score)),
          bias: biasOf(score),
        } satisfies ScoredHeadline;
      })
      .filter((h) => h.title);
  } catch {
    return null;
  }
}
