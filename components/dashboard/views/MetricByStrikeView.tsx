"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import { strikeAggregates } from "@/lib/analytics";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import LiveBadge from "../LiveBadge";
import StrikeBarChart from "./StrikeBarChart";
import { fmtCompact } from "@/lib/format";
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

export default function MetricByStrikeView({ title, description, metric, unit }: Props) {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || undefined;
  const { chain, loading, refreshing, error, updatedAt } = useChain(symbol);

  const aggs = chain ? strikeAggregates(chain, { expiration: exp }) : [];
  const data = aggs.map((a) => ({ strike: a.strike, value: a[metric] as number }));
  const total = aggs.reduce((s, a) => s + (a[metric] as number), 0);

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <ExpirationPicker />

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-2 gap-4 flex-wrap">
          <h3 className="display-italic text-2xl text-white">{title}</h3>
          <div className="flex items-center gap-4">
            <span className="label-mono">
              total {total >= 0 ? "+" : ""}
              {fmtCompact(total)} {unit ?? ""}
            </span>
            <LiveBadge updatedAt={updatedAt} refreshing={refreshing} stale={!!error && !!chain} />
          </div>
        </div>
        <p className="text-ink-400 text-sm mb-5 max-w-2xl">{description}</p>

        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && !chain && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && data.length === 0 && (
          <EmptyState title="No data" body="Try another symbol or expiration." />
        )}

        {data.length > 0 && (
          <StrikeBarChart
            data={data}
            spot={chain?.spot}
            tooltipLabel={title}
            valueFormatter={(v) => fmtCompact(v)}
            height={440}
            resetKey={`${symbol}|${exp ?? "all"}|${metric}`}
          />
        )}
      </section>
    </div>
  );
}
