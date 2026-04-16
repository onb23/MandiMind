# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## MandiMind App

MandiMind is a crop price decision system for Indian farmers built with React + Vite + Tailwind CSS.

### Features
- **Home**: Select crop and mandi, view quick price overview
- **Farmer Input**: Enter crop quality, harvest status, storage, urgency
- **Decision Engine**: Rule-based SELL/HOLD/WAIT recommendation (score out of 100)
- **Mandi Comparison**: Compare prices across 5 mandis
- **Forecast**: 30-day price trend charts with Recharts
- **Settings**: Language switcher (English, Hindi, Marathi)

### Tech Details
- React + Vite + Tailwind CSS
- React Router for navigation
- Recharts for price trend charts
- LanguageContext for multi-language support (default: Marathi)
- Mock price data fallback for 5 crops x 5 mandis x 30 days
- Live price data from data.gov.in (Agmarknet) via Express backend
- Decision engine in `src/utils/decisionEngine.js`
- Fonts: Manrope (headings), Be Vietnam Pro (body)
- Colors: primary #004c22, secondary #feb234, background #fff9eb

### MVP Constraints (v1.1)
- **Maharashtra only** — state selector removed, all calls hardcoded to Maharashtra
- **5 crops only**: Onion, Soybean, Cotton, Tomato, Wheat (removed Rice, Sugarcane, Maize, Chilli, Garlic)
- **Zero fake/mock prices** — `priceData` mock generator removed; all prices come from Agmarknet API
- **Data validation**: prices > 0 validated on backend; stale data (>2 days old) flagged with ⚠️ badge
- **Insufficient data**: Forecast chart requires 7+ real data points; shows "Insufficient data" otherwise
- **MA5/MA10**: shows "—" when insufficient data (never ₹0)
- **Trend direction**: computed from actual price movement, not hardcoded mock trend

### Live Data Integration
- **Source**: data.gov.in resource `9ef84268-d588-465a-a308-a864a43d0070` (Agmarknet daily prices)
- **API Key**: `DATA_GOV_API_KEY` env var (shared)
- **Backend routes**: `GET /api/prices`, `GET /api/trend`, `GET /api/compare` in `artifacts/api-server/src/routes/prices.ts`
- **Vite proxy**: `^/api` → `http://localhost:8080` (strips BASE_PATH prefix, forwards to Express)
- **Frontend utility**: `src/utils/api.js` — `fetchPrices()`, `fetchTrend()`, `fetchCompare()`
- **Cache**: 30-min in-memory cache on server; localStorage offline cache on frontend
- **Cloudflare Worker** (`mandimind.omkarborade-11.workers.dev`): decision, forecast, mandi-compare only

### Folder Structure
```
artifacts/mandimind/src/
  pages/        - Home, FarmerInput, Decision, Comparison, Forecast, Settings
  components/   - Navbar, BottomNav, DecisionCard, MandiCard, TrendChart, Sparkline
  data/         - mockPrices.js, translations.js
  utils/        - decisionEngine.js, api.js (live data fetching)
  context/      - LanguageContext.jsx
  assets/       - logo.svg

artifacts/api-server/src/routes/
  health.ts     - GET /api/health
  prices.ts     - GET /api/prices, GET /api/trend (data.gov.in integration)
```

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
