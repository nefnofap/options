"use client";

import { useSearchParams } from "next/navigation";
import { useChain } from "../useChain";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import ExpirationPicker from "../ExpirationPicker";
import { fmtCompact, fmtMoney, fmtNumber, fmtPct } from "@/lib/format";

export default function ChainView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const exp = sp.get("exp");
  const { chain, loading, error } = useChain(symbol);

  const filtered =
    chain && exp ? chain.contracts.filter((c) => c.expiration === exp) : chain?.contracts ?? [];

  // group by strike with C and P side-by-side
  const byStrike = new Map<number, { C?: any; P?: any }>();
  for (const c of filtered) {
    const e = byStrike.get(c.strike) || {};
    e[c.side] = c;
    byStrike.set(c.strike, e);
  }
  const rows = Array.from(byStrike.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <ExpirationPicker />

      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Option chain</h3>
          <span className="label-mono">
            {chain ? `${rows.length} strikes` : ""}{exp ? ` · ${exp}` : ""}
          </span>
        </div>

        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {error && <EmptyState title="Couldn't load chain" body={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState title="No contracts" body="Try a different symbol." />
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="label-mono">
                <tr className="border-b border-white/5">
                  <th className="py-2 px-2 text-right" colSpan={5}>CALLS</th>
                  <th className="py-2 px-2 text-center bg-white/5">STRIKE</th>
                  <th className="py-2 px-2 text-left" colSpan={5}>PUTS</th>
                </tr>
                <tr className="text-ink-300 border-b border-white/5">
                  <th className="py-1 px-2 text-right">OI</th>
                  <th className="py-1 px-2 text-right">VOL</th>
                  <th className="py-1 px-2 text-right">IV</th>
                  <th className="py-1 px-2 text-right">DELTA</th>
                  <th className="py-1 px-2 text-right">MID</th>
                  <th className="py-1 px-2 text-center bg-white/5"></th>
                  <th className="py-1 px-2 text-left">MID</th>
                  <th className="py-1 px-2 text-left">DELTA</th>
                  <th className="py-1 px-2 text-left">IV</th>
                  <th className="py-1 px-2 text-left">VOL</th>
                  <th className="py-1 px-2 text-left">OI</th>
                </tr>
              </thead>
              <tbody className="num">
                {rows.map(([strike, sides]) => {
                  const c = sides.C;
                  const p = sides.P;
                  const itmCall = chain && strike < chain.spot;
                  const itmPut = chain && strike > chain.spot;
                  return (
                    <tr key={strike} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className={`py-1 px-2 text-right ${itmCall ? "text-white" : "text-ink-300"}`}>
                        {c ? fmtCompact(c.openInterest, 0) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-right ${itmCall ? "text-white" : "text-ink-300"}`}>
                        {c ? fmtCompact(c.volume, 0) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-right ${itmCall ? "text-white" : "text-ink-300"}`}>
                        {c ? fmtPct(c.iv * 100, 1) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-right ${itmCall ? "text-white" : "text-ink-300"}`}>
                        {c ? fmtNumber(c.delta, 2) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-right ${itmCall ? "text-white" : "text-ink-300"}`}>
                        {c ? fmtMoney((c.bid + c.ask) / 2 || c.last) : "—"}
                      </td>
                      <td className="py-1 px-2 text-center bg-white/5 font-mono text-white">
                        {fmtNumber(strike, 2)}
                      </td>
                      <td className={`py-1 px-2 text-left ${itmPut ? "text-white" : "text-ink-300"}`}>
                        {p ? fmtMoney((p.bid + p.ask) / 2 || p.last) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-left ${itmPut ? "text-white" : "text-ink-300"}`}>
                        {p ? fmtNumber(p.delta, 2) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-left ${itmPut ? "text-white" : "text-ink-300"}`}>
                        {p ? fmtPct(p.iv * 100, 1) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-left ${itmPut ? "text-white" : "text-ink-300"}`}>
                        {p ? fmtCompact(p.volume, 0) : "—"}
                      </td>
                      <td className={`py-1 px-2 text-left ${itmPut ? "text-white" : "text-ink-300"}`}>
                        {p ? fmtCompact(p.openInterest, 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
