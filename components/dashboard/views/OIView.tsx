"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useChain } from "../useChain";
import { strikeAggregates } from "@/lib/analytics";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import LiveBadge from "../LiveBadge";
import { fmtCompact, fmtNumber } from "@/lib/format";

const WINDOW = 41;

function defaultWindow(strikes: number[], spot?: number) {
  const n = strikes.length;
  if (n === 0) return { startIndex: 0, endIndex: 0 };
  const size = Math.min(n, WINDOW);
  let center = Math.floor(n / 2);
  if (typeof spot === "number") {
    let best = Infinity;
    strikes.forEach((s, i) => {
      const d = Math.abs(s - spot);
      if (d < best) {
        best = d;
        center = i;
      }
    });
  }
  let start = Math.max(0, center - Math.floor(size / 2));
  const end = Math.min(n - 1, start + size - 1);
  start = Math.max(0, end - size + 1);
  return { startIndex: start, endIndex: end };
}

export default function OIView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || undefined;
  const { chain, loading, refreshing, error, updatedAt } = useChain(symbol);

  const aggs = chain ? strikeAggregates(chain, { expiration: exp }) : [];
  const data = aggs.map((a) => ({
    strike: a.strike,
    call: a.callOI,
    put: -a.putOI, // mirror axis
  }));

  const resetKey = `${symbol}|${exp ?? "all"}`;
  const [range, setRange] = useState(() => defaultWindow(data.map((d) => d.strike), chain?.spot));
  useEffect(() => {
    setRange(defaultWindow(data.map((d) => d.strike), chain?.spot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const end = Math.min(range.endIndex, Math.max(0, data.length - 1));
  const start = Math.min(range.startIndex, end);

  // Symmetric domain so the call/put split is mirrored around a centered zero.
  const max = useMemo(() => {
    const slice = data.slice(start, end + 1);
    let m = 0;
    for (const d of slice) m = Math.max(m, d.call, Math.abs(d.put));
    return m > 0 ? m : 1;
  }, [data, start, end]);

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <ExpirationPicker />
      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
          <h3 className="display-italic text-2xl text-white">Open interest by strike</h3>
          <div className="flex items-center gap-4">
            <span className="label-mono">calls vs puts</span>
            <LiveBadge updatedAt={updatedAt} refreshing={refreshing} stale={!!error && !!chain} />
          </div>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && !chain && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && aggs.length === 0 && <EmptyState title="No data" />}
        {aggs.length > 0 && (
          <div className="h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} stackOffset="sign" margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="strike"
                  stroke="#5a5a66"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => fmtNumber(v, 0)}
                />
                <YAxis
                  domain={[-max, max]}
                  stroke="#5a5a66"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => fmtCompact(Math.abs(v), 0)}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.28)" />
                <Tooltip
                  contentStyle={{
                    background: "#0d0d10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                  labelFormatter={(l) => `Strike ${fmtNumber(Number(l), 2)}`}
                  formatter={(v: any, name: string) => [fmtCompact(Math.abs(Number(v)), 0), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                {chain && (
                  <ReferenceLine x={Math.round(chain.spot)} stroke="#e8e8ee" strokeDasharray="3 3" />
                )}
                <Bar dataKey="call" name="Call OI" stackId="oi" fill="#5fd39a" opacity={0.85} isAnimationActive={false} />
                <Bar dataKey="put" name="Put OI" stackId="oi" fill="#f06a7a" opacity={0.85} isAnimationActive={false} />
                <Brush
                  dataKey="strike"
                  height={22}
                  travellerWidth={8}
                  stroke="rgba(255,255,255,0.25)"
                  fill="rgba(13,13,16,0.65)"
                  startIndex={start}
                  endIndex={end}
                  tickFormatter={(v) => fmtNumber(Number(v), 0)}
                  onChange={(r: any) => {
                    if (r && typeof r.startIndex === "number" && typeof r.endIndex === "number") {
                      setRange({ startIndex: r.startIndex, endIndex: r.endIndex });
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
