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
} from "recharts";
import { useChain } from "../useChain";
import { strikeAggregates } from "@/lib/analytics";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import { fmtCompact, fmtNumber } from "@/lib/format";
import type { StrikeAggregate } from "@/lib/analytics";

interface Props {
  title: string;
  description: string;
  metric: keyof Pick<
    StrikeAggregate,
    "netDelta" | "netVega" | "netVanna" | "netCharm" | "netGamma"
  >;
  unit?: string;
}

const POS = "#5fd39a";
const NEG = "#f06a7a";

export default function MetricByStrikeView({ title, description, metric, unit }: Props) {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || undefined;
  const { chain, loading, error } = useChain(symbol);
  const aggs = chain ? strikeAggregates(chain, { expiration: exp }) : [];
  const data = aggs.map((a) => ({ strike: a.strike, value: a[metric] }));
  const total = aggs.reduce((s, a) => s + (a[metric] as number), 0);

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <ExpirationPicker />

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="display-italic text-2xl text-white">{title}</h3>
          <span className="label-mono">
            total {total >= 0 ? "+" : ""}
            {fmtCompact(total)} {unit ?? ""}
          </span>
        </div>
        <p className="text-ink-400 text-sm mb-5 max-w-2xl">{description}</p>

        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && data.length === 0 && (
          <EmptyState title="No data" body="Try another symbol or expiration." />
        )}

        {data.length > 0 && (
          <div className="h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="strike"
                  stroke="#5a5a66"
                  tickLine={false}
                  fontSize={10}
                  tickFormatter={(v) => fmtNumber(v, 0)}
                />
                <YAxis
                  stroke="#5a5a66"
                  tickLine={false}
                  fontSize={10}
                  tickFormatter={(v) => fmtCompact(v, 1)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    background: "#0d0d10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                  labelFormatter={(l) => `Strike ${fmtNumber(Number(l), 2)}`}
                  formatter={(v: any) => [fmtCompact(Number(v)), title]}
                />
                {chain && (
                  <ReferenceLine
                    x={Math.round(chain.spot)}
                    stroke="#e8e8ee"
                    strokeDasharray="3 3"
                    label={{ value: "spot", fill: "#e8e8ee", fontSize: 10, position: "top" }}
                  />
                )}
                <Bar
                  dataKey="value"
                  shape={(props: any) => {
                    const { x, y, width, height, value } = props;
                    const fill = (value as number) >= 0 ? POS : NEG;
                    return <rect x={x} y={y} width={width} height={height} fill={fill} opacity={0.85} />;
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
