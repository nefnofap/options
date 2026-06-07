"use client";

import { useEffect, useState } from "react";
import Stat from "@/components/dashboard/Stat";
import Notices from "@/components/intel/Notices";
import type { SentimentResult, Bias } from "@/lib/intel/types";

const toneFor = (b: Bias): "bull" | "bear" | "default" =>
  b === "bullish" ? "bull" : b === "bearish" ? "bear" : "default";

function biasColor(b: Bias): string {
  return b === "bullish" ? "text-bull" : b === "bearish" ? "text-bear" : "text-ink-300";
}

export default function SentimentView() {
  const [data, setData] = useState<SentimentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/intel/sentiment")
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

  if (error) return <div className="panel p-6 text-bear text-sm">Failed to load sentiment: {error}</div>;
  if (!data) return <div className="label-mono">analysing headlines…</div>;

  // -1..1 → 0..100 for the gauge bar.
  const pct = Math.round(((data.score + 1) / 2) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-mono">ai news bias · {data.engine}</div>
          <h1 className="display-italic text-3xl text-white mt-1">News Sentiment</h1>
        </div>
        <div className={`text-3xl num ${biasColor(data.bias)}`}>{data.bias.toUpperCase()}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Aggregate Score" value={data.score.toFixed(2)} hint="-1 bearish · +1 bullish" tone={toneFor(data.bias)} />
        <Stat label="Bullish" value={String(data.bullishCount)} tone="bull" />
        <Stat label="Bearish" value={String(data.bearishCount)} tone="bear" />
        <Stat label="Neutral" value={String(data.neutralCount)} />
      </div>

      {/* Sentiment gauge */}
      <div className="panel p-5">
        <div className="label-mono">bearish ←→ bullish</div>
        <div className="mt-3 h-3 rounded-full bg-ink-800 overflow-hidden relative">
          <div
            className="absolute inset-y-0 left-1/2 w-px bg-white/30"
            aria-hidden
          />
          <div
            className={`h-full ${data.score >= 0 ? "bg-bull" : "bg-bear"}`}
            style={{
              width: `${Math.abs(pct - 50)}%`,
              marginLeft: data.score >= 0 ? "50%" : `${pct}%`,
            }}
          />
        </div>
        {data.drivers.length > 0 && (
          <div className="mt-3 text-xs text-ink-400">
            Top drivers: <span className="text-ink-200">{data.drivers.join(", ")}</span>
          </div>
        )}
      </div>

      {/* Headlines */}
      <div className="panel p-0 overflow-hidden">
        <div className="px-5 py-3 label-mono border-b border-white/5">scored headlines</div>
        <ul className="divide-y divide-white/5">
          {data.headlines.map((h, i) => (
            <li key={i} className="px-5 py-3 flex items-start gap-4 hover:bg-white/[0.02]">
              <span className={`num text-sm w-12 shrink-0 ${biasColor(h.bias)}`}>
                {h.score >= 0 ? "+" : ""}
                {h.score.toFixed(2)}
              </span>
              <div className="min-w-0">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-ink-100 hover:text-white line-clamp-2"
                >
                  {h.title}
                </a>
                <div className="label-mono mt-1">{h.source}</div>
              </div>
            </li>
          ))}
        </ul>
        {data.headlines.length === 0 && (
          <div className="px-5 py-6 text-sm text-ink-300">No headlines available right now.</div>
        )}
      </div>

      <Notices notices={data.notices} />
    </div>
  );
}
