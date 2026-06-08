import Link from "next/link";
import { Suspense } from "react";
import TabNav from "@/components/dashboard/TabNav";
import TickerSearch from "@/components/dashboard/TickerSearch";
import PaywallGate from "@/components/intel/PaywallGate";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ink-950">
      {/* top bar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-ink-950/85 border-b border-white/5">
        <div className="px-6 py-3 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="display-italic text-xl text-white leading-none">A+</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-200">
              Aplus
            </span>
          </Link>
          <span className="h-5 w-px bg-white/10" />
          <Suspense fallback={<span className="label-mono">loading</span>}>
            <TickerSearch />
          </Suspense>
          <span className="flex-1" />
          <Link
            href="/intel/macro"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400 hover:text-ink-100 whitespace-nowrap"
          >
            Intel →
          </Link>
        </div>
        <Suspense fallback={null}>
          <TabNav />
        </Suspense>
      </header>

      <div className="px-6 py-8">
        <PaywallGate title="Aplus Options Dashboard">{children}</PaywallGate>
      </div>
    </main>
  );
}
