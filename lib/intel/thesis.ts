// Market Thesis synthesis engine. Composes the existing free, graceful-degrade
// orchestrators (macro via FRED, sentiment via the lexicon over Yahoo news) plus
// our own zero-key options chains (CBOE) and the 16+ instrument board into ONE
// coherent, auditable market thesis. The read is BROAD-MARKET: directional calls
// come from a composite of the major equity indices (S&P 500, Nasdaq, Dow,
// Russell), cross-asset flows, and index-options dealer positioning — not a
// single ticker. No paid API and no LLM; the same inputs always yield the same
// thesis.
//
// Like the other intel orchestrators, getThesis() NEVER throws: any failing
// provider records a non-fatal notice and the thesis degrades around it.

import { getChain } from "../data";
import { strikeAggregates, gammaFlip, maxPain } from "../analytics";
import { absorptionProfile } from "../regime";
import { getMacro, getSentiment, getInstruments } from "./data";
import { calendarToday } from "./tradingeconomics";
import { assessGeopolitics } from "./geopolitics";
import { biasOf } from "./sentiment";
import type {
  Bias,
  CatalystItem,
  InstrumentSignal,
  ProviderNotice,
  ScoredHeadline,
  ThesisLevels,
  ThesisResult,
  ThesisSection,
  ThesisSignal,
} from "./types";

const todayStr = () => new Date().toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sign = (n: number): Bias => (n > 0.12 ? "bullish" : n < -0.12 ? "bearish" : "neutral");
const biasVal = (b: Bias) => (b === "bullish" ? 1 : b === "bearish" ? -1 : 0);
const pct = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

// Continuous -1..+1 trend score for one instrument, from its 5-day move, its
// position vs the 20-day average, and today's change.
function instScore(it: InstrumentSignal): number {
  let s = 0;
  if (it.chg5 != null) {
    if (it.chg5 > 0.5) s += 1;
    else if (it.chg5 < -0.5) s -= 1;
  }
  if (it.vsMa20 != null) {
    if (it.vsMa20 > 0.25) s += 0.6;
    else if (it.vsMa20 < -0.25) s -= 0.6;
  }
  if (it.changePct != null) {
    if (it.changePct > 0.4) s += 0.4;
    else if (it.changePct < -0.4) s -= 0.4;
  }
  return Math.max(-1, Math.min(1, s / 2));
}

// ── Instrument breadth → market-direction signal ─────────────────────────────
// Each tracked instrument's OWN bias is mapped to a market-risk polarity: a
// bullish equity/crypto is risk-on (+), a bullish VIX or dollar is risk-OFF (−),
// and commodities/bonds (ambiguous for equity risk) sit out of the directional
// vote while still being shown on the board.
const RISK_POLARITY: Record<string, number> = {
  SPX: 1, NDX: 1, IXIC: 1, DJI: 1, RUT: 1,
  BTCUSD: 1, ETHUSD: 1,
  HYG: 0.6, // high-yield credit risk-on
  EURUSD: 0.5, // inverse to the dollar → mildly risk-on
  USDJPY: 0.5, // yen weakness → carry / risk-on
  VIX: -1, // rising vol → risk-off
  DXY: -0.7, // strong dollar → tighter conditions / risk-off
  TLT: -0.4, // bonds bid → flight to safety
};

