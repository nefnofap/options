"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function ExpirationPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp") || "";
  const [list, setList] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/expirations?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { expirations: [] }))
      .then((j) => {
        if (cancelled) return;
        const exps: string[] = j.expirations || [];
        setList(exps);
        if (!exp && exps.length > 0) {
          const params = new URLSearchParams(sp.toString());
          params.set("exp", exps[0]);
          router.replace(`${pathname}?${params.toString()}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(e: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("exp", e);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (list.length === 0)
    return <span className="label-mono">EXP — loading</span>;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="label-mono">EXP</span>
      <select
        value={exp}
        onChange={(e) => set(e.target.value)}
        className="bg-ink-850 border border-white/10 rounded-md font-mono text-xs tracking-wider px-2 py-1.5 text-white outline-none focus:border-white/30"
      >
        {list.map((e) => (
          <option key={e} value={e} className="bg-ink-850">
            {e}
          </option>
        ))}
      </select>
    </div>
  );
}
