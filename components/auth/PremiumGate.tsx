"use client";

// Client-side tier gate for premium features embedded inside otherwise-free
// pages (the Pine export button and the GEX "levels" section on the dashboard).
// Reads the session tier; free-tier members see a locked placeholder instead of
// the real feature. This is UX only — never the sole protection for a secret;
// the data behind these still lives in the app, so it's fine to gate visually.
import { useSession } from "next-auth/react";

const INVITE = "https://discord.com/invite/MSXdaexYdH";

export default function PremiumGate({
  children,
  variant = "block",
  label = "Premium feature",
}: {
  children: React.ReactNode;
  /** "block": blur the content with a centered overlay. "inline": small locked pill. */
  variant?: "block" | "inline";
  label?: string;
}) {
  const { data: session, status } = useSession();
  const isPremium = session?.user?.tier === "premium";

  // While the session resolves, render nothing extra — avoids a lock flash for
  // premium members on first paint.
  if (status === "loading") return <>{children}</>;
  if (isPremium) return <>{children}</>;

  if (variant === "inline") {
    return (
      <a
        href={INVITE}
        target="_blank"
        rel="noreferrer"
        className="pill pill-ghost opacity-80 hover:opacity-100"
        title="Premium — upgrade your Discord role to unlock"
      >
        🔒 {label} · Premium
      </a>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-md opacity-40" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="panel p-6 text-center max-w-sm">
          <div className="label-mono">premium · members</div>
          <div className="text-white mt-1 mb-3 text-sm">{label}</div>
          <a className="pill pill-primary" href={INVITE} target="_blank" rel="noreferrer">
            Upgrade in Discord
          </a>
        </div>
      </div>
    </div>
  );
}
