// Market Thesis synthesis engine. Composes the existing free, graceful-degrade
// orchestrators (macro via FRED, sentiment via the lexicon over Yahoo news) plus
// our own zero-key options chain (CBOE) and Yahoo price series into ONE coherent,
// auditable market thesis. No paid API and no LLM — every paragraph is generated
// by deterministic rules, so the same inputs always yield the same thesis.
//
// Like the other intel orchestrators, getThesis() NEVER throws: any failing
// provider records a non-fatal notice and the thesis degrades around it.

import { getChart } from "../data";
import { getChain } from "../data";
import { strikeAggregates, gammaFlip, maxPain } from "../analytics";
import { absorptionProfile } from "../regime";
import { getMacro, getSentiment } from "./data";
import { calendarToday } from "./tradingeconomics";
import { assessGeopolitics } from "./geopolitics";
import { biasOf } from "./sentiment";
import type { ChartBar } from "../types";
import type {
  Bias,
  CatalystItem,
  ProviderNotice,
  ScoredHeadline,
  ThesisLevels,
  ThesisResult,
  ThesisSection,
  ThesisSignal,
} from "./types";

const now = () => new Date();
const todayStr = () => now().toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sign = (n: number): Bias => (n > 0.12 ? "bullish" : n < -0.12 ? "bearish" : "neutral");
const biasVal = (b: Bias) => (b === "bullish" ? 1 : b === "bearish" ? -1 : 0);
const pct = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

// ── Price momentum from a daily Yahoo series (zero-key) ──────────────────────
interface Momentum {
  last: number;
  chg1: number; // 1-day % change
  chg5: number; // 5-day % change
  vsMa20: number; // % above/below the 20-day average
  bias: Bias;
  score: number; // -1..+1
}

function momentum(bars: ChartBar[]): Momentum | null {
  const closes = bars.map((b) => b.c).filter((c) => Number.isFinite(c) && c > 0);
  if (closes.length < 6) return null;
  const last = closes[closes.length - 1];
  const prev1 = closes[closes.length - 2];
  const ago5 = closes[closes.length - 6];
  const chg1 = (last / prev1 - 1) * 100;
  const chg5 = (last / ago5 - 1) * 100;
  const ma20 = avg(closes.slice(-20));
  const vsMa20 = ma20 > 0 ? (last / ma20 - 1) * 100 : 0;

  let s = 0;
  if (chg5 > 0.5) s += 1;
  else if (chg5 < -0.5) s -= 1;
  if (vsMa20 > 0.25) s += 0.6;
  else if (vsMa20 < -0.25) s -= 0.6;
  if (chg1 > 0.4) s += 0.4;
  else if (chg1 < -0.4) s -= 0.4;
  const score = Math.max(-1, Math.min(1, s / 2));
  return { last, chg1, chg5, vsMa20, bias: sign(score), score };
}

// Pull a 1-month daily series; null (not throw) on any failure.
async function series(symbol: string): Promise<Momentum | null> {
  try {
    const r = await getChart(symbol, "1mo", "1d");
    return momentum(r.bars);
  } catch {
    return null;
  }
}

