"use client";

import { useEffect, useState } from "react";
import Notices from "@/components/intel/Notices";
import type { Bias, ThesisResult, ThesisSection } from "@/lib/intel/types";

function biasColor(b: Bias): string {
  return b === "bullish" ? "text-bull" : b === "bearish" ? "text-bear" : "text-ink-300";
}
function biasDot(b: Bias): string {
  return b === "bullish" ? "bg-bull" : b === "bearish" ? "bg-bear" : "bg-ink-500";
}

function ConvictionMeter({ value, label }: { value: number; label: string }) {
  const color = value >= 66 ? "bg-bull" : value >= 40 ? "bg-amber-400" : "bg-bear";
  return (
    <div className="min-w-[160px]">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">conviction</span>
        <span className="num text-sm text-white">
          {value}
          <span className="text-ink-500">/100 · {label}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SectionCard({ s }: { s: ThesisSection }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="label-mono">{s.title}</div>
        <span className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${biasColor(s.bias)}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${biasDot(s.bias)}`} />
          {s.bias}
        </span>
      </div>
      <p className="mt-2 text-sm text-white leading-snug">{s.headline}</p>
      <ul className="mt-3 space-y-1.5 text-[13px] text-ink-200 leading-relaxed">
        {s.body.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-ink-600">▸</span>
            {b}
          </li>
        ))}
      </ul>
      {s.metrics && s.metrics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {s.metrics.map((m, i) => (
            <div key={i}>
              <div className="label-mono">{m.label}</div>
              <div className={`num text-sm ${m.bias ? biasColor(m.bias) : "text-ink-100"}`}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ThesisView() {
  const [data, setData] = useState<ThesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/intel/thesis")
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

  if (error) return <div className="panel p-6 text-bear text-sm">Failed to load thesis: {error}</div>;
  if (!data) return <div className="label-mono">synthesizing market thesis…</div>;

  const lv = data.levels;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-mono">auto-generated · {data.asOf}</div>
          <h1 className="display-italic text-3xl text-white mt-1">Market Thesis</h1>
        </div>
        <div className={`text-2xl num ${biasColor(data.bias)}`}>{data.bias.toUpperCase()}</div>
      </div>

      {/* Bottom line */}
      <div className="panel p-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="label-mono">the thesis</div>
          <ConvictionMeter value={data.conviction} label={data.convictionLabel} />
        </div>
        <p className="mt-3 text-[15px] text-white leading-relaxed">{data.thesis}</p>
        <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-ink-100">
          {data.tldr.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ink-600">▸</span>
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* Key levels */}
      <div className="panel p-0 overflow-hidden">
        <div className="px-5 py-3 label-mono border-b border-white/5">
          key levels · {lv.symbol}
          {lv.dealerRegime && <span className={`ml-2 ${lv.dealerRegime === "long" ? "text-bull" : "text-bear"}`}>dealers {lv.dealerRegime} γ</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-white/5">
          {[
            { label: "spot", value: lv.spot },
            { label: "resistance / call wall", value: lv.resistance, bias: "bearish" as Bias },
            { label: "support / put wall", value: lv.support, bias: "bullish" as Bias },
            { label: "gamma flip", value: lv.gammaFlip },
            { label: "max pain", value: lv.maxPain },
            { label: "invalidation", value: lv.invalidation, bias: "bearish" as Bias },
          ].map((c, i) => (
            <div key={i} className="px-4 py-3">
              <div className="label-mono">{c.label}</div>
              <div className={`num text-lg mt-0.5 ${c.bias ? biasColor(c.bias) : "text-white"}`}>
                {c.value == null ? "—" : c.value.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="grid lg:grid-cols-2 gap-5">
        {data.sections.map((s) => (
          <SectionCard key={s.key} s={s} />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Signal vote breakdown */}
        <div className="panel p-0 overflow-hidden">
          <div className="px-5 py-3 label-mono border-b border-white/5">how the call was built</div>
          <ul className="divide-y divide-white/5">
            {data.signals.map((sig, i) => (
              <li key={i} className="px-5 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm text-ink-100">{sig.label}</span>
                  <span className="label-mono ml-2">{sig.note}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="label-mono">w{sig.weight}</span>
                  <span className={`flex items-center gap-1.5 text-[11px] uppercase ${biasColor(sig.bias)}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${biasDot(sig.bias)}`} />
                    {sig.bias}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Catalysts ahead */}
        <div className="panel p-0 overflow-hidden">
          <div className="px-5 py-3 label-mono border-b border-white/5">catalysts ahead</div>
          <ul className="divide-y divide-white/5">
            {data.catalysts.map((c, i) => (
              <li key={i} className="px-5 py-2.5 flex items-start gap-3">
                <span className="num text-xs text-ink-400 w-24 shrink-0">{c.when || c.country}</span>
                <div className="min-w-0 text-sm text-ink-100">
                  {c.label}
                  {c.importance >= 3 && <span className="ml-2 text-bear text-[10px]">HIGH</span>}
                  {c.importance === 2 && <span className="ml-2 text-amber-400 text-[10px]">MED</span>}
                </div>
              </li>
            ))}
            {data.catalysts.length === 0 && (
              <li className="px-5 py-6 text-sm text-ink-300">No high-impact events on the calendar (set TRADINGECONOMICS_KEY for more).</li>
            )}
          </ul>
        </div>
      </div>

      {/* Daily news */}
      <div className="panel p-0 overflow-hidden">
        <div className="px-5 py-3 label-mono border-b border-white/5">daily news</div>
        <ul className="divide-y divide-white/5">
          {data.headlines.map((h, i) => (
            <li key={i} className="px-5 py-3">
              <a href={h.url} target="_blank" rel="noreferrer" className="text-sm text-ink-100 hover:text-white line-clamp-2">
                {h.title}
              </a>
              <div className="label-mono mt-1">
                <span className={biasColor(h.bias)}>{h.bias}</span> · {h.source}
              </div>
            </li>
          ))}
          {data.headlines.length === 0 && <li className="px-5 py-6 text-sm text-ink-300">No headlines in the pool.</li>}
        </ul>
      </div>

      <Notices notices={data.notices} />
    </div>
  );
}
