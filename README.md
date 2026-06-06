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

## Stack

Next.js 14 (App Router), TypeScript, Tailwind, Recharts.
