"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import { fmtNumber, fmtPct } from "@/lib/format";

function ivColor(iv: number, min: number, max: number): string {
  if (max === min) return "rgba(255,255,255,0.1)";
  const t = (iv - min) / (max - min);
  // green (low) -> white -> red (high)
  if (t < 0.5) {
    const k = t / 0.5;
    const r = Math.round(95 + (232 - 95) * k);
    const g = Math.round(211 + (232 - 211) * k);
    const b = Math.round(154 + (238 - 154) * k);
    return `rgb(${r},${g},${b})`;
  } else {
    const k = (t - 0.5) / 0.5;
    const r = Math.round(232 + (240 - 232) * k);
    const g = Math.round(232 + (106 - 232) * k);
    const b = Math.round(238 + (122 - 238) * k);
    return `rgb(${r},${g},${b})`;
  }
}

export default function HeatmapView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const { chain, loading, error } = useChain(symbol);

  if (loading)
    return (
      <div className="space-y-6">
        <QuoteHeader />
        <div className="label-mono py-16 text-center">loading</div>
      </div>
    );

  if (error || !chain)
    return (
      <div className="space-y-6">
        <QuoteHeader />
        <EmptyState title="Couldn't load chain" body={error ?? "no data"} />
      </div>
    );

  const exps = chain.expirations.slice(0, 8); // limit columns
  // pick strikes near spot
  const strikes = Array.from(new Set(chain.contracts.map((c) => c.strike)))
    .sort((a, b) => a - b)
    .filter((s) => Math.abs(s - chain.spot) / chain.spot < 0.2);

  const lookup = new Map<string, number>();
  for (const c of chain.contracts) {
    if (c.iv <= 0) continue;
    if (c.side !== "C") continue; // call IV
    const k = `${c.strike}|${c.expiration}`;
    lookup.set(k, c.iv * 100);
  }

  let min = Infinity;
  let max = -Infinity;
  for (const v of lookup.values()) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 100;

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">IV heatmap</h3>
          <span className="label-mono">
            call IV · {fmtPct(min, 1)} → {fmtPct(max, 1)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs num border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="px-2 py-2 label-mono text-left sticky left-0 bg-ink-900">
                  STRIKE
                </th>
                {exps.map((e) => (
                  <th key={e} className="px-2 py-2 label-mono whitespace-nowrap">
                    {e.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strikes.map((s) => (
                <tr key={s}>
                  <td className="px-2 py-1 sticky left-0 bg-ink-900 text-ink-200">
                    {fmtNumber(s, 0)}
                  </td>
                  {exps.map((e) => {
                    const v = lookup.get(`${s}|${e}`);
                    return (
                      <td
                        key={e}
                        className="px-2 py-1 text-center text-ink-950 font-medium"
                        style={{
                          background: v ? ivColor(v, min, max) : "rgba(255,255,255,0.03)",
                          color: v ? "#0a0a0c" : "#5a5a66",
                          minWidth: 64,
                        }}
                      >
                        {v ? v.toFixed(0) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
