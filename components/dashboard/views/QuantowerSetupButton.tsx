"use client";

import { useState } from "react";

interface Props {
  symbol: string;
  exp?: string;
}

interface ApiKeyResponse {
  key: string;
  appUrl: string;
}

export default function QuantowerSetupButton({ symbol, exp }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiKeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  async function load() {
    setOpen(true);
    if (data) return; // already loaded
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/api-key");
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, which: "key" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 1500);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 1500);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button type="button" className="pill pill-ghost" onClick={load}>
        Quantower Live
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel w-full max-w-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h3 className="display-italic text-xl text-white">Quantower Live</h3>
                <div className="label-mono mt-1 text-ink-400">
                  Install once — auto-refreshes live GEX from the API
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

            {loading && <div className="label-mono py-8 text-center">loading…</div>}
            {error && !loading && (
              <div className="text-bear text-sm py-4 text-center">{error}</div>
            )}

            {!loading && !error && data && (
              <>
                {/* Step 1 */}
                <div className="space-y-1">
                  <div className="label-mono text-ink-300">1 · Download the indicator</div>
                  <a
                    href="/APlus_GEX_Live.cs"
                    download="APlus_GEX_Live.cs"
                    className="pill pill-primary inline-block text-center"
                  >
                    Download APlus_GEX_Live.cs
                  </a>
                  <p className="text-[11px] text-ink-500 mt-1">
                    Open Quantower → <span className="text-ink-300">Algo → Scripts → New</span>, paste the file, click <span className="text-ink-300">Compile</span>.
                  </p>
                </div>

                <div className="border-t border-white/5" />

                {/* Step 2 — API Key */}
                <div className="space-y-1">
                  <div className="label-mono text-ink-300">2 · Copy your API key</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-ink-900 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-ink-100 truncate select-all">
                      {data.key}
                    </code>
                    <button
                      type="button"
                      className="pill pill-ghost shrink-0"
                      onClick={() => copy(data.key, "key")}
                    >
                      {copiedKey ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-500">
                    Paste into the <span className="text-ink-300">API Key</span> input in the indicator settings.
                  </p>
                </div>

                <div className="border-t border-white/5" />

                {/* Step 3 — App URL */}
                <div className="space-y-1">
                  <div className="label-mono text-ink-300">3 · Set App URL</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-ink-900 border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-ink-100 truncate select-all">
                      {data.appUrl}
                    </code>
                    <button
                      type="button"
                      className="pill pill-ghost shrink-0"
                      onClick={() => copy(data.appUrl, "url")}
                    >
                      {copiedUrl ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-500">
                    Paste into the <span className="text-ink-300">App URL</span> input in the indicator settings.
                  </p>
                </div>

                <div className="border-t border-white/5" />

                {/* Step 4 — Symbol */}
                <div className="space-y-1">
                  <div className="label-mono text-ink-300">4 · Set symbol in the indicator</div>
                  <p className="text-[11px] text-ink-500">
                    Set <span className="text-ink-300">Symbol</span> to{" "}
                    <span className="text-ink-100 font-mono">{symbol.toUpperCase()}</span>
                    {exp && (
                      <>
                        {" "}and <span className="text-ink-300">Expiration</span> to{" "}
                        <span className="text-ink-100 font-mono">{exp}</span>
                      </>
                    )}
                    . Apply to your {symbol.toUpperCase()} chart.
                  </p>
                </div>

                <div className="bg-ink-900/60 rounded-lg p-3">
                  <p className="text-[11px] text-ink-500 leading-relaxed">
                    The indicator fetches fresh GEX from the API and auto-refreshes every 15 min
                    (configurable). Your key is tied to your Discord account — keep it private.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