// ── Time-windowed sentiment over the scored headline pool ────────────────────
function windowSentiment(headlines: ScoredHeadline[], hours: number) {
  const cutoff = Date.now() - hours * 3600_000;
  const within = headlines.filter((h) => {
    const t = Date.parse(h.publishedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
  const pool = within.length ? within : headlines; // fall back to whole pool if timestamps are sparse
  const score = avg(pool.map((h) => h.score));
  return {
    score,
    bias: biasOf(score),
    n: within.length,
    bullish: pool.filter((h) => h.bias === "bullish").length,
    bearish: pool.filter((h) => h.bias === "bearish").length,
  };
}

export async function getThesis(): Promise<ThesisResult> {
  const notices: ProviderNotice[] = [];

  // Equity beta, cross-asset proxies — all zero-key Yahoo daily series.
  const XASSET = {
    spy: "SPY",
    qqq: "QQQ",
    dia: "DIA",
    iwm: "IWM",
    tlt: "TLT", // long bonds
    hyg: "HYG", // high-yield credit (risk appetite)
    gld: "GLD", // gold
    uup: "UUP", // US dollar
    uso: "USO", // crude oil
    btc: "BTC-USD",
  } as const;

  const [sentiment, macro, calRes, chartRes] = await Promise.all([
    getSentiment().catch(() => null),
    getMacro().catch(() => null),
    calendarToday().catch((e) => {
      notices.push({ provider: "TradingEconomics", message: (e as Error).message });
      return [];
    }),
    Promise.all(Object.values(XASSET).map((s) => series(s))),
  ]);
  if (sentiment) notices.push(...sentiment.notices);
  if (macro) notices.push(...macro.notices);

  const keys = Object.keys(XASSET) as (keyof typeof XASSET)[];
  const mom: Record<string, Momentum | null> = {};
  keys.forEach((k, i) => (mom[k] = chartRes[i]));
  if (keys.every((k) => mom[k] == null)) {
    notices.push({ provider: "Yahoo", message: "Price series unavailable — technical/cross-asset reads skipped." });
  }

  const headlines = sentiment?.headlines ?? [];
  const sections: ThesisSection[] = [];
  const signals: ThesisSignal[] = [];

  // ── 1. Weekly sentiment ────────────────────────────────────────────────
  const weekly = windowSentiment(headlines, 24 * 7);
  {
    const spyWk = mom.spy?.chg5 ?? null;
    let s = weekly.score * 0.7;
    if (spyWk != null) s += Math.max(-1, Math.min(1, spyWk / 3)) * 0.3;
    const b = sign(s);
    sections.push({
      key: "weekly",
      title: "Weekly Market Sentiment",
      bias: b,
      score: s,
      headline: `News tone over the past week reads ${b.toUpperCase()}${
        spyWk != null ? `, with the S&P ${spyWk >= 0 ? "up" : "down"} ${Math.abs(spyWk).toFixed(1)}% on the week` : ""
      }.`,
      body: [
        `Across ${weekly.bullish + weekly.bearish || headlines.length} scored stories the bullish/bearish split is ${weekly.bullish}↑ / ${weekly.bearish}↓ (net score ${weekly.score.toFixed(2)}).`,
        macro
          ? `The weekly read is framed by a ${macro.regime.toUpperCase()} macro regime — ${macro.drivers[0] ?? "mixed signals"}.`
          : `Macro context is unavailable this run (set FRED_API_KEY to enrich the weekly frame).`,
        spyWk != null
          ? `Price confirms/conflicts: SPY is ${pct(spyWk, 1)} over five sessions and ${
              (mom.spy?.vsMa20 ?? 0) >= 0 ? "above" : "below"
            } its 20-day average.`
          : `Weekly price trend unavailable.`,
      ],
      metrics: [
        { label: "Net tone", value: weekly.score.toFixed(2), bias: b },
        { label: "SPY 5d", value: pct(spyWk, 1), bias: spyWk == null ? "neutral" : sign(spyWk / 3) },
      ],
    });
    signals.push({ label: "Weekly sentiment", bias: b, weight: 1.5, note: `net tone ${weekly.score.toFixed(2)}` });
  }

  // ── 2. Daily sentiment ─────────────────────────────────────────────────
  const daily = windowSentiment(headlines, 24);
  {
    const spy1 = mom.spy?.chg1 ?? null;
    let s = daily.score * 0.7;
    if (spy1 != null) s += Math.max(-1, Math.min(1, spy1 / 1.5)) * 0.3;
    const b = sign(s);
    const vix = macro?.series.find((x) => x.id === "VIXCLS");
    sections.push({
      key: "daily",
      title: "Daily Market Sentiment",
      bias: b,
      score: s,
      headline: `Today's tape and headlines lean ${b.toUpperCase()}${
        vix ? ` with VIX at ${vix.value.toFixed(1)}` : ""
      }.`,
      body: [
        `${daily.n} stories landed in the last 24h (${daily.bullish}↑ / ${daily.bearish}↓).`,
        spy1 != null ? `SPY is ${pct(spy1, 2)} on the day.` : `Intraday price move unavailable.`,
        vix
          ? `Volatility regime: VIX ${vix.value.toFixed(1)} — ${
              vix.value > 22 ? "elevated, expect wider ranges" : vix.value < 15 ? "compressed, mean-reversion favoured" : "mid-range"
            }.`
          : `VIX unavailable (set FRED_API_KEY).`,
      ],
      metrics: [
        { label: "24h tone", value: daily.score.toFixed(2), bias: b },
        { label: "SPY 1d", value: pct(spy1, 2), bias: spy1 == null ? "neutral" : sign(spy1 / 1.5) },
        ...(vix ? [{ label: "VIX", value: vix.value.toFixed(1), bias: (vix.value > 22 ? "bearish" : vix.value < 15 ? "bullish" : "neutral") as Bias }] : []),
      ],
    });
    signals.push({ label: "Daily sentiment", bias: b, weight: 1.0, note: `${daily.n} stories, score ${daily.score.toFixed(2)}` });
  }

  // ── 3. Macroeconomics ──────────────────────────────────────────────────
  {
    const b: Bias = macro ? (macro.regime === "risk-on" ? "bullish" : macro.regime === "risk-off" ? "bearish" : "neutral") : "neutral";
    const find = (id: string) => macro?.series.find((x) => x.id === id);
    const t2 = find("DGS2");
    const t10 = find("DGS10");
    const curve = t2 && t10 ? t10.value - t2.value : null;
    sections.push({
      key: "macro",
      title: "Macroeconomic Backdrop",
      bias: b,
      score: macro ? macro.regimeScore : 0,
      headline: macro
        ? `Macro regime is ${macro.regime.toUpperCase()} — ${macro.drivers[0] ?? ""}.`
        : `Macro data unavailable — set FRED_API_KEY to light up rates, credit and the curve.`,
      body: macro
        ? [
            macro.drivers.join(" · "),
            curve != null
              ? `The 2s10s curve is ${curve >= 0 ? "positive" : "inverted"} at ${curve.toFixed(2)}% — ${
                  curve < 0 ? "a classic late-cycle caution flag" : "no inversion stress"
                }.`
              : `Yield-curve data unavailable.`,
          ]
        : [`No macro series this run.`],
      metrics: (macro?.series ?? [])
        .filter((s) => ["DFF", "DGS10", "BAMLH0A0HYM2", "UNRATE"].includes(s.id))
        .map((s) => ({ label: s.label, value: `${s.value}${s.unit}`, bias: "neutral" as Bias })),
    });
    if (macro) signals.push({ label: "Macro regime", bias: b, weight: 2.0, note: macro.regime });
  }

  // ── 4. Micro / market structure (technicals + breadth) ──────────────────
  {
    const eq = (["spy", "qqq", "dia", "iwm"] as const).map((k) => mom[k]).filter(Boolean) as Momentum[];
    const up = eq.filter((m) => m.bias === "bullish").length;
    const breadth = eq.length ? up / eq.length : null;
    const s = eq.length ? avg(eq.map((m) => m.score)) : 0;
    const b = sign(s);
    const small = mom.iwm;
    const big = mom.spy;
    const leadership =
      small && big
        ? small.chg5 > big.chg5
          ? "small-caps leading (broadening, risk-on)"
          : "mega-caps leading (narrow, defensive)"
        : "leadership unclear";
    sections.push({
      key: "micro",
      title: "Micro / Market Structure",
      bias: b,
      score: s,
      headline: breadth == null
        ? `Index technicals unavailable this run.`
        : `Index trend ${b.toUpperCase()} with ${up}/${eq.length} major benchmarks above trend — ${leadership}.`,
      body: [
        big ? `SPY ${pct(big.chg5, 1)} (5d), ${big.vsMa20 >= 0 ? "above" : "below"} its 20-day MA by ${pct(big.vsMa20, 1)}.` : `SPY series unavailable.`,
        mom.qqq ? `QQQ ${pct(mom.qqq.chg5, 1)} (5d) — growth/tech ${mom.qqq.bias}.` : `QQQ series unavailable.`,
        breadth != null ? `Breadth proxy: ${(breadth * 100).toFixed(0)}% of tracked benchmarks trending up.` : ``,
      ].filter(Boolean),
      metrics: (["spy", "qqq", "dia", "iwm"] as const)
        .filter((k) => mom[k])
        .map((k) => ({ label: k.toUpperCase(), value: pct(mom[k]!.chg5, 1), bias: mom[k]!.bias })),
    });
    if (eq.length) signals.push({ label: "Index technicals", bias: b, weight: 1.5, note: `${up}/${eq.length} above trend` });
  }

  // ── 5. Cross-asset confirmation ─────────────────────────────────────────
  {
    const equity = mom.spy?.score ?? 0;
    const bondsUp = (mom.tlt?.chg5 ?? 0) > 0.5; // flight to safety
    const hygUp = (mom.hyg?.chg5 ?? 0) > 0; // credit appetite healthy
    const goldUp = (mom.gld?.chg5 ?? 0) > 1; // hedging bid
    const dollarUp = (mom.uup?.chg5 ?? 0) > 0.5; // risk-off / tightening
    const divergences: string[] = [];
    let confirm = 0;
    if (mom.spy && mom.hyg) {
      if (sign(equity) === "bullish" && hygUp) confirm += 1;
      else if (sign(equity) === "bullish" && !hygUp) divergences.push("equities up but high-yield credit soft — risk rally unconfirmed");
    }
    if (mom.spy && mom.tlt) {
      if (sign(equity) === "bullish" && bondsUp) divergences.push("bonds bid alongside stocks — a defensive undertone");
      if (sign(equity) === "bearish" && bondsUp) confirm -= 1; // classic risk-off confirmed
    }
    if (sign(equity) === "bullish" && goldUp) divergences.push("gold rallying with equities — hedging demand persists");
    if (sign(equity) === "bullish" && dollarUp) divergences.push("dollar firm into an equity rally — tighter conditions");
    const s = Math.max(-1, Math.min(1, equity + confirm * 0.3 - divergences.length * 0.15));
    const b = sign(s);
    sections.push({
      key: "crossasset",
      title: "Cross-Asset Confirmation",
      bias: b,
      score: s,
      headline: divergences.length
        ? `Risk signal is ${b.toUpperCase()} but with ${divergences.length} divergence${divergences.length > 1 ? "s" : ""} to respect.`
        : `Cross-asset flows ${b === "neutral" ? "are mixed" : `confirm a ${b.toUpperCase()} tilt`}.`,
      body: [
        divergences.length ? `Watch: ${divergences.join("; ")}.` : `Bonds, credit, gold and the dollar broadly agree with the equity read.`,
        `Crypto risk proxy: BTC ${mom.btc ? pct(mom.btc.chg5, 1) + " (5d)" : "unavailable"}.`,
      ],
      metrics: (["tlt", "hyg", "gld", "uup", "uso", "btc"] as const)
        .filter((k) => mom[k])
        .map((k) => ({ label: k === "btc" ? "BTC" : k.toUpperCase(), value: pct(mom[k]!.chg5, 1), bias: mom[k]!.bias })),
    });
    if (mom.spy) signals.push({ label: "Cross-asset", bias: b, weight: 1.5, note: divergences.length ? `${divergences.length} divergence(s)` : "aligned" });
  }

  // ── 6. Options positioning (our own GEX, zero-key CBOE) ─────────────────
  const levels: ThesisLevels = {
    symbol: "SPY",
    spot: null,
    gammaFlip: null,
    callWall: null,
    putWall: null,
    maxPain: null,
    resistance: null,
    support: null,
    invalidation: null,
    dealerRegime: null,
  };
  {
    let optBias: Bias = "neutral";
    let optScore = 0;
    try {
      const chain = await getChain("SPY");
      const aggs = strikeAggregates(chain);
      const flip = gammaFlip(aggs);
      const pain = maxPain(aggs);
      const { callWall, putWall } = absorptionProfile(aggs, chain.spot);
      const totalGamma = aggs.reduce((a, x) => a + (Number.isFinite(x.netGammaNotional) ? x.netGammaNotional : 0), 0);
      const longGamma = totalGamma >= 0;

      levels.spot = chain.spot;
      levels.gammaFlip = flip;
      levels.callWall = callWall;
      levels.putWall = putWall;
      levels.maxPain = pain;
      levels.resistance = callWall;
      levels.support = putWall;
      levels.dealerRegime = longGamma ? "long" : "short";

      const aboveFlip = flip != null ? chain.spot > flip : null;
      // Long gamma + above flip = dealers dampen, supportive drift (mild bullish).
      // Short gamma = dealers amplify; tilt follows daily momentum, conviction-reducing.
      if (longGamma && aboveFlip) {
        optBias = "bullish";
        optScore = 0.4;
      } else if (longGamma && aboveFlip === false) {
        optBias = "bearish";
        optScore = -0.3;
      } else if (!longGamma) {
        optBias = sign(mom.spy?.score ?? 0);
        optScore = (mom.spy?.score ?? 0) * 0.5;
      }
      levels.invalidation = flip;

      sections.push({
        key: "options",
        title: "Options Positioning — Dealer Gamma (SPY)",
        bias: optBias,
        score: optScore,
        headline: `Dealers are ${longGamma ? "LONG" : "SHORT"} gamma${
          flip != null ? `, spot ${aboveFlip ? "above" : "below"} the ${flip.toFixed(0)} flip` : ""
        }.`,
        body: [
          longGamma
            ? `Long-gamma regime: dealer hedging is mean-reverting — expect ranges to hold and dips/rips to fade unless a wall breaks.`
            : `Short-gamma regime: dealer hedging amplifies moves — breakouts run and pullbacks accelerate. Size accordingly.`,
          `Call wall ${callWall?.toFixed(0) ?? "—"} caps upside; put wall ${putWall?.toFixed(0) ?? "—"} cushions downside; max-pain magnet ${pain?.toFixed(0) ?? "—"}.`,
          flip != null ? `Gamma flip at ${flip.toFixed(0)} is the regime line — losing it ${aboveFlip ? "would open volatility expansion" : "must be reclaimed to stabilise"}.` : `Gamma flip unavailable.`,
        ],
        metrics: [
          { label: "Regime", value: longGamma ? "Long γ" : "Short γ", bias: longGamma ? "bullish" : "bearish" },
          { label: "Flip", value: flip?.toFixed(0) ?? "—" },
          { label: "Call wall", value: callWall?.toFixed(0) ?? "—" },
          { label: "Put wall", value: putWall?.toFixed(0) ?? "—" },
        ],
      });
      signals.push({ label: "Options positioning", bias: optBias, weight: 1.0, note: `${longGamma ? "long" : "short"} gamma` });
    } catch (e) {
      notices.push({ provider: "CBOE", message: `Options positioning skipped — ${(e as Error).message}` });
      sections.push({
        key: "options",
        title: "Options Positioning — Dealer Gamma (SPY)",
        bias: "neutral",
        score: 0,
        headline: `Options chain unavailable this run.`,
        body: [`CBOE did not return a SPY chain — dealer-gamma read is skipped.`],
      });
    }
  }

  // ── 7. Geopolitics ──────────────────────────────────────────────────────
  const geo = assessGeopolitics(headlines);
  {
    const b: Bias = geo.level === "high" ? "bearish" : geo.level === "elevated" ? "neutral" : "neutral";
    sections.push({
      key: "geopolitics",
      title: "Geopolitical Risk",
      bias: b,
      score: -geo.score, // risk is a downside tilt
      headline: `Geopolitical risk reads ${geo.level.toUpperCase()}${
        geo.themes.length ? ` — ${geo.themes[0].label.toLowerCase()} dominant` : ""
      }.`,
      body: [
        geo.themes.length ? `Active themes: ${geo.themes.map((t) => `${t.label} (${t.count})`).join(", ")}.` : `No material geopolitical headlines detected in the current news pool.`,
        geo.level === "high"
          ? `Elevated headline risk argues for trimming conviction and respecting tail hedges (gold, vol, USD).`
          : geo.level === "elevated"
          ? `Some headline risk present — keep position sizing disciplined into catalysts.`
          : `Geopolitics is not the marginal driver right now.`,
      ],
      metrics: [{ label: "Risk gauge", value: `${(geo.score * 100).toFixed(0)}/100`, bias: b }],
    });
    if (geo.level !== "low") signals.push({ label: "Geopolitics", bias: "bearish", weight: geo.level === "high" ? 1.2 : 0.6, note: `${geo.level} risk` });
  }

  // ── Bottom-line synthesis (weighted vote) ───────────────────────────────
  const totalW = signals.reduce((a, s) => a + s.weight, 0) || 1;
  const score = signals.reduce((a, s) => a + biasVal(s.bias) * s.weight, 0) / totalW;
  const bias = sign(score);

  // Conviction: magnitude of the net call + how aligned the weighted votes are,
  // docked for missing data and acute geopolitical uncertainty.
  const directional = signals.filter((s) => s.bias !== "neutral");
  const aligned = directional
    .filter((s) => biasVal(s.bias) === Math.sign(score))
    .reduce((a, s) => a + s.weight, 0);
  const dirW = directional.reduce((a, s) => a + s.weight, 0) || 1;
  const agreement = aligned / dirW; // 0..1
  let conviction = Math.abs(score) * 55 + agreement * 45;
  const dataGaps = notices.filter((n) => /not set|unavailable|skipped|no data/i.test(n.message)).length;
  conviction -= dataGaps * 4;
  if (geo.level === "high") conviction -= 12;
  else if (geo.level === "elevated") conviction -= 5;
  conviction = Math.max(0, Math.min(100, Math.round(conviction)));
  const convictionLabel = conviction >= 66 ? "high" : conviction >= 40 ? "medium" : "low";

  // ── Bottom-line narrative ───────────────────────────────────────────────
  const topBull = signals.filter((s) => s.bias === "bullish").sort((a, b) => b.weight - a.weight)[0];
  const topBear = signals.filter((s) => s.bias === "bearish").sort((a, b) => b.weight - a.weight)[0];
  const driver = bias === "bullish" ? topBull : bias === "bearish" ? topBear : topBull ?? topBear;
  const counter = bias === "bullish" ? topBear : topBull;

  const thesis =
    `Net read: ${bias.toUpperCase()} with ${convictionLabel} conviction (${conviction}/100). ` +
    (driver ? `The call is led by ${driver.label.toLowerCase()} (${driver.note}). ` : ``) +
    (counter ? `The main risk to it is ${counter.label.toLowerCase()} pulling the other way. ` : ``) +
    (levels.gammaFlip != null
      ? `Options structure puts the line in the sand at the ${levels.gammaFlip.toFixed(0)} gamma flip on SPY.`
      : ``);

  const tldr: string[] = [
    `Bottom line: ${bias.toUpperCase()} · conviction ${conviction}/100 (${convictionLabel}).`,
    `Weekly tone ${weekly.bias}, daily tone ${daily.bias}.`,
    macro ? `Macro regime ${macro.regime.toUpperCase()}.` : `Macro data offline.`,
    levels.dealerRegime ? `Dealers ${levels.dealerRegime} gamma; key levels ${levels.support?.toFixed(0) ?? "—"} / ${levels.resistance?.toFixed(0) ?? "—"}.` : `Options positioning offline.`,
    `Geopolitical risk ${geo.level}.`,
  ];

  // ── Catalysts ahead (high-impact econ events) ───────────────────────────
  const catalysts: CatalystItem[] = (calRes ?? [])
    .filter((e) => e.importance >= 2)
    .slice(0, 8)
    .map((e) => ({
      when: (e.time || "").slice(0, 16).replace("T", " "),
      label: e.event,
      country: e.country,
      importance: e.importance,
    }));

  return {
    asOf: todayStr(),
    generatedAt: new Date().toISOString(),
    bias,
    score,
    conviction,
    convictionLabel,
    thesis,
    tldr,
    sections,
    levels,
    catalysts,
    headlines: headlines.slice(0, 8),
    signals,
    notices,
  };
}
