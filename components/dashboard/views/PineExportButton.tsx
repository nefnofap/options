"use client";

import { useState } from "react";

interface Props {
  symbol: string;
  exp?: string;
}

/**
 * Fetches the app-generated Pine v5 script for the current symbol/expiration and
 * shows it in a copy box. Pine can't pull live data, so this bakes the current
 * GEX levels into a script the user pastes into TradingView's Pine Editor.
 */
export default function PineExportButton({ symbol, exp }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const qs = new URLSearchParams({ symbol });
      if (exp) qs.set("exp", exp);
      const res = await fetch(`/api/pine?${qs.toString()}`);
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

  return (
    <>
      <button type="button" className="pill pill-ghost" onClick={load}>
        Export to TradingView
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel w-full max-w-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <div>
                <h3 className="display-italic text-xl text-white">Pine indicator</h3>
                <div className="label-mono mt-1">
                  {symbol.toUpperCase()} · {exp ? `exp ${exp}` : "all expirations"}
                </div>
              </div>
              <button
                type="button"
                className="label-mono text-ink-400 hover:text-white"
                onClick={() => setOpen(false)}
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
                    Paste into TradingView → <span className="text-ink-300">Pine Editor</span> →
                    <span className="text-ink-300"> Add to chart</span>. Levels are a snapshot at
                    copy time — re-export for fresh GEX. Auto-scales to the index, its ETF, and the
                    e-mini future.
                  </p>
                  <button type="button" className="pill pill-primary shrink-0" onClick={copy}>
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
