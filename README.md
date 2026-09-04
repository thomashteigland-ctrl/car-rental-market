# Car rental market (FINN scrape)

Standalone Next.js app for FINN.no market listings, charts, and scraping.
Shares the same Supabase `rental` schema as the admin app.

## Setup

```powershell
Copy-Item .env.example .env
# set PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY (same as admin)
npm install
npm run dev
```

Opens on [http://localhost:3001](http://localhost:3001).

Requires the same Supabase grants as admin (`supabase/grants.sql` in the admin repo), including `MarketModel`, `MarketListing`, `MarketPriceObservation`, and `ScrapeJob`.

## Vercel

1. Create a new Vercel project from this folder / GitHub repo.
2. Set env: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_ADMIN_APP_URL` (your admin site URL).
3. Deploy. Scrape route allows up to 300s (`maxDuration`).

## Link from admin

In the admin app, set `PUBLIC_MARKET_APP_URL` to this deployment URL (local: `http://localhost:3001`). The header **Market** button opens it in a new tab.
