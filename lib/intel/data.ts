// Intel orchestrators. Each composes one or more providers and ALWAYS returns a
// usable result — when a key is missing or a provider fails, it records a
// non-fatal ProviderNotice and degrades instead of throwing. The options app's
// existing getNews() (Yahoo) is the zero-key fallback for news.

import { getNews } from "../data";
import type { NewsItem } from "../types";
import { fredLatest } from "./fred";
import { finnhubMarketNews } from "./finnhub";
import { marketauxNews } from "./marketaux";
import { calendarToday } from "./tradingeconomics";
import { twelveDataSeries } from "./twelvedata";
import { taapiRsi, taapiMacd } from "./taapi";
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

  // Regime classification from credit spread, VIX, and the 2s10s curve.
  const find = (id: string) => series.find((s) => s.id === id);
  let regimeScore = 0;
  const drivers: string[] = [];

  const hy = find("BAMLH0A0HYM2");
  if (hy?.change != null) {
    if (hy.change > 0.1) {
      regimeScore -= 1;
      drivers.push("Credit spreads widening (risk-off)");
    } else if (hy.change < -0.1) {
      regimeScore += 1;
      drivers.push("Credit spreads tightening (risk-on)");
    }
  }
  const vix = find("VIXCLS");
  if (vix) {
    if (vix.value > 22) {
      regimeScore -= 1;
      drivers.push(`VIX elevated at ${vix.value.toFixed(1)} (risk-off)`);
    } else if (vix.value < 15) {
      regimeScore += 1;
      drivers.push(`VIX calm at ${vix.value.toFixed(1)} (risk-on)`);
    }
  }
  const t2 = find("DGS2");
  const t10 = find("DGS10");
  if (t2 && t10) {
    const curve = t10.value - t2.value;
    if (curve < 0) drivers.push(`2s10s inverted (${curve.toFixed(2)}%) — late-cycle caution`);
    else drivers.push(`2s10s positive (${curve.toFixed(2)}%)`);
  }

  const regime: Regime = regimeScore > 0 ? "risk-on" : regimeScore < 0 ? "risk-off" : "neutral";
  if (drivers.length === 0) drivers.push("Insufficient data for a confident regime call");

  return {
    asOf: today(),
    regime,
    regimeScore: Math.max(-1, Math.min(1, regimeScore / 2)),
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
    score: avg,
    bias: biasOf(avg),
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

// ── Instruments tracker ──────────────────────────────────────────────────────
const INSTRUMENTS: { symbol: string; name: string; taapiSymbol?: string; taapiExchange?: string }[] = [
  { symbol: "SPY", name: "S&P 500 (SPY)" },
  { symbol: "QQQ", name: "Nasdaq 100 (QQQ)" },
  { symbol: "DIA", name: "Dow 30 (DIA)" },
  { symbol: "EUR/USD", name: "Euro / Dollar" },
  { symbol: "USD/JPY", name: "Dollar / Yen" },
  { symbol: "GBP/USD", name: "Pound / Dollar" },
  { symbol: "BTC/USD", name: "Bitcoin", taapiSymbol: "BTC/USDT" },
  { symbol: "ETH/USD", name: "Ethereum", taapiSymbol: "ETH/USDT" },
  { symbol: "XAU/USD", name: "Gold" },
  { symbol: "WTI/USD", name: "Crude Oil (WTI)" },
];

function biasFrom(rsiVal: number | null, hist: number | null): Bias {
  let score = 0;
  if (rsiVal != null) {
    if (rsiVal >= 60) score += 1;
    else if (rsiVal <= 40) score -= 1;
  }
  if (hist != null) {
    if (hist > 0) score += 1;
    else if (hist < 0) score -= 1;
  }
  return score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral";
}

export async function getInstruments(): Promise<InstrumentsResult> {
  const notices: ProviderNotice[] = [];
  if (!env.twelveData()) {
    notices.push({
      provider: "Twelve Data",
      message: "TWELVE_DATA_API_KEY not set — instrument prices/indicators unavailable.",
      varName: "TWELVE_DATA_API_KEY",
    });
    return { asOf: today(), instruments: [], notices };
  }

  const useTaapi = !!env.taapi();

  // Sequential with a tiny stagger keeps us under Twelve Data's 8 req/min cap.
  const out: InstrumentSignal[] = [];
  for (const inst of INSTRUMENTS) {
    try {
      const series = await twelveDataSeries(inst.symbol);
      let rsiVal = calcRsi(series.closes);
      let macdVal = calcMacd(series.closes);
      let macd = macdVal?.macd ?? null;
      let macdSignal = macdVal?.signal ?? null;
      let macdHist = macdVal?.hist ?? null;

      if (useTaapi && inst.taapiSymbol) {
        const tr = await taapiRsi(inst.taapiSymbol);
        const tm = await taapiMacd(inst.taapiSymbol);
        if (tr != null) rsiVal = tr;
        if (tm) {
          macd = tm.macd;
          macdSignal = tm.signal;
          macdHist = tm.hist;
        }
      }

      const bias = biasFrom(rsiVal, macdHist);
      const level =
        rsiVal == null
          ? "—"
          : rsiVal >= 70
          ? "Overbought (>70)"
          : rsiVal <= 30
          ? "Oversold (<30)"
          : `RSI ${rsiVal.toFixed(0)}`;

      out.push({
        symbol: inst.symbol,
        name: inst.name,
        price: series.price,
        changePct: series.changePct,
        rsi: rsiVal,
        macd,
        macdSignal,
        macdHist,
        bias,
        level,
        source: useTaapi && inst.taapiSymbol ? "TwelveData+TAAPI" : "TwelveData",
      });
    } catch (e) {
      out.push({
        symbol: inst.symbol,
        name: inst.name,
        price: null,
        changePct: null,
        rsi: null,
        macd: null,
        macdSignal: null,
        macdHist: null,
        bias: "neutral",
        level: "—",
        source: "TwelveData",
        error: (e as Error).message,
      });
    }
  }

  return { asOf: today(), instruments: out, notices };
}
