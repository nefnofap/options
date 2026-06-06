import Link from "next/link";

const links = [
  { label: "Product", href: "#product" },
  { label: "Data", href: "#data" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "#docs" },
];

export default function Nav() {
  return (
    <header className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[min(94vw,920px)]">
      <nav className="glass rounded-full flex items-center justify-between px-3 py-2.5">
        <Link href="/" className="flex items-center gap-2 pl-2">
          <span className="display-italic text-xl text-white leading-none">A+</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-200">
            Aplus
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="nav-link">
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="pill pill-ghost hidden sm:inline-block">
            Sign in
          </Link>
          <Link href="/dashboard" className="pill pill-primary">
            Open app
          </Link>
        </div>
      </nav>
    </header>
  );
}
