// Types for the Gold Thesis Engine (XAUUSD + Micro Gold futures, MGC).
// Flat and JSON-serialisable, matching the rest of the Intel section. The
// GoldBriefing object IS the API contract: it carries the layered theses, the
// dual-instrument expected-move blocks, the 0..100 sub-scores, and a
// website-ready markdown render so a front-end card and a detail view can be
// built from one payload.

import type { Bias, ProviderNotice } from "./types";

export type MacroRegime =
  | "disinflationary risk-off"
  | "inflationary risk-off"
  | "reflationary"
  | "stagflationary"
  | "dollar squeeze"
  | "dovish liquidity expansion"
  | "crisis / flight-to-quality"
  | "mixed / transition";

export type FlowState = "supportive" | "neutral" | "crowded / vulnerable" | "liquidation / unwind risk";

export type TokyoOpenState =
  | "bullish acceptance"
  | "bearish acceptance"
  | "rejection / fade"
  | "trap / liquidity grab"
  | "no-trade / neutral range";

// A 0..100 sub-score where 50 is neutral, >50 leans bullish-for-gold and <50
// bearish-for-gold. Carries the directional reasons that produced it so every
// score is explainable rather than a black box.
export interface LayerScore {
  score: number; // 0..100
  bias: Bias;
  direction: number; // internal -1..+1 (bullish-for-gold positive)
  headline: string;
  drivers: string[];
}

export interface Triple {
  low: number;
  base: number;
  high: number;
}

export interface XauExpectedMove {
  session_points: Triple;
  session_pips: Triple; // pips = points * 100
  day_points: Triple;
  day_pips: Triple;
}

export interface MgcExpectedMove {
  session_points: Triple;
  session_ticks: Triple; // ticks = points / 0.10
  day_points: Triple;
  day_ticks: Triple;
  session_dollars: Triple; // $/contract = points * 10
  day_dollars: Triple;
}

export interface InstrumentBlock {
  spot: number | null;
  expected_move: XauExpectedMove | MgcExpectedMove;
  invalidation_level: number | null;
  levels: { support: number[]; resistance: number[] };
}

export interface GoldScores {
  macro: number;
  microeconomics: number;
  flow: number;
  microstructure: number;
  geopolitical: number;
  event_risk: number;
}

export interface GoldScenario {
  name: string;
  trigger: string;
  target?: string;
  implication?: string;
  risk: string;
}

export interface DataFreshness {
  market_data: string;
  macro_data: string;
  news_data: string;
}

// One session's measured behaviour, surfaced so the microstructure call is
// auditable rather than asserted.
export interface SessionFrame {
  name: "Tokyo" | "London" | "New York";
  active: boolean;
  high: number | null;
  low: number | null;
  range: number | null;
  medianRange: number | null;
  vwap: number | null;
}

export interface GoldBriefing {
  timestamp: string;
  instrument: "XAUUSD / MGC";
  bias: Bias;
  confidence: number; // 0..100

  macro_regime: MacroRegime;
  macro_thesis: string;
  microeconomics_thesis: string;
  flow_thesis: string;
  microstructure_thesis: string;
  geopolitical_thesis: string;
  pre_market_brief: string;

  tokyo_open: TokyoOpenState;
  active_session: "Tokyo" | "London" | "New York";
  sessions: SessionFrame[];

  xauusd: InstrumentBlock & { expected_move: XauExpectedMove };
  mgc: InstrumentBlock & { expected_move: MgcExpectedMove };

  scores: GoldScores;
  layers: {
    macro: LayerScore;
    microeconomics: LayerScore;
    flow: LayerScore;
    microstructure: LayerScore;
    geopolitical: LayerScore;
    event_risk: LayerScore;
  };

  drivers: string[];
  scenarios: GoldScenario[];

  markdown: string; // website-ready render of this same briefing
  data_freshness: DataFreshness;
  notices: ProviderNotice[];
}
