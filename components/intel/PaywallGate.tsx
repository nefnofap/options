"use client";

import { useEffect, useState } from "react";

const STORE_KEY = "intel_unlocked";
const EXPIRES_KEY = "intel_unlocked_expires";
const PRICE = "$10.99/mo";
const CONTACT_DISCORD = "https://discord.com/invite/MSXdaexYdH";
const CONTACT_GITHUB = "https://github.com/nefnofap";

/**
 * Wraps a premium page. If the device hasn't been unlocked, the real content is
 * blurred behind an overlay that says "contact owner to purchase". Visitors who
 * bought access enter the code the owner gave them; it's checked server-side at
 * /api/intel/unlock and, on success, an unlock flag is saved to localStorage.
 */
export default function PaywallGate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORE_KEY) !== "1") {
      setUnlocked(false);
      return;
    }
    // A stored expiry means this was a 7-day trial code; re-lock once it passes.
    // No expiry stored (or "never") means a permanent code — stays unlocked.
    const exp = localStorage.getItem(EXPIRES_KEY);
    if (exp && exp !== "never") {
      const ts = Number(exp);
      if (!Number.isFinite(ts) || Date.now() > ts) {
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem(EXPIRES_KEY);
        setUnlocked(false);
        return;
      }
    }
    setUnlocked(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intel/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        expiresAt?: number | null;
      };
      if (json.ok) {
        localStorage.setItem(STORE_KEY, "1");
        localStorage.setItem(
          EXPIRES_KEY,
          json.expiresAt == null ? "never" : String(json.expiresAt),
        );
        setUnlocked(true);
      } else {
        setError(json.error ?? "Invalid access code.");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Avoid a flash before we've read localStorage.
  if (unlocked === null) return <div className="label-mono">loading</div>;
  if (unlocked) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred preview of the real content */}
      <div className="pointer-events-none select-none blur-md opacity-40" aria-hidden>
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-start justify-center pt-16">
        <div className="panel max-w-md w-full p-7 text-center">
          <div className="label-mono">premium · {PRICE}</div>
          <h2 className="display-italic text-2xl text-white mt-2">{title}</h2>
          <p className="text-sm text-ink-300 mt-3 leading-relaxed">
            This is a premium feature. To unlock it, contact the owner to
            purchase access ({PRICE}). You&apos;ll get an access code to enter
            below.
          </p>

          <div className="mt-4 flex flex-col gap-2 text-sm">
            <a className="pill pill-primary" href={CONTACT_DISCORD} target="_blank" rel="noreferrer">
              Contact owner on Discord
            </a>
            <a className="pill pill-ghost" href={CONTACT_GITHUB} target="_blank" rel="noreferrer">
              Contact on GitHub
            </a>
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-2">
            <label className="label-mono text-left">have a code?</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter access code"
              className="bg-ink-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
            <button
              type="submit"
              disabled={busy || !code}
              className="pill pill-primary disabled:opacity-40"
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
            {error && <div className="text-bear text-xs mt-1">{error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}
