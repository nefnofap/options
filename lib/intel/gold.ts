// ────────────────────────────────────────────────────────────────────────────
// GOLD THESIS ENGINE — institutional-grade daily briefing for XAUUSD + Micro
// Gold futures (MGC). Composes the existing zero-key Intel plumbing (Yahoo
// charts via getChart, FRED macro via getMacro, lexicon news via getSentiment,
// headline geopolitics via assessGeopolitics) into a five-layer thesis,
// dual-instrument expected-move engine, 0..100 explainable sub-scores, and a
// website-ready markdown render.
//
// Design contract (mirrors the rest of the Intel section):
//   • getGoldBriefing() NEVER throws — a failing provider records a non-fatal
//     ProviderNotice and the briefing degrades around it.
//   • Facts, inference and forecast are kept separate; the call is auditable.
//   • No directional bias is forced when layers conflict — confidence falls
//     instead, and the conflict is explained (classic gold case: geopolitics
//     bullish but a firm dollar / rising real yields capping the move).
//   • Every conversion is deterministic and validated:
//       XAUUSD  pips  = points * 100
//       MGC     ticks = points / 0.10  (= points * 10)
//       MGC     $/ctr = points * 10
// ────────────────────────────────────────────────────────────────────────────

import { getChart } from "../data";
import type { ChartBar } from "../types";
import { getMacro, getSentiment } from "./data";
import { assessGeopolitics, type GeoRead } from "./geopolitics";
import { calendarToday } from "./tradingeconomics";
import { rsi as calcRsi, macd as calcMacd } from "./indicators";
import type { Bias, ProviderNotice, ScoredHeadline, CalendarEvent, MacroResult } from "./types";
import type {
  GoldBriefing,
  GoldScenario,
  GoldScores,
  InstrumentBlock,
  LayerScore,
  MacroRegime,
  MgcExpectedMove,
  SessionFrame,
  TokyoOpenState,
  Triple,
  XauExpectedMove,
  BriefingMode,
  Horizon,
} from "./gold-types";

// ── Instrument conversion constants (from spec, immutable) ───────────────────
export const XAU_PIPS_PER_POINT = 100; // 1 point = 1.00 price = 100 pips
export const MGC_TICK = 0.1; // minimum tick in USD/oz
export const MGC_TICKS_PER_POINT = 1 / MGC_TICK; // = 10 ticks per point
export const MGC_DOLLARS_PER_POINT = 10; // 10 oz contract → $10 per 1.00 move

// ── small numeric helpers ────────────────────────────────────────────────────
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Map an internal -1..+1 (bullish-for-gold) direction to a 0..100 sub-score. */
const toScore = (dir: number) => round(clamp(50 + clamp(dir, -1, 1) * 50, 0, 100), 0);
const biasOfDir = (dir: number): Bias => (dir > 0.12 ? "bullish" : dir < -0.12 ? "bearish" : "neutral");

// Non-negative, deterministic expected-move triple. Low/high are empirical
// multiples around the base (≈ calm vs expansion). Shared by the daily session
// model and the weekly thesis model.
const mkTriple = (base: number): Triple => ({
  low: round(Math.max(0, base * 0.6), 2),
  base: round(Math.max(0, base), 2),
  high: round(Math.max(0, base * 1.6), 2),
});

// ── Average True Range over OHLC bars (Wilder) ───────────────────────────────
export function atr(bars: ChartBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h;
    const l = bars[i].l;
    const pc = bars[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing.
  let a = mean(tr.slice(0, period));
  for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
  return a;
}

/** Simple moving average of the last `period` closes. */
function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return mean(closes.slice(-period));
}

// ── Session windows in UTC (gold trades ~23h; these frame the liquidity blocks)
const SESSIONS: { name: SessionFrame["name"]; startH: number; endH: number; frac: number }[] = [
  { name: "Tokyo", startH: 0, endH: 8, frac: 0.4 }, // Asia / Manila morning sits here
  { name: "London", startH: 7, endH: 16, frac: 0.62 },
  { name: "New York", startH: 12, endH: 21, frac: 0.66 },
];

function activeSessionName(nowUtcHour: number): SessionFrame["name"] {
  // Overlaps resolve to the later-opening, higher-liquidity desk.
  if (nowUtcHour >= 12 && nowUtcHour < 21) return "New York";
  if (nowUtcHour >= 7 && nowUtcHour < 16) return "London";
  return "Tokyo";
}

// Bucket intraday bars by UTC day, then by session window; return each session's
// (high, low, range) per day plus a VWAP for the most recent occurrence.
function sessionStats(bars: ChartBar[]) {
  const byName: Record<string, { ranges: number[]; last: SessionFrame | null }> = {
    Tokyo: { ranges: [], last: null },
    London: { ranges: [], last: null },
    "New York": { ranges: [], last: null },
  };

  // Group by yyyy-mm-dd (UTC).
  const days = new Map<string, ChartBar[]>();
  for (const b of bars) {
    const d = new Date(b.t * 1000).toISOString().slice(0, 10);
    (days.get(d) ?? days.set(d, []).get(d)!).push(b);
  }
  const dayKeys = [...days.keys()].sort();

  for (const sess of SESSIONS) {
    for (const dk of dayKeys) {
      const inWindow = (days.get(dk) ?? []).filter((b) => {
        const h = new Date(b.t * 1000).getUTCHours();
        return h >= sess.startH && h < sess.endH;
      });
      if (inWindow.length < 2) continue;
      const high = Math.max(...inWindow.map((b) => b.h));
      const low = Math.min(...inWindow.map((b) => b.l));
      const range = high - low;
      if (Number.isFinite(range) && range > 0) byName[sess.name].ranges.push(range);

      // Keep the most recent session occurrence with a volume-weighted price.
      if (dk === dayKeys[dayKeys.length - 1]) {
        const vol = sum(inWindow.map((b) => b.v || 0));
        const vwap =
          vol > 0
            ? sum(inWindow.map((b) => ((b.h + b.l + b.c) / 3) * (b.v || 0))) / vol
            : mean(inWindow.map((b) => b.c));
        byName[sess.name].last = {
          name: sess.name,
          active: false,
          high,
          low,
          range,
          medianRange: null,
          vwap,
        };
      }
    }
  }
  return byName;
}

// ── 1. fetch_market_data() ────────────────────────────────────────────────────
export interface GoldMarketData {
  spotGold: number | null;
  mgcPrice: number | null;
  dailyBars: ChartBar[];
  hourBars: ChartBar[];
  fiveMinBars: ChartBar[];
  dxy: { spot: number | null; chg5: number | null };
  vix: number | null;
  oilChg5: number | null;
  priorDay: { high: number | null; low: number | null; close: number | null };
  overnight: { high: number | null; low: number | null; open: number | null };
  stale: boolean;
  notices: ProviderNotice[];
}

function trend5(bars: ChartBar[]): number | null {
  const c = bars.map((b) => b.c).filter((x) => Number.isFinite(x) && x > 0);
  if (c.length < 6) return null;
  const now = c[c.length - 1];
  const ago = c[c.length - 6];
  return (now / ago - 1) * 100;
}

