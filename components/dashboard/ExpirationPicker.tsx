"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; list: string[] };

const NEAR_DTE = 7; // pills for 0–7 DTE; everything beyond goes in the dropdown

function dte(exp: string): number {
  const [y, m, d] = exp.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function label(exp: string): string {
  const [y, m, d] = exp.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}

export default function ExpirationPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || "";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/expirations?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `status ${r.status}`);
        return (j.expirations as string[]) || [];
      })
      .then((exps) => {
        if (cancelled) return;
        setState({ kind: "ready", list: exps });
        if (!exp && exps.length > 0) {
          const params = new URLSearchParams(sp.toString());
          params.set("exp", exps[0]);
          router.replace(`${pathname}?${params.toString()}`);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ kind: "error", message: e.message ?? "failed to load expirations" });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  function select(e: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("exp", e);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (state.kind === "loading")
    return <span className="label-mono">EXP — loading…</span>;
  if (state.kind === "error")
    return <span className="label-mono text-bear">EXP — {state.message}</span>;
  if (state.list.length === 0)
    return <span className="label-mono">EXP — none listed</span>;

  const near = state.list.filter((e) => dte(e) <= NEAR_DTE);
  const far = state.list.filter((e) => dte(e) > NEAR_DTE);
  const farSelected = far.includes(exp);

  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      <span className="label-mono shrink-0">EXP</span>

      {near.map((e) => {
        const active = e === exp;
        const days = dte(e);
        const tag = days <= 0 ? "0DTE" : `${days}d`;
        return (
          <button
            key={e}
            onClick={() => select(e)}
            title={`${e} · ${days <= 0 ? "expires today" : `${days} days to expiry`}`}
            className={[
              "shrink-0 rounded-md px-2.5 py-1.5 border font-mono text-xs tracking-wider transition-colors",
              active
                ? "bg-white text-ink-950 border-transparent"
                : "bg-ink-850 text-ink-200 border-white/10 hover:border-white/30 hover:text-white",
            ].join(" ")}
          >
            <span>{label(e)}</span>
            <span className={`ml-1.5 text-[10px] ${active ? "text-ink-500" : "text-ink-400"}`}>
              {tag}
            </span>
          </button>
        );
      })}

      {far.length > 0 && (
        <select
          value={farSelected ? exp : ""}
          onChange={(ev) => ev.target.value && select(ev.target.value)}
          title="Later expirations"
          className={[
            "shrink-0 rounded-md px-2.5 py-1.5 border font-mono text-xs tracking-wider transition-colors cursor-pointer outline-none",
            farSelected
              ? "bg-white text-ink-950 border-transparent"
              : "bg-ink-850 text-ink-200 border-white/10 hover:border-white/30 hover:text-white",
          ].join(" ")}
        >
          <option value="" disabled>
            {farSelected ? `${label(exp)} · ${dte(exp)}d` : `+${far.length} more…`}
          </option>
          {far.map((e) => (
            <option key={e} value={e} className="bg-ink-900 text-ink-100">
              {label(e)} · {dte(e)}d
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
