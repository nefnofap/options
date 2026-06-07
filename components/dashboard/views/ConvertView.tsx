"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CONVERT_MAP, CONVERTIBLE_ETFS, convertTargetFor, type ConvertMap } from "@/lib/convert";
import { fmtNumber, fmtMoney, fmtCompact } from "@/lib/format";
import Stat from "../Stat";

interface Q {
  spot: number;
  source: string;
}

async function fetchQuote(symbol: string): Promise<Q | null> {
  try {
    const r = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.spot === "number" && j.spot > 0 ? { spot: j.spot, source: j.source } : null;
  } catch {
    return null;
  }
}

export default function ConvertView() {
  const sp = useSearchParams();
  const urlSym = (sp.get("symbol") || "SPY").toUpperCase();
  const initial = convertTargetFor(urlSym) ? urlSym : "SPY";

  const [etfKey, setEtfKey] = useState(initial);
  const map: ConvertMap = CONVERT_MAP[etfKey];

  const [etfQ, setEtfQ] = useState<Q | null>(null);
  const [idxQ, setIdxQ] = useState<Q | null>(null);
  const [futQ, setFutQ] = useState<Q | null>(null);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<string>("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    setEtfQ(null);
    setIdxQ(null);
    setFutQ(null);
    Promise.all([fetchQuote(map.etf), fetchQuote(map.index), fetchQuote(map.future)]).then(
      ([e, i, f]) => {
        if (!live) return;
        setEtfQ(e);
        setIdxQ(i);
        setFutQ(f);
        if (e) setPrice(e.spot.toFixed(2));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [etfKey, map.etf, map.index, map.future]);

  // Prefer the live index/etf ratio; fall back to the static multiplier.
  const ratio = useMemo(() => {
    if (etfQ && idxQ && etfQ.spot > 0) return idxQ.spot / etfQ.spot;
    return map.approxMultiplier;
  }, [etfQ, idxQ, map.approxMultiplier]);

  // Basis between the future and the cash index (future carries it).
  const basis = useMemo(() => {
    if (futQ && idxQ) return futQ.spot - idxQ.spot;
    return 0;
  }, [futQ, idxQ]);

  const p = Number(price);
  const valid = Number.isFinite(p) && p > 0;
  const indexEquiv = valid ? p * ratio : null;
  const futureEquiv = indexEquiv != null ? indexEquiv + basis : null;
  const liveRatio = !!(etfQ && idxQ);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-mono">price translator</div>
          <h1 className="display-italic text-3xl text-white mt-1">ETF → Index → Futures</h1>
        </div>
        <div className="flex gap-2">
          {CONVERTIBLE_ETFS.map((k) => (
            <button
              key={k}
              onClick={() => setEtfKey(k)}
              className={`pill ${etfKey === k ? "pill-primary" : "pill-ghost"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="panel p-5">
        <label className="label-mono">enter a {map.etf} price or strike</label>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="bg-ink-900 border border-white/10 rounded-lg px-3 py-2 text-lg num text-white outline-none focus:border-white/30 w-40"
          />
          {etfQ && (
            <button
              onClick={() => setPrice(etfQ.spot.toFixed(2))}
              className="pill pill-ghost text-xs"
            >
              use live spot
            </button>
          )}
          <span className="label-mono">
            ratio {fmtNumber(ratio, 3)} ·{" "}
            {liveRatio ? "live" : "static fallback"} · basis {basis >= 0 ? "+" : ""}
            {fmtNumber(basis, 2)}
          </span>
        </div>
      </div>

      {loading && <div className="label-mono">fetching live quotes…</div>}

      {/* Conversions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat
          label={`${map.etf} (ETF)`}
          value={valid ? fmtMoney(p) : "—"}
          hint={etfQ ? `live ${fmtMoney(etfQ.spot)} · ${etfQ.source}` : "no live quote"}
        />
        <Stat
          label={`${map.indexLabel} (cash index)`}
          value={indexEquiv != null ? fmtNumber(indexEquiv, 2) : "—"}
          tone="bull"
          hint={idxQ ? `live ${fmtNumber(idxQ.spot, 2)}` : `≈ ${map.etf} × ${ratio.toFixed(2)}`}
        />
        <Stat
          label={`${map.futureLabel} (front future)`}
          value={futureEquiv != null ? fmtNumber(futureEquiv, 2) : "—"}
          tone="bull"
          hint={
            futQ
              ? `live ${fmtNumber(futQ.spot, 2)} · $${map.pointValue}/pt`
              : `index + basis · $${map.pointValue}/pt`
          }
        />
      </div>

      {/* Contract economics */}
      <div className="panel p-5">
        <div className="label-mono mb-3">contract economics ({map.futureLabel})</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="label-mono">point value</div>
            <div className="num text-white mt-1">${map.pointValue}/pt</div>
          </div>
          <div>
            <div className="label-mono">contract notional</div>
            <div className="num text-white mt-1">
              {futureEquiv != null ? `$${fmtCompact(futureEquiv * map.pointValue)}` : "—"}
            </div>
          </div>
          <div>
            <div className="label-mono">micro contract</div>
            <div className="num text-white mt-1">{map.micro ?? "—"}</div>
          </div>
          <div>
            <div className="label-mono">1 ETF pt =</div>
            <div className="num text-white mt-1">{fmtNumber(ratio, 2)} idx pts</div>
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-400">
        Conversions use the live {map.indexLabel}/{map.etf} ratio when both quotes are available,
        else the static multiplier ({map.approxMultiplier}×). The future carries a basis over the
        cash index (cost-of-carry minus dividends), shown above. Index/future quotes come from Yahoo
        via <span className="num">/api/quote</span>; some may be delayed or unavailable intraday.
      </p>
    </div>
  );
}
