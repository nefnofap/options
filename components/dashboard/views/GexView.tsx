"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import { strikeAggregates, gammaFlip, maxPain } from "@/lib/analytics";
import Stat from "../Stat";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import LiveBadge from "../LiveBadge";
import StrikeBarChart, { type RefMarker } from "./StrikeBarChart";
import { fmtCompact, fmtMoney } from "@/lib/format";

export default function GexView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || undefined;
  const { chain, loading, refreshing, error, updatedAt } = useChain(symbol);

  const aggs = chain ? strikeAggregates(chain, { expiration: exp }) : [];
  const flip = gammaFlip(aggs);
  const pain = maxPain(aggs);
  const totalNotional = aggs.reduce((a, s) => a + s.netGammaNotional, 0);

  const chartData = aggs.map((a) => ({ strike: a.strike, value: a.netGammaNotional }));
  const markers: RefMarker[] = [];
  if (flip) markers.push({ x: flip, label: "flip", color: "#a8a8b3" });
  if (pain) markers.push({ x: pain, label: "pain", color: "#7a7a88", dash: "1 5" });

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <div className="flex items-center gap-6 flex-wrap">
        <ExpirationPicker />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Spot" value={chain ? fmtMoney(chain.spot) : "—"} />
        <Stat
          label="Gamma flip"
          value={flip ? fmtMoney(flip) : "—"}
          tone={flip && chain ? (chain.spot > flip ? "bull" : "bear") : "default"}
          hint="zero-gamma level"
        />
        <Stat label="Max pain" value={pain ? fmtMoney(pain) : "—"} />
        <Stat
          label="Total GEX"
          value={`${totalNotional >= 0 ? "+" : ""}$${fmtCompact(totalNotional)}`}
          tone={totalNotional >= 0 ? "bull" : "bear"}
          hint="per 1% move"
        />
      </div>

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
          <h3 className="display-italic text-2xl text-white">Gamma exposure by strike</h3>
          <div className="flex items-center gap-4">
            <span className="label-mono">{exp ? `EXP ${exp}` : "all expirations"}</span>
            <LiveBadge updatedAt={updatedAt} refreshing={refreshing} stale={!!error && !!chain} />
          </div>
        </div>

        {loading && <div className="label-mono py-20 text-center">loading chain</div>}
        {error && !chain && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && aggs.length === 0 && (
          <EmptyState title="No data" body="Try another symbol or expiration." />
        )}

        {aggs.length > 0 && (
          <StrikeBarChart
            data={chartData}
            spot={chain?.spot}
            markers={markers}
            tooltipLabel="GEX"
            valueFormatter={(v) => `$${fmtCompact(v)}`}
            height={420}
            resetKey={`${symbol}|${exp ?? "all"}`}
          />
        )}
      </section>
    </div>
  );
}
