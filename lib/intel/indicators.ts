// Local technical-indicator math so the Instruments tracker works from plain
// OHLC (Twelve Data) without depending on TAAPI's rate-limited free tier.
// Standard formulas: Wilder's RSI(14) and MACD(12,26,9).

/** Exponential moving average over `values`, returning the full EMA series. */
function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

/** Wilder's RSI. Returns the latest RSI value (0..100) or null if not enough data. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  // Seed with the first `period` changes.
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  // Wilder smoothing over the remainder.
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdValue {
  macd: number;
  signal: number;
  hist: number;
}

/** MACD(fast=12, slow=26, signal=9). Returns latest values or null. */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdValue | null {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = emaSeries(macdLine, signalPeriod);
  const i = closes.length - 1;
  const macdV = macdLine[i];
  const signalV = signalLine[i];
  return { macd: macdV, signal: signalV, hist: macdV - signalV };
}