function instrumentBreadth(instruments: InstrumentSignal[]) {
  let num = 0;
  let den = 0;
  let riskUp = 0;
  let total = 0;
  for (const it of instruments) {
    const pol = RISK_POLARITY[it.symbol] ?? 0;
    if (pol === 0 || it.error) continue; // commodities + failed rows excluded
    total += 1;
    const v = biasVal(it.bias);
    num += v * pol;
    den += Math.abs(pol);
    if (v * Math.sign(pol) > 0) riskUp += 1; // instrument is pushing the market risk-on
  }
  if (den === 0) return null;
  const score = Math.max(-1, Math.min(1, num / den));
  return { score, bias: sign(score), riskUp, total };
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

// ── Index-options dealer-gamma read (per index, zero-key CBOE) ────────────────
interface GammaRead {
  symbol: string;
  spot: number;
  longGamma: boolean;
  aboveFlip: boolean | null;
  flip: number | null;
  callWall: number | null;
  putWall: number | null;
  pain: number | null;
  bias: Bias;
  score: number;
}

async function gammaRead(symbol: string): Promise<GammaRead | null> {
  const chain = await getChain(symbol);
  const aggs = strikeAggregates(chain);
  const flip = gammaFlip(aggs);
  const pain = maxPain(aggs);
  const { callWall, putWall } = absorptionProfile(aggs, chain.spot);
  const totalGamma = aggs.reduce((a, x) => a + (Number.isFinite(x.netGammaNotional) ? x.netGammaNotional : 0), 0);
  const longGamma = totalGamma >= 0;
  const aboveFlip = flip != null ? chain.spot > flip : null;
  let bias: Bias = "neutral";
  let score = 0;
  if (longGamma && aboveFlip) {
    bias = "bullish";
    score = 0.4;
  } else if (longGamma && aboveFlip === false) {
    bias = "bearish";
    score = -0.3;
  }
  return { symbol, spot: chain.spot, longGamma, aboveFlip, flip, callWall, putWall, pain, bias, score };
}

export async function getThesis(): Promise<ThesisResult> {
  const notices: ProviderNotice[] = [];

  const [sentiment, macro, calRes, instRes] = await Promise.all([
    getSentiment().catch(() => null),
    getMacro().catch(() => null),
    calendarToday().catch((e) => {
      notices.push({ provider: "TradingEconomics", message: (e as Error).message });
      return [];
    }),
    getInstruments().catch(() => null),
  ]);
  if (sentiment) notices.push(...sentiment.notices);
  if (macro) notices.push(...macro.notices);
  if (instRes) notices.push(...instRes.notices);

  const board = instRes?.instruments ?? [];
  const inst = (sym: string) => board.find((i) => i.symbol === sym && !i.error) ?? null;

  // Broad equity composite — the market read, not a single ticker.
  const EQ = ["SPX", "NDX", "DJI", "RUT"];
  const eqList = EQ.map(inst).filter((x): x is InstrumentSignal => !!x);
  const eqScore = eqList.length ? avg(eqList.map(instScore)) : 0;
  const eqBias = sign(eqScore);
  const eqChg5 = eqList.length ? avg(eqList.map((i) => i.chg5 ?? 0)) : null;
  const eqChg1 = eqList.length ? avg(eqList.map((i) => i.changePct ?? 0)) : null;
  const eqUp = eqList.filter((i) => i.bias === "bullish").length;

  // Polarity-aware breadth across the full instrument board.
  const breadth = instRes ? instrumentBreadth(board) : null;
  if (!board.length) {
    notices.push({ provider: "Yahoo", message: "Instrument board unavailable — price-based reads degraded." });
  }

  const headlines = sentiment?.headlines ?? [];
  const sections: ThesisSection[] = [];
  const signals: ThesisSignal[] = [];

  // ── 1. Weekly sentiment ────────────────────────────────────────────────
  const weekly = windowSentiment(headlines, 24 * 7);
  {
    let s = weekly.score * 0.7;
    if (eqChg5 != null) s += Math.max(-1, Math.min(1, eqChg5 / 3)) * 0.3;
    const b = sign(s);
    sections.push({
      key: "weekly",
      title: "Weekly Market Sentiment",
      bias: b,
      score: s,
      headline: `News tone over the past week reads ${b.toUpperCase()}${
        eqChg5 != null ? `, with the broad market ${eqChg5 >= 0 ? "up" : "down"} ${Math.abs(eqChg5).toFixed(1)}% on the week` : ""
      }.`,
      body: [
        `Across the scored stories the bullish/bearish split is ${weekly.bullish}↑ / ${weekly.bearish}↓ (net tone ${weekly.score.toFixed(2)}).`,
        macro
          ? `Framed by a ${macro.regime.toUpperCase()} macro regime — ${macro.drivers[0] ?? "mixed signals"}.`
          : `Macro context unavailable this run.`,
        eqChg5 != null
          ? `Index composite is ${pct(eqChg5, 1)} over five sessions (S&P, Nasdaq, Dow, Russell average).`
          : `Weekly index trend unavailable.`,
      ],
      metrics: [
        { label: "Net tone", value: weekly.score.toFixed(2), bias: b },
        { label: "Index 5d", value: pct(eqChg5, 1), bias: eqChg5 == null ? "neutral" : sign(eqChg5 / 3) },
      ],
    });
    signals.push({ label: "Weekly sentiment", bias: b, weight: 1.5, note: `net tone ${weekly.score.toFixed(2)}` });
  }

  // ── 2. Daily sentiment ─────────────────────────────────────────────────
  const daily = windowSentiment(headlines, 24);
  const vix = macro?.series.find((x) => x.id === "VIXCLS") ?? null;
  const vixInst = inst("VIX");
  const vixLevel = vix?.value ?? vixInst?.price ?? null;
  {
    let s = daily.score * 0.7;
    if (eqChg1 != null) s += Math.max(-1, Math.min(1, eqChg1 / 1.5)) * 0.3;
    const b = sign(s);
    sections.push({
      key: "daily",
      title: "Daily Market Sentiment",
      bias: b,
      score: s,
      headline: `Today's tape and headlines lean ${b.toUpperCase()}${vixLevel != null ? ` with VIX at ${vixLevel.toFixed(1)}` : ""}.`,
      body: [
        `${daily.n} stories landed in the last 24h (${daily.bullish}↑ / ${daily.bearish}↓).`,
        eqChg1 != null ? `The major indices are ${pct(eqChg1, 2)} on the day (composite).` : `Intraday index move unavailable.`,
        vixLevel != null
          ? `Volatility regime: VIX ${vixLevel.toFixed(1)} — ${
              vixLevel > 22 ? "elevated, expect wider ranges" : vixLevel < 15 ? "compressed, mean-reversion favoured" : "mid-range"
            }.`
          : `VIX unavailable.`,
      ],
      metrics: [
        { label: "24h tone", value: daily.score.toFixed(2), bias: b },
        { label: "Index 1d", value: pct(eqChg1, 2), bias: eqChg1 == null ? "neutral" : sign(eqChg1 / 1.5) },
        ...(vixLevel != null ? [{ label: "VIX", value: vixLevel.toFixed(1), bias: (vixLevel > 22 ? "bearish" : vixLevel < 15 ? "bullish" : "neutral") as Bias }] : []),
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

  // ── 4. Micro / market structure (instrument breadth) ────────────────────
  {
    const rut = inst("RUT");
    const spx = inst("SPX");
    const leadership =
      rut && spx && rut.chg5 != null && spx.chg5 != null
        ? rut.chg5 > spx.chg5
          ? "small-caps leading (broadening, risk-on)"
          : "mega-caps leading (narrow, defensive)"
        : "leadership unclear";
    const s = breadth ? breadth.score : eqScore;
    const b = sign(s);
    sections.push({
      key: "micro",
      title: "Micro / Market Structure",
      bias: b,
      score: s,
      headline: breadth
        ? `Instrument board reads ${b.toUpperCase()} — ${breadth.riskUp}/${breadth.total} risk proxies risk-on aligned.`
        : eqList.length
        ? `Index trend ${b.toUpperCase()} with ${eqUp}/${eqList.length} benchmarks bullish — ${leadership}.`
        : `Market-structure data unavailable this run.`,
      body: [
        breadth ? `Across the board, ${breadth.riskUp}/${breadth.total} risk assets (equities, crypto, credit, FX vs the dollar; VIX/USD/bonds counted inversely) are aligned risk-on.` : ``,
        eqList.length ? `Index breadth: ${eqUp}/${eqList.length} of the majors are bullish on their own technicals — ${leadership}.` : ``,
        spx && spx.vsMa20 != null ? `S&P is ${spx.vsMa20 >= 0 ? "above" : "below"} its 20-day average by ${pct(spx.vsMa20, 1)}.` : ``,
      ].filter(Boolean),
      metrics: eqList.map((i) => ({ label: i.symbol, value: pct(i.chg5, 1), bias: i.bias })),
    });
    if (breadth) {
      signals.push({ label: "Instrument breadth", bias: breadth.bias, weight: 1.5, note: `${breadth.riskUp}/${breadth.total} risk-on across the board` });
    } else if (eqList.length) {
      signals.push({ label: "Index technicals", bias: b, weight: 1.5, note: `${eqUp}/${eqList.length} benchmarks bullish` });
    }
  }

  // ── 5. Cross-asset confirmation ─────────────────────────────────────────
  {
    const bonds = inst("TLT");
    const credit = inst("HYG");
    const gold = inst("XAUUSD");
    const dollar = inst("DXY");
    const crypto = inst("BTCUSD");
    const oil = inst("CL");
    const bondsUp = (bonds?.chg5 ?? 0) > 0.5;
    const creditUp = (credit?.chg5 ?? 0) > 0;
    const goldUp = (gold?.chg5 ?? 0) > 1;
    const dollarUp = (dollar?.chg5 ?? 0) > 0.5;

    const divergences: string[] = [];
    let confirm = 0;
    if (eqBias === "bullish" && credit) {
      if (creditUp) confirm += 1;
      else divergences.push("equities up but high-yield credit soft — risk rally unconfirmed");
    }
    if (eqBias === "bullish" && bondsUp) divergences.push("bonds bid alongside stocks — a defensive undertone");
    if (eqBias === "bearish" && bondsUp) confirm -= 1; // classic risk-off confirmed
    if (eqBias === "bullish" && goldUp) divergences.push("gold rallying with equities — hedging demand persists");
    if (eqBias === "bullish" && dollarUp) divergences.push("dollar firm into an equity rally — tighter conditions");

    const s = Math.max(-1, Math.min(1, eqScore + confirm * 0.3 - divergences.length * 0.15));
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
        `Crypto risk proxy: BTC ${crypto ? pct(crypto.chg5, 1) + " (5d)" : "unavailable"}; oil ${oil ? pct(oil.chg5, 1) + " (5d)" : "unavailable"}.`,
      ],
      metrics: (["TLT", "HYG", "XAUUSD", "DXY", "CL", "BTCUSD"] as const)
        .map((sym) => inst(sym))
        .filter((x): x is InstrumentSignal => !!x)
        .map((i) => ({ label: i.symbol, value: pct(i.chg5, 1), bias: i.bias })),
    });
    if (eqList.length) signals.push({ label: "Cross-asset", bias: b, weight: 1.5, note: divergences.length ? `${divergences.length} divergence(s)` : "aligned" });
  }

  // ── 6. Options positioning — index dealer gamma (SPY + QQQ) ──────────────
  const levels: ThesisLevels = {
    symbol: "S&P 500 (SPY)",
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
    const reads = await Promise.all(
      ["SPY", "QQQ"].map((s) =>
        gammaRead(s).catch((e) => {
          notices.push({ provider: "CBOE", message: `${s} options skipped — ${(e as Error).message}` });
          return null;
        }),
      ),
    );
    const ok = reads.filter((r): r is GammaRead => !!r);
    const primary = ok.find((r) => r.symbol === "SPY") ?? ok[0] ?? null;

    if (primary) {
      levels.symbol = primary.symbol === "SPY" ? "S&P 500 (SPY)" : primary.symbol;
      levels.spot = primary.spot;
      levels.gammaFlip = primary.flip;
      levels.callWall = primary.callWall;
      levels.putWall = primary.putWall;
      levels.maxPain = primary.pain;
      levels.resistance = primary.callWall;
      levels.support = primary.putWall;
      levels.invalidation = primary.flip;
      levels.dealerRegime = primary.longGamma ? "long" : "short";
    }

    const optScore = ok.length ? avg(ok.map((r) => r.score)) : 0;
    const optBias = sign(optScore);
    const longCount = ok.filter((r) => r.longGamma).length;

    sections.push({
      key: "options",
      title: "Options Positioning — Index Dealer Gamma",
      bias: optBias,
      score: optScore,
      headline: ok.length
        ? `Dealers are ${longCount === ok.length ? "LONG" : longCount === 0 ? "SHORT" : "MIXED"} gamma across ${ok.map((r) => r.symbol).join(" & ")}.`
        : `Index option chains unavailable this run.`,
      body: ok.length
        ? [
            primary && primary.longGamma
              ? `Long-gamma regime: dealer hedging is mean-reverting — expect ranges to hold and dips/rips to fade unless a wall breaks.`
              : `Short-gamma regime: dealer hedging amplifies moves — breakouts run and pullbacks accelerate.`,
            ...ok.map(
              (r) =>
                `${r.symbol}: ${r.longGamma ? "long" : "short"} γ, spot ${r.aboveFlip == null ? "—" : r.aboveFlip ? "above" : "below"} the ${r.flip?.toFixed(0) ?? "—"} flip; walls ${r.putWall?.toFixed(0) ?? "—"}/${r.callWall?.toFixed(0) ?? "—"}.`,
            ),
          ]
        : [`CBOE did not return index chains — dealer-gamma read is skipped.`],
      metrics: ok.map((r) => ({ label: `${r.symbol} flip`, value: r.flip?.toFixed(0) ?? "—", bias: r.longGamma ? "bullish" : "bearish" })),
    });
    if (ok.length) signals.push({ label: "Options positioning", bias: optBias, weight: 1.0, note: `${longCount}/${ok.length} indices long γ` });
  }

  // ── 7. Geopolitics ──────────────────────────────────────────────────────
  const geo = assessGeopolitics(headlines);
  {
    const b: Bias = geo.level === "high" ? "bearish" : "neutral";
    sections.push({
      key: "geopolitics",
      title: "Geopolitical Risk",
      bias: b,
      score: -geo.score,
      headline: `Geopolitical risk reads ${geo.level.toUpperCase()}${geo.themes.length ? ` — ${geo.themes[0].label.toLowerCase()} dominant` : ""}.`,
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

  const directional = signals.filter((s) => s.bias !== "neutral");
  const aligned = directional.filter((s) => biasVal(s.bias) === Math.sign(score)).reduce((a, s) => a + s.weight, 0);
  const dirW = directional.reduce((a, s) => a + s.weight, 0) || 1;
  const agreement = aligned / dirW;
  let conviction = Math.abs(score) * 55 + agreement * 45;
  const dataGaps = notices.filter((n) => /not set|unavailable|skipped|no data|degraded/i.test(n.message)).length;
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
    `Net read on the broad market: ${bias.toUpperCase()} with ${convictionLabel} conviction (${conviction}/100). ` +
    (driver ? `The call is led by ${driver.label.toLowerCase()} (${driver.note}). ` : ``) +
    (counter ? `The main risk to it is ${counter.label.toLowerCase()} pulling the other way. ` : ``) +
    (levels.gammaFlip != null ? `Index options put the line in the sand at the ${levels.gammaFlip.toFixed(0)} gamma flip on ${levels.symbol}.` : ``);

  const tldr: string[] = [
    `Bottom line: ${bias.toUpperCase()} · conviction ${conviction}/100 (${convictionLabel}).`,
    `Weekly tone ${weekly.bias}, daily tone ${daily.bias}.`,
    macro ? `Macro regime ${macro.regime.toUpperCase()}.` : `Macro data offline.`,
    breadth ? `Breadth ${breadth.riskUp}/${breadth.total} risk-on; index composite ${eqBias}.` : `Instrument board offline.`,
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