export async function fetchMarketData(): Promise<GoldMarketData> {
  const notices: ProviderNotice[] = [];
  let stale = false;
  const safeChart = async (sym: string, range: any, interval: any) => {
    try {
      const r = await getChart(sym, range, interval);
      if (r.stale) stale = true;
      return r;
    } catch (e) {
      notices.push({ provider: "Yahoo", message: `${sym} ${interval}: ${(e as Error).message}` });
      return null;
    }
  };

  const [goldD, goldH, gold5, mgcD, dxyD, vixD, oilD] = await Promise.all([
    safeChart("GC=F", "1y", "1d"),
    safeChart("GC=F", "1mo", "1h"),
    safeChart("GC=F", "5d", "15m"),
    safeChart("MGC=F", "5d", "1d"),
    safeChart("DX-Y.NYB", "1mo", "1d"),
    safeChart("^VIX", "1mo", "1d"),
    safeChart("CL=F", "1mo", "1d"),
  ]);

  const dailyBars = goldD?.bars ?? [];
  const hourBars = goldH?.bars ?? [];
  const fiveMinBars = gold5?.bars ?? [];

  const priorDay =
    dailyBars.length >= 2
      ? { high: dailyBars[dailyBars.length - 2].h, low: dailyBars[dailyBars.length - 2].l, close: dailyBars[dailyBars.length - 2].c }
      : { high: null, low: null, close: null };

  // "Overnight" = the most recent Asia window from the intraday series.
  let overnight = { high: null as number | null, low: null as number | null, open: null as number | null };
  if (fiveMinBars.length) {
    const lastDay = new Date(fiveMinBars[fiveMinBars.length - 1].t * 1000).toISOString().slice(0, 10);
    const asia = fiveMinBars.filter((b) => {
      const d = new Date(b.t * 1000);
      return d.toISOString().slice(0, 10) === lastDay && d.getUTCHours() < 8;
    });
    if (asia.length) {
      overnight = {
        high: Math.max(...asia.map((b) => b.h)),
        low: Math.min(...asia.map((b) => b.l)),
        open: asia[0].o,
      };
    }
  }

  return {
    spotGold: goldD?.spot ?? null,
    mgcPrice: mgcD?.spot ?? goldD?.spot ?? null,
    dailyBars,
    hourBars,
    fiveMinBars,
    dxy: { spot: dxyD?.spot ?? null, chg5: dxyD ? trend5(dxyD.bars) : null },
    vix: vixD?.spot ?? null,
    oilChg5: oilD ? trend5(oilD.bars) : null,
    priorDay,
    overnight,
    stale,
    notices,
  };
}

// ── 2. compute_macro_regime() ────────────────────────────────────────────────
// Classifies the macro environment AND maps it to a gold-specific direction.
// Gold's macro driver is not generic risk-on/off: it is the real-rate + dollar
// complex, with a flight-to-quality overlay. Falling real yields / soft dollar /
// dovish Fed / crisis = bullish gold; firm dollar + rising real yields = bearish.
export function computeMacroRegime(
  macro: MacroResult | null,
  md: GoldMarketData,
): { regime: MacroRegime; layer: LayerScore } {
  const drivers: string[] = [];
  let dir = 0; // bullish-for-gold

  const find = (id: string) => macro?.series.find((s) => s.id === id) ?? null;
  const t2 = find("DGS2");
  const t10 = find("DGS10");
  const vixSeries = find("VIXCLS");
  const cpi = find("CPIAUCSL");
  const unrate = find("UNRATE");
  const hy = find("BAMLH0A0HYM2");

  // Dollar — the single biggest gold cross-current.
  const dxyChg = md.dxy.chg5;
  if (dxyChg != null) {
    if (dxyChg > 0.6) {
      dir -= 0.5;
      drivers.push(`Dollar firm (DXY ${dxyChg >= 0 ? "+" : ""}${dxyChg.toFixed(1)}% / 5d) — headwind`);
    } else if (dxyChg < -0.6) {
      dir += 0.5;
      drivers.push(`Dollar softening (DXY ${dxyChg.toFixed(1)}% / 5d) — tailwind`);
    } else {
      drivers.push(`Dollar broadly flat (DXY ${dxyChg.toFixed(1)}% / 5d)`);
    }
  } else {
    drivers.push("DXY trend unavailable — dollar read degraded");
  }

  // Nominal yields as a real-yield proxy (TIPS not wired): a fast back-up in 10Y
  // is a gold headwind; easing yields are supportive.
  if (t10?.change != null) {
    if (t10.change > 0.08) {
      dir -= 0.35;
      drivers.push("10Y yields backing up — real-rate headwind (proxy)");
    } else if (t10.change < -0.08) {
      dir += 0.35;
      drivers.push("10Y yields easing — real-rate tailwind (proxy)");
    }
  }

  // Flight-to-quality overlay.
  const vixLvl = md.vix ?? vixSeries?.value ?? null;
  if (vixLvl != null) {
    if (vixLvl >= 26) {
      dir += 0.35;
      drivers.push(`VIX ${vixLvl.toFixed(1)} — haven bid`);
    } else if (vixLvl < 14) {
      dir -= 0.1;
      drivers.push(`VIX ${vixLvl.toFixed(1)} — calm, haven demand light`);
    }
  }
  if (hy && hy.value > 5) {
    dir += 0.15;
    drivers.push(`HY credit spread elevated (${hy.value.toFixed(2)}%) — stress bid`);
  }

  // Inflation tilt (gold leans bullish into inflationary regimes).
  const inflationHot = cpi?.change != null && cpi.change > 0;
  const curveInverted = t2 && t10 ? t10.value - t2.value < 0 : false;
  const labourSoft = unrate?.change != null && unrate.change > 0.1;

  // ── regime classification ──────────────────────────────────────────────
  let regime: MacroRegime = "mixed / transition";
  const dollarUp = (dxyChg ?? 0) > 0.6;
  const dollarDown = (dxyChg ?? 0) < -0.6;
  const yieldsUp = (t10?.change ?? 0) > 0.08;
  const yieldsDown = (t10?.change ?? 0) < -0.08;
  const crisis = vixLvl != null && vixLvl >= 28;

  if (crisis) regime = "crisis / flight-to-quality";
  else if (dollarUp && yieldsUp) regime = "dollar squeeze";
  else if (yieldsDown && (dollarDown || (dxyChg ?? 0) <= 0)) regime = "dovish liquidity expansion";
  else if (inflationHot && labourSoft) regime = "stagflationary";
  else if (inflationHot && !labourSoft) regime = "reflationary";
  else if (!inflationHot && (vixLvl ?? 0) >= 20) regime = "disinflationary risk-off";
  else if (inflationHot && (vixLvl ?? 0) >= 20) regime = "inflationary risk-off";

  // Regime → gold tilt nudges.
  if (regime === "crisis / flight-to-quality") dir += 0.3;
  if (regime === "dovish liquidity expansion") dir += 0.25;
  if (regime === "stagflationary") dir += 0.2;
  if (regime === "dollar squeeze") dir -= 0.3;
  if (regime === "reflationary") dir -= 0.05;

  if (!macro && dxyChg == null) drivers.push("Macro core (FRED) unavailable — set FRED_API_KEY for full regime detail");

  dir = clamp(dir, -1, 1);
  return {
    regime,
    layer: {
      score: toScore(dir),
      bias: biasOfDir(dir),
      direction: dir,
      headline: `Macro regime reads ${regime}; net ${biasOfDir(dir)} for gold.`,
      drivers: drivers.length ? drivers : ["Insufficient macro data for a confident regime call"],
    },
  };
}

