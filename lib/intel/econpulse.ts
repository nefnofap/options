// EconPulse client — OPTIONAL macro supplement. The public "demo" key returns a
// limited set of live macro readings. Best-effort: returns [] on any failure so
// the Macro page still renders from FRED alone.

import { cacheGet, cacheSet } from "../cache";
import { env } from "./env";
import type { MacroSeries } from "./types";

const TTL = 30 * 60_000;

export async function econpulseMacro(): Promise<MacroSeries[]> {
  const key = env.econpulse();
  const cacheKey = `econpulse:${key}`;
  const cached = cacheGet<MacroSeries[]>(cacheKey, TTL);
  if (cached) return cached;

  try {
    const url = `https://api.econpulse.io/v1/macro?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as Record<string, unknown>;
    // Shape is provider-specific and may change; defensively map known fields.
    const rows = Array.isArray((json as { data?: unknown }).data)
      ? ((json as { data: Record<string, unknown>[] }).data)
      : [];
    const series: MacroSeries[] = rows
      .map((r) => ({
        id: String(r.id ?? r.name ?? ""),
        label: String(r.label ?? r.name ?? r.id ?? ""),
        value: Number(r.value),
        prev: r.previous != null ? Number(r.previous) : null,
        change: r.previous != null ? Number(r.value) - Number(r.previous) : null,
        unit: String(r.unit ?? ""),
        asOf: String(r.date ?? r.asOf ?? ""),
        source: "EconPulse",
      }))
      .filter((s) => s.label && Number.isFinite(s.value));
    cacheSet(cacheKey, series);
    return series;
  } catch {
    return [];
  }
}
