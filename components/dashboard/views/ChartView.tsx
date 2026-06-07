"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import LiveBadge from "../LiveBadge";
import type { ChartBar } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

const RANGES: { label: string; range: string; interval: string; refreshMs: number }[] = [
  { label: "1D", range: "1d", interval: "5m", refreshMs: 30_000 },
  { label: "5D", range: "5d", interval: "15m", refreshMs: 30_000 },
  { label: "1M", range: "1mo", interval: "1d", refreshMs: 60_000 },
  { label: "3M", range: "3mo", interval: "1d", refreshMs: 60_000 },
  { label: "1Y", range: "1y", interval: "1d", refreshMs: 300_000 },
  { label: "5Y", range: "5y", interval: "1wk", refreshMs: 300_000 },
];

export default function ChartView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const [range, setRange] = useState(RANGES[2]);
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [brush, setBrush] = useState<{ s: number; e: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBrush(null); // reset brush when symbol/range changes

    async function load(initial: boolean) {
      if (initial) {
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }
      try {
        const r = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range.range}&interval=${range.interval}`,
        );
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `status ${r.status}`);
        }
        const j = await r.json();
        if (cancelled) return;
        setBars(j.bars || []);
        setStale(!!j.stale);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        if (initial) setBars([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    load(true);
    const id = setInterval(() => load(false), range.refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, range]);

  const data = bars.map((b) => ({ t: b.t * 1000, c: b.c }));

  const start = brush ? Math.max(0, Math.min(brush.s, data.length - 1)) : 0;
  const end = brush ? Math.min(brush.e, data.length - 1) : Math.max(0, data.length - 1);
  const first = data[0]?.c ?? 0;
  const last = data[data.length - 1]?.c ?? 0;
  const up = last >= first;

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="label-mono">RANGE</span>
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRange(r)}
            className={`px-2.5 py-1 rounded font-mono text-[11px] tracking-wider transition-colors ${
              r.label === range.label ? "bg-white/10 text-white" : "text-ink-300 hover:text-white"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
          <h3 className="display-italic text-2xl text-white">Price</h3>
          <div className="flex items-center gap-4">
            <span className="label-mono">via Yahoo · {bars.length} bars</span>
            <LiveBadge updatedAt={updatedAt} refreshing={refreshing} stale={stale || (!!error && bars.length > 0)} />
          </div>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && bars.length === 0 && <EmptyState title="Couldn't load chart" body={error} />}
        {!loading && !error && data.length === 0 && <EmptyState title="No data" />}
        {data.length > 0 && (
          <div className="h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={up ? "#5fd39a" : "#f06a7a"} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={up ? "#5fd39a" : "#f06a7a"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="t"
                  stroke="#5a5a66"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  }
                />
                <YAxis
                  stroke="#5a5a66"
                  fontSize={10}
                  tickLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => fmtMoney(v, 2)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0d0d10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                  labelFormatter={(v: any) => new Date(v).toLocaleString()}
                  formatter={(v: any) => [fmtMoney(Number(v)), "Close"]}
                />
                <Area
                  type="monotone"
                  dataKey="c"
                  stroke={up ? "#5fd39a" : "#f06a7a"}
                  strokeWidth={1.5}
                  fill="url(#grad)"
                  isAnimationActive={false}
                />
                <Brush
                  dataKey="t"
                  height={22}
                  travellerWidth={8}
                  stroke="rgba(255,255,255,0.25)"
                  fill="rgba(13,13,16,0.65)"
                  startIndex={start}
                  endIndex={end}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  }
                  onChange={(r: any) => {
                    if (r && typeof r.startIndex === "number" && typeof r.endIndex === "number") {
                      setBrush({ s: r.startIndex, e: r.endIndex });
                    }
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
