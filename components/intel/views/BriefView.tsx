"use client";

import { useEffect, useState } from "react";
import Notices from "@/components/intel/Notices";
import type { BriefResult, Bias } from "@/lib/intel/types";

function biasColor(b: Bias): string {
  return b === "bullish" ? "text-bull" : b === "bearish" ? "text-bear" : "text-ink-300";
}

export default function BriefView() {
  const [data, setData] = useState<BriefResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/intel/brief")
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

  if (error) return <div className="panel p-6 text-bear text-sm">Failed to load brief: {error}</div>;
  if (!data) return <div className="label-mono">generating brief…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-mono">auto-generated · {data.asOf}</div>
          <h1 className="display-italic text-3xl text-white mt-1">Pre-Market Brief</h1>
        </div>
        {data.regime && (
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
        )}
      </div>

      {/* TL;DR */}
      <div className="panel p-5">
        <div className="label-mono">the brief</div>
        <ul className="mt-3 space-y-2 text-sm text-ink-100 leading-relaxed">
          {data.summary.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ink-500">▸</span>
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Headlines */}
        <div className="panel p-0 overflow-hidden">
          <div className="px-5 py-3 label-mono border-b border-white/5">overnight headlines</div>
          <ul className="divide-y divide-white/5">
            {data.headlines.map((h, i) => (
              <li key={i} className="px-5 py-3">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-ink-100 hover:text-white line-clamp-2"
                >
                  {h.title}
                </a>
                <div className="label-mono mt-1">
                  <span className={biasColor(h.bias)}>{h.bias}</span> · {h.source}
                </div>
              </li>
            ))}
            {data.headlines.length === 0 && (
              <li className="px-5 py-6 text-sm text-ink-300">No overnight headlines.</li>
            )}
          </ul>
        </div>

        {/* Economic calendar */}
        <div className="panel p-0 overflow-hidden">
          <div className="px-5 py-3 label-mono border-b border-white/5">today&apos;s economic events</div>
          <ul className="divide-y divide-white/5">
            {data.events.map((e, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <span className="num text-xs text-ink-400 w-16 shrink-0">{e.country}</span>
                <div className="min-w-0">
                  <div className="text-sm text-ink-100">
                    {e.event}
                    {e.importance >= 3 && <span className="ml-2 text-bear text-[10px]">HIGH</span>}
                    {e.importance === 2 && <span className="ml-2 text-amber-400 text-[10px]">MED</span>}
                  </div>
                  {(e.forecast || e.previous) && (
                    <div className="label-mono mt-1">
                      {e.forecast && <>fcst {e.forecast} </>}
                      {e.previous && <>· prev {e.previous}</>}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {data.events.length === 0 && (
              <li className="px-5 py-6 text-sm text-ink-300">
                No calendar events (set TRADINGECONOMICS_KEY for more coverage).
              </li>
            )}
          </ul>
        </div>
      </div>

      <Notices notices={data.notices} />
    </div>
  );
}
