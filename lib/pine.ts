// Generates a self-contained TradingView Pine v5 indicator with the current GEX
// levels baked in. Pine cannot make HTTP calls, so the app pre-computes the
// gamma profile and emits a script the user pastes into the Pine Editor.
//
// The trick that makes ONE script work on the index, its ETF, and its e-mini
// future: every level is baked in *cash-index points* and the script rescales
// to the charted instrument live via
//     scale = close / request.security(referenceIndex, …, close)
// So on SPX scale≈1, on SPY scale≈0.1, on ES1! scale≈1 (basis absorbed), etc.
// No hard-coded ETF divisors or futures basis in the Pine itself.

import type { StrikeAggregate } from "./analytics";
import { CONVERT_MAP } from "./convert";

export interface PineFamily {
  /** Cash-index label, e.g. "SPX". */
  indexLabel: string;
  /** ETF ticker, e.g. "SPY". */
  etf: string;
  /** Front e-mini label, e.g. "ES". */
  futureLabel: string;
  /** index ≈ etf × divisor (from CONVERT_MAP.approxMultiplier). */
  etfDivisor: number;
  /** TradingView symbol for the reference cash index. */
  refIndexSymbol: string;
}

// TradingView symbols for each cash index. These are the common, widely-licensed
// feeds; the generated script also exposes this as an editable input so a user on
// a different data plan can correct the exchange prefix.
const REF_INDEX_TV: Record<string, string> = {
  SPX: "SP:SPX",
  NDX: "NASDAQ:NDX",
  RUT: "TVC:RUT",
  DJI: "DJ:DJI",
};

// Built from CONVERT_MAP so the ETF→index multipliers live in exactly one place.
export const PINE_FAMILIES: PineFamily[] = Object.values(CONVERT_MAP).map((m) => ({
  indexLabel: m.indexLabel,
  etf: m.etf,
  futureLabel: m.futureLabel,
  etfDivisor: m.approxMultiplier,
  refIndexSymbol: REF_INDEX_TV[m.indexLabel] ?? `INDEX:${m.indexLabel}`,
}));

export interface ResolvedSymbol {
  family: PineFamily;
  /** True when the chain symbol is the ETF (strikes need ×divisor to reach index points). */
  isEtf: boolean;
  /** Multiplier to lift this symbol's strikes into cash-index points. */
  divisor: number;
}

/**
 * Map a chain source symbol (an ETF or index — CBOE doesn't list futures) onto
 * its family and the multiplier that lifts its strikes into index points.
 */
export function resolveSymbol(symbol: string): ResolvedSymbol | null {
  const s = symbol.toUpperCase();
  for (const family of PINE_FAMILIES) {
    if (s === family.etf) return { family, isEtf: true, divisor: family.etfDivisor };
    if (s === family.indexLabel) return { family, isEtf: false, divisor: 1 };
  }
  return null;
}

export interface GeneratePineInput {
  symbol: string;
  exp?: string; // expiration filter, or undefined for "all"
  spot: number; // chain spot, in the symbol's own units
  aggs: StrikeAggregate[]; // per-strike aggregates (already expiry-filtered)
  flip: number | null; // gamma flip strike (symbol units)
  pain: number | null; // max-pain strike (symbol units)
  callWall: number | null;
  putWall: number | null;
  generatedAt: string; // ISO timestamp (caller stamps it)
}

