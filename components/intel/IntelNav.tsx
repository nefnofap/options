"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const TABS: { slug: string; label: string; locked?: boolean }[] = [
  { slug: "macro", label: "Macro" },
  { slug: "sentiment", label: "News Bias" },
  { slug: "brief", label: "Pre-Market Brief", locked: true },
  { slug: "instruments", label: "Instruments", locked: true },
  { slug: "matrix", label: "Impact Matrix", locked: true },
];

export default function IntelNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isPremium = session?.user?.tier === "premium";
  return (
    <div className="border-b border-white/5 overflow-x-auto">
      <nav className="flex items-center gap-0 min-w-max px-6">
        {TABS.map((t) => {
          const href = `/intel/${t.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={t.slug}
              href={href}
              className={`relative px-4 py-3.5 text-[12px] tracking-[0.16em] uppercase font-mono transition-colors ${
                active ? "text-white" : "text-ink-400 hover:text-ink-100"
              }`}
            >
              {t.label}
              {t.locked && !isPremium && <span className="ml-1.5 text-[9px] align-top">🔒</span>}
              {active && <span className="absolute left-3 right-3 -bottom-px h-px bg-white" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
