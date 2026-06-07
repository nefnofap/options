"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS: { slug: string; label: string }[] = [
  { slug: "gex", label: "GEX" },
  { slug: "dex", label: "DEX" },
  { slug: "flow", label: "Flow" },
  { slug: "vex", label: "VEX" },
  { slug: "vega", label: "Vega" },
  { slug: "charm", label: "Charm" },
  { slug: "chain", label: "Chain" },
  { slug: "volatility", label: "Volatility" },
  { slug: "heatmap", label: "Heatmap" },
  { slug: "ladder", label: "Ladder" },
  { slug: "oi", label: "OI" },
  { slug: "contracts", label: "Contracts" },
  { slug: "chart", label: "Chart" },
  { slug: "macro", label: "Macro" },
  { slug: "news", label: "News" },
  { slug: "convert", label: "Convert" },
];

export default function TabNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp");

  return (
    <div className="border-b border-white/5 overflow-x-auto">
      <nav className="flex items-center gap-0 min-w-max px-6">
        {TABS.map((t) => {
          const href = `/dashboard/${t.slug}?symbol=${symbol}${exp ? `&exp=${exp}` : ""}`;
          const active = pathname === `/dashboard/${t.slug}`;
          return (
            <Link
              key={t.slug}
              href={href}
              className={`relative px-4 py-3.5 text-[12px] tracking-[0.16em] uppercase font-mono transition-colors ${
                active ? "text-white" : "text-ink-400 hover:text-ink-100"
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute left-3 right-3 -bottom-px h-px bg-white" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
