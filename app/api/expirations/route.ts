import { NextRequest, NextResponse } from "next/server";
import { getChain } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  const chain = await getChain(symbol);
  if (!chain) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ symbol: chain.underlying, expirations: chain.expirations });
}
