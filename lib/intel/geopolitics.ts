// Zero-key geopolitical risk classifier. Scans the headline pool for conflict,
// sanctions, energy-supply, trade-war and political-instability language and
// returns a risk read plus the headlines that triggered it. No external call —
// pairs with the lexicon sentiment engine to keep the thesis panel free.

import type { ScoredHeadline } from "./types";

interface GeoTheme {
  key: string;
  label: string;
  weight: number; // contribution to the risk score per matched headline
  terms: RegExp;
}

// Term groups are deliberately broad; matching is case-insensitive on title.
const THEMES: GeoTheme[] = [
  {
    key: "conflict",
    label: "Armed conflict / war",
    weight: 1.0,
    terms: /\b(war|invasion|invade|missile|airstrike|strike[sd]?|troops|military|ceasefire|attack|drone|nuclear|escalat\w*|offensive|incursion|conflict)\b/i,
  },
  {
    key: "sanctions",
    label: "Sanctions / export controls",
    weight: 0.8,
    terms: /\b(sanction\w*|embargo|export controls?|blacklist|seiz\w*|frozen assets?)\b/i,
  },
  {
    key: "trade",
    label: "Trade war / tariffs",
    weight: 0.7,
    terms: /\b(tariff\w*|trade war|trade deal|protectionis\w*|import ban|retaliat\w*|decoupl\w*)\b/i,
  },
  {
    key: "energy",
    label: "Energy supply shock",
    weight: 0.8,
    terms: /\b(opec\+?|oil supply|crude supply|pipeline|gas supply|energy crisis|production cut|supply disruption|strait of hormuz|red sea|tanker)\b/i,
  },
  {
    key: "politics",
    label: "Political instability",
    weight: 0.5,
    terms: /\b(coup|election|elections|impeach\w*|protest\w*|unrest|government shutdown|default|debt ceiling|no-confidence|regime)\b/i,
  },
];

// Regions/actors that, when named, intensify a matched headline.
const HOTSPOTS = /\b(russia|ukraine|china|taiwan|iran|israel|gaza|hamas|hezbollah|north korea|middle east|venezuela|houthi|syria|lebanon)\b/i;

export interface GeoRead {
  score: number; // 0 (calm) .. 1 (acute)
  level: "low" | "elevated" | "high";
  themes: { key: string; label: string; count: number }[];
  flagged: ScoredHeadline[]; // headlines that triggered the read
}

export function assessGeopolitics(headlines: ScoredHeadline[]): GeoRead {
  const counts = new Map<string, number>();
  const flagged: ScoredHeadline[] = [];
  let raw = 0;

  for (const h of headlines) {
    const text = h.title;
    let matchedThis = false;
    for (const t of THEMES) {
      if (t.terms.test(text)) {
        counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
        let w = t.weight;
        if (HOTSPOTS.test(text)) w *= 1.4; // named hotspot raises the stakes
        raw += w;
        matchedThis = true;
      }
    }
    if (matchedThis) flagged.push(h);
  }

  // Normalise: a handful of strong geopolitical headlines saturates the gauge.
  const score = Math.max(0, Math.min(1, raw / 5));
  const level = score >= 0.6 ? "high" : score >= 0.25 ? "elevated" : "low";

  const themes = THEMES.filter((t) => counts.has(t.key))
    .map((t) => ({ key: t.key, label: t.label, count: counts.get(t.key)! }))
    .sort((a, b) => b.count - a.count);

  // Most market-relevant flagged headlines first (by absolute sentiment).
  flagged.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  return { score, level, themes, flagged: flagged.slice(0, 6) };
}
