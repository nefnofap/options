"use client";

import { useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
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
import { fmtCompact, fmtNumber } from "@/lib/format";

export default function OIView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || undefined;
  const { chain, loading, error } = useChain(symbol);

  const aggs = chain ? strikeAggregates(chain, { expiration: exp }) : [];
  const data = aggs.map((a) => ({
    strike: a.strike,
    call: a.callOI,
    put: -a.putOI, // mirror axis
  }));

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <ExpirationPicker />
      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Open interest by strike</h3>
          <span className="label-mono">calls vs puts</span>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && aggs.length === 0 && (
          <EmptyState title="No data" />
        )}
        {aggs.length > 0 && (
          <div className="h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} stackOffset="sign">
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
                  tickFormatter={(v) => fmtCompact(Math.abs(v), 0)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0d0d10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                  formatter={(v: any, name: string) => [fmtCompact(Math.abs(Number(v)), 0), name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
                {chain && (
                  <ReferenceLine
                    x={Math.round(chain.spot)}
                    stroke="#e8e8ee"
                    strokeDasharray="3 3"
                  />
                )}
                <Bar dataKey="call" name="Call OI" stackId="oi" fill="#5fd39a" opacity={0.85} />
                <Bar dataKey="put" name="Put OI" stackId="oi" fill="#f06a7a" opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
