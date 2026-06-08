// Premium unlock check. Users who "contacted the owner to purchase" receive an
// access code; this validates it server-side against INTEL_ACCESS_CODE (a 7-day
// trial code) or INTEL_ACCESS_CODE_PERMANENT (never expires) so the secret never
// ships to the browser. On success the client stores an unlock flag plus the
// returned expiry in localStorage (see components/intel/PaywallGate.tsx).

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/intel/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const trial = env.accessCode();
  const permanent = env.accessCodePermanent();
  if (!trial && !permanent) {
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
  if (code && permanent && code === permanent) {
    // Permanent code: no expiry.
    return NextResponse.json({ ok: true, expiresAt: null });
  }
  if (code && trial && code === trial) {
    // Trial code: unlock expires 7 days from now.
    return NextResponse.json({ ok: true, expiresAt: Date.now() + SEVEN_DAYS_MS });
  }
  return NextResponse.json({ ok: false, error: "Invalid access code." }, { status: 401 });
}
