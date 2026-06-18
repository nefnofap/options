// JSON GEX levels endpoint consumed by the Quantower live indicator.
// Auth: ?key=<per-user API key> (no cookies — Quantower can't send them).

import { NextRequest, NextResponse } from "next/server";
import { getChain } from "@/lib/data";
import { strikeAggregates, gammaFlip, maxPain } from "@/lib/analytics";
import { absorptionProfile } from "@/lib/regime";
import { verifyApiKey } from "@/lib/api-key";
import { describeError, httpStatusFor } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STRIKES = 40;

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function medianStep(strikes: number[]): number {
  if (strikes.length < 2) return 1;
  const sorted = [...strikes].sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 1;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "missing key — get yours from the app" }, { status: 401 });

  const userId = verifyApiKey(key);
  if (!userId) return NextResponse.json({ error: "invalid key" }, { status: 403 });

  const symbol = req.nextUrl.searchParams.get("symbol");
  const exp = req.nextUrl.searchParams.get("exp") || undefined;
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });

  try {
    const chain = await getChain(symbol);
    const aggs = strikeAggregates(chain, { expiration: exp });
    const flip = gammaFlip(aggs);
    const pain = maxPain(aggs);
    const { callWall, putWall } = absorptionProfile(aggs, chain.spot);

    const totalGamma = aggs.reduce(
      (a, s) => a + (Number.isFinite(s.netGammaNotional) ? s.netGammaNotional : 0),
      0
    );
    const longGamma = totalGamma >= 0;

    const selected = [...aggs]
      .filter((a) => Number.isFinite(a.netGammaNotional))
      .sort((a, b) => Math.abs(b.netGammaNotional) - Math.abs(a.netGammaNotional))
      .slice(0, MAX_STRIKES)
      .sort((a, b) => a.strike - b.strike);

    const strikes = selected.map((a) => round(a.strike, 2));
    const gex = selected.map((a) => round(a.netGammaNotional, 0));
    const maxAbsGex = gex.reduce((m, g) => Math.max(m, Math.abs(g)), 0);
    const strikeStep = round(medianStep(aggs.map((a) => a.strike)), 4);

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      exp: exp ?? "all",
      spot: round(chain.spot, 2),
      gammaFlip: flip != null && Number.isFinite(flip) ? round(flip, 2) : null,
      callWall: callWall != null && Number.isFinite(callWall) ? round(callWall, 2) : null,
      putWall: putWall != null && Number.isFinite(putWall) ? round(putWall, 2) : null,
      maxPain: pain != null && Number.isFinite(pain) ? round(pain, 2) : null,
      regime: longGamma ? "long" : "short",
      callBias: longGamma ? "REJECT/FADE" : "BREACH=CHASE",
      putBias: longGamma ? "BOUNCE" : "BREAK=FLUSH",
      flipBias: longGamma ? "RECLAIM=STABILIZE / LOSE=EXPAND" : "RECLAIM=REVERSE UP",
      strikeStep,
      maxAbsGex,
      strikes,
      gex,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(describeError(e), { status: httpStatusFor(e) });
  }
}
