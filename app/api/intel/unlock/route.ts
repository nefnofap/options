// Premium unlock check. Users who "contacted the owner to purchase" receive an
// access code; this validates it server-side against INTEL_ACCESS_CODE so the
// secret never ships to the browser. On success the client stores an unlock
// flag in localStorage (see components/intel/PaywallGate.tsx).

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/intel/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expected = env.accessCode();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Premium access is not configured yet. Contact the owner." },
      { status: 503 },
    );
  }
  let code = "";
  try {
    const body = (await req.json()) as { code?: string };
    code = (body.code ?? "").trim();
  } catch {
    /* fall through to invalid */
  }
  if (code && code === expected) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Invalid access code." }, { status: 401 });
}
