// Decorative floating ticker nodes with dotted connectors orbiting the headline.
// Pure CSS + SVG, no client JS.

interface Node {
  label: string;
  sub: string;
  top: string;
  left: string;
  animClass: string;
  size?: "sm" | "md";
}

const NODES: Node[] = [
  { label: "SPX", sub: "5832.10  +0.42%", top: "18%", left: "8%", animClass: "animate-float-slow" },
  { label: "AAPL", sub: "228.11  +1.08%", top: "62%", left: "6%", animClass: "animate-float-med", size: "sm" },
  { label: "TSLA", sub: "242.84  −0.74%", top: "32%", left: "84%", animClass: "animate-float-fast" },
  { label: "NVDA", sub: "131.20  +2.31%", top: "70%", left: "82%", animClass: "animate-float-med", size: "sm" },
  { label: "QQQ", sub: "508.17  +0.61%", top: "8%", left: "60%", animClass: "animate-float-fast", size: "sm" },
  { label: "VIX", sub: "13.42  −3.10%", top: "78%", left: "44%", animClass: "animate-float-slow", size: "sm" },
];

export default function FloatingNodes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Dotted connector lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-40"
        viewBox="0 0 1000 700"
        preserveAspectRatio="none"
        fill="none"
      >
        <g
          stroke="rgba(232,232,238,0.35)"
          strokeWidth="0.6"
          strokeDasharray="2 4"
          strokeLinecap="round"
        >
          <path d="M 110 145 Q 320 220 500 350" />
          <path d="M 80 470 Q 280 420 500 350" />
          <path d="M 880 240 Q 700 290 500 350" />
          <path d="M 850 530 Q 680 450 500 350" />
          <path d="M 620 70 Q 560 200 500 350" />
          <path d="M 460 600 Q 480 470 500 350" />
        </g>
      </svg>

      {NODES.map((n, i) => (
        <div
          key={i}
          className={`absolute ${n.animClass}`}
          style={{ top: n.top, left: n.left }}
        >
          <div
            className={`ticker-node px-3.5 py-2 ${
              n.size === "sm" ? "text-[10px]" : "text-xs"
            } shadow-[0_8px_30px_rgba(0,0,0,0.5)]`}
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-bull animate-pulse-soft" />
              <span className="font-mono tracking-wider text-white">{n.label}</span>
            </div>
            <div className="mt-1 num text-[10px] text-ink-300">{n.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
