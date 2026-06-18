"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import { strikeAggregates, gammaFlip, maxPain } from "@/lib/analytics";
import { interpretRegime, absorptionProfile, reversalZones, type ReversalBias } from "@/lib/regime";
import Stat from "../Stat";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import LiveBadge from "../LiveBadge";
import StrikeBarChart, { type RefMarker } from "./StrikeBarChart";
import PineExportButton from "./PineExportButton";
import QuantowerSetupButton from "./QuantowerSetupButton";
import PremiumGate from "@/components/auth/PremiumGate";
import { fmtCompact, fmtMoney } from "@/lib/format";

const TONE_CLS: Record<string, string> = {
  bull: "text-bull",
  bear: "text-bear",
  neutral: "text-ink-100",
};

// How each reversal bias renders: accent color + a short directional tag.
const BIAS_META: Record<ReversalBias, { cls: string; tag: string; dot: string }> = {
  "reverse-down": { cls: "text-bear", tag: "may reverse down", dot: "#f06a7a" },
  "reverse-up": { cls: "text-bull", tag: "may reverse up", dot: "#5fd39a" },
  consolidate: { cls: "text-ink-200", tag: "may consolidate", dot: "#a8a8b3" },
  "breakout-up": { cls: "text-bull", tag: "breach → upside chase", dot: "#5fd39a" },
  "breakout-down": { cls: "text-bear", tag: "break → flush", dot: "#f06a7a" },
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
  const zones = aggs.length > 0 ? reversalZones(aggs, chain?.spot, flip, pain) : [];

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

      {/* Reversal & continuation zones — in-depth, directional read per level */}
      {zones.length > 0 && (
        <PremiumGate variant="block" label="Levels · reversals & continuation">
        <section className="panel p-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1">
            <div className="label-mono">levels · possible reversals & continuation</div>
            <div className="label-mono text-ink-500">{zones.length} zones</div>
          </div>
          <p className="text-sm text-ink-300 mt-1 mb-4 max-w-3xl leading-relaxed">
            Where dealer mechanics make a turn, a stall, or an acceleration more likely. Each level
            reads off the live gamma structure — price might reverse, consolidate, or keep running.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {zones.map((z) => {
              const meta = BIAS_META[z.bias];
              const dist = chain?.spot ? ((z.price - chain.spot) / chain.spot) * 100 : null;
              return (
                <div
                  key={`${z.kind}-${z.price}`}
                  className="rounded-lg border border-white/10 bg-ink-900/60 p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: meta.dot }}
                      />
                      <span className={`num text-lg ${meta.cls}`}>{fmtMoney(z.price)}</span>
                      {dist != null && (
                        <span className="label-mono text-ink-500">
                          {dist >= 0 ? "+" : ""}
                          {dist.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 ${meta.cls}`}>
                      {meta.tag}
                    </span>
                  </div>
                  <div className="text-sm text-white mt-2 font-medium">{z.title}</div>
                  <p className="text-[12.5px] text-ink-300 mt-1 leading-relaxed">{z.detail}</p>
                  <div className="mt-3 h-1 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round(z.strength * 100)}%`, backgroundColor: meta.dot }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-500 mt-4">
            Mechanics-based, not predictions — levels move when IV or positioning shifts. The bar shows
            relative conviction (gamma concentration × proximity). Not financial advice.
          </p>
        </section>
        </PremiumGate>
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
            <PremiumGate variant="inline" label="Pine export">
              <PineExportButton symbol={symbol} exp={exp} />
              <QuantowerSetupButton symbol={symbol} exp={exp} />
            </PremiumGate>
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
