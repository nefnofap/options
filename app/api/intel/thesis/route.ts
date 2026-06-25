import { NextResponse } from "next/server";
import { getThesis } from "@/lib/intel/thesis";
import { describeError, httpStatusFor } from "@/lib/errors";
import { requirePremium } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const denied = await requirePremium();
  if (denied) return denied;
  try {
    return NextResponse.json(await getThesis());
  } catch (e) {
    return NextResponse.json(describeError(e), { status: httpStatusFor(e) });
  }
}
