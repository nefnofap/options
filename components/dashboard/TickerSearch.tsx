"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const POPULAR = ["SPX", "SPY", "QQQ", "AAPL", "NVDA", "TSLA", "META", "AMZN"];

export default function TickerSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get("symbol") || "SPY";
  const [val, setVal] = useState(current);

  useEffect(() => setVal(current), [current]);

  function commit(symbol: string) {
    const next = symbol.trim().toUpperCase();
    if (!next) return;
    const params = new URLSearchParams(sp.toString());
    params.set("symbol", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit(val);
        }}
        className="flex items-center gap-2"
      >
        <span className="label-mono">SYMBOL</span>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value.toUpperCase())}
          className="bg-transparent border-b border-white/15 focus:border-white/60 outline-none px-1 py-1 w-28 font-mono text-sm tracking-widest text-white uppercase"
          maxLength={8}
          spellCheck={false}
        />
        <button type="submit" className="pill pill-ghost text-[11px]">
          GO
        </button>
      </form>

      <div className="flex items-center gap-1.5">
        {POPULAR.map((p) => (
          <button
            key={p}
            onClick={() => commit(p)}
            className={`px-2 py-1 rounded font-mono text-[11px] tracking-wider transition-colors ${
              p === current
                ? "text-white bg-white/10"
                : "text-ink-300 hover:text-white hover:bg-white/5"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
