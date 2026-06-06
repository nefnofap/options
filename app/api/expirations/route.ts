import { NextRequest, NextResponse } from "next/server";
import { getChain } from "@/lib/data";
import { describeError, httpStatusFor } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  try {
    const chain = await getChain(symbol);
    return NextResponse.json({ symbol: chain.underlying, expirations: chain.expirations });
  } catch (e) {
    return NextResponse.json(describeError(e), { status: httpStatusFor(e) });
  }
}