// ── 3. compute_microeconomics() ─────────────────────────────────────────────
// Structural supply-demand backdrop. Treated as slow-moving support/headwind,
// not a timing tool. Without central-bank / ETF / physical feeds wired, we proxy
// the structural trend from gold's position vs its 200-day average and flag the
// missing feeds explicitly.
export function computeMicroeconomics(md: GoldMarketData): LayerScore {
  const drivers: string[] = [];
  let dir = 0;
  const closes = md.dailyBars.map((b) => b.c).filter((x) => Number.isFinite(x) && x > 0);
  const ma200 = sma(closes, Math.min(200, closes.length));
  const ma50 = sma(closes, 50);
  const spot = md.spotGold;

  if (spot != null && ma200 != null) {
    const vs = (spot / ma200 - 1) * 100;
    if (vs > 2) {
      dir += 0.4;
      drivers.push(`Price ${vs.toFixed(1)}% above 200d — structural uptrend (CB/ETF demand proxy)`);
    } else if (vs < -2) {
      dir -= 0.4;
      drivers.push(`Price ${vs.toFixed(1)}% below 200d — structural downtrend`);
    } else {
      drivers.push("Price near 200d — structurally balanced");
    }
  }
  if (spot != null && ma50 != null && ma200 != null && ma50 > ma200) {
    dir += 0.15;
    drivers.push("50d above 200d — long-term demand intact");
  }
  // Central-bank reserve diversification is a persistent structural bid; encode a
  // small standing tilt but keep it explicitly labelled as a narrative prior.
  dir += 0.1;
  drivers.push("Central-bank reserve diversification a standing structural bid (narrative prior)");
  drivers.push("[proxy] ETF flows / physical premia / mine supply feeds not wired — using price-structure proxy");

  dir = clamp(dir, -1, 1);
  return {
    score: toScore(dir),
    bias: biasOfDir(dir),
    direction: dir,
    headline: `Structural backdrop is ${biasOfDir(dir) === "neutral" ? "balanced" : biasOfDir(dir)} for gold.`,
    drivers,
  };
}

// ── 4. compute_flows() ───────────────────────────────────────────────────────
// CTA trend pressure + crowding read from gold's own momentum. Without COT /
// dealer-gamma feeds, momentum and overextension stand in for positioning and
// classify the flow state.
export function computeFlows(md: GoldMarketData): LayerScore & { state: string } {
  const drivers: string[] = [];
  let dir = 0;
  const closes = md.dailyBars.map((b) => b.c).filter((x) => Number.isFinite(x) && x > 0);
  const rsi = calcRsi(closes);
  const macd = calcMacd(closes);
  const ma20 = sma(closes, 20);
  const spot = md.spotGold;

  // CTA trend pressure: MACD histogram + price vs 20d.
  if (macd?.hist != null) {
    if (macd.hist > 0) {
      dir += 0.35;
      drivers.push("MACD histogram positive — CTA trend pressure to the upside");
    } else {
      dir -= 0.35;
      drivers.push("MACD histogram negative — CTA trend pressure to the downside");
    }
  }
  if (spot != null && ma20 != null) {
    dir += spot > ma20 ? 0.15 : -0.15;
    drivers.push(`Price ${spot > ma20 ? "above" : "below"} 20d average`);
  }

  // Crowding / unwind risk from RSI extremes.
  let state = "neutral";
  if (rsi != null) {
    if (rsi >= 75) {
      state = "crowded / vulnerable";
      dir -= 0.1; // trend up but stretched — fade-risk caps conviction
      drivers.push(`RSI ${rsi.toFixed(0)} — crowded long, vulnerable to a flush`);
    } else if (rsi <= 25) {
      state = "liquidation / unwind risk";
      dir += 0.1;
      drivers.push(`RSI ${rsi.toFixed(0)} — washed out, unwind likely complete`);
    } else if (dir > 0.2) {
      state = "supportive";
      drivers.push(`RSI ${rsi.toFixed(0)} — trend supported, not yet stretched`);
    } else if (dir < -0.2) {
      state = "supportive"; // supportive of the (bearish) trend
      drivers.push(`RSI ${rsi.toFixed(0)} — downtrend intact`);
    }
  }
  drivers.push("[proxy] COT / dealer-gamma / ETF-flow feeds not wired — using momentum positioning proxy");

  dir = clamp(dir, -1, 1);
  return {
    score: toScore(dir),
    bias: biasOfDir(dir),
    direction: dir,
    headline: `Flows look ${state}; momentum ${biasOfDir(dir)}.`,
    drivers,
    state,
  };
}

// ── 5. compute_microstructure() ───────────────────────────────────────────────
// Intraday acceptance vs VWAP / prior-day levels, plus an explicit Tokyo-open
// classification.
export function computeMicrostructure(
  md: GoldMarketData,
  sess: Record<string, { ranges: number[]; last: SessionFrame | null }>,
): { layer: LayerScore; tokyo: TokyoOpenState; frames: SessionFrame[] } {
  const drivers: string[] = [];
  let dir = 0;
  const spot = md.spotGold;
  const pd = md.priorDay;

  // Prior-day level interaction.
  if (spot != null && pd.high != null && pd.low != null) {
    if (spot > pd.high) {
      dir += 0.4;
      drivers.push("Trading above prior-day high — bullish acceptance / breakout");
    } else if (spot < pd.low) {
      dir -= 0.4;
      drivers.push("Trading below prior-day low — bearish acceptance / breakdown");
    } else {
      const pos = (spot - pd.low) / Math.max(1e-9, pd.high - pd.low);
      if (pos > 0.66) {
        dir += 0.15;
        drivers.push("Holding the upper third of prior-day range");
      } else if (pos < 0.34) {
        dir -= 0.15;
        drivers.push("Pinned to the lower third of prior-day range");
      } else {
        drivers.push("Mid prior-day range — balance / no edge");
      }
    }
  }

  // VWAP acceptance from the most recent active-or-prior session.
  const order: SessionFrame["name"][] = ["New York", "London", "Tokyo"];
  let vwapFrame: SessionFrame | null = null;
  for (const n of order) if (!vwapFrame && sess[n].last) vwapFrame = sess[n].last;
  if (vwapFrame?.vwap != null && spot != null) {
    if (spot > vwapFrame.vwap) {
      dir += 0.2;
      drivers.push(`Accepted above ${vwapFrame.name} VWAP (${vwapFrame.vwap.toFixed(1)})`);
    } else {
      dir -= 0.2;
      drivers.push(`Rejected below ${vwapFrame.name} VWAP (${vwapFrame.vwap.toFixed(1)})`);
    }
  }

  // ── Tokyo open classification (5-min Asia window) ──────────────────────
  let tokyo: TokyoOpenState = "no-trade / neutral range";
  const tk = sess["Tokyo"].last;
  const on = md.overnight;
  if (tk && spot != null && tk.high != null && tk.low != null) {
    const rng = tk.high - tk.low;
    const tkMedian = median(sess["Tokyo"].ranges.length ? sess["Tokyo"].ranges : [rng]);
    const sweepHigh = on.high != null && tk.high > on.high && spot < on.high;
    const sweepLow = on.low != null && tk.low < on.low && spot > on.low;
    if (sweepHigh || sweepLow) {
      tokyo = "trap / liquidity grab";
      drivers.push(`Tokyo swept the ${sweepHigh ? "overnight high" : "overnight low"} then reversed — liquidity grab`);
    } else if (rng < tkMedian * 0.6) {
      tokyo = "no-trade / neutral range";
      drivers.push("Tokyo range compressed below typical — no-trade / wait for London");
    } else if (spot > tk.high - rng * 0.25) {
      tokyo = "bullish acceptance";
      drivers.push("Tokyo accepting near session highs — bullish");
    } else if (spot < tk.low + rng * 0.25) {
      tokyo = "bearish acceptance";
      drivers.push("Tokyo accepting near session lows — bearish");
    } else if (vwapFrame?.vwap != null && Math.abs(spot - vwapFrame.vwap) < rng * 0.15) {
      tokyo = "rejection / fade";
      drivers.push("Tokyo mean-reverting to VWAP — fade the extremes");
    }
  } else {
    drivers.push("Tokyo session data thin — open classification degraded");
  }

  // Assemble session frames with median ranges attached.
  const frames: SessionFrame[] = SESSIONS.map((s) => {
    const st = sess[s.name];
    const f = st.last ?? { name: s.name, active: false, high: null, low: null, range: null, medianRange: null, vwap: null };
    return { ...f, name: s.name, medianRange: st.ranges.length ? round(median(st.ranges), 1) : null };
  });

  dir = clamp(dir, -1, 1);
  return {
    layer: {
      score: toScore(dir),
      bias: biasOfDir(dir),
      direction: dir,
      headline: `Price structure is ${biasOfDir(dir)}; Tokyo open = ${tokyo}.`,
      drivers: drivers.length ? drivers : ["Intraday structure unavailable"],
    },
    tokyo,
    frames,
  };
}

