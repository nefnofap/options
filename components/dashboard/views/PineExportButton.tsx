"use client";

import { useState } from "react";

interface Props {
  symbol: string;
  exp?: string;
}

type Platform = "tradingview" | "quantower";

const PLATFORM_META: Record<
  Platform,
  { label: string; api: string; ext: string; instructions: React.ReactNode }
> = {
  tradingview: {
    label: "TradingView",
    api: "/api/pine",
    ext: "pine",
    instructions: (
      <>
        Paste into TradingView → <span className="text-ink-300">Pine Editor</span> →{" "}
        <span className="text-ink-300">Add to chart</span>. Levels are a snapshot at copy
        time — re-export for fresh GEX. Auto-scales to the index, its ETF, and the e-mini
        future.
      </>
    ),
  },
  quantower: {
    label: "Quantower",
    api: "/api/quantower",
    ext: "cs",
    instructions: (
      <>
        Open Quantower → <span className="text-ink-300">Algo → Scripts</span> → create a
        new script, paste, then click <span className="text-ink-300">Compile</span>. Apply
        the indicator to a chart of the same instrument you exported from. Re-export for
        fresh GEX.
      </>
    ),
  },
};

export default function PineExportButton({ symbol, exp }: Props) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load(p: Platform) {
    setPlatform(p);
    setLoading(true);
    setError(null);
    setScript("");
    setCopied(false);
    try {
      const qs = new URLSearchParams({ symbol });
      if (exp) qs.set("exp", exp);
      const res = await fetch(`${PLATFORM_META[p].api}?${qs.toString()}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setScript(await res.text());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard blocked — select the text and copy manually.");
    }
  }

  function close() {
    setPlatform(null);
    setScript("");
    setError(null);
  }

  const meta = platform ? PLATFORM_META[platform] : null;

  return (
    <>
      <button type="button" className="pill pill-ghost" onClick={() => load("tradingview")}>
        Export to TradingView
      </button>
      <button type="button" className="pill pill-ghost" onClick={() => load("quantower")}>
        Export to Quantower
      </button>

      {platform && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={close}
        >
          <div
            className="panel w-full max-w-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <div>
                <h3 className="display-italic text-xl text-white">
                  {meta!.label} indicator
                </h3>
                <div className="label-mono mt-1">
                  {symbol.toUpperCase()} · {exp ? `exp ${exp}` : "all expirations"}
                </div>
              </div>
              <button
                type="button"
                className="label-mono text-ink-400 hover:text-white"
                onClick={close}
              >
                close ✕
              </button>
            </div>

            {loading && <div className="label-mono py-12 text-center">generating…</div>}
            {error && !loading && (
              <div className="text-bear text-sm py-6 text-center">{error}</div>
            )}

            {!loading && !error && script && (
              <>
                <textarea
                  readOnly
                  value={script}
                  spellCheck={false}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full h-72 bg-ink-900 border border-white/10 rounded-lg p-3 text-[11px] leading-snug text-ink-100 font-mono outline-none focus:border-white/30 resize-none"
                />
                <div className="flex items-center justify-between gap-4 mt-3">
                  <p className="text-[11px] text-ink-500 leading-relaxed max-w-md">
                    {meta!.instructions}
                  </p>
                  <button
                    type="button"
                    className="pill pill-primary shrink-0"
                    onClick={copy}
                  >
                    {copied ? "Copied ✓" : "Copy script"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
