import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataMode, EtfRow, HistoryPoint, QuoteBatch } from '../types';
import { createSimulator, fetchLiveQuotes, type Simulator } from '../services/marketData';
import { enrich } from '../utils/etfCalculations';

const HISTORY_LIMIT = 400;
const BACKFILL_POINTS = 90;
const BACKFILL_STEP_MS = 60_000;

export interface UseETFMarketDataOptions {
  mode: DataMode;
  /** Polling interval in ms (e.g. 3000, 5000, 10000, 30000). */
  intervalMs: number;
}

export interface UseETFMarketData {
  rows: EtfRow[];
  history: Map<string, HistoryPoint[]>;
  lastUpdated: number | null;
  /** Increments on every successful refresh; use as a key to retrigger the pulse animation. */
  tick: number;
  error: string | null;
  refresh: () => void;
}

/**
 * Single entry point for ETF data. Polls the simulator or the live proxy on an interval,
 * derives spread / status per ETF and keeps a bounded intraday LTP-vs-iNAV history.
 */
export function useETFMarketData({ mode, intervalMs }: UseETFMarketDataOptions): UseETFMarketData {
  const [rows, setRows] = useState<EtfRow[]>([]);
  const [history, setHistory] = useState<Map<string, HistoryPoint[]>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const simRef = useRef<Simulator | null>(null);

  const apply = useCallback((batch: QuoteBatch) => {
    const next = batch.quotes.map(enrich).filter((r): r is EtfRow => r !== null);
    setRows(next);
    setHistory((prev) => {
      const map = new Map(prev);
      for (const r of next) {
        const arr = [...(map.get(r.symbol) ?? []), { ts: batch.ts, ltp: r.ltp, inav: r.inav }];
        map.set(r.symbol, arr.length > HISTORY_LIMIT ? arr.slice(-HISTORY_LIMIT) : arr);
      }
      return map;
    });
    setLastUpdated(batch.ts);
    setTick((t) => t + 1);
    setError(null);
  }, []);

  const poll = useCallback(
    async (signal?: AbortSignal) => {
      try {
        if (mode === 'mock') {
          simRef.current ??= createSimulator();
          apply(simRef.current.tick());
        } else {
          apply(await fetchLiveQuotes(signal));
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message || 'Failed to fetch quotes');
      }
    },
    [mode, apply],
  );

  // Switching source resets the data so mock and live numbers never mix.
  useEffect(() => {
    setRows([]);
    setHistory(new Map());
    setLastUpdated(null);
    setError(null);
    if (mode === 'mock') {
      simRef.current = createSimulator();
      setHistory(simRef.current.backfill(BACKFILL_POINTS, BACKFILL_STEP_MS));
    } else {
      simRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    const ctrl = new AbortController();
    void poll(ctrl.signal);
    const id = window.setInterval(() => void poll(ctrl.signal), intervalMs);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [poll, intervalMs]);

  const refresh = useCallback(() => void poll(), [poll]);

  return useMemo(() => ({ rows, history, lastUpdated, tick, error, refresh }), [rows, history, lastUpdated, tick, error, refresh]);
}