// ── 6. compute_geopolitical_risk() ───────────────────────────────────────────
// Haven demand from the headline pool, with the explicit caveat that a firm
// dollar / rising real yields can blunt it.
export function computeGeopoliticalRisk(geo: GeoRead, macroDir: number): LayerScore {
  const drivers: string[] = [];
  // Geopolitical stress is bullish-for-gold; saturating gauge.
  let dir = geo.score * 0.9;
  if (geo.themes.length) {
    drivers.push(`Active themes: ${geo.themes.map((t) => `${t.label} (${t.count})`).join(", ")}`);
  } else {
    drivers.push("No acute geopolitical themes in the current headline pool");
  }
  // Conflict explanation: bullish geopolitics vs a bearish macro backdrop.
  if (dir > 0.3 && macroDir < -0.2) {
    drivers.push("Conflict: haven bid is real, but a firm dollar / rising real yields are capping the gold response");
    dir *= 0.7; // discount the haven impulse when the rate/FX complex fights it
  }
  dir = clamp(dir, -1, 1);
  return {
    score: toScore(dir),
    bias: biasOfDir(dir),
    direction: dir,
    headline: `Geopolitical risk ${geo.level}${dir > 0.12 ? " — haven supportive" : ""}.`,
    drivers,
  };
}

// ── event risk ───────────────────────────────────────────────────────────────
function computeEventRisk(events: CalendarEvent[]): { layer: LayerScore; highImpact: number } {
  const high = events.filter((e) => e.importance >= 3).length;
  const med = events.filter((e) => e.importance === 2).length;
  // Higher event risk → score pulled toward 50 (uncertainty), not directional.
  const risk = clamp(high * 0.5 + med * 0.2, 0, 1);
  const drivers: string[] = [];
  if (high) drivers.push(`${high} high-impact event(s) on the calendar today`);
  if (med) drivers.push(`${med} medium-impact event(s) today`);
  if (!high && !med) drivers.push("No major scheduled catalysts today");
  // event_risk sub-score is an uncertainty gauge (0 calm .. 100 acute), not a
  // directional vote; surfaced as 50 + risk magnitude for the scores grid.
  return {
    layer: {
      score: round(50 + risk * 50, 0),
      bias: "neutral",
      direction: 0,
      headline: risk > 0.5 ? "Heavy event risk — fade conviction" : "Light event risk",
      drivers,
    },
    highImpact: high,
  };
}

// ── 7. compute_expected_move() ───────────────────────────────────────────────
// Blended estimate in gold POINTS, shared by both instruments. Sources: ATR(1D),
// a 4H ATR proxy resampled from hourly bars, recent Tokyo/London session
// medians, a volatility-regime multiplier and an event-risk widener. Options
// implied move is used if present (not wired by default → ATR blend).
export function computeExpectedMove(
  md: GoldMarketData,
  sess: Record<string, { ranges: number[]; last: SessionFrame | null }>,
  activeSession: SessionFrame["name"],
  highImpactEvents: number,
): { sessionPts: Triple; dayPts: Triple; atrDaily: number | null } {
  const atrDaily = atr(md.dailyBars, 14);
  const last = md.dailyBars[md.dailyBars.length - 1];
  const recentRange = last ? last.h - last.l : null;

  // 4H ATR proxy: resample hourly bars into 4h buckets, then ATR(period 10).
  let atr4h: number | null = null;
  if (md.hourBars.length >= 20) {
    const buckets: ChartBar[] = [];
    for (let i = 0; i < md.hourBars.length; i += 4) {
      const slice = md.hourBars.slice(i, i + 4);
      if (!slice.length) continue;
      buckets.push({
        t: slice[0].t,
        o: slice[0].o,
        h: Math.max(...slice.map((b) => b.h)),
        l: Math.min(...slice.map((b) => b.l)),
        c: slice[slice.length - 1].c,
        v: sum(slice.map((b) => b.v || 0)),
      });
    }
    atr4h = atr(buckets, 10);
  }

  const tokyoMed = sess["Tokyo"].ranges.length ? median(sess["Tokyo"].ranges) : null;
  const londonMed = sess["London"].ranges.length ? median(sess["London"].ranges) : null;
  const nyMed = sess["New York"].ranges.length ? median(sess["New York"].ranges) : null;

  const sessFrac = SESSIONS.find((s) => s.name === activeSession)!.frac;
  const activeMed =
    activeSession === "Tokyo" ? tokyoMed : activeSession === "London" ? londonMed : nyMed;

  // ── session base: blend the active-session median with an ATR-implied slice ──
  const sessionInputs = [
    activeMed,
    atrDaily != null ? atrDaily * sessFrac : null,
    atr4h,
  ].filter((x): x is number => x != null && x > 0);
  let sessionBase = sessionInputs.length ? mean(sessionInputs) : atrDaily ?? recentRange ?? 0;

  // ── full-day base: blend ATR(1D), the latest realised day range, and the sum
  // of session medians (captures multi-desk participation) ──
  const sessionSum =
    [tokyoMed, londonMed, nyMed].filter((x): x is number => x != null && x > 0).reduce((a, b) => a + b, 0) || null;
  const dayInputs = [atrDaily, recentRange, sessionSum].filter((x): x is number => x != null && x > 0);
  let dayBase = dayInputs.length ? mean(dayInputs) : atrDaily ?? 0;

  // ── volatility-regime multiplier: current ATR vs its 60-bar median ──
  if (md.dailyBars.length > 30) {
    const trs: number[] = [];
    for (let i = 1; i < md.dailyBars.length; i++) {
      const b = md.dailyBars[i];
      const pc = md.dailyBars[i - 1].c;
      trs.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
    }
    const longRun = median(trs.slice(-60));
    if (longRun > 0 && atrDaily != null) {
      const volMult = clamp(atrDaily / longRun, 0.7, 1.5);
      sessionBase *= volMult;
      dayBase *= volMult;
    }
  }

  // ── event-risk widener ──
  if (highImpactEvents > 0) {
    const ev = 1 + Math.min(0.25, highImpactEvents * 0.08);
    sessionBase *= ev;
    dayBase *= ev;
  }

  // Non-negative, deterministic triples (shared builder).
  const mk = mkTriple;

  return { sessionPts: mk(sessionBase), dayPts: mk(dayBase), atrDaily };
}

