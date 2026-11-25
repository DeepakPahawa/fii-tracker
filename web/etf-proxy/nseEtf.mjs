// Real-data backend for the /etf page: reads NSE's public ETF snapshot (https://www.nseindia.com/api/etf).
// No dependencies, no API keys. Used by `server.mjs` (standalone) and by the Vite dev server (vite.config.ts).
//
// Data caveat: NSE's snapshot has LTP, previous close, volume and turnover, but its `nav` field is the
// last *published* NAV (previous trading day), not a live intraday iNAV. Live iNAV needs another source.

const BASE = 'https://www.nseindia.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CACHE_MS = 2000; // protects NSE when several tabs poll at once

let cookie = '';
let cookieAt = 0;
/** @type {{ at: number, body: any } | null} */
let cache = null;

/** NSE equity hours: Mon-Fri 09:15-15:30 IST. Holidays are not modelled. */
export function isMarketOpen(now = Date.now()) {
  const d = new Date(now + 330 * 60_000);
  const day = d.getUTCDay();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

async function refreshCookie() {
  const r = await fetch(`${BASE}/market-data/exchange-traded-funds-etf`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
  });
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  cookieAt = Date.now();
  if (!cookie) throw new Error(`NSE gave no session cookie (HTTP ${r.status})`);
}

async function fetchNse(retry = true) {
  if (!cookie || Date.now() - cookieAt > 10 * 60_000) await refreshCookie();
  const r = await fetch(`${BASE}/api/etf`, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'application/json',
      Referer: `${BASE}/market-data/exchange-traded-funds-etf`,
      Cookie: cookie,
    },
  });
  if (!r.ok) {
    cookie = '';
    if (retry) return fetchNse(false);
    throw new Error(`NSE returned HTTP ${r.status}`);
  }
  return r.json();
}

const num = (v) => Number.parseFloat(String(v).replace(/,/g, ''));

/** @param {string[]} symbols */
export async function getQuotes(symbols) {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), body: await fetchNse() };
  const { body } = cache;
  const want = new Set(symbols);
  const quotes = [];
  for (const x of body.data ?? []) {
    if (!want.has(x.symbol)) continue;
    const q = { symbol: x.symbol, ltp: num(x.ltP), prevClose: num(x.prevClose), inav: num(x.nav), volume: num(x.qty), turnover: num(x.trdVal) };
    if (Number.isFinite(q.ltp) && Number.isFinite(q.prevClose) && Number.isFinite(q.inav)) quotes.push(q);
  }
  return { ts: Date.now(), asOf: body.timestamp, navDate: body.navDate, quotes };
}

/** Connect/Node-style handler for GET /api/etf/quotes?symbols=A,B. Never calls NSE outside market hours. */
export async function etfHandler(req, res) {
  const send = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  const url = new URL(req.url ?? '/', 'http://localhost');
  const symbols = (url.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
  if (!symbols.length) return send(400, { error: 'symbols query parameter is required' });
  if (!isMarketOpen()) return send(503, { error: 'Market closed (09:15–15:30 IST): not fetching' });
  try {
    send(200, await getQuotes(symbols));
  } catch (e) {
    send(502, { error: String(e instanceof Error ? e.message : e) });
  }
}
