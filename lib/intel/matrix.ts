// Static instrument-impact matrix: what each macro factor tends to push around.
// Pure data — consumed directly by the (client) Matrix view, no API needed.

import type { ImpactFactor } from "./types";

export const IMPACT_MATRIX: ImpactFactor[] = [
  {
    key: "usd",
    label: "USD ↑",
    direction: "up",
    effects: [
      { asset: "US Exports", impact: "down", note: "Stronger dollar makes US goods pricier abroad" },
      { asset: "Gold (XAU)", impact: "down", note: "Gold is USD-priced; inverse to the dollar" },
      { asset: "Emerging Markets", impact: "down", note: "USD debt servicing gets heavier" },
      { asset: "Commodities", impact: "down", note: "Broadly USD-denominated, so they cheapen" },
      { asset: "US Importers", impact: "up", note: "Cheaper foreign inputs" },
    ],
  },
  {
    key: "oil",
    label: "Oil ↑",
    direction: "up",
    effects: [
      { asset: "Airlines", impact: "down", note: "Fuel is a top cost line" },
      { asset: "Energy Sector", impact: "up", note: "Producers earn more per barrel" },
      { asset: "Inflation (CPI)", impact: "up", note: "Energy feeds headline inflation" },
      { asset: "Consumer Discretionary", impact: "down", note: "Higher pump prices squeeze spending" },
      { asset: "CAD / NOK", impact: "up", note: "Petro-currencies firm up" },
    ],
  },
  {
    key: "vix",
    label: "VIX ↑",
    direction: "up",
    effects: [
      { asset: "Equities (risk-on)", impact: "down", note: "Fear gauge rising = de-risking" },
      { asset: "Tech / High-beta", impact: "down", note: "Sold first in a vol spike" },
      { asset: "Treasuries (TLT)", impact: "up", note: "Flight-to-safety bid" },
      { asset: "Gold", impact: "up", note: "Defensive haven flows" },
      { asset: "USD", impact: "up", note: "Reserve-currency safe haven" },
    ],
  },
  {
    key: "rates",
    label: "Rates / Yields ↑",
    direction: "up",
    effects: [
      { asset: "Bonds (TLT)", impact: "down", note: "Price falls as yields rise" },
      { asset: "Growth / Tech", impact: "down", note: "Higher discount rate on future earnings" },
      { asset: "Banks", impact: "up", note: "Wider net interest margins" },
      { asset: "Gold", impact: "down", note: "Higher real yields raise gold's opportunity cost" },
      { asset: "USD", impact: "up", note: "Rate differentials attract capital" },
    ],
  },
  {
    key: "credit",
    label: "Credit Spreads ↑",
    direction: "up",
    effects: [
      { asset: "High-Yield (HYG)", impact: "down", note: "Default risk getting repriced" },
      { asset: "Equities", impact: "down", note: "Tightening financial conditions" },
      { asset: "Treasuries", impact: "up", note: "Quality rotation" },
      { asset: "VIX", impact: "up", note: "Stress bleeds into equity vol" },
    ],
  },
];
