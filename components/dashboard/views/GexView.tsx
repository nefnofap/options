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
import { strikeAggregates, gammaFlip, maxPain } from "@/lib/analytics";
import Stat from "../Stat";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import { fmtCompact, fmtMoney, fmtNumber } from "@/lib/format";

const CHART_COLOR_POS = "#5fd39a";
const CHART_COLOR_NEG = "#f06a7a";

export default function GexView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || undefined;
  const { chain, loading, error } = useChain(symbol);

  const aggs = chain ? strikeAggregates(chain, { expiration: exp }) : [];
  const flip = gammaFlip(aggs);
  const pain = maxPain(aggs);
  const totalGamma = aggs.reduce((a, s) => a + s.netGamma, 0);
  const totalNotional = aggs.reduce((a, s) => a + s.netGammaNotional, 0);

  const chartData = aggs.map((a) => ({
    strike: a.strike,
    value: a.netGammaNotional,
  }));

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <div className="flex items-center gap-6 flex-wrap">
        <ExpirationPicker />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Spot"
          value={chain ? fmtMoney(chain.spot) : "—"}
        />
        <Stat
          label="Gamma flip"
          value={flip ? fmtMoney(flip) : "—"}
          tone={flip && chain ? (chain.spot > flip ? "bull" : "bear") : "default"}
          hint="zero-gamma level"
        />
        <Stat
          label="Max pain"
          value={pain ? fmtMoney(pain) : "—"}
        />
        <Stat
          label="Total GEX"
          value={`${totalNotional >= 0 ? "+" : ""}$${fmtCompact(totalNotional)}`}
          tone={totalNotional >= 0 ? "bull" : "bear"}
          hint="per 1% move"
        />
      </div>

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Gamma exposure by strike</h3>
          <span className="label-mono">
            {exp ? `EXP ${exp}` : "all expirations"}
          </span>
        </div>

        {loading && <div className="label-mono py-20 text-center">loading chain</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && aggs.length === 0 && (
          <EmptyState title="No data" body="Try another symbol or expiration." />
        )}

        {aggs.length > 0 && (
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
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
                  formatter={(v: any) => [`$${fmtCompact(Number(v))}`, "GEX"]}
                />
                {chain && (
                  <ReferenceLine
                    x={Math.round(chain.spot)}
                    stroke="#e8e8ee"
                    strokeDasharray="3 3"
                    label={{
                      value: "spot",
                      fill: "#e8e8ee",
                      fontSize: 10,
                      position: "top",
                    }}
                  />
                )}
                {flip && (
                  <ReferenceLine
                    x={Math.round(flip)}
                    stroke="#a8a8b3"
                    strokeDasharray="2 4"
                    label={{ value: "flip", fill: "#a8a8b3", fontSize: 10, position: "top" }}
                  />
                )}
                <Bar
                  dataKey="value"
                  fill={CHART_COLOR_POS}
                  shape={(props: any) => {
                    const { x, y, width, height, value } = props;
                    const fill = value >= 0 ? CHART_COLOR_POS : CHART_COLOR_NEG;
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
