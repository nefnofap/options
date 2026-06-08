// Server-side tier guard for premium API routes. Call at the top of a route
// handler: `const denied = await requirePremium(); if (denied) return denied;`
// Returns a 403 NextResponse for non-premium (or signed-out) callers, else null.
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function requirePremium(): Promise<NextResponse | null> {
  const session = await auth();
  if (session?.user?.tier === "premium") return null;
  return NextResponse.json(
    { error: "premium required", hint: "Upgrade your Discord role to access this." },
    { status: 403 },
  );
}
