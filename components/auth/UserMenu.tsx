"use client";

// Small account chrome for the app headers: avatar, tier badge, sign out.
// Receives the user's display fields from the server layout (which already has
// the session) so it doesn't need to re-fetch via useSession.
import { useState } from "react";
import { signOut } from "next-auth/react";
import type { Tier } from "@/auth";

export default function UserMenu({
  name,
  image,
  tier,
}: {
  name: string | null;
  image: string | null;
  tier: Tier;
}) {
  const [open, setOpen] = useState(false);
  const initial = (name ?? "?").charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-7 w-7 rounded-full border border-white/10" />
        ) : (
          <span className="h-7 w-7 rounded-full bg-white/10 grid place-items-center text-xs text-white">
            {initial}
          </span>
        )}
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded ${
            tier === "premium"
              ? "bg-amber-400/15 text-amber-300"
              : "bg-white/5 text-ink-400"
          }`}
        >
          {tier}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-48 panel p-2 z-50"
          role="menu"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-2 py-1.5 text-xs text-ink-300 truncate">{name ?? "Signed in"}</div>
          <div className="h-px bg-white/5 my-1" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full text-left px-2 py-1.5 text-sm text-ink-200 hover:text-white hover:bg-white/5 rounded"
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
