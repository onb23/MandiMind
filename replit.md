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
- Mock price data for 5 crops x 5 mandis x 30 days
- Decision engine in `src/utils/decisionEngine.js`
- Fonts: Manrope (headings), Be Vietnam Pro (body)
- Colors: primary #004c22, secondary #feb234, background #fff9eb

### Folder Structure
```
artifacts/mandimind/src/
  pages/        - Home, FarmerInput, Decision, Comparison, Forecast, Settings
  components/   - Navbar, BottomNav, DecisionCard, MandiCard, TrendChart
  data/         - mockPrices.js, translations.js
  utils/        - decisionEngine.js
  context/      - LanguageContext.jsx
  assets/       - logo.svg
```

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
