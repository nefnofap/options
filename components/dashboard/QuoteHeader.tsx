"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { QuoteSnapshot } from "@/lib/types";
import { fmtMoney, fmtPct, fmtSigned, colorForPnl } from "@/lib/format";

export default function QuoteHeader() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const [q, setQ] = useState<QuoteSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as QuoteSnapshot;
        if (!cancelled) setQ(data);
      } catch (e: any) {
        if (!cancelled) setErr(e.message ?? "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  return (
    <div className="flex items-baseline gap-5 flex-wrap">
      <div className="display-italic text-5xl text-white leading-none">{symbol}</div>
      <div className="flex items-baseline gap-3 num">
        <span className="text-2xl text-white">
          {q ? fmtMoney(q.spot) : loading ? "…" : "—"}
        </span>
        <span className={`text-sm ${colorForPnl(q?.change)}`}>
          {q ? `${fmtSigned(q.change)} (${fmtPct(q.changePct)})` : ""}
        </span>
      </div>
      <div className="ml-auto label-mono">
        {q ? `via ${q.source}` : err ? `error: ${err}` : "loading"}
      </div>
    </div>
  );
}
