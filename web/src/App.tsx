import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Row, Summary } from './types';
import { normalizeSummary } from './normalize';
import { fmtDateTime, fmtQuarter } from './format';
import { METRICS, METRIC_LABEL, metricView, type Metric } from './metrics';
import { listStocks, type Preset, type SortKey } from './listing';
import { SectorChart } from './components/SectorChart';
import { StockList } from './components/StockList';
import { StockDetail } from './components/StockDetail';
import { MetricChecks } from './components/MetricChecks';
import { ThemeToggle } from './components/ThemeToggle';
import { FlowsView } from './components/FlowsView';

type Load = { state: 'loading' } | { state: 'empty' } | { state: 'error'; message: string } | { state: 'ok'; data: Summary; legacy: boolean };
type Tab = 'stock' | 'sectors' | 'flows';

const SERIES_KEY = 'fii-series';
const ALL_ON: Record<Metric, boolean> = { fii: true, dii: true, pro: true };

function loadActive(): Record<Metric, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(SERIES_KEY) ?? 'null') as Partial<Record<Metric, boolean>> | null;
    if (raw && METRICS.some((m) => raw[m])) return { fii: !!raw.fii, dii: !!raw.dii, pro: !!raw.pro };
  } catch {
    /* storage blocked or corrupt: use the default */
  }
  return ALL_ON;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function EmptyState() {
  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-line bg-surface p-6 text-sm text-ink-2">
      <h2 className="text-base font-semibold text-ink">No data yet</h2>
      <p className="mt-2">
        The page reads <code>data/summary.json</code>, which the Python fetcher writes. From the repo root:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs text-ink">{`cd fetcher
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m fii_fetcher all --limit 20   # try 20 stocks first
.venv/bin/python -m fii_fetcher all              # full Nifty 500`}</pre>
      <p className="mt-3">
        If NSE blocks the fetcher, download shareholding XBRL files by hand into <code>fetcher/inbox/</code> and run{' '}
        <code>import-xbrl</code> then <code>summarize</code>.
      </p>
    </div>
  );
}

