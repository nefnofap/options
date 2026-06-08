import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import IntelNav from "@/components/intel/IntelNav";
import UserMenu from "@/components/auth/UserMenu";

export default async function IntelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.inGuild) redirect("/denied");

  return (
    <main className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-40 backdrop-blur bg-ink-950/85 border-b border-white/5">
        <div className="px-6 py-3 flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="display-italic text-xl text-white leading-none">A+</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-200">
              Aplus · Intel
            </span>
          </Link>
          <span className="h-5 w-px bg-white/10" />
          <Link
            href="/dashboard/gex?symbol=SPY"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400 hover:text-ink-100"
          >
            ← Options Dashboard
          </Link>
          <span className="flex-1" />
          <UserMenu
            name={session.user.name ?? null}
            image={session.user.image ?? null}
            tier={session.user.tier}
          />
        </div>
        <Suspense fallback={null}>
          <IntelNav />
        </Suspense>
      </header>

      <div className="px-6 py-8">{children}</div>
    </main>
  );
}
