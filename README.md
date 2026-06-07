# Aplus

Minimal, dark, options analytics.

- Landing page with glass nav, radial wash, floating ticker nodes
- 15-tab dashboard: GEX, DEX, Flow, VEX, Vega, Charm, Chain, Volatility, Heatmap, Ladder, OI, Contracts, Chart, Macro, News
- Data: CBOE delayed quotes (primary, no key) + Yahoo fallback for chart history and news
- Greeks computed locally via Black-Scholes when missing

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Intel section (`/intel`)

A market-intelligence area layered on top of the options dashboard. Two pages
are **free**; three are **premium ($10.99/mo — "contact owner to purchase")**.

| Page | Tier | Source |
|------|------|--------|
| Macro Analysis (`/intel/macro`) | Free | FRED (SOFR, rates, HY credit spread, VIX, CPI, unemployment) + EconPulse; classifies a risk-on / risk-off / neutral regime |
| News Bias (`/intel/sentiment`) | Free | Finnhub + MarketAux news → lexicon sentiment (or Apify AI actor if configured); falls back to Yahoo headlines with zero keys |
| Pre-Market Brief (`/intel/brief`) | Premium | MarketAux overnight news + TradingEconomics calendar + macro snapshot |
| Instruments Tracker (`/intel/instruments`) | Premium | Twelve Data daily OHLC → RSI(14)/MACD(12,26,9) computed locally; TAAPI optional |
| Impact Matrix (`/intel/matrix`) | Premium | Static interactive map (USD↑, Oil↑, VIX↑, rates↑, credit↑ → affected assets) |

**Every API key is optional.** A feature whose key is missing shows a "set
`<KEY>`" notice instead of crashing, so the app always runs.

### Premium gate

Premium pages are wrapped in `<PaywallGate>`. A buyer contacts the owner, gets an
access code, and enters it once; it's verified server-side at `/api/intel/unlock`
against `INTEL_ACCESS_CODE` and an unlock flag is stored in the browser's
`localStorage`. If `INTEL_ACCESS_CODE` is unset, premium pages stay locked.

### Configuration

```bash
cp .env.example .env.local   # then fill in the keys you want
```

Free-tier keys that light up the most: **FRED** (Macro) and **Twelve Data**
(Instruments). Sentiment works with no keys at all.

## Docker

```bash
docker build -t aplus .
docker run -p 3000:3000 --env-file .env.local aplus
```

## Stack

Next.js 14 (App Router), TypeScript, Tailwind, Recharts.

- Intel providers: `lib/intel/*` → orchestrators in `lib/intel/data.ts`
  → routes in `app/api/intel/*` → client views in `components/intel/views/*`.
