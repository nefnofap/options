"use client";

import { useEffect, useState } from "react";
import type { OptionChain } from "@/lib/types";

export interface ChainState {
  chain: OptionChain | null;
  loading: boolean;      // true only on first load / symbol change
  refreshing: boolean;   // true during a background poll
  error: string | null;
  updatedAt: number | null;
}

const DEFAULT_REFRESH_MS = 30_000;

export function useChain(
  symbol: string,
  refreshMs: number = DEFAULT_REFRESH_MS,
): ChainState {
  const [state, setState] = useState<ChainState>({
    chain: null,
    loading: true,
    refreshing: false,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load(initial: boolean) {
      setState((s) =>
        initial
          ? { ...s, loading: true, error: null }
          : { ...s, refreshing: true },
      );
      try {
        const r = await fetch(`/api/chain?symbol=${encodeURIComponent(symbol)}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `status ${r.status}`);
        }
        const chain = (await r.json()) as OptionChain;
        if (cancelled) return;
        setState({
          chain,
          loading: false,
          refreshing: false,
          error: null,
          updatedAt: Date.now(),
        });
      } catch (e) {
        if (cancelled) return;
        // On a background refresh failure, keep the last good chain so the
        // view doesn't blank out — just surface the error + stop spinners.
        setState((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: (e as Error).message ?? "error",
          chain: initial ? null : s.chain,
        }));
      }
    }

    load(true);
    const id = refreshMs > 0 ? setInterval(() => load(false), refreshMs) : undefined;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [symbol, refreshMs]);

  return state;
}
