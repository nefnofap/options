// Economic-calendar client.
//
// NOTE: filename is legacy. The TradingEconomics guest feed (guest:guest) was
// discontinued and now returns HTTP 410, so this module sources the public
// Forex Factory weekly calendar instead, mirrored as keyless JSON by
// faireconomy. The export name `calendarToday` is kept so existing importers
// (gold engine, thesis, intel data) need no changes.
//
//   Feed:  https://nfs.faireconomy.media/ff_calendar_thisweek.json
//          https://nfs.faireconomy.media/ff_calendar_nextweek.json
//   Row:   { title, country (currency code), date (ISO+offset),
//            impact ("High"|"Medium"|"Low"|"Holiday"), forecast, previous }
//
// Caveats handled here: the feed sits behind Cloudflare and rate-limits hard,
// so we send a browser UA, cache for 30 min, try a CDN mirror host, and merge
// this-week + next-week (the latter fixes weekend roll-over so a weekend
// "week-ahead" thesis still sees the coming week's events). Fully defensive:
// any total failure throws UpstreamError, which every caller already catches
// into a non-fatal notice.

import { UpstreamError } from "../errors";
import { cacheGet, cacheSet } from "../cache";
import type { CalendarEvent } from "./types";

const TTL = 30 * 60_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Forex Factory event row as served by faireconomy (only the fields we use).
interface FFEvent {
  title?: unknown;
  country?: unknown;
  date?: unknown;
  impact?: unknown;
  forecast?: unknown;
  previous?: unknown;
}

// Map FF impact wording to the 1..3 importance scale used across Intel.
function impactToImportance(impact: unknown): number {
  switch (String(impact).toLowerCase()) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1; // "Low", "Holiday", or anything unexpected
  }
}

const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};

/** Pure mapper: FF rows → CalendarEvent[]. Exported for unit testing. */
export function mapForexFactory(rows: FFEvent[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of rows) {
    const title = str(r.title);
    const date = str(r.date);
    if (!title || !date) continue; // a usable event needs at least a title + time
    out.push({
      time: date, // ISO 8601 with offset; Date.parse handles it downstream
      country: str(r.country) ?? "",
      event: title,
      importance: impactToImportance(r.impact),
      forecast: str(r.forecast),
      previous: str(r.previous),
    });
  }
  return out;
}

async function fetchFeed(file: string): Promise<FFEvent[]> {
  const hosts = ["https://nfs.faireconomy.media", "https://cdn-nfs.faireconomy.media"];
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/${file}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        next: { revalidate: 1800 },
      });
      if (!res.ok) {
        lastErr = new UpstreamError("forexfactory", res.status, `FF ${file} → ${res.status} via ${host}`);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json)) return json as FFEvent[];
      lastErr = new UpstreamError("forexfactory", 502, `FF ${file} returned a non-array payload via ${host}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new UpstreamError("forexfactory", 502, `FF ${file} unavailable`);
}

export async function calendarToday(): Promise<CalendarEvent[]> {
  const cacheKey = "ff:calendar";
  const cached = cacheGet<CalendarEvent[]>(cacheKey, TTL);
  if (cached) return cached;

  // this-week is the primary source; next-week is best-effort and only fills in
  // the back half of a weekend "week-ahead" view. Don't let next-week failing
  // sink the whole call.
  const [thisWeek, nextWeek] = await Promise.all([
    fetchFeed("ff_calendar_thisweek.json"),
    fetchFeed("ff_calendar_nextweek.json").catch(() => [] as FFEvent[]),
  ]);

  const merged = mapForexFactory([...thisWeek, ...nextWeek]);

  // Keep a rolling near-term window (yesterday → +9d). Covers the weekly
  // engine's next-7-days filter and keeps the daily gauge near-term. Events
  // with an unparseable date are kept rather than silently dropped.
  const now = Date.now();
  const lo = now - 2 * 86_400_000;
  const hi = now + 9 * 86_400_000;
  const windowed = merged
    .filter((e) => {
      const t = Date.parse(e.time);
      return Number.isNaN(t) ? true : t >= lo && t <= hi;
    })
    .sort((a, b) => {
      const ta = Date.parse(a.time);
      const tb = Date.parse(b.time);
      return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
    })
    .slice(0, 200);

  cacheSet(cacheKey, windowed);
  return windowed;
}