// ── conversions (deterministic + validated downstream) ───────────────────────
const mulTriple = (t: Triple, k: number): Triple => ({
  low: round(t.low * k, 2),
  base: round(t.base * k, 2),
  high: round(t.high * k, 2),
});

function xauExpectedMove(sessionPts: Triple, dayPts: Triple): XauExpectedMove {
  return {
    session_points: sessionPts,
    session_pips: mulTriple(sessionPts, XAU_PIPS_PER_POINT),
    day_points: dayPts,
    day_pips: mulTriple(dayPts, XAU_PIPS_PER_POINT),
  };
}
function mgcExpectedMove(sessionPts: Triple, dayPts: Triple): MgcExpectedMove {
  return {
    session_points: sessionPts,
    session_ticks: mulTriple(sessionPts, MGC_TICKS_PER_POINT),
    day_points: dayPts,
    day_ticks: mulTriple(dayPts, MGC_TICKS_PER_POINT),
    session_dollars: mulTriple(sessionPts, MGC_DOLLARS_PER_POINT),
    day_dollars: mulTriple(dayPts, MGC_DOLLARS_PER_POINT),
  };
}

// ── levels + invalidation ───────────────────────────────────────────────────
function buildLevels(md: GoldMarketData, spot: number | null, bias: Bias, dayBase: number) {
  const support: number[] = [];
  const resistance: number[] = [];
  const push = (arr: number[], v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) arr.push(round(v, 1));
  };
  if (spot != null) {
    push(md.priorDay.low != null && md.priorDay.low < spot ? support : resistance, md.priorDay.low);
    push(md.priorDay.high != null && md.priorDay.high > spot ? resistance : support, md.priorDay.high);
    push(md.overnight.low != null && md.overnight.low < spot ? support : resistance, md.overnight.low);
    push(md.overnight.high != null && md.overnight.high > spot ? resistance : support, md.overnight.high);
  }
  const dedupSort = (arr: number[], dir: "asc" | "desc") =>
    [...new Set(arr)].sort((a, b) => (dir === "asc" ? a - b : b - a)).slice(0, 3);

  const sup = dedupSort(support, "desc"); // nearest support first
  const res = dedupSort(resistance, "asc"); // nearest resistance first

  // Invalidation sits OUTSIDE the trigger zone: beyond the nearest opposing level
  // by a half-day-move buffer, so a clean break truly voids the bias.
  let invalidation: number | null = null;
  const buf = Math.max(dayBase * 0.5, 1);
  if (spot != null) {
    if (bias === "bullish") invalidation = round((sup[0] ?? spot) - buf, 1);
    else if (bias === "bearish") invalidation = round((res[0] ?? spot) + buf, 1);
    else invalidation = round((sup[0] ?? spot) - buf, 1); // neutral: downside range break
  }
  return { support: sup, resistance: res, invalidation };
}

// ── score_bias() ─────────────────────────────────────────────────────────────
// Weighted blend (Macro 30 / Micro 10 / Flow 20 / Microstructure 25 / Geo 10 /
// Event 5) → bias + 0..100 confidence. Confidence rises with layer agreement and
// signal magnitude; falls on conflict, on heavy event risk, and in a narrow range.
export function scoreBias(
  layers: { macro: LayerScore; micro: LayerScore; flow: LayerScore; micro_structure: LayerScore; geo: LayerScore; event: LayerScore },
  ctx: { highImpactEvents: number; atrDaily: number | null; spot: number | null; narrowRange: boolean; cleanAcceptance: boolean },
): { bias: Bias; confidence: number; net: number } {
  const W = { macro: 0.3, micro: 0.1, flow: 0.2, ms: 0.25, geo: 0.1, event: 0.05 };
  // Directional layers only (event risk is an uncertainty gauge, not a vote).
  const dirs = [
    { d: layers.macro.direction, w: W.macro },
    { d: layers.micro.direction, w: W.micro },
    { d: layers.flow.direction, w: W.flow },
    { d: layers.micro_structure.direction, w: W.ms },
    { d: layers.geo.direction, w: W.geo },
  ];
  const dw = dirs.reduce((a, x) => a + x.w, 0);
  const net = clamp(dirs.reduce((a, x) => a + x.d * x.w, 0) / dw, -1, 1);
  const bias = biasOfDir(net);

  // Agreement: share of directional weight that agrees with the net sign.
  const netSign = Math.sign(net) || 0;
  const agreeW = dirs.filter((x) => Math.sign(x.d) === netSign && netSign !== 0).reduce((a, x) => a + x.w, 0);
  const agreement = dw ? agreeW / dw : 0;

  let confidence = 35 + Math.abs(net) * 45 + agreement * 25; // ≈ 35..105 pre-penalty
  if (ctx.highImpactEvents > 0) confidence -= Math.min(20, ctx.highImpactEvents * 8);
  if (ctx.narrowRange) confidence -= 12;
  if (ctx.cleanAcceptance) confidence += 8;
  if (bias === "neutral") confidence -= 8;
  confidence = round(clamp(confidence, 0, 100), 0);

  return { bias, confidence, net };
}

// ── narrative + scenarios ────────────────────────────────────────────────────
function buildScenarios(
  md: GoldMarketData,
  xau: InstrumentBlock,
  dayBase: number,
  bias: Bias,
): GoldScenario[] {
  const spot = md.spotGold;
  const r0 = xau.levels.resistance[0];
  const s0 = xau.levels.support[0];
  const tgtUp = spot != null ? round(spot + dayBase, 1) : null;
  const tgtDn = spot != null ? round(spot - dayBase, 1) : null;
  return [
    {
      name: "bullish continuation",
      trigger: r0 != null ? `Acceptance above ${r0} (prior-day / overnight high)` : "Break and hold above the session high",
      target: tgtUp != null ? `${tgtUp} (≈ +1 day expected move)` : "+1 day expected move",
      risk: "A firm dollar or a hot yields print stalls the breakout into a fade",
    },
    {
      name: "bearish rejection",
      trigger: s0 != null ? `Loss of ${s0} (prior-day / overnight low) on volume` : "Break below the session low",
      target: tgtDn != null ? `${tgtDn} (≈ -1 day expected move)` : "-1 day expected move",
      risk: "A haven headline or soft data snaps price back above VWAP",
    },
    {
      name: "neutral chop",
      trigger: "Price oscillates between the prior-day high and low with no acceptance",
      implication: "Stand down or fade the range edges back to VWAP; size down",
      risk: "A scheduled catalyst breaks the balance abruptly — don't anchor to the range",
    },
  ];
}

// ── format_markdown() ────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(dp);
const tri = (t: Triple, dp = 0) => `${fmt(t.low, dp)} / ${fmt(t.base, dp)} / ${fmt(t.high, dp)}`;

