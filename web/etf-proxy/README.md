# ETF data proxy

The `/etf` page only shows real NSE data. The browser cannot call NSE directly (CORS + session cookie), so it calls
`GET /api/etf/quotes?symbols=A,B,C` (override with `VITE_ETF_API_URL`), which this folder implements.

- `nseEtf.mjs` reads NSE's public snapshot (`/api/etf`). No keys, no dependencies.
- `npm run dev` mounts it automatically (see `vite.config.ts`).
- For a built site, run `node etf-proxy/server.mjs` (port 8787) and route `/api/etf/` to it.
- It caches NSE responses for 2 s. Polling policy lives in the client: fetch on page open, then every 30 minutes (including after market close).

Response: `{ ts, asOf, navDate, quotes: [{ symbol, ltp, prevClose, inav, volume, turnover }] }`.

## iNAV caveat

NSE's snapshot has real LTP, previous close, volume and turnover, but its `nav` field is the last **published NAV**
(previous trading day), not a live intraday iNAV. The page uses it as the reference and says so. ETFs tracking
overseas or commodity prices (MON100, gold, silver) can show large "premiums" that are just stale NAV. For true iNAV,
swap the `inav` source in `getQuotes()` for an AMC / data-vendor iNAV feed.

## Daily history (`/api/etf/history?symbol=X`)

A ~6 month JSON view of the same join (no longer used by the page): `{ symbol, schemeCode, schemeName, rows: [{ date, close, nav, spreadPct }] }` (~6 months).
`history.mjs` joins Yahoo Finance daily closes with AMFI end-of-day NAV (via mfapi.in) by date; `SCHEME_CODES` maps each ticker to its AMFI scheme.
Results are cached for 1 hour. This is close-vs-NAV, not intraday iNAV. Yahoo occasionally lacks a day, and such days are skipped.

## Full history for the drawer (`fetch-history.mjs`)

The ETF drawer's "Price vs NAV history" section reads static CSVs from `web/public/data/etf-history/daily/<SYMBOL>.csv`
(plus `weekly/` and `manifest.json`), so it works without the proxy. Refresh them with:

```bash
node web/etf-proxy/fetch-history.mjs            # all 20 ETFs, whole history
node web/etf-proxy/fetch-history.mjs GOLDBEES   # one ETF
node web/etf-proxy/fetch-history.mjs --combined # also write all-daily.csv / all-weekly.csv
```

Splits are detected in the price and NAV series separately and both are put on the latest share basis (see `manifest.json`).
