"use client";

import { useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useChain } from "../useChain";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import { fmtNumber, fmtPct } from "@/lib/format";

export default function VolatilityView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp");
  const { chain, loading, error } = useChain(symbol);

  const filtered =
    chain && exp ? chain.contracts.filter((c) => c.expiration === exp) : [];

  // skew: by strike, separate call & put IV
  const byStrike = new Map<number, { call?: number; put?: number }>();
  for (const c of filtered) {
    if (c.iv <= 0) continue;
    const e = byStrike.get(c.strike) || {};
    if (c.side === "C") e.call = c.iv * 100;
    else e.put = c.iv * 100;
    byStrike.set(c.strike, e);
  }
  const skew = Array.from(byStrike.entries())
    .map(([strike, v]) => ({ strike, call: v.call, put: v.put }))
    .sort((a, b) => a.strike - b.strike);

  // term structure: avg ATM IV per expiration
  const term: { exp: string; iv: number }[] = [];
  if (chain) {
    const expMap = new Map<string, { ivs: number[] }>();
    for (const c of chain.contracts) {
      if (c.iv <= 0) continue;
      // pick contracts within 5% of spot ("ATM-ish")
      if (Math.abs(c.strike - chain.spot) / chain.spot > 0.05) continue;
      const e = expMap.get(c.expiration) || { ivs: [] };
      e.ivs.push(c.iv * 100);
      expMap.set(c.expiration, e);
    }
    for (const [k, v] of expMap.entries()) {
      const avg = v.ivs.reduce((s, x) => s + x, 0) / v.ivs.length;
      term.push({ exp: k, iv: avg });
    }
    term.sort((a, b) => a.exp.localeCompare(b.exp));
  }

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <ExpirationPicker />

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Volatility skew</h3>
          <span className="label-mono">{exp ? `EXP ${exp}` : "select an expiration"}</span>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && skew.length === 0 && (
          <EmptyState title="No IV data" body="Pick an expiration with IV reported." />
        )}
        {skew.length > 0 && (
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={skew}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="strike"
                  stroke="#5a5a66"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => fmtNumber(v, 0)}
                />
                <YAxis
                  stroke="#5a5a66"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0d0d10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                  formatter={(v: any) => [fmtPct(Number(v), 2), ""]}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                <Line type="monotone" dataKey="call" name="Call IV" stroke="#5fd39a" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="put" name="Put IV" stroke="#f06a7a" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Term structure</h3>
          <span className="label-mono">ATM avg IV per expiration</span>
        </div>
        {term.length > 0 ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={term}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="exp" stroke="#5a5a66" fontSize={10} tickLine={false} />
                <YAxis
                  stroke="#5a5a66"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0d0d10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                  formatter={(v: any) => [fmtPct(Number(v), 2), "ATM IV"]}
                />
                <Line type="monotone" dataKey="iv" stroke="#e8e8ee" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="No term structure" body="No ATM contracts with IV." />
        )}
      </section>
    </div>
  );
}
