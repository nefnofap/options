"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import { topFlow } from "@/lib/analytics";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import { fmtCompact, fmtMoney, fmtNumber } from "@/lib/format";

export default function FlowView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const { chain, loading, error } = useChain(symbol);

  const rows = chain ? topFlow(chain, 60) : [];

  const callPremium = rows
    .filter((r) => r.bias === "C")
    .reduce((s, r) => s + r.premium, 0);
  const putPremium = rows
    .filter((r) => r.bias === "P")
    .reduce((s, r) => s + r.premium, 0);
  const totalPremium = callPremium + putPremium;

  return (
    <div className="space-y-6">
      <QuoteHeader />

      <div className="grid grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="label-mono">CALL $ TRADED</div>
          <div className="num text-2xl text-bull mt-2">${fmtCompact(callPremium)}</div>
        </div>
        <div className="panel p-4">
          <div className="label-mono">PUT $ TRADED</div>
          <div className="num text-2xl text-bear mt-2">${fmtCompact(putPremium)}</div>
        </div>
        <div className="panel p-4">
          <div className="label-mono">CALL/PUT RATIO</div>
          <div className="num text-2xl mt-2 text-white">
            {putPremium > 0 ? fmtNumber(callPremium / putPremium, 2) : "—"}
          </div>
        </div>
      </div>

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Top order flow</h3>
          <span className="label-mono">
            {rows.length} prints · ${fmtCompact(totalPremium)} total
          </span>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState title="No flow yet" body="No volume reported on this chain." />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left label-mono border-b border-white/5">
                  <th className="py-2 pr-3">SIDE</th>
                  <th className="py-2 pr-3">EXP</th>
                  <th className="py-2 pr-3">STRIKE</th>
                  <th className="py-2 pr-3 text-right">VOL</th>
                  <th className="py-2 pr-3 text-right">OI</th>
                  <th className="py-2 pr-3 text-right">VOL/OI</th>
                  <th className="py-2 pr-3 text-right">MID</th>
                  <th className="py-2 pl-3 text-right">PREMIUM</th>
                </tr>
              </thead>
              <tbody className="num">
                {rows.map((r) => (
                  <tr key={r.contract.symbol} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className={`py-1.5 pr-3 font-mono ${r.bias === "C" ? "text-bull" : "text-bear"}`}>
                      {r.bias}
                    </td>
                    <td className="py-1.5 pr-3 text-ink-300">{r.contract.expiration}</td>
                    <td className="py-1.5 pr-3">{fmtNumber(r.contract.strike, 2)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtCompact(r.contract.volume, 0)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-300">{fmtCompact(r.contract.openInterest, 0)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNumber(r.volOI, 2)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtMoney((r.contract.bid + r.contract.ask) / 2 || r.contract.last)}</td>
                    <td className="py-1.5 pl-3 text-right text-white">${fmtCompact(r.premium)}</td>
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
