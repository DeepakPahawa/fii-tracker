/**
 * Market data service for the ETF tracker: real data only.
 *
 * The browser cannot call NSE directly (CORS + session cookie), so it calls a small backend proxy
 * (web/etf-proxy/, mounted automatically by `npm run dev`) that reads NSE's public ETF snapshot.
 */
import type { DailyHistory, EtfQuote, QuoteBatch } from '../types';

/** Endpoint of the backend proxy. Override with VITE_ETF_API_URL. */
export const LIVE_ENDPOINT: string = (import.meta.env.VITE_ETF_API_URL as string | undefined) ?? '/api/etf/quotes';

/**
 * Expected response: { ts?, asOf?, navDate?, quotes: EtfQuote[] } — one entry per symbol.
 * Throws on network/HTTP/shape errors so the caller can show a message and keep the last good data.
 */
export async function fetchLiveQuotes(symbols: string[], signal?: AbortSignal): Promise<QuoteBatch> {
  const res = await fetch(`${LIVE_ENDPOINT}?symbols=${encodeURIComponent(symbols.join(','))}`, { signal, cache: 'no-store' });
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: string }).error ?? '';
    } catch {
      /* body was not JSON */
    }
    throw new Error(detail || `Proxy returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as Partial<QuoteBatch>;
  if (!Array.isArray(body.quotes) || !body.quotes.length) throw new Error('Proxy response has no quotes');
  const quotes = body.quotes.filter(
    (q): q is EtfQuote => !!q && typeof q.symbol === 'string' && Number.isFinite(q.ltp) && Number.isFinite(q.inav) && Number.isFinite(q.prevClose),
  );
  if (!quotes.length) throw new Error('Proxy quotes are missing ltp / nav / prevClose');
  return { ts: body.ts ?? Date.now(), asOf: body.asOf, navDate: body.navDate, quotes };
}

const HISTORY_ENDPOINT = LIVE_ENDPOINT.replace(/\/quotes$/, '/history');

/** Daily close vs end-of-day NAV for one ETF (about 6 months). Throws with the proxy's message on failure. */
export async function fetchDailyHistory(symbol: string, signal?: AbortSignal): Promise<DailyHistory> {
  const res = await fetch(`${HISTORY_ENDPOINT}?symbol=${encodeURIComponent(symbol)}`, { signal });
  const body = (await res.json().catch(() => ({}))) as Partial<DailyHistory> & { error?: string };
  if (!res.ok) throw new Error(body.error || `Proxy returned HTTP ${res.status}`);
  if (!Array.isArray(body.rows)) throw new Error('Proxy history response has no rows');
  return body as DailyHistory;
}
