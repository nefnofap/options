import Link from "next/link";
import FloatingNodes from "./FloatingNodes";

export default function Hero() {
  return (
    <section className="relative min-h-[100vh] flex flex-col items-center justify-center overflow-hidden bg-radial-fade">
      {/* faint grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 70%)",
        }}
      />

      <FloatingNodes />

      <div className="relative z-10 text-center px-6 max-w-4xl">
        <div className="label-mono mb-8 inline-flex items-center gap-2">
          <span className="h-px w-6 bg-ink-500" />
          OPTIONS · GAMMA · DEALER FLOW
          <span className="h-px w-6 bg-ink-500" />
        </div>

        <h1 className="display-italic text-[clamp(3rem,9vw,7.5rem)] text-white">
          Read the
          <br />
          <span className="text-ink-300">tape, exactly.</span>
        </h1>

        <p className="mt-8 max-w-xl mx-auto text-ink-300 text-base md:text-lg leading-relaxed">
          A minimal, real-time view of gamma exposure, dealer positioning,
          implied volatility, and order flow — built for traders who want signal,
          not noise.
        </p>

        <div className="mt-10 flex items-center justify-center gap-3">
          <Link href="/dashboard" className="pill pill-primary">
            Open app →
          </Link>
          <Link href="/dashboard/gex" className="pill pill-ghost">
            See live GEX
          </Link>
        </div>
      </div>

      {/* scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="label-mono">scroll</span>
        <svg
          width="14"
          height="22"
          viewBox="0 0 14 22"
          fill="none"
          className="animate-scroll-hint text-ink-300"
        >
          <path
            d="M7 1V18M7 18L1 12M7 18L13 12"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </section>
  );
}