export function formatMarkdown(b: Omit<GoldBriefing, "markdown">): string {
  const badge = b.bias.toUpperCase();
  const x = b.xauusd;
  const m = b.mgc;
  const L = (arr: number[]) => (arr.length ? arr.join(" · ") : "—");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const near = cap(b.horizon.near); // "Session" | "Day"
  const far = cap(b.horizon.far); // "Day" | "Week"
  const weekly = b.mode === "weekly";
  const title = weekly ? "# Gold Weekly Thesis — XAUUSD / MGC (week ahead)" : "# Gold Daily Briefing — XAUUSD / MGC";
  const subline = weekly
    ? `_${b.timestamp} · ${b.period_label} · markets closed (weekend)_`
    : `_${b.timestamp} · ${b.active_session} session · Tokyo open: ${b.tokyo_open}_`;
  const briefLabel = weekly ? "**Week-ahead brief.**" : "**Pre-market brief.**";
  return `${title}

**Bias:** ${badge}  ·  **Confidence:** ${b.confidence}/100  ·  **Regime:** ${b.macro_regime}
${subline}

${b.macro_thesis}

${briefLabel} ${b.pre_market_brief}

### XAUUSD  (spot ${fmt(x.spot)})
| | low / base / high |
|---|---|
| ${near} move (points) | ${tri(x.expected_move.session_points, 1)} |
| ${near} move (pips) | ${tri(x.expected_move.session_pips, 0)} |
| ${far} move (points) | ${tri(x.expected_move.day_points, 1)} |
| ${far} move (pips) | ${tri(x.expected_move.day_pips, 0)} |
| Support | ${L(x.levels.support)} |
| Resistance | ${L(x.levels.resistance)} |
| Invalidation | ${fmt(x.invalidation_level)} |

### MGC — Micro Gold  (price ${fmt(m.spot)})
| | low / base / high |
|---|---|
| ${near} move (points) | ${tri(m.expected_move.session_points, 1)} |
| ${near} move (ticks) | ${tri(m.expected_move.session_ticks, 0)} |
| ${near} move ($/contract) | ${tri(m.expected_move.session_dollars, 0)} |
| ${far} move (points) | ${tri(m.expected_move.day_points, 1)} |
| ${far} move (ticks) | ${tri(m.expected_move.day_ticks, 0)} |
| ${far} move ($/contract) | ${tri(m.expected_move.day_dollars, 0)} |
| Support | ${L(m.levels.support)} |
| Resistance | ${L(m.levels.resistance)} |
| Invalidation | ${fmt(m.invalidation_level)} |

### Drivers
${b.drivers.map((d) => `- ${d}`).join("\n")}

### Scenario map
${b.scenarios
  .map((s) => `- **${s.name}** — trigger: ${s.trigger}. ${s.target ? `Target: ${s.target}. ` : ""}${s.implication ? `${s.implication}. ` : ""}Risk: ${s.risk}`)
  .join("\n")}

### Scores (0–100, 50 = neutral; event risk = uncertainty gauge)
macro ${b.scores.macro} · micro ${b.scores.microeconomics} · flow ${b.scores.flow} · microstructure ${b.scores.microstructure} · geopolitical ${b.scores.geopolitical} · event risk ${b.scores.event_risk}

_Data freshness — market: ${b.data_freshness.market_data}; macro: ${b.data_freshness.macro_data}; news: ${b.data_freshness.news_data}._
`;
}

// ── weekend detection + weekly thesis machinery ─────────────────────────────
// Gold futures are shut across the weekend, so an intraday "daily" brief makes
// no sense on Sat/Sun. Instead we still gather the feeds that DO update on
// weekends (news, geopolitics, FRED macro) and frame a forward-looking WEEKLY
// thesis off the prior week's range and a weekly expected move.
export function marketModeFor(now: Date): BriefingMode {
  const day = now.getUTCDay(); // 0 = Sun … 6 = Sat
  return day === 0 || day === 6 ? "weekly" : "daily";
}

// ISO-8601 week key (year + week number), Thursday-anchored.
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Aggregate daily bars into weekly OHLCV bars (chronological).
function resampleWeekly(daily: ChartBar[]): ChartBar[] {
  const groups = new Map<string, ChartBar[]>();
  for (const b of daily) {
    const k = isoWeekKey(new Date(b.t * 1000));
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(b);
  }
  const weeks: ChartBar[] = [];
  for (const [, bars] of groups) {
    if (!bars.length) continue;
    weeks.push({
      t: bars[0].t,
      o: bars[0].o,
      h: Math.max(...bars.map((b) => b.h)),
      l: Math.min(...bars.map((b) => b.l)),
      c: bars[bars.length - 1].c,
      v: sum(bars.map((b) => b.v || 0)),
    });
  }
  return weeks.sort((a, b) => a.t - b.t);
}

interface PriorWeek {
  high: number;
  low: number;
  close: number;
  open: number;
}
// On a weekend the most recent weekly bar IS the just-finished trading week.
function lastWeek(weekly: ChartBar[]): PriorWeek | null {
  if (!weekly.length) return null;
  const w = weekly[weekly.length - 1];
  return { high: w.h, low: w.l, close: w.c, open: w.o };
}

// Weekly expected move. `near` = a typical day in the week ahead (daily ATR);
// `far` = the week itself (weekly ATR blended with the last realised week).
export function computeWeeklyExpectedMove(
  daily: ChartBar[],
  weekly: ChartBar[],
  highImpactWeek: number,
): { nearPts: Triple; farPts: Triple; atrWeekly: number | null; atrDaily: number | null } {
  const atrDaily = atr(daily, 14);
  const atrWeekly = weekly.length >= 4 ? atr(weekly, Math.min(14, weekly.length - 1)) : null;
  const realisedWeek = weekly.length ? weekly[weekly.length - 1].h - weekly[weekly.length - 1].l : null;

  const farInputs = [atrWeekly, realisedWeek].filter((x): x is number => x != null && x > 0);
  let farBase = farInputs.length ? mean(farInputs) : atrDaily != null ? atrDaily * Math.sqrt(5) : 0;
  let nearBase = atrDaily ?? (atrWeekly != null ? atrWeekly / Math.sqrt(5) : 0);

  // Event-risk widener spread across the week (softer than the single-day case).
  if (highImpactWeek > 0) {
    const ev = 1 + Math.min(0.3, highImpactWeek * 0.05);
    farBase *= ev;
    nearBase *= ev;
  }
  return { nearPts: mkTriple(nearBase), farPts: mkTriple(farBase), atrWeekly, atrDaily };
}

// Weekly structure read — replaces the intraday microstructure layer on weekends.
// Uses position within the prior-week range, the prior-week close location, and
// price vs a 10-week average. Returns a layer plus a plain-language week state.
export function computeWeeklyStructure(
  daily: ChartBar[],
  weekly: ChartBar[],
  spot: number | null,
): { layer: LayerScore; weekState: string } {
  const drivers: string[] = [];
  let dir = 0;
  const pw = lastWeek(weekly);
  let weekState = "inside prior-week range";

  if (spot != null && pw) {
    const span = Math.max(1e-9, pw.high - pw.low);
    if (spot > pw.high) {
      dir += 0.4;
      weekState = "above prior-week high";
      drivers.push("Above prior-week high — weekly breakout in play");
    } else if (spot < pw.low) {
      dir -= 0.4;
      weekState = "below prior-week low";
      drivers.push("Below prior-week low — weekly breakdown in play");
    } else {
      const pos = (spot - pw.low) / span;
      if (pos > 0.66) {
        dir += 0.15;
        drivers.push("Holding the upper third of the prior-week range");
      } else if (pos < 0.34) {
        dir -= 0.15;
        drivers.push("Pinned to the lower third of the prior-week range");
      } else {
        drivers.push("Mid prior-week range — weekly balance");
      }
    }
    // Where the prior week closed inside its own range.
    if (pw.close > pw.high - span * 0.25) {
      dir += 0.1;
      drivers.push("Prior week closed in its upper quartile — momentum up");
    } else if (pw.close < pw.low + span * 0.25) {
      dir -= 0.1;
      drivers.push("Prior week closed in its lower quartile — momentum down");
    }
  } else {
    drivers.push("Prior-week range unavailable — weekly structure degraded");
  }

  // Weekly trend filter.
  const wc = weekly.map((b) => b.c);
  const wma = sma(wc, Math.min(10, wc.length));
  if (spot != null && wma != null) {
    dir += spot > wma ? 0.15 : -0.15;
    drivers.push(`Price ${spot > wma ? "above" : "below"} the 10-week average`);
  }
  drivers.push("Intraday session structure n/a over the weekend — using weekly range / close");

  dir = clamp(dir, -1, 1);
  return {
    layer: {
      score: toScore(dir),
      bias: biasOfDir(dir),
      direction: dir,
      headline: `Weekly structure ${biasOfDir(dir)}; ${weekState}.`,
      drivers,
    },
    weekState,
  };
}

