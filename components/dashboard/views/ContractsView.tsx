"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import { fmtCompact, fmtMoney, fmtNumber, fmtPct } from "@/lib/format";

export default function ContractsView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp");
  const { chain, loading, error } = useChain(symbol);

  const filtered =
    chain && exp ? chain.contracts.filter((c) => c.expiration === exp) : chain?.contracts ?? [];
  const sorted = [...filtered].sort((a, b) => {
    if (a.strike !== b.strike) return a.strike - b.strike;
    return a.side.localeCompare(b.side);
  });

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <ExpirationPicker />
      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Contracts</h3>
          <span className="label-mono">{sorted.length} contracts</span>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && sorted.length === 0 && (
          <EmptyState title="No contracts" />
        )}
        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs num">
              <thead className="label-mono">
                <tr className="border-b border-white/5">
                  <th className="py-2 px-2 text-left">SYMBOL</th>
                  <th className="py-2 px-2 text-left">SIDE</th>
                  <th className="py-2 px-2 text-right">STRIKE</th>
                  <th className="py-2 px-2 text-right">BID</th>
                  <th className="py-2 px-2 text-right">ASK</th>
                  <th className="py-2 px-2 text-right">LAST</th>
                  <th className="py-2 px-2 text-right">IV</th>
                  <th className="py-2 px-2 text-right">DELTA</th>
                  <th className="py-2 px-2 text-right">GAMMA</th>
                  <th className="py-2 px-2 text-right">VEGA</th>
                  <th className="py-2 px-2 text-right">THETA</th>
                  <th className="py-2 px-2 text-right">VOL</th>
                  <th className="py-2 px-2 text-right">OI</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.symbol} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-1 px-2 font-mono text-ink-200 text-[10px]">{c.symbol}</td>
                    <td className={`py-1 px-2 ${c.side === "C" ? "text-bull" : "text-bear"}`}>
                      {c.side}
                    </td>
                    <td className="py-1 px-2 text-right text-white">{fmtNumber(c.strike, 2)}</td>
                    <td className="py-1 px-2 text-right">{fmtMoney(c.bid)}</td>
                    <td className="py-1 px-2 text-right">{fmtMoney(c.ask)}</td>
                    <td className="py-1 px-2 text-right">{fmtMoney(c.last)}</td>
                    <td className="py-1 px-2 text-right">{fmtPct(c.iv * 100, 1)}</td>
                    <td className="py-1 px-2 text-right">{fmtNumber(c.delta, 3)}</td>
                    <td className="py-1 px-2 text-right">{fmtNumber(c.gamma, 4)}</td>
                    <td className="py-1 px-2 text-right">{fmtNumber(c.vega, 3)}</td>
                    <td className="py-1 px-2 text-right">{fmtNumber(c.theta, 3)}</td>
                    <td className="py-1 px-2 text-right">{fmtCompact(c.volume, 0)}</td>
                    <td className="py-1 px-2 text-right text-ink-300">{fmtCompact(c.openInterest, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
