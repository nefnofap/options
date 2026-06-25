// Shared types for the Intel section. Kept separate from lib/types.ts (which is
// options-chain specific) but follows the same flat, JSON-serialisable style.

export type Bias = "bullish" | "bearish" | "neutral";
export type Regime = "risk-on" | "risk-off" | "neutral";

export interface ProviderNotice {
  // Non-fatal info surfaced to the UI: which provider is missing a key, etc.
  provider: string;
  message: string;
  varName?: string;
}

// ── Macro ────────────────────────────────────────────────────────────────
export interface MacroSeries {
  id: string; // FRED series id or our synthetic id
  label: string;
  value: number;
  prev: number | null;
  change: number | null; // value - prev
  unit: string;
  asOf: string; // YYYY-MM-DD
  source: string;
}

export interface MacroResult {
  asOf: string;
  regime: Regime;
  regimeScore: number; // -1 (risk-off) .. +1 (risk-on)
  drivers: string[]; // human-readable reasons for the regime call
  series: MacroSeries[];
  notices: ProviderNotice[];
}

// ── Sentiment ──────────────────────────────────────────────────────────────
export interface ScoredHeadline {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  score: number; // -1 .. +1
  bias: Bias;
}

export interface SentimentResult {
  asOf: string;
  score: number; // aggregate -1 .. +1
  bias: Bias;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  drivers: string[]; // top sentiment-moving words seen
  headlines: ScoredHeadline[];
  engine: "lexicon" | "apify";
  notices: ProviderNotice[];
}

// ── Pre-market brief ─────────────────────────────────────────────────────
export interface CalendarEvent {
  time: string; // ISO or HH:MM
  country: string;
  event: string;
  importance: number; // 1..3
  actual?: string;
  forecast?: string;
  previous?: string;
}

export interface BriefResult {
  asOf: string;
  generatedAt: string;
  summary: string[]; // bullet lines for the brief
  headlines: ScoredHeadline[];
  events: CalendarEvent[];
  regime: Regime | null;
  notices: ProviderNotice[];
}

// ── Instruments tracker ────────────────────────────────────────────────────
export interface InstrumentSignal {
  symbol: string; // display symbol, e.g. "EUR/USD"
  name: string;
  price: number | null;
  changePct: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bias: Bias;
  level: string; // key level / note
  source: string;
  error?: string;
}

export interface InstrumentsResult {
  asOf: string;
  instruments: InstrumentSignal[];
  notices: ProviderNotice[];
}

// ── Market thesis ─────────────────────────────────────────────────────────
export type Conviction = "high" | "medium" | "low";

// One thematic section of the thesis (weekly, daily, macro, micro, geopolitics…).
export interface ThesisSection {
  key: string;
  title: string;
  bias: Bias;
  score: number; // -1 .. +1
  headline: string; // one-line summary of the section
  body: string[]; // narrative bullets / paragraphs
  metrics?: { label: string; value: string; bias?: Bias }[];
}

// Actionable price geography pulled from our own options chain (zero-key, CBOE).
export interface ThesisLevels {
  symbol: string;
  spot: number | null;
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  maxPain: number | null;
  resistance: number | null;
  support: number | null;
  invalidation: number | null; // level that would void the bottom-line bias
  dealerRegime: "long" | "short" | null;
}

export interface CatalystItem {
  when: string; // date or HH:MM
  label: string;
  country: string;
  importance: number; // 1..3
}

// One vote in the bottom-line synthesis, surfaced so the call is auditable.
export interface ThesisSignal {
  label: string;
  bias: Bias;
  weight: number;
  note: string;
}

export interface ThesisResult {
  asOf: string;
  generatedAt: string;
  bias: Bias; // bottom-line directional call
  score: number; // -1 .. +1 weighted vote
  conviction: number; // 0 .. 100
  convictionLabel: Conviction;
  thesis: string; // 2-3 sentence bottom line
  tldr: string[]; // bullet summary
  sections: ThesisSection[];
  levels: ThesisLevels;
  catalysts: CatalystItem[];
  headlines: ScoredHeadline[]; // top daily news, with links
  signals: ThesisSignal[]; // the vote breakdown
  notices: ProviderNotice[];
}

// ── Impact matrix ───────────────────────────────────────────────────────────
export interface ImpactFactor {
  key: string;
  label: string; // e.g. "USD ↑"
  direction: "up" | "down";
  effects: { asset: string; impact: "up" | "down"; note: string }[];
}
