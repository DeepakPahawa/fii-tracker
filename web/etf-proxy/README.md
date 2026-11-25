# ETF live-feed proxy (contract)

The `/etf` page's **Live proxy** mode calls `GET {VITE_ETF_API_URL}?symbols=A,B,C` (default `/api/etf/quotes`).
Implement it with any broker API (Zerodha Kite Connect, Upstox, Dhan) or an NSE scrape. Keep API keys on the server; the browser never sees them.

Response (JSON):

```json
{
  "ts": 1764057242000,
  "quotes": [
    { "symbol": "NIFTYBEES", "ltp": 285.4, "prevClose": 284.9, "inav": 285.21, "volume": 1250000, "turnover": 356000000 }
  ]
}
```

- `ltp`, `prevClose`, `inav` are required numbers (₹). `volume` is cumulative units today; `turnover` (₹) is optional.
- Return one entry per requested symbol. Symbols outside the 20-ETF universe are ignored.
- iNAV is published by the AMCs / NSE (not by most broker quote APIs), so you will usually combine two sources.

`server.mjs` is a runnable skeleton: `node etf-proxy/server.mjs` listens on :8787 and returns 501 until you fill in `getQuotes()`.
Point Vite at it with `ETF_PROXY_TARGET=http://127.0.0.1:8787 npm run dev` (see `vite.config.ts`).
