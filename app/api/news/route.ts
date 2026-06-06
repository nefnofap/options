import { NextRequest, NextResponse } from "next/server";
import { getNews } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  const data = await getNews(symbol);
  return NextResponse.json({ items: data });
}
