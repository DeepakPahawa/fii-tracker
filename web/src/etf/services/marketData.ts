/**
 * Market data service for the ETF tracker.
 *
 * Two sources behind one shape (`QuoteBatch`):
 *  - `createSimulator()`  — a realistic random-walk feed; needs no keys, runs anywhere.
 *  - `fetchLiveQuotes()`  — calls a backend proxy (see web/etf-proxy/README.md for the contract).
 *
 * The UI never talks to a broker directly: API secrets and CORS stay on the proxy.
 */
import type { EtfQuote, HistoryPoint, QuoteBatch } from '../types';
import { ETF_UNIVERSE } from '../universe';

/** Max |premium/discount| the simulator allows, in percent. */
const MAX_SIM_SPREAD_PCT = 0.2;

// ---------------------------------------------------------------- simulator

interface SimState {
  symbol: string;
  prevClose: number;
  inav: number;
  /** Premium/discount of LTP over iNAV, in percent (mean-reverting). */
  premiumPct: number;
  volume: number;
  turnover: number;
  volPerTick: number;
}

/** Box-Muller standard normal. */
function randn(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface Simulator {
  /** Advance one tick and return the new snapshot. */
  tick(): QuoteBatch;
  /** Pre-generated intraday history so charts are not empty on first paint. */
  backfill(points: number, stepMs: number): Map<string, HistoryPoint[]>;
}

export function createSimulator(): Simulator {
  const states: SimState[] = ETF_UNIVERSE.map((e) => {
    // Open slightly away from the previous close, within the +/-0.20% walk range.
    const prevClose = e.seedPrice * (1 + randn() * 0.002);
    return {
      symbol: e.symbol,
      prevClose: round2(prevClose),
      inav: prevClose * (1 + randn() * 0.001),
      premiumPct: randn() * 0.05,
      volume: e.seedVolume * 0.15 * Math.random(),
      turnover: 0,
      volPerTick: e.seedVolume / 1500,
    };
  });
  states.forEach((s) => (s.turnover = s.volume * s.inav));

  const step = (s: SimState) => {
    // iNAV: small random walk, kept within +/-2% of the previous close so the day change stays realistic.
    s.inav = clamp(s.inav * (1 + randn() * 0.0004), s.prevClose * 0.98, s.prevClose * 1.02);
    // Premium: Ornstein-Uhlenbeck (mean-reverting) so mispricings appear and fade, hard-clamped to +/-0.20%.
    s.premiumPct = clamp(s.premiumPct * 0.92 + randn() * 0.045, -MAX_SIM_SPREAD_PCT, MAX_SIM_SPREAD_PCT);
    const ltp = s.inav * (1 + s.premiumPct / 100);
    const traded = Math.max(0, s.volPerTick * (0.4 + Math.random() * 1.2));
    s.volume += traded;
    s.turnover += traded * ltp;
    return ltp;
  };

  const snapshot = (ltps: Map<string, number>, ts: number): QuoteBatch => ({
    ts,
    quotes: states.map<EtfQuote>((s) => ({
      symbol: s.symbol,
      ltp: round2(ltps.get(s.symbol)!),
      prevClose: s.prevClose,
      inav: round2(s.inav),
      volume: Math.round(s.volume),
      turnover: Math.round(s.turnover),
    })),
  });

  return {
    tick() {
      const ltps = new Map<string, number>();
      for (const s of states) ltps.set(s.symbol, step(s));
      return snapshot(ltps, Date.now());
    },
    backfill(points, stepMs) {
      const out = new Map<string, HistoryPoint[]>(states.map((s) => [s.symbol, []]));
      const now = Date.now();
      for (let i = points; i > 0; i--) {
        const ts = now - i * stepMs;
        for (const s of states) {
          const ltp = step(s);
          out.get(s.symbol)!.push({ ts, ltp: round2(ltp), inav: round2(s.inav) });
        }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- live proxy

/** Endpoint of the backend proxy. Override with VITE_ETF_API_URL. */
export const LIVE_ENDPOINT: string = (import.meta.env.VITE_ETF_API_URL as string | undefined) ?? '/api/etf/quotes';

/**
 * Expected response: { ts?: number, quotes: EtfQuote[] } — one entry per symbol.
 * Throws on network/HTTP/shape errors so the caller can show a message and keep the last good data.
 */
export async function fetchLiveQuotes(signal?: AbortSignal): Promise<QuoteBatch> {
  const symbols = ETF_UNIVERSE.map((e) => e.symbol).join(',');
  const res = await fetch(`${LIVE_ENDPOINT}?symbols=${encodeURIComponent(symbols)}`, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Proxy returned HTTP ${res.status}`);
  const body = (await res.json()) as Partial<QuoteBatch>;
  if (!Array.isArray(body.quotes) || !body.quotes.length) throw new Error('Proxy response has no quotes');
  const quotes = body.quotes.filter(
    (q): q is EtfQuote => !!q && typeof q.symbol === 'string' && Number.isFinite(q.ltp) && Number.isFinite(q.inav) && Number.isFinite(q.prevClose),
  );
  if (!quotes.length) throw new Error('Proxy quotes are missing ltp / inav / prevClose');
  return { ts: body.ts ?? Date.now(), quotes };
}
