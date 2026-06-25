// Intel orchestrators. Each composes one or more providers and ALWAYS returns a
// usable result — when a key is missing or a provider fails, it records a
// non-fatal ProviderNotice and degrades instead of throwing. The options app's
// existing getNews() (Yahoo) is the zero-key fallback for news.

import { getNews, getChart } from "../data";
import type { NewsItem } from "../types";
import { fredLatest } from "./fred";
import { finnhubMarketNews } from "./finnhub";
import { marketauxNews } from "./marketaux";
import { calendarToday } from "./tradingeconomics";
import { econpulseMacro } from "./econpulse";
import { apifySentiment } from "./apify";
import { rsi as calcRsi, macd as calcMacd } from "./indicators";
import { scoreText, biasOf } from "./sentiment";
import { env } from "./env";
import type {
  MacroResult,
  MacroSeries,
  ProviderNotice,
  Regime,
  SentimentResult,
  ScoredHeadline,
  BriefResult,
  InstrumentsResult,
  InstrumentSignal,
  Bias,
} from "./types";

const today = () => new Date().toISOString().slice(0, 10);

// ── Macro ──────────────────────────────────────────────────────────────────
const FRED_SERIES: { id: string; label: string; unit: string }[] = [
  { id: "SOFR", label: "SOFR (overnight funding)", unit: "%" },
  { id: "DFF", label: "Fed Funds Rate", unit: "%" },
  { id: "DGS2", label: "2Y Treasury", unit: "%" },
  { id: "DGS10", label: "10Y Treasury", unit: "%" },
  { id: "BAMLH0A0HYM2", label: "HY Credit Spread (OAS)", unit: "%" },
  { id: "VIXCLS", label: "VIX", unit: "" },
  { id: "CPIAUCSL", label: "CPI (index)", unit: "" },
  { id: "UNRATE", label: "Unemployment Rate", unit: "%" },
];

