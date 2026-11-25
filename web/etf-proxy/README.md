# ETF data proxy

The `/etf` page only shows real NSE data. The browser cannot call NSE directly (CORS + session cookie), so it calls
`GET /api/etf/quotes?symbols=A,B,C` (override with `VITE_ETF_API_URL`), which this folder implements.

- `nseEtf.mjs` reads NSE's public snapshot (`/api/etf`). No keys, no dependencies.
- `npm run dev` mounts it automatically (see `vite.config.ts`).
- For a built site, run `node etf-proxy/server.mjs` (port 8787) and route `/api/etf/` to it.
- It caches NSE responses for 2 s. Polling policy lives in the client: every interval during 09:15–15:30 IST (Mon–Fri), then a single fetch after close.

Response: `{ ts, asOf, navDate, quotes: [{ symbol, ltp, prevClose, inav, volume, turnover }] }`.

## iNAV caveat

NSE's snapshot has real LTP, previous close, volume and turnover, but its `nav` field is the last **published NAV**
(previous trading day), not a live intraday iNAV. The page uses it as the reference and says so. ETFs tracking
overseas or commodity prices (MON100, gold, silver) can show large "premiums" that are just stale NAV. For true iNAV,
swap the `inav` source in `getQuotes()` for an AMC / data-vendor iNAV feed.
