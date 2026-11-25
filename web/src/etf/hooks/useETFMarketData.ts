import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EtfRow, HistoryPoint, QuoteBatch } from '../types';
import { fetchLiveQuotes } from '../services/marketData';
import { enrich, marketState } from '../utils/etfCalculations';

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

export interface UseETFMarketData {
  rows: EtfRow[];
  history: Map<string, HistoryPoint[]>;
  lastUpdated: number | null;
  /** NSE's own timestamp and the date of the reference NAV, when the proxy supplies them. */
  asOf: string | null;
  navDate: string | null;
  /** True when the rows shown are the last saved snapshot (market closed), not a fresh fetch. */
  stale: boolean;
  /** Increments on every successful fetch; use as a key to retrigger the pulse animation. */
  tick: number;
  error: string | null;
  refresh: () => void;
}

/**
 * Single entry point for ETF data. Polls the proxy every `intervalMs` while NSE is open
 * (Mon-Fri 09:15-15:30 IST). Once it is closed, exactly one fetch is made (the final snapshot) and
 * polling stops until the next open. The last snapshot is saved locally and shown on reload.
 */
export function useETFMarketData({ intervalMs }: { intervalMs: number }): UseETFMarketData {
  const [rows, setRows] = useState<EtfRow[]>([]);
  const [history, setHistory] = useState<Map<string, HistoryPoint[]>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ asOf: string | null; navDate: string | null }>({ asOf: null, navDate: null });
  const [stale, setStale] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** True once the single after-close fetch has been made; reset whenever the market is seen open. */
  const closedFetched = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;

  const apply = useCallback((batch: QuoteBatch, fresh: boolean) => {
    const next = batch.quotes.map(enrich).filter((r): r is EtfRow => r !== null);
    setRows(next);
    setLastUpdated(batch.ts);
    setMeta({ asOf: batch.asOf ?? null, navDate: batch.navDate ?? null });
    setStale(!fresh);
    if (fresh) {
      const map = new Map(historyRef.current);
      for (const r of next) {
        const arr = [...(map.get(r.symbol) ?? []), { ts: batch.ts, ltp: r.ltp, inav: r.inav }];
        map.set(r.symbol, arr.length > HISTORY_LIMIT ? arr.slice(-HISTORY_LIMIT) : arr);
      }
      setHistory(map);
      setTick((t) => t + 1);
      setError(null);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ batch, history: [...map] } satisfies Stored));
      } catch {
        /* storage full or blocked: just won't survive a reload */
      }
    }
  }, []);

  const poll = useCallback(
    async (signal?: AbortSignal) => {
      if (marketState(Date.now()).open) {
        closedFetched.current = false;
      } else {
        if (closedFetched.current) return; // closed: the one fetch is already done, stay idle
        closedFetched.current = true;
      }
      try {
        apply(await fetchLiveQuotes(signal), true);
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          if (!marketState(Date.now()).open) closedFetched.current = false; // aborted by StrictMode/unmount: let the remount fetch
          return;
        }
        setError((e as Error).message || 'Failed to fetch quotes');
      }
    },
    [apply],
  );

  // On load: show the last saved snapshot immediately (also the only thing shown while closed).
  useEffect(() => {
    const s = readStored();
    if (!s) return;
    historyRef.current = new Map(s.history);
    setHistory(historyRef.current);
    apply(s.batch, false);
  }, [apply]);

  useEffect(() => {
    const ctrl = new AbortController();
    void poll(ctrl.signal);
    const id = window.setInterval(() => void poll(ctrl.signal), intervalMs);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [poll, intervalMs]);

  // Manual refresh only does something while the market is open (closed: one fetch only).
  const refresh = useCallback(() => void poll(), [poll]);

  return useMemo(
    () => ({ rows, history, lastUpdated, asOf: meta.asOf, navDate: meta.navDate, stale, tick, error, refresh }),
    [rows, history, lastUpdated, meta, stale, tick, error, refresh],
  );
}
