// Centralised access to Intel-section secrets. Server-only — never import this
// into a "use client" component. Every getter returns the raw value or "" so
// callers can do `if (!key) return gracefulFallback()`.

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

export const env = {
  fred: () => read("FRED_API_KEY"),
  finnhub: () => read("FINNHUB_API_KEY"),
  marketaux: () => read("MARKETAUX_API_KEY"),
  tradingeconomics: () => read("TRADINGECONOMICS_KEY") || "guest:guest",
  twelveData: () => read("TWELVE_DATA_API_KEY"),
  taapi: () => read("TAAPI_SECRET"),
  econpulse: () => read("ECONPULSE_KEY") || "demo",
  apify: () => read("APIFY_TOKEN"),
  accessCode: () => read("INTEL_ACCESS_CODE"),
  // Permanent premium key. Defaults to "luciipremium" so the deploy is locked
  // out of the box; override by setting INTEL_ACCESS_CODE_PERMANENT in Vercel.
  accessCodePermanent: () => read("INTEL_ACCESS_CODE_PERMANENT") || "luciipremium",
};

/** A standard "this feature needs a key" payload used across providers. */
export function missingKey(provider: string, varName: string) {
  return {
    error: `${provider} not configured`,
    hint: `Set ${varName} in .env.local to enable this. See .env.example.`,
    varName,
  };
}
