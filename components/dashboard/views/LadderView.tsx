"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import { expirationAggregates } from "@/lib/analytics";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import { fmtCompact, fmtNumber } from "@/lib/format";

export default function LadderView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const { chain, loading, error } = useChain(symbol);
  const rows = chain ? expirationAggregates(chain) : [];

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Expiration ladder</h3>
          <span className="label-mono">{rows.length} expirations</span>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState title="No expirations" />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left label-mono border-b border-white/5">
                  <th className="py-2 pr-3">EXPIRATION</th>
                  <th className="py-2 pr-3 text-right">DTE</th>
                  <th className="py-2 pr-3 text-right">CALL OI</th>
                  <th className="py-2 pr-3 text-right">PUT OI</th>
                  <th className="py-2 pr-3 text-right">P/C OI</th>
                  <th className="py-2 pr-3 text-right">CALL VOL</th>
                  <th className="py-2 pr-3 text-right">PUT VOL</th>
                  <th className="py-2 pr-3 text-right">NET DELTA</th>
                  <th className="py-2 pl-3 text-right">NET GAMMA</th>
                </tr>
              </thead>
              <tbody className="num">
                {rows.map((r) => (
                  <tr key={r.expiration} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-1.5 pr-3 text-white">{r.expiration}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-300">{r.dte}</td>
                    <td className="py-1.5 pr-3 text-right text-bull">{fmtCompact(r.callOI, 0)}</td>
                    <td className="py-1.5 pr-3 text-right text-bear">{fmtCompact(r.putOI, 0)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNumber(r.putCallRatio, 2)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-200">{fmtCompact(r.callVol, 0)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-200">{fmtCompact(r.putVol, 0)}</td>
                    <td className={`py-1.5 pr-3 text-right ${r.netDelta >= 0 ? "text-bull" : "text-bear"}`}>
                      {fmtCompact(r.netDelta)}
                    </td>
                    <td className={`py-1.5 pl-3 text-right ${r.netGamma >= 0 ? "text-bull" : "text-bear"}`}>
                      {fmtCompact(r.netGamma)}
                    </td>
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
