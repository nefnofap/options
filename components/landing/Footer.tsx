import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-16 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-12">
        <div>
          <div className="display-italic text-7xl md:text-9xl text-white leading-none">
            Aplus
          </div>
          <p className="mt-4 text-ink-400 text-sm max-w-sm">
            Minimal options analytics. Built for clarity. Delayed quotes via CBOE
            and Yahoo. Not investment advice.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
          <Link href="/dashboard/gex" className="nav-link">GEX</Link>
          <Link href="/dashboard/flow" className="nav-link">Flow</Link>
          <Link href="/dashboard/volatility" className="nav-link">Volatility</Link>
          <Link href="/dashboard/chain" className="nav-link">Chain</Link>
          <Link href="/dashboard/heatmap" className="nav-link">Heatmap</Link>
          <Link href="/dashboard/news" className="nav-link">News</Link>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-12 flex items-center justify-between text-xs font-mono tracking-wider text-ink-400">
        <span>© {new Date().getFullYear()} APLUS</span>
        <span>v0.1 · BUILT WITH NEXT.JS</span>
      </div>
    </footer>
  );
}