export async function getMacro(): Promise<MacroResult> {
  const notices: ProviderNotice[] = [];
  const series: MacroSeries[] = [];

  if (!env.fred()) {
    notices.push({
      provider: "FRED",
      message: "FRED_API_KEY not set — core macro series unavailable.",
      varName: "FRED_API_KEY",
    });
  } else {
    const results = await Promise.allSettled(
      FRED_SERIES.map(async (s) => {
        const obs = await fredLatest(s.id);
        return { spec: s, obs };
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        const { spec, obs } = r.value;
        series.push({
          id: spec.id,
          label: spec.label,
          value: obs.value,
          prev: obs.prev,
          change: obs.prev != null ? obs.value - obs.prev : null,
          unit: spec.unit,
          asOf: obs.asOf,
          source: "FRED",
        });
      }
    }
    if (series.length === 0) {
      notices.push({ provider: "FRED", message: "FRED returned no data (check key/limits)." });
    }
  }

  // EconPulse is a best-effort supplement.
  const ep = await econpulseMacro();
  for (const s of ep) {
    if (!series.find((x) => x.label.toLowerCase() === s.label.toLowerCase())) series.push(s);
  }

  // Regime classification — graduated so a calm-but-tilted market still reads
  // directionally instead of collapsing to neutral. Each input contributes a
  // weighted vote; we normalise and use a narrow neutral band.
  const find = (id: string) => series.find((s) => s.id === id);
  let regimeScore = 0;
  const drivers: string[] = [];

  // Credit spreads: both the move and the absolute stress level matter.
  const hy = find("BAMLH0A0HYM2");
  if (hy?.change != null) {
    regimeScore += Math.max(-1.5, Math.min(1.5, -hy.change / 0.1)); // +0.1% wider ≈ -1
    if (hy.change > 0.05) drivers.push("Credit spreads widening (risk-off)");
    else if (hy.change < -0.05) drivers.push("Credit spreads tightening (risk-on)");
  }
  if (hy && hy.value > 5) {
    regimeScore -= 0.5;
    drivers.push(`HY spread elevated at ${hy.value.toFixed(2)}% (stress)`);
  }

  // VIX: graduated bands rather than a single 22/15 cliff.
  const vix = find("VIXCLS");
  if (vix) {
    const v = vix.value;
    if (v >= 28) regimeScore -= 2;
    else if (v >= 22) regimeScore -= 1;
    else if (v >= 20) regimeScore -= 0.5;
    else if (v < 13) regimeScore += 1.5;
    else if (v < 16) regimeScore += 1;
    else if (v < 18) regimeScore += 0.5;
    drivers.push(
      `VIX ${v.toFixed(1)} — ${v >= 22 ? "elevated (risk-off)" : v < 16 ? "calm (risk-on)" : "mid-range"}`,
    );
  }

  // Yield curve: inversion is a late-cycle caution tilt.
  const t2 = find("DGS2");
  const t10 = find("DGS10");
  if (t2 && t10) {
    const curve = t10.value - t2.value;
    if (curve < 0) {
      regimeScore -= 0.5;
      drivers.push(`2s10s inverted (${curve.toFixed(2)}%) — late-cycle caution`);
    } else {
      drivers.push(`2s10s positive (${curve.toFixed(2)}%)`);
    }
  }

  // Rate momentum: a fast back-up in 10Y yields tightens conditions.
  if (t10?.change != null) {
    if (t10.change > 0.1) {
      regimeScore -= 0.4;
      drivers.push("10Y yields backing up (tightening)");
    } else if (t10.change < -0.1) {
      regimeScore += 0.4;
      drivers.push("10Y yields easing (supportive)");
    }
  }

  // Labour market: rising unemployment leans risk-off.
  const unrate = find("UNRATE");
  if (unrate?.change != null) {
    if (unrate.change > 0.1) {
      regimeScore -= 0.4;
      drivers.push("Unemployment ticking up");
    } else if (unrate.change < -0.1) {
      regimeScore += 0.3;
    }
  }

  const regime: Regime = regimeScore > 0.4 ? "risk-on" : regimeScore < -0.4 ? "risk-off" : "neutral";
  if (drivers.length === 0) drivers.push("Insufficient data for a confident regime call");

  return {
    asOf: today(),
    regime,
    regimeScore: Math.max(-1, Math.min(1, regimeScore / 3)),
    drivers,
    series,
    notices,
  };
}

// ── Sentiment ──────────────────────────────────────────────────────────────
async function gatherNews(notices: ProviderNotice[]): Promise<NewsItem[]> {
  const collected: NewsItem[] = [];
  // Finnhub
  if (env.finnhub()) {
    try {
      collected.push(...(await finnhubMarketNews("general")));
    } catch (e) {
      notices.push({ provider: "Finnhub", message: (e as Error).message });
    }
  }
  // MarketAux
  if (env.marketaux()) {
    try {
      collected.push(...(await marketauxNews({ limit: 25 })));
    } catch (e) {
      notices.push({ provider: "MarketAux", message: (e as Error).message });
    }
  }
  // Zero-key fallback: Yahoo market news via the existing options pipeline.
  if (collected.length === 0) {
    notices.push({
      provider: "news",
      message: "No news API keys set — using Yahoo market headlines (SPY).",
    });
    try {
      collected.push(...(await getNews("SPY")));
    } catch {
      /* getNews never throws, but guard anyway */
    }
  }
  // De-dup by title.
  const seen = new Set<string>();
  return collected.filter((n) => {
    const k = n.title.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function getSentiment(): Promise<SentimentResult> {
  const notices: ProviderNotice[] = [];

  // Preferred: Apify AI actor.
  if (env.apify()) {
    const ai = await apifySentiment("stock market");
    if (ai && ai.length) {
      return aggregateSentiment(ai, "apify", notices);
    }
    notices.push({ provider: "Apify", message: "Apify returned no items — using lexicon." });
  }

  const news = await gatherNews(notices);
  const scored: ScoredHeadline[] = news.slice(0, 40).map((n) => {
    const s = scoreText(`${n.title} ${n.summary ?? ""}`);
    return {
      title: n.title,
      url: n.url,
      source: n.source,
      publishedAt: n.publishedAt,
      score: s.score,
      bias: s.bias,
    };
  });
  return aggregateSentiment(scored, "lexicon", notices, news);
}

function aggregateSentiment(
  scored: ScoredHeadline[],
  engine: "lexicon" | "apify",
  notices: ProviderNotice[],
  rawNews?: NewsItem[],
): SentimentResult {
  const n = scored.length || 1;
  const avg = scored.reduce((a, h) => a + h.score, 0) / n;
  const bullishCount = scored.filter((h) => h.bias === "bullish").length;
  const bearishCount = scored.filter((h) => h.bias === "bearish").length;
  const neutralCount = scored.filter((h) => h.bias === "neutral").length;
  // Blend the averaged score with the bull/bear count skew so a clearly tilted
  // headline mix isn't washed out to neutral by the squashed average.
  const skew = (bullishCount - bearishCount) / n;
  const blended = avg * 0.6 + skew * 0.4;

  // Top driver words from the lexicon pass.
  const wordCounts = new Map<string, number>();
  if (rawNews) {
    for (const item of rawNews) {
      for (const w of scoreText(`${item.title} ${item.summary ?? ""}`).hits) {
        wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
      }
    }
  }
  const drivers = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w, c]) => `${w} (${c})`);

  return {
    asOf: new Date().toISOString(),
    score: blended,
    bias: biasOf(blended),
    bullishCount,
    bearishCount,
    neutralCount,
    drivers,
    headlines: scored.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)),
    engine,
    notices,
  };
}