export default function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [active, setActive] = useState<Record<Metric, boolean>>(loadActive);
  const [focus, setFocus] = useState<Metric>(() => METRICS.find((m) => loadActive()[m]) ?? 'fii');
  const [sortKey, setSortKey] = useState<SortKey>('change');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [preset, setPreset] = useState<Preset>('all');
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState('');
  const [hidePending, setHidePending] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stock');
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/summary.json`, { cache: 'no-cache' })
      .then(async (r) => {
        if (r.status === 404) return setLoad({ state: 'empty' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Summary;
        if (!data.rows?.length) return setLoad({ state: 'empty' });
        const { data: norm, legacy } = normalizeSummary(data);
        setLoad({ state: 'ok', data: norm, legacy });
      })
      .catch((e: unknown) => {
        // Vite dev serves index.html for missing files, which fails JSON parsing.
        if (e instanceof SyntaxError) setLoad({ state: 'empty' });
        else setLoad({ state: 'error', message: String(e) });
      });
  }, []);

  // "/" jumps to search, like most data tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && t?.tagName !== 'INPUT' && t?.tagName !== 'SELECT' && t?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeList = useMemo(() => METRICS.filter((m) => active[m]), [active]);
  const allRows = useMemo(() => (load.state === 'ok' ? load.data.rows : []), [load]);

  // Stocks that have a value for at least one selected series.
  const baseRows = useMemo(() => allRows.filter((r) => activeList.some((m) => metricView(r, m).pct != null)), [allRows, activeList]);
  const industries = useMemo(() => [...new Set(baseRows.map((r) => r.industry))].sort(), [baseRows]);

  const listed = useMemo(
    () => listStocks(baseRows, { query, industry, hidePending, focus, sortKey, dir, preset }),
    [baseRows, query, industry, hidePending, focus, sortKey, dir, preset],
  );

  const current: Row | null = useMemo(
    () => allRows.find((r) => r.symbol === selectedSymbol) ?? listed[0] ?? null,
    [allRows, selectedSymbol, listed],
  );

  const stats = useMemo(() => {
    const vs = listed.map((r) => metricView(r, focus)).filter((v) => !v.pending && v.change != null);
    const ch = vs.map((v) => v.change as number);
    return { up: ch.filter((c) => c > 0.01).length, down: ch.filter((c) => c < -0.01).length, median: median(ch), compared: ch.length };
  }, [listed, focus]);

  const toggleMetric = (m: Metric) => {
    const next = { ...active, [m]: !active[m] };
    if (!METRICS.some((x) => next[x])) return; // keep at least one
    setActive(next);
    if (!next[focus]) setFocus(METRICS.find((x) => next[x]) ?? 'fii');
    try {
      localStorage.setItem(SERIES_KEY, JSON.stringify(next));
    } catch {
      /* choice just won't persist */
    }
  };

  const choose = useCallback((r: Row) => {
    setSelectedSymbol(r.symbol);
    setTab('stock');
    if (window.innerWidth < 1024) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const navigate = (to: 'next' | 'prev' | 'first' | 'last') => {
    if (!listed.length) return;
    const i = current ? listed.findIndex((r) => r.symbol === current.symbol) : -1;
    const next = to === 'first' ? 0 : to === 'last' ? listed.length - 1 : Math.min(listed.length - 1, Math.max(0, i + (to === 'next' ? 1 : -1)));
    setSelectedSymbol(listed[next].symbol);
    setTab('stock');
  };

  const onSortKey = (k: SortKey) => {
    setSortKey(k);
    setDir(k === 'name' ? 1 : -1);
  };

  // A preset is a ranking shortcut too: Decreased reads best worst-first.
  const onPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'down' || p === 'falling') {
      setSortKey(p === 'down' ? 'change' : 'streak');
      setDir(1);
    } else if (p === 'up' || p === 'rising') {
      setSortKey(p === 'up' ? 'change' : 'streak');
      setDir(-1);
    }
  };

  const coverage = load.state === 'ok' ? load.data.coverage : null;
  const filedForFocus = coverage ? (focus === 'fii' ? coverage.withLatest : focus === 'dii' ? coverage.diiWithLatest : coverage.proWithLatest) ?? 0 : 0;
  const missing = activeList.filter((m) => !allRows.some((r) => metricView(r, m).pct != null));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:h-screen lg:overflow-hidden">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">FII Tracker</h1>
          <ThemeToggle />
        </div>
        <p className="mt-0.5 max-w-3xl text-sm text-ink-2">
          Who holds Nifty 500 stocks: foreign investors, domestic institutions and promoters, from quarterly shareholding filings.
        </p>
        {load.state === 'ok' && (
          <p className="num mt-1 text-xs text-ink-3">
            {fmtQuarter(load.data.latestQuarter)} vs {fmtQuarter(load.data.previousQuarter)} · {filedForFocus} of {load.data.coverage.universe}{' '}
            filed ({METRIC_LABEL[focus]}) · updated {fmtDateTime(load.data.generatedAt)}
          </p>
        )}
      </header>

      {load.state === 'loading' && <p className="mt-6 text-sm text-ink-3">Loading…</p>}
      {load.state === 'empty' && <EmptyState />}
      {load.state === 'error' && <p className="mt-6 text-sm text-down">Could not load data: {load.message}</p>}

      {load.state === 'ok' && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
            <MetricChecks active={active} onToggle={toggleMetric} />
            <p className="hidden text-xs text-ink-3 md:block">Tick the series to plot and list. Rank and filter by any of them.</p>
          </div>

          {load.legacy ? (
            <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-2">
              <p>
                <span className="font-semibold text-ink">This data file was built by an older version</span>, so DII and Promoters are missing and the
                chart can only draw FII. Rebuild it once from the fetcher folder:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 p-2.5 text-xs text-ink">{`.venv/bin/python -m fii_fetcher summarize`}</pre>
              <p className="mt-2 text-xs text-ink-3">
                That adds promoters. DII values are read from the filings themselves, so if DII is still empty afterwards run{' '}
                <code className="rounded bg-surface-2 px-1.5 py-0.5">fetch --force</code> and then <code className="rounded bg-surface-2 px-1.5 py-0.5">summarize</code>{' '}
                again.
              </p>
            </div>
          ) : (
            missing.length > 0 && (
              <p className="mt-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
                No {missing.map((m) => METRIC_LABEL[m]).join(' or ')} data in this dataset.
                {missing.includes('dii') && (
                  <>
                    {' '}
                    DII needs a one-time <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">fetch --force</code> then{' '}
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">summarize</code>.
                  </>
                )}
              </p>
            )
          )}

          <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)] lg:grid-rows-1">
            <div className="order-2 min-h-0 min-w-0 lg:order-1">
              <StockList
                items={listed}
                total={baseRows.length}
                active={activeList}
                focus={focus}
                onFocus={setFocus}
                sortKey={sortKey}
                onSortKey={onSortKey}
                dir={dir}
                onDir={() => setDir((d) => (d === 1 ? -1 : 1))}
                query={query}
                onQuery={setQuery}
                searchRef={searchRef}
                industry={industry}
                industries={industries}
                onIndustry={setIndustry}
                preset={preset}
                onPreset={onPreset}
                hidePending={hidePending}
                onHidePending={setHidePending}
                selected={current?.symbol ?? null}
                onSelect={choose}
                onNavigate={navigate}
                stats={stats}
              />
            </div>

            <div ref={detailRef} className="order-1 min-h-0 min-w-0 scroll-mt-4 lg:order-2 lg:overflow-y-auto lg:pr-1">
              <div role="tablist" aria-label="View" className="mb-3 inline-flex rounded-full border border-line bg-surface p-0.5 text-sm">
                {(
                  [
                    ['stock', 'Stock'],
                    ['sectors', 'Sectors'],
                    ['flows', 'Daily flows'],
                  ] as [Tab, string][]
                ).map(([t, label]) => (
                  <button
                    key={t}
                    role="tab"
                    type="button"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-4 py-1.5 font-medium transition-colors ${tab === t ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'stock' ? (
                current ? (
                  <StockDetail row={current} active={active} />
                ) : (
                  <p className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink-3">Pick a stock from the list.</p>
                )
              ) : tab === 'flows' ? (
                <FlowsView />
              ) : (
                <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-base font-semibold text-ink">Average {METRIC_LABEL[focus]} change by sector</h2>
                    <span className="text-xs text-ink-3">
                      percentage points · <span className="text-up">■</span> added · <span className="text-down">■</span> cut · click a bar to filter the list
                    </span>
                  </div>
                  <SectorChart rows={baseRows} metric={focus} selected={industry} onSelect={setIndustry} />
                </section>
              )}

              <p className="mt-4 pb-2 text-xs leading-relaxed text-ink-3">
                FII = Category I + II foreign portfolio investors. DII = domestic institutions (mutual funds, insurers, banks, pension funds, AIFs).
                Promoters = promoters and promoter group. All are % of total shares, from NSE filings for calendar quarter ends; off-cycle filings are ignored. A
                % change can come from the company's share count changing; cards marked ⚠ show this. Not investment advice.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
