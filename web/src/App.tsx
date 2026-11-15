import { useEffect, useMemo, useState } from 'react';
import type { Row, Summary } from './types';
import { fmtDateTime, fmtPp, fmtQuarter } from './format';
import { SectorChart } from './components/SectorChart';
import { HoldingsTable } from './components/HoldingsTable';
import { StockDetail } from './components/HistoryChart';
import { ThemeToggle } from './components/ThemeToggle';

type Load = { state: 'loading' } | { state: 'empty' } | { state: 'error'; message: string } | { state: 'ok'; data: Summary };

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="num mt-1 text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-line bg-surface p-6 text-sm text-ink-2">
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
  const [industry, setIndustry] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/summary.json`, { cache: 'no-cache' })
      .then(async (r) => {
        if (r.status === 404) return setLoad({ state: 'empty' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Summary;
        setLoad(data.rows?.length ? { state: 'ok', data } : { state: 'empty' });
      })
      .catch((e: unknown) => {
        // Vite dev serves index.html for missing files, which fails JSON parsing.
        if (e instanceof SyntaxError) setLoad({ state: 'empty' });
        else setLoad({ state: 'error', message: String(e) });
      });
  }, []);

  const stats = useMemo(() => {
    if (load.state !== 'ok') return null;
    const filed = load.data.rows.filter((r) => !r.pending && r.changePp != null);
    const changes = filed.map((r) => r.changePp as number);
    return {
      up: changes.filter((c) => c > 0.01).length,
      down: changes.filter((c) => c < -0.01).length,
      median: median(changes),
      compared: filed.length,
    };
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ink">FII Tracker</h1>
          <ThemeToggle />
        </div>
        <p className="mt-1 text-sm text-ink-2">
          Foreign Portfolio Investor holdings in Nifty 500 stocks, from quarterly shareholding-pattern filings (SEBI LODR Reg. 31).
        </p>
        {load.state === 'ok' && (
          <p className="num mt-2 text-xs text-ink-3">
            {fmtQuarter(load.data.latestQuarter)} vs {fmtQuarter(load.data.previousQuarter)} · {load.data.coverage.withLatest} of{' '}
            {load.data.coverage.universe} filed for the latest quarter · updated {fmtDateTime(load.data.generatedAt)}
          </p>
        )}
      </header>

      {load.state === 'loading' && <p className="text-sm text-ink-3">Loading…</p>}
      {load.state === 'empty' && <EmptyState />}
      {load.state === 'error' && <p className="text-sm text-down">Could not load data: {load.message}</p>}

      {load.state === 'ok' && stats && (
        <main className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="FPIs increased stake" value={String(stats.up)} sub={`of ${stats.compared} compared`} />
            <Tile label="FPIs cut stake" value={String(stats.down)} sub={`of ${stats.compared} compared`} />
            <Tile label="Median change" value={fmtPp(stats.median)} sub="per stock, since last quarter" />
            <Tile
              label="Not yet filed"
              value={String(load.data.coverage.withAny - load.data.coverage.withLatest)}
              sub={`for ${fmtQuarter(load.data.latestQuarter)}`}
            />
          </div>

          {selected && <StockDetail row={selected} onClose={() => setSelected(null)} />}

          <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">Average FPI holding change by sector</h2>
              <span className="text-xs text-ink-3">
                percentage points · <span className="text-up">■</span> added · <span className="text-down">■</span> cut · click a bar to
                filter
              </span>
            </div>
            <SectorChart rows={load.data.rows} selected={industry} onSelect={setIndustry} />
          </section>

          <HoldingsTable
            rows={load.data.rows}
            industry={industry}
            onIndustry={setIndustry}
            selected={selected?.symbol ?? null}
            onSelect={(r) => {
              setSelected(r);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />

          <footer className="pb-4 text-xs text-ink-3">
            FPI % = Category I + Category II (+ legacy FII rows) as % of total shares. A % change can come from the company's share
            count changing; rows marked ⚠ show this. Data from NSE filings; not investment advice.
          </footer>
        </main>
      )}
    </div>
  );
}
