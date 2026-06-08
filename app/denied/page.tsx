"use client";

// Shown to a signed-in user who is NOT a member of the required Discord guild.
// They have a session but no app access — their only paths are "join the
// Discord" or "sign in with a different account".
import { signOut } from "next-auth/react";

const INVITE = "https://discord.com/invite/MSXdaexYdH";

export default function DeniedPage() {
  return (
    <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
      <div className="panel max-w-md w-full p-8 text-center">
        <div className="label-mono">access · members only</div>
        <h1 className="display-italic text-3xl text-white mt-2">Join the Discord</h1>
        <p className="text-sm text-ink-300 mt-3 leading-relaxed">
          Aplus is open to members of our Discord server only. Your account isn&apos;t
          in the server yet — join with the same Discord account, then sign in
          again to unlock the dashboard.
        </p>

        <div className="mt-6 flex flex-col gap-2 text-sm">
          <a className="pill pill-primary" href={INVITE} target="_blank" rel="noreferrer">
            Join the Discord server
          </a>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="pill pill-ghost"
          >
            Sign in with a different account
          </button>
        </div>
      </div>
    </main>
  );
}
