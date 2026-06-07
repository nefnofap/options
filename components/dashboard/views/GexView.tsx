"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import { strikeAggregates, gammaFlip, maxPain } from "@/lib/analytics";
import { interpretRegime, absorptionProfile } from "@/lib/regime";
import Stat from "../Stat";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import LiveBadge from "../LiveBadge";
import StrikeBarChart, { type RefMarker } from "./StrikeBarChart";
import { fmtCompact, fmtMoney } from "@/lib/format";

const TONE_CLS: Record<string, string> = {
  bull: "text-bull",
  bear: "text-bear",
  neutral: "text-ink-100",
};

export default function GexView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || undefined;
  const { chain, loading, refreshing, error, updatedAt } = useChain(symbol);

  const aggs = chain ? strikeAggregates(chain, { expiration: exp }) : [];
  const flip = gammaFlip(aggs);
  const pain = maxPain(aggs);
  const totalNotional = aggs.reduce((a, s) => a + s.netGammaNotional, 0);

  const regime = aggs.length > 0 ? interpretRegime(aggs, chain?.spot, flip) : null;
  const absorption = aggs.length > 0 ? absorptionProfile(aggs, chain?.spot) : null;

  const chartData = aggs.map((a) => ({ strike: a.strike, value: a.netGammaNotional }));
  const markers: RefMarker[] = [];
  if (flip) markers.push({ x: flip, label: "flip", color: "#a8a8b3" });
  if (pain) markers.push({ x: pain, label: "pain", color: "#7a7a88", dash: "1 5" });
  if (absorption?.callWall) markers.push({ x: absorption.callWall, label: "call wall", color: "#5fd39a", dash: "4 3" });
  if (absorption?.putWall) markers.push({ x: absorption.putWall, label: "put wall", color: "#f06a7a", dash: "4 3" });

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

      {/* Dealer-positioning interpretation */}
      {regime && (
        <section className="panel p-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div className="label-mono">dealer regime · interpretation</div>
            <div className="flex gap-2 flex-wrap">
              {regime.badges.map((b) => (
                <span
                  key={b}
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                    b.startsWith("negative")
                      ? "bg-bear/15 text-bear"
                      : b.startsWith("positive")
                      ? "bg-bull/15 text-bull"
                      : "bg-white/10 text-ink-300"
                  }`}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
          <h3 className={`display-italic text-2xl mt-2 ${TONE_CLS[regime.tone]}`}>{regime.label}</h3>
          <p className="text-sm text-ink-200 mt-2 leading-relaxed max-w-3xl">{regime.interpretation}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <div className="label-mono">net gamma</div>
              <div className={`num mt-1 ${regime.gamma >= 0 ? "text-bull" : "text-bear"}`}>
                {regime.gamma >= 0 ? "+" : ""}${fmtCompact(regime.gamma)}
              </div>
            </div>
            <div>
              <div className="label-mono">net vanna</div>
              <div className={`num mt-1 ${regime.vanna >= 0 ? "text-bull" : "text-bear"}`}>
                {regime.vanna >= 0 ? "+" : ""}{fmtCompact(regime.vanna)}
              </div>
            </div>
            <div>
              <div className="label-mono">net charm</div>
              <div className={`num mt-1 ${regime.charm >= 0 ? "text-bull" : "text-bear"}`}>
                {regime.charm >= 0 ? "+" : ""}{fmtCompact(regime.charm)}
              </div>
            </div>
            <div>
              <div className="label-mono">spot vs flip</div>
              <div className="num mt-1 text-ink-100">
                {regime.aboveFlip == null ? "—" : regime.aboveFlip ? "above" : "below"}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-ink-500 mt-3">
            Dealer-side signs. Walls only absorb if dealer-hedged and only matter if price arrives;
            an IV spike relocates them. Not financial advice.
          </p>
        </section>
      )}

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
          <h3 className="display-italic text-2xl text-white">Gamma exposure by strike</h3>
          <div className="flex items-center gap-4">
            {absorption?.callWall && (
              <span className="label-mono">
                walls <span className="text-bull">{fmtMoney(absorption.callWall)}</span>
                {absorption.putWall && <> · <span className="text-bear">{fmtMoney(absorption.putWall)}</span></>}
              </span>
            )}
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
            absorption={absorption?.strikes ?? []}
            tooltipLabel="GEX"
            valueFormatter={(v) => `$${fmtCompact(v)}`}
            height={420}
            resetKey={`${symbol}|${exp ?? "all"}`}
          />
        )}
        {absorption && absorption.strikes.length > 0 && (
          <p className="text-[11px] text-ink-500 mt-3">
            <span className="text-[#e8c15f]">▢</span> outlined bars = absorption walls (high |gamma| ×
            proximity to spot) — strikes where dealer hedging most dampens or accelerates price.
          </p>
        )}
      </section>
    </div>
  );
}
