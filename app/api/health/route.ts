import { NextRequest, NextResponse } from "next/server";
import { getCboeChain } from "@/lib/cboe";
import { getYahooChart } from "@/lib/yahoo";
import { describeError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/health?symbol=SPY
// Probes each upstream provider independently and reports status + latency,
// so a failing data feed can be diagnosed without guessing.
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "SPY").toUpperCase();

  const cboe = await probe(async () => {
    const chain = await getCboeChain(symbol);
    return {
      spot: chain.spot,
      contracts: chain.contracts.length,
      expirations: chain.expirations.length,
    };
  });

  const yahoo = await probe(async () => {
    const chart = await getYahooChart(symbol, "5d", "1d");
    return { spot: chart.spot, bars: chart.bars.length };
  });

  const ok = cboe.ok || yahoo.ok;
  return NextResponse.json(
    { symbol, ok, checkedAt: new Date().toISOString(), providers: { cboe, yahoo } },
    { status: ok ? 200 : 502 },
  );
}

async function probe<T>(fn: () => Promise<T>) {
  const start = Date.now();
  try {
    const data = await fn();
    return { ok: true as const, ms: Date.now() - start, ...data };
  } catch (e) {
    return { ok: false as const, ms: Date.now() - start, ...describeError(e) };
  }
}