// Weekly support/resistance from the last two weekly bars; invalidation beyond.
function buildWeeklyLevels(weekly: ChartBar[], spot: number | null, bias: Bias, weekBase: number) {
  const support: number[] = [];
  const resistance: number[] = [];
  const push = (arr: number[], v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) arr.push(round(v, 1));
  };
  const pw = lastWeek(weekly);
  const pw2 = weekly.length >= 2 ? weekly[weekly.length - 2] : null;
  if (spot != null) {
    if (pw) {
      push(pw.low < spot ? support : resistance, pw.low);
      push(pw.high > spot ? resistance : support, pw.high);
    }
    if (pw2) {
      push(pw2.l < spot ? support : resistance, pw2.l);
      push(pw2.h > spot ? resistance : support, pw2.h);
    }
  }
  const dedupSort = (arr: number[], dir: "asc" | "desc") =>
    [...new Set(arr)].sort((a, b) => (dir === "asc" ? a - b : b - a)).slice(0, 3);
  const sup = dedupSort(support, "desc");
  const res = dedupSort(resistance, "asc");

  let invalidation: number | null = null;
  const buf = Math.max(weekBase * 0.5, 1);
  if (spot != null) {
    if (bias === "bullish") invalidation = round((sup[0] ?? spot) - buf, 1);
    else if (bias === "bearish") invalidation = round((res[0] ?? spot) + buf, 1);
    else invalidation = round((sup[0] ?? spot) - buf, 1);
  }
  return { support: sup, resistance: res, invalidation };
}

function buildWeeklyScenarios(
  spot: number | null,
  res0: number | undefined,
  sup0: number | undefined,
  weekBase: number,
  _bias: Bias,
): GoldScenario[] {
  const tgtUp = spot != null ? round(spot + weekBase, 1) : null;
  const tgtDn = spot != null ? round(spot - weekBase, 1) : null;
  return [
    {
      name: "weekly continuation higher",
      trigger: res0 != null ? `Weekly acceptance above ${res0} (prior-week high)` : "Break and hold above the prior-week high",
      target: tgtUp != null ? `${tgtUp} (≈ +1 weekly expected move)` : "+1 weekly expected move",
      risk: "A firmer dollar or hawkish data through the week caps the breakout",
    },
    {
      name: "weekly rejection lower",
      trigger: sup0 != null ? `Weekly close back below ${sup0} (prior-week low)` : "Weekly close below the prior-week low",
      target: tgtDn != null ? `${tgtDn} (≈ -1 weekly expected move)` : "-1 weekly expected move",
      risk: "A weekend haven catalyst gaps price back up on the Asia open",
    },
    {
      name: "weekly range / rotation",
      trigger: "Price rotates between the prior-week high and low with no weekly acceptance",
      implication: "Trade the range edges, stand aside mid-range; let the week-ahead catalysts resolve it",
      risk: "A scheduled catalyst breaks the balance — don't anchor to the range",
    },
  ];
}

// Week-ahead event risk: count high/medium-impact items dated within the next 7
// days (falls back to counting all returned rows if dates don't parse).
function computeEventRiskWeekly(events: CalendarEvent[]): { layer: LayerScore; highImpact: number } {
  const now = Date.now();
  const horizon = now + 7 * 86_400_000;
  const inWindow = events.filter((e) => {
    const t = Date.parse(e.time);
    return Number.isNaN(t) ? true : t >= now - 86_400_000 && t <= horizon;
  });
  const high = inWindow.filter((e) => e.importance >= 3).length;
  const med = inWindow.filter((e) => e.importance === 2).length;
  const risk = clamp(high * 0.35 + med * 0.12, 0, 1);
  const drivers: string[] = [];
  if (high) drivers.push(`${high} high-impact event(s) in the week ahead`);
  if (med) drivers.push(`${med} medium-impact event(s) in the week ahead`);
  if (!high && !med) drivers.push("Light scheduled calendar in the week ahead");
  return {
    layer: {
      score: round(50 + risk * 50, 0),
      bias: "neutral",
      direction: 0,
      headline: risk > 0.5 ? "Heavy week-ahead event risk — size down early" : "Manageable week-ahead event risk",
      drivers,
    },
    highImpact: high,
  };
}

