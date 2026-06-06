import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/data";
import { describeError, httpStatusFor } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  try {
    return NextResponse.json(await getQuote(symbol));
  } catch (e) {
    return NextResponse.json(describeError(e), { status: httpStatusFor(e) });
  }
}
