import { NextRequest, NextResponse } from "next/server";
import { getChart } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RANGES = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y"]);
const INTERVALS = new Set(["1m", "5m", "15m", "1h", "1d", "1wk"]);

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const range = req.nextUrl.searchParams.get("range") || "3mo";
  const interval = req.nextUrl.searchParams.get("interval") || "1d";
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  if (!RANGES.has(range) || !INTERVALS.has(interval))
    return NextResponse.json({ error: "invalid range/interval" }, { status: 400 });
  const data = await getChart(symbol, range as any, interval as any);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
