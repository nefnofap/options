import { NextResponse } from "next/server";
import { getGoldBriefing } from "@/lib/intel/gold";
import { describeError, httpStatusFor } from "@/lib/errors";
import { requirePremium } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/intel/gold            → full JSON briefing (incl. a `markdown` field)
// GET /api/intel/gold?format=md  → website-ready markdown as text/markdown
export async function GET(req: Request) {
  const denied = await requirePremium();
  if (denied) return denied;
  try {
    const briefing = await getGoldBriefing();
    const format = new URL(req.url).searchParams.get("format");
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
