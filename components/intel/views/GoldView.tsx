"use client";

import { useEffect, useState } from "react";
import Notices from "@/components/intel/Notices";
import type { Bias } from "@/lib/intel/types";
import type { GoldBriefing, LayerScore, Triple } from "@/lib/intel/gold-types";

function biasColor(b: Bias): string {
  return b === "bullish" ? "text-bull" : b === "bearish" ? "text-bear" : "text-ink-300";
}
function biasDot(b: Bias): string {
  return b === "bullish" ? "bg-bull" : b === "bearish" ? "bg-bear" : "bg-ink-500";
}
const f = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const triStr = (t: Triple, dp = 1) => `${f(t.low, dp)} / ${f(t.base, dp)} / ${f(t.high, dp)}`;

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 66 ? "bg-bull" : value >= 40 ? "bg-amber-400" : "bg-bear";
  return (
    <div className="min-w-[160px]">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">confidence</span>
        <span className="num text-sm text-white">
          {value}
          <span className="text-ink-500">/100</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Sub-score gauge: 50 = neutral midline, bull above / bear below.
function ScoreBar({ label, value, neutral = true }: { label: string; value: number; neutral?: boolean }) {
  const color = !neutral ? "bg-ink-400" : value >= 56 ? "bg-bull" : value <= 44 ? "bg-bear" : "bg-ink-400";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label-mono">{label}</span>
        <span className="num text-sm text-ink-100">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden relative">
        {neutral && <span className="absolute left-1/2 top-0 h-full w-px bg-white/20" />}
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function LayerCard({ title, layer }: { title: string; layer: LayerScore }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="label-mono">{title}</div>
        <span className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${biasColor(layer.bias)}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${biasDot(layer.bias)}`} />
          {layer.bias} · {layer.score}
        </span>
      </div>
      <p className="mt-2 text-sm text-white leading-snug">{layer.headline}</p>
      <ul className="mt-3 space-y-1.5 text-[13px] text-ink-200 leading-relaxed">
        {layer.drivers.map((d, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-ink-600">▸</span>
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InstrumentTable({
  title,
  spot,
  rows,
  support,
  resistance,
  invalidation,
}: {
  title: string;
  spot: number | null;
  rows: { label: string; value: string }[];
  support: number[];
  resistance: number[];
  invalidation: number | null;
}) {
  return (
    <div className="panel p-0 overflow-hidden">
      <div className="px-5 py-3 label-mono border-b border-white/5 flex items-center justify-between">
        <span>{title}</span>
        <span className="num text-white">{spot == null ? "—" : f(spot, 1)}</span>
      </div>
      <table className="w-full text-[13px]">
        <tbody className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-5 py-2 text-ink-300">{r.label}</td>
              <td className="px-5 py-2 num text-right text-ink-100">{r.value}</td>
            </tr>
          ))}
          <tr>
            <td className="px-5 py-2 text-ink-300">support</td>
            <td className="px-5 py-2 num text-right text-bull">{support.length ? support.map((s) => f(s, 1)).join(" · ") : "—"}</td>
          </tr>
          <tr>
            <td className="px-5 py-2 text-ink-300">resistance</td>
            <td className="px-5 py-2 num text-right text-bear">{resistance.length ? resistance.map((s) => f(s, 1)).join(" · ") : "—"}</td>
          </tr>
          <tr>
            <td className="px-5 py-2 text-ink-300">invalidation</td>
            <td className="px-5 py-2 num text-right text-amber-400">{f(invalidation, 1)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function GoldView() {
  const [data, setData] = useState<GoldBriefing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/intel/gold")
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

  if (error) return <div className="panel p-6 text-bear text-sm">Failed to load gold briefing: {error}</div>;
  if (!data) return <div className="label-mono">building gold thesis…</div>;

  const x = data.xauusd;
  const m = data.mgc;
  const weekly = data.mode === "weekly";
  const nearL = data.horizon.near; // "session" | "day"
  const farL = data.horizon.far; // "day" | "week"

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(data.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-mono">
            gold engine · {weekly ? "weekend · markets closed" : `${data.active_session} session · Tokyo open: ${data.tokyo_open}`}
          </div>
          <h1 className="display-italic text-3xl text-white mt-1">{weekly ? "Gold Weekly Thesis" : "Gold Daily Briefing"}</h1>
          <div className="label-mono mt-1">XAUUSD · MGC · {data.period_label} · regime: {data.macro_regime}</div>
        </div>
        <div className="flex items-center gap-6">
          <ConfidenceMeter value={data.confidence} />
          <div className="text-right">
            <div className={`text-2xl num ${biasColor(data.bias)}`}>{data.bias.toUpperCase()}</div>
            <div className="label-mono mt-0.5">{weekly ? "weekly" : "daily"} thesis</div>
          </div>
        </div>
      </div>

      {/* Bottom line */}
      <div className="panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="label-mono">the read</div>
          <button
            onClick={copyMarkdown}
            className="label-mono px-2 py-1 rounded border border-white/10 hover:border-white/30 text-ink-300 hover:text-white transition-colors"
          >
            {copied ? "copied ✓" : "copy markdown"}
          </button>
        </div>
        <p className="mt-3 text-[15px] text-white leading-relaxed">{data.pre_market_brief}</p>
        <p className="mt-3 text-[13px] text-ink-200 leading-relaxed">{data.macro_thesis}</p>
      </div>

      {/* Sub-scores */}
      <div className="panel p-5">
        <div className="label-mono mb-4">how the call was built · weighted macro 30 / micro 10 / flow 20 / structure 25 / geo 10 / event 5</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
          <ScoreBar label="macro" value={data.scores.macro} />
          <ScoreBar label="microeconomics" value={data.scores.microeconomics} />
          <ScoreBar label="flow" value={data.scores.flow} />
          <ScoreBar label="microstructure" value={data.scores.microstructure} />
          <ScoreBar label="geopolitical" value={data.scores.geopolitical} />
          <ScoreBar label="event risk" value={data.scores.event_risk} neutral={false} />
        </div>
      </div>

      {/* Expected move tables */}
      <div className="grid lg:grid-cols-2 gap-5">
        <InstrumentTable
          title="XAUUSD"
          spot={x.spot}
          support={x.levels.support}
          resistance={x.levels.resistance}
          invalidation={x.invalidation_level}
          rows={[
            { label: `${nearL} move (points)`, value: triStr(x.expected_move.session_points) },
            { label: `${nearL} move (pips)`, value: triStr(x.expected_move.session_pips, 0) },
            { label: `${farL} move (points)`, value: triStr(x.expected_move.day_points) },
            { label: `${farL} move (pips)`, value: triStr(x.expected_move.day_pips, 0) },
          ]}
        />
        <InstrumentTable
          title="MGC — Micro Gold"
          spot={m.spot}
          support={m.levels.support}
          resistance={m.levels.resistance}
          invalidation={m.invalidation_level}
          rows={[
            { label: `${nearL} move (points)`, value: triStr(m.expected_move.session_points) },
            { label: `${nearL} move (ticks)`, value: triStr(m.expected_move.session_ticks, 0) },
            { label: `${nearL} move ($/contract)`, value: triStr(m.expected_move.session_dollars, 0) },
            { label: `${farL} move (points)`, value: triStr(m.expected_move.day_points) },
            { label: `${farL} move (ticks)`, value: triStr(m.expected_move.day_ticks, 0) },
            { label: `${farL} move ($/contract)`, value: triStr(m.expected_move.day_dollars, 0) },
          ]}
        />
      </div>

      {/* Layer theses */}
      <div className="grid lg:grid-cols-2 gap-5">
        <LayerCard title="Macro Regime" layer={data.layers.macro} />
        <LayerCard title="Microeconomics" layer={data.layers.microeconomics} />
        <LayerCard title="Flow & Positioning" layer={data.layers.flow} />
        <LayerCard title="Microstructure" layer={data.layers.microstructure} />
        <LayerCard title="Geopolitical Risk" layer={data.layers.geopolitical} />
        <LayerCard title="Event Risk" layer={data.layers.event_risk} />
      </div>

      {/* Sessions */}
      <div className="panel p-0 overflow-hidden">
        <div className="px-5 py-3 label-mono border-b border-white/5">{weekly ? "typical session ranges · reference (market closed)" : "session ranges (points)"}</div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="label-mono text-left">
              <th className="px-5 py-2 font-normal">session</th>
              <th className="px-5 py-2 font-normal text-right">high</th>
              <th className="px-5 py-2 font-normal text-right">low</th>
              <th className="px-5 py-2 font-normal text-right">range</th>
              <th className="px-5 py-2 font-normal text-right">median</th>
              <th className="px-5 py-2 font-normal text-right">vwap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.sessions.map((s) => (
              <tr key={s.name} className={s.active ? "bg-white/[0.03]" : ""}>
                <td className="px-5 py-2 text-ink-100">
                  {s.name}
                  {s.active && <span className="ml-2 text-[10px] text-bull">ACTIVE</span>}
                </td>
                <td className="px-5 py-2 num text-right text-ink-200">{f(s.high, 1)}</td>
                <td className="px-5 py-2 num text-right text-ink-200">{f(s.low, 1)}</td>
                <td className="px-5 py-2 num text-right text-ink-100">{f(s.range, 1)}</td>
                <td className="px-5 py-2 num text-right text-ink-300">{f(s.medianRange, 1)}</td>
                <td className="px-5 py-2 num text-right text-ink-300">{f(s.vwap, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drivers + Scenarios */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="panel p-5">
          <div className="label-mono">top drivers</div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-100 leading-relaxed">
            {data.drivers.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-ink-600">▸</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-0 overflow-hidden">
          <div className="px-5 py-3 label-mono border-b border-white/5">scenario map</div>
          <ul className="divide-y divide-white/5">
            {data.scenarios.map((s, i) => (
              <li key={i} className="px-5 py-3">
                <div className="text-sm text-white capitalize">{s.name}</div>
                <div className="label-mono mt-1">trigger</div>
                <div className="text-[13px] text-ink-100">{s.trigger}</div>
                {s.target && (
                  <>
                    <div className="label-mono mt-1.5">target</div>
                    <div className="text-[13px] text-bull">{s.target}</div>
                  </>
                )}
                {s.implication && (
                  <>
                    <div className="label-mono mt-1.5">implication</div>
                    <div className="text-[13px] text-ink-100">{s.implication}</div>
                  </>
                )}
                <div className="label-mono mt-1.5">risk</div>
                <div className="text-[13px] text-ink-300">{s.risk}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="label-mono">
        data freshness — market: {data.data_freshness.market_data} · macro: {data.data_freshness.macro_data} · news: {data.data_freshness.news_data}
      </div>

      <Notices notices={data.notices} />
    </div>
  );
}
