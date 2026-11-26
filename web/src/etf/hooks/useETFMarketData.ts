import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EtfQuote, EtfRow, HistoryPoint, QuoteBatch } from '../types';
import { fetchLiveQuotes } from '../services/marketData';
import { enrich } from '../utils/etfCalculations';
import { ETF_UNIVERSE } from '../universe';

/** Refresh cadence: on open, then every 30 minutes (also after market close). */
export const REFRESH_MS = 30 * 60 * 1000;
/** ETFs requested per call; each call lands independently so rows appear progressively. */
const CHUNK_SIZE = 4;
const HISTORY_LIMIT = 400;
const STORE_KEY = 'etf-last-session-v1';

interface Stored {
  batch: QuoteBatch;
  history: [string, HistoryPoint[]][];
}

function readStored(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Stored | null;
    return s?.batch?.quotes ? s : null;
  } catch {
    return null;
  }
}

const ORDER = new Map(ETF_UNIVERSE.map((e, i) => [e.symbol, i]));
const SYMBOLS = ETF_UNIVERSE.map((e) => e.symbol);

export interface UseETFMarketData {
  rows: EtfRow[];
  history: Map<string, HistoryPoint[]>;
  lastUpdated: number | null;
  /** NSE's own timestamp and the date of the reference NAV, when the proxy supplies them. */
  asOf: string | null;
  navDate: string | null;
  /** True while a fetch is in flight. */
  loading: boolean;
  /** ETFs received so far in the current fetch, out of `total`. */
  progress: { done: number; total: number };
  /** True until the first fresh data of this page load arrives (rows are the saved snapshot, if any). */
  stale: boolean;
  /** Increments each time a chunk of fresh data lands; use as a key to retrigger the pulse animation. */
  tick: number;
  error: string | null;
  refresh: () => void;
}

/**
 * Single entry point for ETF data. Fetches immediately on mount and then every 30 minutes, regardless of
 * market hours. A fetch is split into small chunks that complete independently, so the table fills in as
 * data arrives. The last result is saved locally and shown instantly on the next visit while fetching.
 */
export function useETFMarketData(): UseETFMarketData {
  const [rows, setRows] = useState<EtfRow[]>([]);
  const [history, setHistory] = useState<Map<string, HistoryPoint[]>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ asOf: string | null; navDate: string | null }>({ asOf: null, navDate: null });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: SYMBOLS.length });
  const [stale, setStale] = useState(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const quotes = useRef(new Map<string, EtfQuote>());
  const historyRef = useRef(new Map<string, HistoryPoint[]>());
  const metaRef = useRef<{ ts: number; asOf?: string; navDate?: string }>({ ts: 0 });
  /** Each fetch gets a number; results from superseded fetches (unmount, StrictMode, manual refresh) are dropped. */
  const generation = useRef(0);

  const publish = useCallback(() => {
    const next = [...quotes.current.values()]
      .map(enrich)
      .filter((r): r is EtfRow => r !== null)
      .sort((a, b) => (ORDER.get(a.symbol) ?? 0) - (ORDER.get(b.symbol) ?? 0));
    setRows(next);
    setHistory(new Map(historyRef.current));
  }, []);

  const persist = useCallback(() => {
    try {
      const batch: QuoteBatch = { ...metaRef.current, quotes: [...quotes.current.values()] };
      localStorage.setItem(STORE_KEY, JSON.stringify({ batch, history: [...historyRef.current] } satisfies Stored));
    } catch {
      /* storage full or blocked: just won't survive a reload */
    }
  }, []);

  const poll = useCallback(
    async (signal?: AbortSignal) => {
      const gen = ++generation.current;
      setLoading(true);
      setProgress({ done: 0, total: SYMBOLS.length });
      setError(null);
      let done = 0;
      let failure: string | null = null;
      const chunks: string[][] = [];
      for (let i = 0; i < SYMBOLS.length; i += CHUNK_SIZE) chunks.push(SYMBOLS.slice(i, i + CHUNK_SIZE));

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const batch = await fetchLiveQuotes(chunk, signal);
            if (gen !== generation.current) return;
            for (const q of batch.quotes) {
              quotes.current.set(q.symbol, q);
              const arr = [...(historyRef.current.get(q.symbol) ?? []), { ts: batch.ts, ltp: q.ltp, inav: q.inav }];
              historyRef.current.set(q.symbol, arr.length > HISTORY_LIMIT ? arr.slice(-HISTORY_LIMIT) : arr);
            }
            metaRef.current = { ts: batch.ts, asOf: batch.asOf, navDate: batch.navDate };
            done += batch.quotes.length;
            publish(); // show this chunk right away
            setLastUpdated(batch.ts);
            setMeta({ asOf: batch.asOf ?? null, navDate: batch.navDate ?? null });
            setStale(false);
            setProgress({ done, total: SYMBOLS.length });
            setTick((t) => t + 1);
          } catch (e) {
            if ((e as Error).name === 'AbortError' || gen !== generation.current) return;
            failure = (e as Error).message || 'Failed to fetch quotes';
          }
        }),
      );

      if (gen !== generation.current) return;
      setLoading(false);
      if (failure) setError(failure);
      if (done) persist();
    },
    [publish, persist],
  );

  // On load: show the last saved snapshot instantly (marked stale), then fetch fresh data right away.
  useEffect(() => {
    const s = readStored();
    if (s) {
      quotes.current = new Map(s.batch.quotes.map((q) => [q.symbol, q]));
      historyRef.current = new Map(s.history);
      metaRef.current = { ts: s.batch.ts, asOf: s.batch.asOf, navDate: s.batch.navDate };
      publish();
      setLastUpdated(s.batch.ts);
      setMeta({ asOf: s.batch.asOf ?? null, navDate: s.batch.navDate ?? null });
    }
    const ctrl = new AbortController();
    void poll(ctrl.signal);
    const id = window.setInterval(() => void poll(ctrl.signal), REFRESH_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [poll, publish]);

  const refresh = useCallback(() => void poll(), [poll]);

  return useMemo(
    () => ({ rows, history, lastUpdated, asOf: meta.asOf, navDate: meta.navDate, loading, progress, stale, tick, error, refresh }),
    [rows, history, lastUpdated, meta, loading, progress, stale, tick, error, refresh],
  );
}
