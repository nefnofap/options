"use client";

import { useEffect, useState } from "react";
import type { OptionChain } from "@/lib/types";

export interface ChainState {
  chain: OptionChain | null;
  loading: boolean;
  error: string | null;
}

export function useChain(symbol: string): ChainState {
  const [state, setState] = useState<ChainState>({
    chain: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`/api/chain?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `status ${r.status}`);
        }
        return (await r.json()) as OptionChain;
      })
      .then((chain) => {
        if (cancelled) return;
        setState({ chain, loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ chain: null, loading: false, error: e.message ?? "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return state;
}
