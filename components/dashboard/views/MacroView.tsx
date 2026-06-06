"use client";

import { useEffect, useState } from "react";
import type { QuoteSnapshot } from "@/lib/types";
import { fmtMoney, fmtPct, fmtSigned, colorForPnl } from "@/lib/format";

const MACRO_TICKERS: { symbol: string; label: string; group: string }[] = [
  { symbol: "SPX", label: "S&P 500", group: "Equity" },
  { symbol: "NDX", label: "Nasdaq 100", group: "Equity" },
  { symbol: "RUT", label: "Russell 2000", group: "Equity" },
  { symbol: "VIX", label: "VIX", group: "Vol" },
  { symbol: "DXY", label: "Dollar Index", group: "FX" },
  { symbol: "TLT", label: "20Y Treasuries", group: "Rates" },
  { symbol: "HYG", label: "High Yield", group: "Credit" },
  { symbol: "GLD", label: "Gold", group: "Commodity" },
  { symbol: "USO", label: "Oil", group: "Commodity" },
  { symbol: "BTC-USD", label: "Bitcoin", group: "Crypto" },
];

interface Row {
  cfg: (typeof MACRO_TICKERS)[number];
  q: QuoteSnapshot | null;
  err?: string;
}

export default function MacroView() {
  const [rows, setRows] = useState<Row[]>(MACRO_TICKERS.map((cfg) => ({ cfg, q: null })));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const out = await Promise.all(
        MACRO_TICKERS.map(async (cfg) => {
          try {
            const r = await fetch(`/api/quote?symbol=${encodeURIComponent(cfg.symbol)}`);
            if (!r.ok) throw new Error(`${r.status}`);
            return { cfg, q: (await r.json()) as QuoteSnapshot };
          } catch (e: any) {
            return { cfg, q: null, err: e.message };
          }
        }),
      );
      if (!cancelled) {
        setRows(out);
        setLoading(false);
      }
    }
    loadAll();
    const id = setInterval(loadAll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const groups = Array.from(new Set(MACRO_TICKERS.map((m) => m.group)));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="display-italic text-4xl text-white">Macro snapshot</h2>
        <span className="label-mono">{loading ? "loading" : "live"}</span>
      </div>
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g} className="panel p-5">
            <h3 className="label-mono mb-3">{g}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {rows
                .filter((r) => r.cfg.group === g)
                .map((r) => (
                  <div key={r.cfg.symbol} className="border border-white/5 rounded-md p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-xs tracking-wider text-white">
                        {r.cfg.symbol}
                      </span>
                      <span className="text-[10px] text-ink-400">{r.cfg.label}</span>
                    </div>
                    <div className="num text-lg mt-1 text-white">
                      {r.q ? fmtMoney(r.q.spot) : "—"}
                    </div>
                    <div className={`num text-xs ${colorForPnl(r.q?.change)}`}>
                      {r.q ? `${fmtSigned(r.q.change)} (${fmtPct(r.q.changePct)})` : ""}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
