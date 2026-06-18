// Returns the calling premium user's Quantower API key.
// The key is derived from their Discord user ID + server secret — no DB needed.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateApiKey } from "@/lib/api-key";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.tier !== "premium") {
    return NextResponse.json({ error: "premium required" }, { status: 403 });
  }
  const userId = session.user.id;
  if (!userId) return NextResponse.json({ error: "no user id in session" }, { status: 500 });

  // Include the app's own base URL so the setup UI can display it.
  const origin = new URL(req.url).origin;

  return NextResponse.json({ key: generateApiKey(userId), appUrl: origin });
}