const MAX_STRIKES = 40; // keep well under TradingView's 500-box ceiling

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Median spacing between adjacent strikes (in the symbol's own units). */
function medianStep(strikes: number[]): number {
  if (strikes.length < 2) return 1;
  const sorted = [...strikes].sort((a, b) => a - b);
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 1;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function pineNum(n: number | null): string {
  return n == null || !Number.isFinite(n) ? "na" : String(n);
}

/**
 * Produce the full Pine v5 source string. Levels are baked in index points; the
 * script rescales them onto whatever instrument is charted.
 */
export function generatePineScript(input: GeneratePineInput): string {
  const resolved = resolveSymbol(input.symbol);
  // Fallback: treat an unknown symbol as its own index (divisor 1, self reference).
  const divisor = resolved?.divisor ?? 1;
  const refIndexSymbol = resolved?.family.refIndexSymbol ?? input.symbol.toUpperCase();
  const family = resolved?.family;

  const toIdx = (x: number | null): number | null =>
    x == null || !Number.isFinite(x) ? null : round(x * divisor, 2);

  // Pick the most significant strikes by |GEX|, then order by strike for drawing.
  const selected = [...input.aggs]
    .filter((a) => Number.isFinite(a.netGammaNotional))
    .sort((a, b) => Math.abs(b.netGammaNotional) - Math.abs(a.netGammaNotional))
    .slice(0, MAX_STRIKES)
    .sort((a, b) => a.strike - b.strike);

  const strikeIdx = selected.map((a) => round(a.strike * divisor, 2));
  const gex = selected.map((a) => round(a.netGammaNotional, 0));
  const maxAbs = gex.reduce((m, g) => Math.max(m, Math.abs(g)), 0);
  const stepIdx = round(medianStep(input.aggs.map((a) => a.strike)) * divisor, 2);
  const spotIdx = round(input.spot * divisor, 2);

  const totalGamma = input.aggs.reduce((a, s) => a + (Number.isFinite(s.netGammaNotional) ? s.netGammaNotional : 0), 0);
  const longGamma = totalGamma >= 0;

  const expLabel = input.exp ?? "all";
  const title = `A+ GEX ${input.symbol.toUpperCase()} ${expLabel}`;
  const familyNote = family
    ? `Works on ${family.indexLabel} / ${family.etf} / ${family.futureLabel} (auto-scaled).`
    : "Single-symbol levels (no family mapping found).";

  const arr = (xs: number[]) => (xs.length ? `array.from(${xs.join(", ")})` : "array.new<float>()");

  // Reversal-bias text baked per wall, conditioned on the gamma regime. Mirrors
  // lib/regime.ts reversalZones() so the chart reads like the website's insights.
  const callBias = longGamma ? "REJECT/FADE" : "BREACH=CHASE";
  const putBias = longGamma ? "BOUNCE" : "BREAK=FLUSH";

  return `//@version=5
// ╔══════════════════════════════════════════════════════════════════╗
// ║  A+ GEX Levels — generated by the A+ options app                  ║
// ║  Source: ${input.symbol.toUpperCase()}   Exp: ${expLabel}   Spot: ${round(input.spot, 2)}
// ║  Generated: ${input.generatedAt}
// ║  Regime: ${longGamma ? "LONG gamma (dealers dampen)" : "SHORT gamma (dealers amplify)"}
// ║  ${familyNote}
// ║                                                                    ║
// ║  Dark theme matched to the A+ website. Levels are baked in CASH-   ║
// ║  INDEX POINTS and auto-scaled to the charted instrument. Paste     ║
// ║  into TradingView → Pine Editor → "Add to chart". Re-export from   ║
// ║  the app for fresh levels.                                         ║
// ╚══════════════════════════════════════════════════════════════════╝
indicator("${title}", overlay = true, max_boxes_count = 500, max_lines_count = 100, max_labels_count = 100)

// ── Theme (A+ website palette) ───────────────────────────────────────
// ink-950 #070708 · ink-900 #0b0b0d · ink-300 #8c8c98 · bull #5fd39a · bear #f06a7a
posCol   = input.color(#5fd39a, "Positive gamma / support", group = "Theme")
negCol   = input.color(#f06a7a, "Negative gamma / resistance", group = "Theme")
inkLine  = input.color(#8c8c98, "Neutral (flip / pain)", group = "Theme")
inkText  = input.color(#e6e6ea, "Label text", group = "Theme")
darkBg   = input.bool(true,  "Dark chart backdrop", group = "Theme")
bgFill   = input.color(#070708, "Backdrop color", group = "Theme")
lblSize  = input.string("small", "Label size", options = ["tiny", "small", "normal", "large"], group = "Theme")

// ── Behaviour ────────────────────────────────────────────────────────
refSym   = input.symbol("${refIndexSymbol}", "Reference cash index", group = "Data")
showBars = input.bool(true,  "Show GEX profile bars", group = "Display")
showKey  = input.bool(true,  "Show key levels (flip / walls / pain)", group = "Display")
showBias = input.bool(true,  "Show reversal bias on walls", group = "Display")
offsetB  = input.int(10, "Bars offset to right",  minval = 0,  maxval = 200, group = "Display")
maxLen   = input.int(60, "Max bar length (bars)", minval = 5,  maxval = 300, group = "Display")

// Paint a dark backdrop so the indicator matches the website regardless of the
// user's TradingView theme (kept subtle so candles stay readable).
bgcolor(darkBg ? color.new(bgFill, 70) : na, title = "A+ dark backdrop")

// ── Baked GEX data (cash-index points) ───────────────────────────────
var strikes = ${arr(strikeIdx)}
var gex     = ${arr(gex)}
maxAbs  = ${maxAbs}
stepPts = ${stepIdx}
spotPts = ${spotIdx}
flipPts = ${pineNum(toIdx(input.flip))}
painPts = ${pineNum(toIdx(input.pain))}
callPts = ${pineNum(toIdx(input.callWall))}
putPts  = ${pineNum(toIdx(input.putWall))}
callBias = "${callBias}"
putBias  = "${putBias}"

// ── Live scale: index points → charted price ─────────────────────────
refClose = request.security(refSym, timeframe.period, close, barmerge.gaps_off, barmerge.lookahead_off)
scale = (not na(refClose) and refClose > 0) ? close / refClose : 1.0

f_sz(s) => s == "tiny" ? size.tiny : s == "normal" ? size.normal : s == "large" ? size.large : size.small

var box[]   boxes  = array.new<box>()
var line[]  lines  = array.new<line>()
var label[] labels = array.new<label>()

if barstate.islast
    // Clear the previous render so levels track scale / input changes.
    for b in boxes
        box.delete(b)
    array.clear(boxes)
    for l in lines
        line.delete(l)
    array.clear(lines)
    for lb in labels
        label.delete(lb)
    array.clear(labels)

    halfH  = stepPts * scale * 0.40
    rightX = bar_index + offsetB

    // Horizontal GEX profile bars (length ∝ |gamma|, green = +γ, red = −γ).
    n = array.size(strikes)
    if showBars and n > 0
        for i = 0 to n - 1
            y   = array.get(strikes, i) * scale
            g   = array.get(gex, i)
            len = maxAbs > 0 ? math.max(1, int(math.round(math.abs(g) / maxAbs * maxLen))) : 1
            col = g >= 0 ? posCol : negCol
            array.push(boxes, box.new(rightX - len, y + halfH, rightX, y - halfH, border_color = col, bgcolor = color.new(col, 35), border_width = 1))

    // Key levels — full-width lines + right-edge labels (dark-theme styled).
    if showKey and not na(flipPts)
        y = flipPts * scale
        array.push(lines,  line.new(bar_index, y, rightX, y, color = inkLine, width = 2, style = line.style_solid, extend = extend.left))
        array.push(labels, label.new(rightX, y, "GAMMA FLIP · pivot " + str.tostring(y, format.mintick), style = label.style_label_left, color = color.new(#0b0b0d, 10), textcolor = inkText, size = f_sz(lblSize)))
    if showKey and not na(callPts)
        y = callPts * scale
        bias = showBias ? "  [" + callBias + "]" : ""
        array.push(lines,  line.new(bar_index, y, rightX, y, color = posCol, width = 2, style = line.style_dashed, extend = extend.left))
        array.push(labels, label.new(rightX, y, "CALL WALL " + str.tostring(y, format.mintick) + bias, style = label.style_label_left, color = color.new(#0b0b0d, 10), textcolor = posCol, size = f_sz(lblSize)))
    if showKey and not na(putPts)
        y = putPts * scale
        bias = showBias ? "  [" + putBias + "]" : ""
        array.push(lines,  line.new(bar_index, y, rightX, y, color = negCol, width = 2, style = line.style_dashed, extend = extend.left))
        array.push(labels, label.new(rightX, y, "PUT WALL " + str.tostring(y, format.mintick) + bias, style = label.style_label_left, color = color.new(#0b0b0d, 10), textcolor = negCol, size = f_sz(lblSize)))
    if showKey and not na(painPts)
        y = painPts * scale
        array.push(lines,  line.new(bar_index, y, rightX, y, color = color.new(inkLine, 40), width = 1, style = line.style_dotted, extend = extend.left))
        array.push(labels, label.new(rightX, y, "MAX PAIN · magnet " + str.tostring(y, format.mintick), style = label.style_label_left, color = color.new(#0b0b0d, 20), textcolor = color.new(inkText, 25), size = f_sz(lblSize)))
`;
}
