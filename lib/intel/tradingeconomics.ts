// TradingEconomics client — free guest tier (guest:guest) returns a limited
// sample of the economic calendar. Used by the Pre-Market Brief.

import { UpstreamError } from "../errors";
import { cacheGet, cacheSet } from "../cache";
import { env } from "./env";
import type { CalendarEvent } from "./types";

const TTL = 30 * 60_000;

// Map TE importance (1..3) straight through; default to 1.
function imp(n: unknown): number {
  const v = Number(n);
  return v >= 1 && v <= 3 ? v : 1;
}

export async function calendarToday(): Promise<CalendarEvent[]> {
  const key = env.tradingeconomics(); // "key:secret" or "guest:guest"

  const cacheKey = `te:calendar:${key}`;
  const cached = cacheGet<CalendarEvent[]>(cacheKey, TTL);
  if (cached) return cached;

  const url = `https://api.tradingeconomics.com/calendar?c=${encodeURIComponent(key)}&f=json`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    throw new UpstreamError("tradingeconomics", res.status, `TE calendar → ${res.status}`);
  }
  const rows = (await res.json()) as Record<string, unknown>[];
  const events: CalendarEvent[] = (rows ?? []).slice(0, 40).map((r) => ({
    time: String(r.Date ?? ""),
    country: String(r.Country ?? ""),
    event: String(r.Event ?? ""),
    importance: imp(r.Importance),
    actual: r.Actual != null ? String(r.Actual) : undefined,
    forecast: r.Forecast != null ? String(r.Forecast) : undefined,
    previous: r.Previous != null ? String(r.Previous) : undefined,
  }));
  cacheSet(cacheKey, events);
  return events;
}
