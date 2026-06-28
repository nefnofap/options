import { NextResponse } from "next/server";
import { getGoldBriefing } from "@/lib/intel/gold";
import { describeError, httpStatusFor } from "@/lib/errors";
import { requirePremium } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/intel/gold                  → auto (weekly on weekends, daily on weekdays)
// GET /api/intel/gold?period=weekly     → force the weekly thesis
// GET /api/intel/gold?period=daily      → force the daily brief
// GET /api/intel/gold?format=md         → website-ready markdown as text/markdown
export async function GET(req: Request) {
  const denied = await requirePremium();
  if (denied) return denied;
  try {
    const params = new URL(req.url).searchParams;
    const period = params.get("period");
    const mode = period === "weekly" || period === "daily" ? period : undefined;
    const briefing = await getGoldBriefing(mode ? { mode } : undefined);
    const format = params.get("format");
    if (format === "md" || format === "markdown") {
      return new NextResponse(briefing.markdown, {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }
    return NextResponse.json(briefing);
  } catch (e) {
    return NextResponse.json(describeError(e), { status: httpStatusFor(e) });
  }
}
