import Link from "next/link";

// Server-rendered upsell shown in place of a premium-only page (Pre-Market
// Brief, Instruments, Impact Matrix) when the signed-in member is on the free
// tier. Premium is granted by holding the premium role in Discord.
const INVITE = "https://discord.com/invite/MSXdaexYdH";

export default function PremiumLock({ title }: { title: string }) {
  return (
    <div className="max-w-md mx-auto mt-16 panel p-8 text-center">
      <div className="label-mono">premium · members</div>
      <h2 className="display-italic text-2xl text-white mt-2">{title}</h2>
      <p className="text-sm text-ink-300 mt-3 leading-relaxed">
        This is a premium feature. Upgrade your Discord role to unlock the full
        Intel suite, the Pine export, and the GEX level reads.
      </p>
      <div className="mt-6 flex flex-col gap-2 text-sm">
        <a className="pill pill-primary" href={INVITE} target="_blank" rel="noreferrer">
          Upgrade in Discord
        </a>
        <Link className="pill pill-ghost" href="/intel/macro">
          Back to free Intel
        </Link>
      </div>
    </div>
  );
}
