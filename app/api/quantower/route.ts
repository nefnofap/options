import { NextRequest, NextResponse } from "next/server";
import { getChain } from "@/lib/data";
import { strikeAggregates, gammaFlip, maxPain } from "@/lib/analytics";
import { absorptionProfile } from "@/lib/regime";
import { generateQuantowerScript } from "@/lib/quantower";
import { describeError, httpStatusFor } from "@/lib/errors";
import { requirePremium } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = await requirePremium();
  if (denied) return denied;

  const symbol = req.nextUrl.searchParams.get("symbol");
  const exp = req.nextUrl.searchParams.get("exp") || undefined;
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });

  try {
    const chain = await getChain(symbol);
    const aggs = strikeAggregates(chain, { expiration: exp });
    const flip = gammaFlip(aggs);
    const pain = maxPain(aggs);
    const { callWall, putWall } = absorptionProfile(aggs, chain.spot);

    const script = generateQuantowerScript({
      symbol,
      exp,
      spot: chain.spot,
      aggs,
      flip,
      pain,
      callWall,
      putWall,
      generatedAt: new Date().toISOString(),
    });

    return new NextResponse(script, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json(describeError(e), { status: httpStatusFor(e) });
  }
}
