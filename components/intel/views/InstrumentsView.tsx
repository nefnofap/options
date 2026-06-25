"use client";

import { useEffect, useState } from "react";
import Notices from "@/components/intel/Notices";
import { fmtNumber, fmtPct } from "@/lib/format";
import type { InstrumentsResult, Bias } from "@/lib/intel/types";

function biasBadge(b: Bias) {
  const cls =
    b === "bullish"
      ? "bg-bull/15 text-bull"
      : b === "bearish"
      ? "bg-bear/15 text-bear"
      : "bg-white/10 text-ink-300";
  return <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${cls}`}>{b}</span>;
}

export default function InstrumentsView() {
  const [data, setData] = useState<InstrumentsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/intel/instruments")
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, []);

  if (error)
    return <div className="panel p-6 text-bear text-sm">Failed to load instruments: {error}</div>;
  if (!data) return <div className="label-mono">scanning instruments…</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="label-mono">technical bias · {data.asOf}</div>
        <h1 className="display-italic text-3xl text-white mt-1">Instruments Tracker</h1>
      </div>

      <div className="panel p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="label-mono text-left border-b border-white/5">
              <th className="px-5 py-3 font-normal">Instrument</th>
              <th className="px-3 py-3 font-normal text-right">Price</th>
              <th className="px-3 py-3 font-normal text-right">Chg%</th>
              <th className="px-3 py-3 font-normal text-right">RSI</th>
              <th className="px-3 py-3 font-normal text-right">MACD Hist</th>
              <th className="px-3 py-3 font-normal">Bias</th>
              <th className="px-5 py-3 font-normal">Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.instruments.map((it) => (
              <tr key={it.symbol} className="hover:bg-white/[0.02]">
                <td className="px-5 py-3">
                  <div className="text-ink-100">{it.symbol}</div>
                  <div className="label-mono">{it.name}</div>
                </td>
                <td className="px-3 py-3 text-right num">
                  {it.price != null ? fmtNumber(it.price, it.price > 100 ? 2 : 4) : "—"}
                </td>
                <td
                  className={`px-3 py-3 text-right num ${
                    it.changePct == null ? "text-ink-400" : it.changePct >= 0 ? "text-bull" : "text-bear"
                  }`}
                >
                  {it.changePct != null ? fmtPct(it.changePct) : "—"}
                </td>
                <td
                  className={`px-3 py-3 text-right num ${
                    it.rsi == null
                      ? "text-ink-400"
                      : it.rsi >= 70
                      ? "text-bull"
                      : it.rsi <= 30
                      ? "text-bear"
                      : "text-ink-200"
                  }`}
                >
                  {it.rsi != null ? it.rsi.toFixed(1) : "—"}
                </td>
                <td
                  className={`px-3 py-3 text-right num ${
                    it.macdHist == null ? "text-ink-400" : it.macdHist >= 0 ? "text-bull" : "text-bear"
                  }`}
                >
                  {it.macdHist != null ? it.macdHist.toFixed(3) : "—"}
                </td>
                <td className="px-3 py-3">{biasBadge(it.bias)}</td>
                <td className="px-5 py-3 text-ink-300 text-xs">{it.error ? `err: ${it.error}` : it.level}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.instruments.length === 0 && (
          <div className="px-5 py-6 text-sm text-ink-300">No instruments loaded — Yahoo may be throttling. Retry shortly.</div>
        )}
      </div>

      <p className="text-xs text-ink-400">
        Bias blends RSI(14), the MACD(12,26,9) histogram, and price vs its 20-day average: RSI ≥ 60
        with a positive histogram above the MA leans bullish; the inverse leans bearish. Prices and
        indicators are pulled free from Yahoo daily closes — no API key required.
      </p>

      <Notices notices={data.notices} />
    </div>
  );
}
