// Daily premium/discount history for the /etf drawer: exchange closing price (Yahoo Finance, free)
// joined with the fund's official end-of-day NAV (AMFI via mfapi.in, free), matched by date.
//
// Why not iNAV history: intraday iNAV is not published free anywhere; end-of-day NAV is. So the
// "spread" here is close vs that day's NAV. Days where either source has no value are skipped.

/** NSE ticker -> AMFI scheme code (looked up via https://api.mfapi.in/mf/search?q=...). */
export const SCHEME_CODES = {
  NIFTYBEES: 140084,
  BANKBEES: 140087,
  ITBEES: 148408,
  PSUBNKBEES: 140089,
  SILVERBEES: 149758,
  GOLDBEES: 140088,
  JUNIORBEES: 140085,
  CPSEETF: 140107,
  SBINIFTY50: 135106,
  NIFTYIETF: 121366,
  BANKNIFTY1: 133122,
  GOLDIETF: 113076,
  SILVERIETF: 149464,
  PHARMABEES: 149008,
  AUTOBEES: 149465,
  FMCGIETF: 149072,
  PVTBANIETF: 147530,
  MID150BEES: 146271,
  ICICIB22: 141957,
  MON100: 114984,
};

const CACHE_MS = 60 * 60 * 1000;
/** @type {Map<string, { at: number, body: any }>} */
const cache = new Map();
/** @type {Map<string, Promise<any>>} */
const inflight = new Map();

async function getJson(url, retry = true) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} from ${new URL(url).host}`), { final: true });
    return await r.json();
  } catch (e) {
    if (!retry || e?.final) throw e;
    await new Promise((res) => setTimeout(res, 500));
    return getJson(url, false);
  }
}

/** Yahoo timestamps are bar-open epoch seconds; +5:30 gives the IST calendar date. */
const istDate = (sec) => new Date((sec + 19800) * 1000).toISOString().slice(0, 10);
/** AMFI "dd-mm-yyyy" -> "yyyy-mm-dd". */
const amfiDate = (d) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;

async function build(symbol) {
  const code = SCHEME_CODES[symbol];
  const [chart, fund] = await Promise.all([
    getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?range=6mo&interval=1d`),
    getJson(`https://api.mfapi.in/mf/${code}`),
  ]);
  const res = chart?.chart?.result?.[0];
  if (!res?.timestamp) throw new Error('No price history from Yahoo Finance');
  const closes = new Map();
  res.timestamp.forEach((t, i) => {
    const c = res.indicators.quote[0].close[i];
    if (Number.isFinite(c)) closes.set(istDate(t), c);
  });
  const rows = [];
  for (const { date, nav } of fund.data ?? []) {
    const d = amfiDate(date);
    const n = Number.parseFloat(nav);
    const close = closes.get(d);
    if (close === undefined || !Number.isFinite(n) || n <= 0) continue;
    rows.push({ date: d, close: Math.round(close * 100) / 100, nav: n, spreadPct: ((close - n) / n) * 100 });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { symbol, schemeCode: code, schemeName: fund.meta?.scheme_name ?? '', rows };
}

export async function getHistory(symbol) {
  if (!(symbol in SCHEME_CODES)) throw Object.assign(new Error(`Unknown symbol ${symbol}`), { status: 400 });
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  if (!inflight.has(symbol)) {
    inflight.set(
      symbol,
      build(symbol)
        .then((body) => (cache.set(symbol, { at: Date.now(), body }), body))
        .finally(() => inflight.delete(symbol)),
    );
  }
  return inflight.get(symbol);
}

/** Handler for GET /api/etf/history?symbol=NIFTYBEES */
export async function historyHandler(req, res) {
  const send = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  const symbol = new URL(req.url ?? '/', 'http://localhost').searchParams.get('symbol') ?? '';
  try {
    send(200, await getHistory(symbol));
  } catch (e) {
    send(e?.status ?? 502, { error: e instanceof Error ? e.message : String(e) });
  }
}
