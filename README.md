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

## Access — Discord login

The whole app is behind **Discord login** (Auth.js / NextAuth v5). The home page
(`/`) is the login screen.

- **You can only sign in if you're a member of the configured Discord server.**
  Signed-in non-members are sent to `/denied` (a join-the-server prompt) and see
  no app content.
- **Free tier** (any guild member): the full options dashboard + Intel **Macro**
  and **News Bias**.
- **Premium tier** (guild member who also holds the premium role): everything
  free, plus the rest of Intel (Pre-Market Brief, Instruments, Impact Matrix),
  the **Pine export**, and the **GEX levels** read.

### Discord setup

1. Create an app at <https://discord.com/developers/applications> → **OAuth2**.
2. Add a redirect URI: `http://localhost:3000/api/auth/callback/discord`
   (and your production URL).
3. Copy the **Client ID/Secret** into `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`.
4. With Discord Developer Mode on, copy your **Server ID** → `DISCORD_GUILD_ID`
   and the **premium role ID** → `DISCORD_PREMIUM_ROLE_ID`.
5. Set `AUTH_SECRET` (`openssl rand -base64 32`). In production also set
   `AUTH_URL` to your site URL.

Membership + role are read once at sign-in via the `guilds.members.read` scope
(no bot token needed) and cached on the session JWT.

## Intel section (`/intel`)

A market-intelligence area layered on top of the options dashboard. Two pages
are **free**; three are **premium** (granted by the Discord premium role).

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

Tiers are derived from Discord roles (see **Access** above). Premium pages render
a `<PremiumLock>` upsell for free members; the embedded premium features (Pine
export, GEX levels) use a client `<PremiumGate>`. The premium API routes
(`/api/intel/brief`, `/api/intel/instruments`, `/api/pine`) also enforce the tier
server-side, so the data can't be fetched directly by free accounts.

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
