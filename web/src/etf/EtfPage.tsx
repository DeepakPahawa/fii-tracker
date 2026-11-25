import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlertSettings, CategoryFilter, DataMode } from './types';
import { useETFMarketData } from './hooks/useETFMarketData';
import { alertBreach, formatIstTime, marketState, matchesFilter, sortRows, type SortKey } from './utils/etfCalculations';
import { KpiCards } from './components/KpiCards';
import { WatchlistTable } from './components/WatchlistTable';
import { DetailDrawer } from './components/DetailDrawer';
import { AlertPanel } from './components/AlertPanel';
import { pct } from './format';

const INTERVALS = [3, 5, 10, 30] as const;
const FILTERS: CategoryFilter[] = ['All', 'Indices', 'Sectoral', 'Commodity', 'Global'];
const ALERT_KEY = 'etf-alerts';
const DEFAULT_ALERTS: AlertSettings = { enabled: false, discountPct: 0.3, premiumPct: 0.3, sound: true };

function loadAlerts(): AlertSettings {
  try {
    return { ...DEFAULT_ALERTS, ...(JSON.parse(localStorage.getItem(ALERT_KEY) ?? 'null') as Partial<AlertSettings> | null) };
  } catch {
    return DEFAULT_ALERTS;
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable or blocked until a user gesture */
  }
}

export default function EtfPage() {
  const [mode, setMode] = useState<DataMode>('mock');
  const [intervalSec, setIntervalSec] = useState<number>(5);
  const [filter, setFilter] = useState<CategoryFilter>('All');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('spreadPct');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [selected, setSelected] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertSettings>(loadAlerts);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: 'discount' | 'premium' }[]>([]);
  const [now, setNow] = useState(Date.now());

  const { rows, history, lastUpdated, tick, error, refresh } = useETFMarketData({ mode, intervalMs: intervalSec * 1000 });

  // Clock for the market-status countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const saveAlerts = (s: AlertSettings) => {
    setAlerts(s);
    try {
      localStorage.setItem(ALERT_KEY, JSON.stringify(s));
    } catch {
      /* not persisted */
    }
  };

  // Edge-triggered alerts: fire once when an ETF crosses a threshold, re-arm when it leaves.
  const breached = useRef<Set<string>>(new Set());
  const alerting = useMemo(() => new Set(rows.filter((r) => alertBreach(r, alerts)).map((r) => r.symbol)), [rows, alerts]);
  useEffect(() => {
    const fresh = rows.filter((r) => alertBreach(r, alerts) && !breached.current.has(r.symbol));
    breached.current = new Set(alerting);
    if (!fresh.length) return;
    const added = fresh.map((r, i) => ({
      id: Date.now() + i,
      kind: alertBreach(r, alerts)!,
      text: `${r.symbol} ${alertBreach(r, alerts) === 'discount' ? 'at discount' : 'at premium'} ${pct(r.spreadPct)}`,
    }));
    setToasts((t) => [...t, ...added].slice(-4));
    if (alerts.sound) beep();
    const ids = new Set(added.map((a) => a.id));
    window.setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 6000);
  }, [rows, alerts, alerting]);

  const onSort = useCallback((k: SortKey) => {
    setSortKey((cur) => {
      setDir((d) => (cur === k ? (d === 1 ? -1 : 1) : k === 'symbol' ? 1 : -1));
      return k;
    });
  }, []);

  const visible = useMemo(() => sortRows(rows.filter((r) => matchesFilter(r, filter, query)), sortKey, dir), [rows, filter, query, sortKey, dir]);
  const market = marketState(now);
  const current = rows.find((r) => r.symbol === selected) ?? null;

  const chip = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <div className="min-h-screen bg-slate-950 font-mono text-slate-200">
      <div className="mx-auto w-full max-w-[1500px] space-y-4 px-4 py-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">ETF iNAV Tracker</h1>
            <p className="mt-0.5 text-sm text-slate-400">LTP vs iNAV premium / discount for 20 liquid NSE ETFs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-2 text-slate-400" aria-live="off">
              <span key={tick} className={`inline-block h-2.5 w-2.5 rounded-full ${error ? 'bg-rose-500' : 'animate-ping-once bg-emerald-400'}`} />
              {lastUpdated ? `Updated ${formatIstTime(lastUpdated)}` : 'Waiting for data…'}
            </span>
            <label className="flex items-center gap-1.5 text-slate-400">
              Refresh
              <select value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
                {INTERVALS.map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            </label>
            <div role="group" aria-label="Data source" className="inline-flex rounded-full border border-slate-800 bg-slate-900 p-0.5">
              {(['mock', 'live'] as DataMode[]).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={chip(mode === m)}>
                  {m === 'mock' ? 'Simulated' : 'Live proxy'}
                </button>
              ))}
            </div>
            <button type="button" onClick={refresh} className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-300 hover:bg-slate-800">Refresh now</button>
            <a href="#/" className="text-slate-400 underline-offset-2 hover:text-slate-100 hover:underline">← FII Tracker</a>
          </div>
        </header>

        {mode === 'mock' && <p className="text-xs text-amber-300/80">Simulated data: random-walk ticks within ±0.20% — not real prices. Switch to “Live proxy” once the backend is configured (see web/etf-proxy/README.md).</p>}
        {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">Live feed error: {error}. Showing last good data.</p>}

        <KpiCards rows={rows} market={market} />
        <AlertPanel settings={alerts} onChange={saveAlerts} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Category filter" className="inline-flex flex-wrap rounded-full border border-slate-800 bg-slate-900 p-0.5">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>{f}</button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or name…"
            aria-label="Search ETFs"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-500 sm:w-72"
          />
        </div>

        <WatchlistTable rows={visible} sortKey={sortKey} dir={dir} onSort={onSort} onSelect={setSelected} alerting={alerting} />

        <p className="pb-4 text-xs leading-relaxed text-slate-500">
          Spread % = (LTP − iNAV) / iNAV × 100. Fair within ±0.10%; discount below −0.15%; premium above +0.15%; in between is marginal. iNAV is indicative and can lag the
          underlying, especially for global and commodity ETFs when their home markets are closed. Not investment advice.
        </p>
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg border px-4 py-2.5 text-sm shadow-lg ${t.kind === 'discount' ? 'border-emerald-400/50 bg-emerald-950 text-emerald-200' : 'border-amber-400/50 bg-amber-950 text-amber-200'}`}>
            {t.text}
          </div>
        ))}
      </div>

      <DetailDrawer row={current} history={current ? history.get(current.symbol) ?? [] : []} onClose={() => setSelected(null)} />
    </div>
  );
}
