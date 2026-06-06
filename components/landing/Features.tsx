const FEATURES = [
  {
    label: "01",
    title: "Gamma exposure",
    body:
      "Strike-by-strike GEX, dealer-positioning maps, gamma flip levels, and walls — recomputed every minute from CBOE.",
  },
  {
    label: "02",
    title: "Dealer flow",
    body:
      "Aggregate delta and vega exposure across the chain, ranked sweeps, and unusual volume.",
  },
  {
    label: "03",
    title: "Volatility surface",
    body:
      "Live IV across strikes and expirations. Term structure, skew, and a heatmap that finally renders fast.",
  },
  {
    label: "04",
    title: "Greeks lab",
    body:
      "Vanna, charm, vega — locally computed Black-Scholes when the feed is missing values. No hidden math.",
  },
];

export default function Features() {
  return (
    <section id="product" className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="label-mono mb-6">— What you get</div>
        <h2 className="display-italic text-5xl md:text-7xl text-white max-w-3xl">
          Everything the chain knows,
          <br />
          <span className="text-ink-400">in one frame.</span>
        </h2>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-14">
          {FEATURES.map((f) => (
            <div key={f.label} className="border-t border-white/5 pt-6">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-xs tracking-widest text-ink-400">
                  {f.label}
                </span>
                <h3 className="display-italic text-2xl md:text-3xl text-white">
                  {f.title}
                </h3>
              </div>
              <p className="mt-4 text-ink-300 leading-relaxed max-w-md">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