// ── Pre-market brief ───────────────────────────────────────────────────────
export async function getBrief(): Promise<BriefResult> {
  const notices: ProviderNotice[] = [];

  const [sentiment, macro] = await Promise.all([getSentiment(), getMacro().catch(() => null)]);
  notices.push(...sentiment.notices);

  let events: BriefResult["events"] = [];
  try {
    events = await calendarToday();
  } catch (e) {
    notices.push({ provider: "TradingEconomics", message: (e as Error).message });
  }

  const topHeadlines = sentiment.headlines.slice(0, 6);
  const highImpact = events.filter((e) => e.importance >= 2).slice(0, 6);

  const summary: string[] = [];
  summary.push(
    `Overnight news bias is ${sentiment.bias.toUpperCase()} ` +
      `(score ${sentiment.score.toFixed(2)}; ${sentiment.bullishCount}↑ / ${sentiment.bearishCount}↓).`,
  );
  if (macro) {
    summary.push(`Macro regime reads ${macro.regime.toUpperCase()} — ${macro.drivers[0]}.`);
  }
  if (highImpact.length) {
    summary.push(`${highImpact.length} high-impact economic events on the calendar today.`);
  }
  if (topHeadlines[0]) summary.push(`Top story: "${topHeadlines[0].title}".`);

  return {
    asOf: today(),
    generatedAt: new Date().toISOString(),
    summary,
    headlines: topHeadlines,
    events: highImpact.length ? highImpact : events.slice(0, 8),
    regime: macro?.regime ?? null,
    notices,
  };
}

// ── Instruments tracker (zero-key, Yahoo) ────────────────────────────────────
// `yahoo` is the Yahoo Finance ticker; `symbol` is the trader-facing label.
// Prices, RSI(14) and MACD(12,26,9) are all derived from the daily Yahoo series
// and computed locally — no API key required.
const INSTRUMENTS: { symbol: string; name: string; yahoo: string; inverseRisk?: boolean }[] = [
  { symbol: "SPX", name: "S&P 500 Index", yahoo: "^GSPC" },
  { symbol: "NDX", name: "Nasdaq 100", yahoo: "^NDX" },
  { symbol: "IXIC", name: "Nasdaq Composite", yahoo: "^IXIC" },
  { symbol: "DJI", name: "Dow Jones 30", yahoo: "^DJI" },
  { symbol: "RUT", name: "Russell 2000", yahoo: "^RUT" },
  { symbol: "VIX", name: "Volatility Index", yahoo: "^VIX", inverseRisk: true },
  { symbol: "BTCUSD", name: "Bitcoin", yahoo: "BTC-USD" },
  { symbol: "ETHUSD", name: "Ethereum", yahoo: "ETH-USD" },
  { symbol: "XAUUSD", name: "Gold Spot (GC)", yahoo: "GC=F" },
  { symbol: "MGC", name: "Micro Gold Futures", yahoo: "MGC=F" },
  { symbol: "SI", name: "Silver Futures", yahoo: "SI=F" },
  { symbol: "CL", name: "WTI Crude Oil", yahoo: "CL=F" },
  { symbol: "NG", name: "Natural Gas", yahoo: "NG=F" },
  { symbol: "DXY", name: "US Dollar Index", yahoo: "DX-Y.NYB" },
  { symbol: "EURUSD", name: "Euro / Dollar", yahoo: "EURUSD=X" },
  { symbol: "USDJPY", name: "Dollar / Yen", yahoo: "JPY=X" },
  { symbol: "TLT", name: "20Y+ Treasuries", yahoo: "TLT" },
  { symbol: "HYG", name: "High-Yield Credit", yahoo: "HYG" },
];

