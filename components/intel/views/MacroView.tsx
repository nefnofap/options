"use client";

import { useEffect, useState } from "react";
import Stat from "@/components/dashboard/Stat";
import Notices from "@/components/intel/Notices";
import { fmtNumber, fmtSigned } from "@/lib/format";
import type { MacroResult, Regime } from "@/lib/intel/types";

const REGIME_TONE: Record<Regime, "bull" | "bear" | "default"> = {
  "risk-on": "bull",
  "risk-off": "bear",
  neutral: "default",
};

export default function MacroView() {
  const [data, setData] = useState<MacroResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/intel/macro")
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

  if (error) return <div className="panel p-6 text-bear text-sm">Failed to load macro: {error}</div>;
  if (!data) return <div className="label-mono">loading macro…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-mono">macro regime</div>
          <h1 className="display-italic text-3xl text-white mt-1">Macro Analysis</h1>
        </div>
        <div className="text-right">
          <div className="label-mono">as of {data.asOf}</div>
          <div
            className={`text-2xl num ${
              data.regime === "risk-on"
                ? "text-bull"
                : data.regime === "risk-off"
                ? "text-bear"
                : "text-white"
            }`}
          >
            {data.regime.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Regime drivers */}
      <div className="panel p-5">
        <div className="label-mono">why this regime</div>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-200">
          {data.drivers.map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ink-500">–</span>
              {d}
            </li>
          ))}
        </ul>
      </div>

      {/* Series grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.series.map((s) => (
          <Stat
            key={s.id}
            label={s.label}
            value={`${fmtNumber(s.value, 2)}${s.unit}`}
            hint={
              s.change != null
                ? `${fmtSigned(s.change, 2)} vs prev · ${s.asOf}`
                : s.asOf || s.source
            }
            tone={
              s.change == null
                ? "default"
                : // For VIX & credit spreads, up = risk-off (bear); flip those.
                s.id === "VIXCLS" || s.id === "BAMLH0A0HYM2"
                ? s.change > 0
                  ? "bear"
                  : "bull"
                : s.change > 0
                ? "bull"
                : "bear"
            }
          />
        ))}
      </div>

      {data.series.length === 0 && (
        <div className="panel p-6 text-sm text-ink-300">
          No macro series loaded. Set <span className="num">FRED_API_KEY</span> in{" "}
          <span className="num">.env.local</span> (free at fred.stlouisfed.org) to populate this
          page.
        </div>
      )}

      <Notices notices={data.notices} />
    </div>
  );
}
