// FRED (Federal Reserve Economic Data) client — genuinely free, instant key.
// Used by the (free) Macro page for SOFR, Treasury yields, credit stress, VIX,
// CPI, fed funds and unemployment.

import { UpstreamError } from "../errors";
import { cacheGet, cacheSet } from "../cache";
import { env } from "./env";

const UA = "Mozilla/5.0 (compatible; AplusIntel/1.0)";
const TTL = 30 * 60_000; // macro data updates slowly; 30 min cache

export interface FredObs {
  id: string;
  value: number;
  prev: number | null;
  asOf: string; // YYYY-MM-DD
}

// Pull the last two non-missing observations for a series so we can show a delta.
export async function fredLatest(seriesId: string): Promise<FredObs> {
  const key = env.fred();
  if (!key) throw new UpstreamError("fred", 401, "FRED_API_KEY not set");

  const cacheKey = `fred:${seriesId}`;
  const cached = cacheGet<FredObs>(cacheKey, TTL);
  if (cached) return cached;

  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${key}&file_type=json&sort_order=desc&limit=12`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    throw new UpstreamError("fred", res.status, `FRED ${seriesId} → ${res.status}`);
  }
  const json = (await res.json()) as {
    observations?: { date: string; value: string }[];
  };
  const obs = (json.observations ?? []).filter((o) => o.value !== ".");
  if (obs.length === 0) {
    throw new UpstreamError("fred", 404, `FRED ${seriesId}: no observations`);
  }
  const latest = obs[0];
  const out: FredObs = {
    id: seriesId,
    value: Number(latest.value),
    prev: obs[1] ? Number(obs[1].value) : null,
    asOf: latest.date,
  };
  cacheSet(cacheKey, out);
  return out;
}