// ── orchestrator: getGoldBriefing() ──────────────────────────────────────────
// Forms a DAILY session brief on weekdays and a WEEKLY thesis over the weekend
// (auto by UTC day; override with opts.mode). News, geopolitics and FRED macro
// are gathered in both modes — that is what keeps the engine "gathering news on
// the weekend" even though the futures tape is shut.
export async function getGoldBriefing(opts?: { mode?: BriefingMode }): Promise<GoldBriefing> {
  const notices: ProviderNotice[] = [];
  const mode: BriefingMode = opts?.mode ?? marketModeFor(new Date());
  const weekly = mode === "weekly";

  const [md, macro, sentiment, events] = await Promise.all([
    fetchMarketData(),
    getMacro().catch(() => null),
    getSentiment().catch(() => null),
    calendarToday().catch((e) => {
      notices.push({ provider: "TradingEconomics", message: (e as Error).message });
      return [] as CalendarEvent[];
    }),
  ]);
  notices.push(...md.notices);
  if (macro) notices.push(...macro.notices);
  if (sentiment) notices.push(...sentiment.notices);

  const headlines: ScoredHeadline[] = sentiment?.headlines ?? [];
  const geo = assessGeopolitics(headlines);

  // Reference session statistics (used for the daily microstructure read and as
  // a reference table in weekly mode).
  const sess = sessionStats(md.hourBars);

  // Direction layers shared by both modes.
  const { regime, layer: macroLayer } = computeMacroRegime(macro, md);
  const microLayer = computeMicroeconomics(md);
  const flowLayer = computeFlows(md);
  const geoLayer = computeGeopoliticalRisk(geo, macroLayer.direction);

  // Mode-specific pieces.
  let msLayer: LayerScore;
  let tokyo: TokyoOpenState;
  let frames: SessionFrame[];
  let activeSession: GoldBriefing["active_session"];
  let nearPts: Triple;
  let farPts: Triple;
  let atrDaily: number | null;
  let eventLayer: LayerScore;
  let highImpact: number;
  let narrowRange: boolean;
  let cleanAcceptance: boolean;
  let horizon: Horizon;
  let period_label: string;

  const weeklyBars = resampleWeekly(md.dailyBars);

  if (weekly) {
    const struct = computeWeeklyStructure(md.dailyBars, weeklyBars, md.spotGold);
    msLayer = struct.layer;
    tokyo = "no-trade / neutral range";
    const ev = computeEventRiskWeekly(events);
    eventLayer = ev.layer;
    highImpact = ev.highImpact;
    const wem = computeWeeklyExpectedMove(md.dailyBars, weeklyBars, highImpact);
    nearPts = wem.nearPts;
    farPts = wem.farPts;
    atrDaily = wem.atrDaily;

    const { frames: refFrames } = computeMicrostructure(md, sess);
    refFrames.forEach((f) => (f.active = false));
    frames = refFrames;
    activeSession = "Weekend";

    const pw = lastWeek(weeklyBars);
    narrowRange = wem.atrWeekly != null && pw != null ? pw.high - pw.low < wem.atrWeekly * 0.6 : false;
    cleanAcceptance = struct.weekState === "above prior-week high" || struct.weekState === "below prior-week low";
    horizon = { near: "day", far: "week" };
    period_label = "Weekly thesis — week ahead";
  } else {
    const ms = computeMicrostructure(md, sess);
    msLayer = ms.layer;
    tokyo = ms.tokyo;
    frames = ms.frames;
    const nowUtcHour = new Date().getUTCHours();
    activeSession = activeSessionName(nowUtcHour);
    frames.forEach((f) => (f.active = f.name === activeSession));

    const ev = computeEventRisk(events);
    eventLayer = ev.layer;
    highImpact = ev.highImpact;

    const em = computeExpectedMove(md, sess, activeSession, highImpact);
    nearPts = em.sessionPts;
    farPts = em.dayPts;
    atrDaily = em.atrDaily;

    narrowRange =
      em.atrDaily != null && md.priorDay.high != null && md.priorDay.low != null
        ? md.priorDay.high - md.priorDay.low < em.atrDaily * 0.6
        : false;
    cleanAcceptance = tokyo === "bullish acceptance" || tokyo === "bearish acceptance";
    horizon = { near: "session", far: "day" };
    period_label = "Daily session brief";
  }

  const farBase = farPts.base;

  const { bias, confidence } = scoreBias(
    { macro: macroLayer, micro: microLayer, flow: flowLayer, micro_structure: msLayer, geo: geoLayer, event: eventLayer },
    { highImpactEvents: highImpact, atrDaily, spot: md.spotGold, narrowRange, cleanAcceptance },
  );

  // Instrument blocks. near→session_* slots, far→day_* slots (labels via horizon).
  const xLevels = weekly
    ? buildWeeklyLevels(weeklyBars, md.spotGold, bias, farBase)
    : buildLevels(md, md.spotGold, bias, farBase);
  const mLevels = weekly
    ? buildWeeklyLevels(weeklyBars, md.mgcPrice, bias, farBase)
    : buildLevels({ ...md, priorDay: md.priorDay }, md.mgcPrice, bias, farBase);
  const xauusd: InstrumentBlock & { expected_move: XauExpectedMove } = {
    spot: md.spotGold,
    expected_move: xauExpectedMove(nearPts, farPts),
    invalidation_level: xLevels.invalidation,
    levels: { support: xLevels.support, resistance: xLevels.resistance },
  };
  const mgc: InstrumentBlock & { expected_move: MgcExpectedMove } = {
    spot: md.mgcPrice,
    expected_move: mgcExpectedMove(nearPts, farPts),
    invalidation_level: mLevels.invalidation,
    levels: { support: mLevels.support, resistance: mLevels.resistance },
  };

  // ── narrative ──
  const macro_thesis =
    `${macroLayer.headline} ${macroLayer.drivers.slice(0, 3).join("; ")}. ` +
    `For gold the operative cross-currents are the dollar and the real-rate complex: ` +
    `${md.dxy.chg5 != null ? `DXY ${md.dxy.chg5 >= 0 ? "+" : ""}${md.dxy.chg5.toFixed(1)}% over five sessions` : "the dollar trend is unavailable"}, ` +
    `with the haven overlay ${md.vix != null ? `at VIX ${md.vix.toFixed(1)}` : "unread"}.`;
  const microeconomics_thesis = `${microLayer.headline} ${microLayer.drivers.join("; ")}.`;
  const flow_thesis = `${flowLayer.headline} ${flowLayer.drivers.slice(0, 3).join("; ")}.`;
  const microstructure_thesis = `${msLayer.headline} ${msLayer.drivers.slice(0, 4).join("; ")}.`;
  const geopolitical_thesis = `${geoLayer.headline} ${geoLayer.drivers.join("; ")}.`;

  const pre_market_brief = weekly
    ? `Week-ahead read is ${bias.toUpperCase()} at ${confidence}/100 confidence. ` +
      `${cleanAcceptance ? "Price enters the week breaking the prior-week range" : narrowRange ? "Price closed the week coiled in a narrow range" : "Price is mid weekly range"}; ` +
      `${highImpact ? `${highImpact} high-impact event(s) across the week argue for staged risk` : "a light scheduled calendar ahead"}. ` +
      `XAUUSD base weekly move ≈ ${farPts.base.toFixed(1)} pts (${(farPts.base * XAU_PIPS_PER_POINT).toFixed(0)} pips); ` +
      `weekly invalidation ${xauusd.invalidation_level ?? "—"}.`
    : `Net read is ${bias.toUpperCase()} at ${confidence}/100 confidence into the ${activeSession} session. ` +
      `${cleanAcceptance ? "Price is accepting directionally" : narrowRange ? "Price is coiled in a narrow range" : "Price is two-way"}; ` +
      `${highImpact ? `${highImpact} high-impact event(s) today argue for lighter size` : "no major scheduled catalysts today"}. ` +
      `XAUUSD base session move ≈ ${nearPts.base.toFixed(1)} pts (${(nearPts.base * XAU_PIPS_PER_POINT).toFixed(0)} pips); ` +
      `invalidation ${xauusd.invalidation_level ?? "—"}.`;

  // Drivers: the most decisive line from each layer.
  const drivers = [
    macroLayer.drivers[0],
    flowLayer.drivers[0],
    msLayer.drivers[0],
    geoLayer.drivers[0],
    eventLayer.drivers[0],
  ].filter(Boolean) as string[];

  const scenarios = weekly
    ? buildWeeklyScenarios(md.spotGold, xauusd.levels.resistance[0], xauusd.levels.support[0], farBase, bias)
    : buildScenarios(md, xauusd, farBase, bias);

  const scores: GoldScores = {
    macro: macroLayer.score,
    microeconomics: microLayer.score,
    flow: flowLayer.score,
    microstructure: msLayer.score,
    geopolitical: geoLayer.score,
    event_risk: eventLayer.score,
  };

  const freshLabel = md.stale
    ? weekly
      ? "weekend — last session served from cache (market closed)"
      : "stale (served from cache — Yahoo throttled)"
    : weekly
      ? "weekend — prior-week close (market closed)"
      : "live";
  const base: Omit<GoldBriefing, "markdown"> = {
    timestamp: new Date().toISOString(),
    instrument: "XAUUSD / MGC",
    mode,
    period_label,
    horizon,
    bias,
    confidence,
    macro_regime: regime,
    macro_thesis,
    microeconomics_thesis,
    flow_thesis,
    microstructure_thesis,
    geopolitical_thesis,
    pre_market_brief,
    tokyo_open: tokyo,
    active_session: activeSession,
    sessions: frames,
    xauusd,
    mgc,
    scores,
    layers: {
      macro: macroLayer,
      microeconomics: microLayer,
      flow: flowLayer,
      microstructure: msLayer,
      geopolitical: geoLayer,
      event_risk: eventLayer,
    },
    drivers,
    scenarios,
    data_freshness: {
      market_data: freshLabel,
      macro_data: macro ? `FRED ${macro.asOf}` : "unavailable",
      news_data: sentiment ? `${sentiment.engine} · ${headlines.length} headlines` : "unavailable",
    },
    notices,
  };

  return { ...base, markdown: formatMarkdown(base) };
}
