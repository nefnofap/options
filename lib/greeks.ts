// Black-Scholes greeks for European options (used as fallback when feed lacks them).

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function pdf(x: number) {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

// Abramowitz-Stegun normal CDF approximation
function cdf(x: number) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

export interface BSInput {
  S: number; // spot
  K: number; // strike
  T: number; // years to expiry
  r: number; // risk-free
  q: number; // dividend yield
  sigma: number; // volatility
  isCall: boolean;
}

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export function blackScholes({ S, K, T, r, q, sigma, isCall }: BSInput): Greeks {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: isCall ? 1 : -1, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Nd1 = cdf(d1);
  const Nd2 = cdf(d2);
  const nd1 = pdf(d1);
  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);

  const price = isCall
    ? S * eqT * Nd1 - K * erT * Nd2
    : K * erT * cdf(-d2) - S * eqT * cdf(-d1);

  const delta = isCall ? eqT * Nd1 : eqT * (Nd1 - 1);
  const gamma = (eqT * nd1) / (S * sigma * sqrtT);
  const vega = S * eqT * nd1 * sqrtT * 0.01; // per 1% vol
  const thetaCommon =
    (-S * eqT * nd1 * sigma) / (2 * sqrtT) -
    (isCall ? r * K * erT * Nd2 - q * S * eqT * Nd1 : -r * K * erT * cdf(-d2) + q * S * eqT * cdf(-d1));
  const theta = thetaCommon / 365; // per calendar day
  const rho = isCall
    ? (K * T * erT * Nd2) / 100
    : (-K * T * erT * cdf(-d2)) / 100;

  return { price, delta, gamma, vega, theta, rho };
}

// Charm = -dDelta/dT. Useful for the Charm tab.
export function charm({ S, K, T, r, q, sigma, isCall }: BSInput): number {
  if (T <= 0 || sigma <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = pdf(d1);
  const eqT = Math.exp(-q * T);
  const term = eqT * (nd1 * (2 * (r - q) * T - d2 * sigma * sqrtT)) / (2 * T * sigma * sqrtT);
  const dividend = isCall ? q * eqT * cdf(d1) : -q * eqT * cdf(-d1);
  return (-dividend - term) / 365;
}

// Vanna = dDelta/dVol = dVega/dSpot
export function vanna({ S, K, T, r, q, sigma }: BSInput): number {
  if (T <= 0 || sigma <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = pdf(d1);
  const eqT = Math.exp(-q * T);
  return (-eqT * nd1 * d2) / sigma;
}

export function yearsBetween(now: Date, expiry: Date): number {
  const ms = expiry.getTime() - now.getTime();
  return Math.max(0, ms / (365 * 24 * 3600 * 1000));
}