// Trend-aware bias: blends RSI, MACD histogram and price vs its 20-day average.
function instBias(
  rsiVal: number | null,
  hist: number | null,
  vsMa20: number | null,
): { bias: Bias; level: string } {
  let score = 0;
  if (rsiVal != null) {
    if (rsiVal >= 60) score += 1;
    else if (rsiVal <= 40) score -= 1;
    else if (rsiVal >= 52) score += 0.5;
    else if (rsiVal <= 48) score -= 0.5;
  }
  if (hist != null) {
    if (hist > 0) score += 1;
    else if (hist < 0) score -= 1;
  }
  if (vsMa20 != null) {
    if (vsMa20 > 0) score += 0.5;
    else if (vsMa20 < 0) score -= 0.5;
  }
  const bias: Bias = score >= 0.5 ? "bullish" : score <= -0.5 ? "bearish" : "neutral";

  let level: string;
  if (rsiVal == null) level = "—";
  else if (rsiVal >= 70) level = "Overbought (RSI>70)";
  else if (rsiVal <= 30) level = "Oversold (RSI<30)";
  else if (vsMa20 != null)
    level = `${vsMa20 >= 0 ? "Above" : "Below"} 20d MA · RSI ${rsiVal.toFixed(0)}`;
  else level = `RSI ${rsiVal.toFixed(0)}`;
  return { bias, level };
}

// Run async tasks with a concurrency cap so we don't burst Yahoo and get throttled.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function getInstruments(): Promise<InstrumentsResult> {
  const notices: ProviderNotice[] = [];

  // Concurrency kept low: Yahoo 429s serverless IPs on bursts. The 30-min Data
  // Cache (getChart) means most of these resolve without touching Yahoo at all.
  const out = await mapLimit(INSTRUMENTS, 3, async (inst): Promise<InstrumentSignal> => {
    try {
      // 6mo of daily bars gives MACD(26,9) and RSI(14) plenty of history.
      const chart = await getChart(inst.yahoo, "6mo", "1d");
      const closes = chart.bars.map((b) => b.c).filter((c) => Number.isFinite(c) && c > 0);
      const rsiVal = calcRsi(closes);
      const macdVal = calcMacd(closes);
      const macdHist = macdVal?.hist ?? null;

      const ma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
      const price = chart.spot || closes[closes.length - 1] || null;
      const vsMa20 = ma20 != null && price != null ? (price / ma20 - 1) * 100 : null;
      const changePct =
        chart.prevClose > 0 && price != null ? ((price - chart.prevClose) / chart.prevClose) * 100 : null;
      const ago5 = closes.length >= 6 ? closes[closes.length - 6] : null;
      const chg5 = ago5 != null && price != null ? (price / ago5 - 1) * 100 : null;

      const { bias, level } = instBias(rsiVal, macdHist, vsMa20);

      return {
        symbol: inst.symbol,
        name: inst.name,
        price,
        changePct,
        chg5,
        vsMa20,
        rsi: rsiVal,
        macd: macdVal?.macd ?? null,
        macdSignal: macdVal?.signal ?? null,
        macdHist,
        bias,
        level: chart.stale ? `${level} · stale` : level,
        source: "Yahoo",
      };
    } catch (e) {
      return {
        symbol: inst.symbol,
        name: inst.name,
        price: null,
        changePct: null,
        chg5: null,
        vsMa20: null,
        rsi: null,
        macd: null,
        macdSignal: null,
        macdHist: null,
        bias: "neutral",
        level: "—",
        source: "Yahoo",
        error: (e as Error).message,
      };
    }
  });

  if (out.every((i) => i.error)) {
    notices.push({ provider: "Yahoo", message: "All instrument series failed to load (Yahoo may be throttling — retry shortly)." });
  }

  return { asOf: today(), instruments: out, notices };
}
