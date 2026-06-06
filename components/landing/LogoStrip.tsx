const TICKERS = ["SPX", "SPY", "QQQ", "NDX", "RUT", "VIX", "AAPL", "NVDA", "TSLA", "META", "AMZN", "GOOGL"];

export default function LogoStrip() {
  return (
    <section id="data" className="relative py-20 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6">
        <div className="label-mono mb-8 text-center">— Coverage</div>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {TICKERS.map((t) => (
            <span
              key={t}
              className="font-mono text-sm tracking-[0.18em] text-ink-300 hover:text-white transition-colors"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
