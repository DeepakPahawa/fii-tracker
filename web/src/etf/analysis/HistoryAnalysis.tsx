import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dropStudy, loadHistory, sliceRange, summarize, yearly, ZONES, type HRow } from './history';
import { C, PremiumChart, PremiumHistogram, PriceNavChart, ReturnScatter } from './charts';
import { DayMoves } from './DayMoves';
import { inr, signed } from '../format';

const tone = (v: number) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');
const pc = (v: number, d = 2) => (Number.isFinite(v) ? `${signed(v, d)}%` : '–');
const RANGES = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: 'All', years: 0 },
];

function Seg<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-slate-700">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={o.v === value}
          onClick={() => onChange(o.v)}
          className={`px-3 py-1 text-xs ${o.v === value ? 'bg-slate-200 text-slate-900' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <section className="mt-6">
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
    {children}
  </section>
);

const th = 'whitespace-nowrap px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-slate-500 first:text-left';
const td = 'whitespace-nowrap px-3 py-1.5 text-right tabular-nums first:text-left';

/** Full-history analysis for one ETF: close vs NAV, premium distribution, yearly stats, post-drop returns and every row. */
export function HistoryAnalysis({ symbol }: { symbol: string }) {
  const [all, setAll] = useState<HRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [years, setYears] = useState(0);
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    const ctrl = new AbortController();
    setAll(null);
    setError(null);
    setHover(-1);
    loadHistory(symbol, ctrl.signal)
      .then(setAll)
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [symbol]);

  const rows = useMemo(() => (all ? sliceRange(all, years) : []), [all, years]);

  if (error) return <p className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>;
  if (!all) return <p className="mt-6 text-sm text-slate-500">Loading full history…</p>;
  if (all.length < 30) {
    return (
      <p className="mt-6 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-400">
        Only {all.length} days of price and NAV history overlap for {symbol} ({all[0].d} to {all[all.length - 1].d}), which is too short to analyse. Yahoo Finance has no longer record for this ticker.
      </p>
    );
  }

  const s = summarize(all);
  const hr = rows[hover >= 0 && hover < rows.length ? hover : rows.length - 1];
  const kpis: [string, ReactNode, string][] = [
    ['Latest premium', <span className={tone(s.last.p)}>{pc(s.last.p, 3)}</span>, `${s.last.d}`],
    ['Average premium', pc(s.avg, 3), `median ${pc(s.med, 3)}`],
    ['Typical spread', `±${s.sd.toFixed(2)}%`, 'one std deviation'],
    ['Days above NAV', `${(s.aboveNav * 100).toFixed(0)}%`, `${s.over15} days over +0.15%`],
    ['Days below NAV', `${(s.belowNav * 100).toFixed(0)}%`, `${s.under15} days under −0.15%`],
    ['Largest premium', <span className="text-emerald-400">{pc(s.maxPrem.p)}</span>, s.maxPrem.d],
    ['Largest discount', <span className="text-rose-400">{pc(s.maxDisc.p)}</span>, s.maxDisc.d],
    ['Tracking error', `${s.trackingError.toFixed(2)}%`, 'annualised, price vs NAV'],
    ['History', `${all.length.toLocaleString('en-IN')} days`, `${s.first.d} to ${s.last.d}`],
    [`Since ${s.first.d.slice(0, 4)}`, <span className={tone(s.priceChange)}>{pc(s.priceChange, 0)}</span>, `NAV ${pc(s.navChange, 0)}`],
  ];

  return (
    <div className="mt-6 border-t border-slate-800 pt-5">
      <h2 className="text-base font-semibold text-slate-100">Price vs NAV history</h2>
      <p className="text-xs text-slate-500">Daily NSE close against the fund's end-of-day NAV (AMFI), {all.length.toLocaleString('en-IN')} trading days.</p>

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([l, v, n]) => (
          <div key={l} className="min-w-0 bg-slate-950/70 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{l}</p>
            <p className="mt-0.5 truncate text-base font-medium tabular-nums text-slate-100">{v}</p>
            <p className="truncate text-[11px] text-slate-500">{n}</p>
          </div>
        ))}
      </div>

      <Section title="Close against NAV">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-4 text-xs text-slate-400">
            <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle" style={{ background: C.price }} />Close (NSE)</span>
            <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle" style={{ background: C.nav }} />End-of-day NAV</span>
          </div>
          <Seg label="Date range" value={years} onChange={setYears} options={RANGES.map((r) => ({ v: r.years, label: r.label }))} />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
            {[
              ['Date', hr.d, ''],
              ['Close', inr(hr.c), ''],
              ['NAV', inr(hr.nav, 4), ''],
              ['Premium', pc(hr.p, 3), tone(hr.p)],
              ['Price day', pc(hr.pr), tone(hr.pr)],
              ['NAV day', pc(hr.nr), tone(hr.nr)],
              ['Volume', hr.v.toLocaleString('en-IN'), ''],
            ].map(([k, v, c]) => (
              <span key={k}>{k} <b className={`ml-1 font-medium tabular-nums text-slate-100 ${c}`}>{v}</b></span>
            ))}
          </div>
          <PriceNavChart rows={rows} hover={hover} onHover={setHover} />
          <p className="mb-1 mt-3 text-xs text-slate-400">Premium / discount to NAV, % <span className="text-slate-500">(dashed lines at ±0.15%)</span></p>
          <PremiumChart rows={rows} hover={hover} onHover={setHover} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Hover or drag across either chart to read that day. They share one time axis.</p>
      </Section>

      <Section title="How the two series relate" hint="Uses the range selected above.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <p className="mb-1 text-xs text-slate-400">Distribution of daily premium</p>
            <PremiumHistogram rows={rows} />
            <p className="mt-1 text-xs text-slate-500">
              {Math.round((rows.filter((r) => Math.abs(r.p) <= 0.1).length / rows.length) * 100)}% of days within ±0.10% of NAV. Values beyond ±1% fold into the end bars.
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <p className="mb-1 text-xs text-slate-400">Daily return: price vs NAV</p>
            <ReturnScatter rows={rows} />
          </div>
        </div>
      </Section>

      <Section title="Year by year" hint="Every year in the file, independent of the range buttons.">
        <YearTable rows={all} />
      </Section>

      <DropStudy rows={all} />

      <DataTabs rows={all} />

      <p className="mt-6 border-l-2 border-slate-700 pl-3 text-xs text-slate-500">
        Prices are NSE closes from Yahoo Finance, NAV is the official end-of-day value from AMFI, joined by trading date (days missing from either are dropped). Splits are detected in each series and both are put on the latest share basis. This is end-of-day NAV, not intraday iNAV, which has no free historical source. Refresh with <code className="text-slate-400">node web/etf-proxy/fetch-history.mjs</code>.
      </p>
    </div>
  );
}

function DataTabs({ rows }: { rows: HRow[] }) {
  const [tab, setTab] = useState<'moves' | 'rows'>('moves');
  return (
    <Section title="Daily data">
      <div className="mb-3">
        <Seg label="Daily data view" value={tab} onChange={setTab} options={[{ v: 'moves', label: 'Day-by-day moves' }, { v: 'rows', label: 'All rows' }]} />
      </div>
      {tab === 'moves' ? <DayMoves rows={rows} /> : <RowsTable rows={rows} />}
    </Section>
  );
}

function YearTable({ rows }: { rows: HRow[] }) {
  const y = useMemo(() => yearly(rows), [rows]);
  const head = ['Year', 'Days', 'Avg close', 'Avg NAV', 'Avg premium', 'Max premium', 'Max discount', 'Days > +0.15%', 'Days < −0.15%', 'Price change', 'NAV change'];
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-950/70"><tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-800">
          {y.map((r) => (
            <tr key={r.year}>
              <td className={`${td} text-slate-200`}>{r.year}</td>
              <td className={td}>{r.days}</td>
              <td className={td}>{inr(r.avgClose)}</td>
              <td className={td}>{inr(r.avgNav)}</td>
              <td className={`${td} ${tone(r.avgPrem)}`}>{pc(r.avgPrem, 3)}</td>
              <td className={`${td} text-emerald-400`}>{pc(r.maxPrem)}</td>
              <td className={`${td} text-rose-400`}>{pc(r.maxDisc)}</td>
              <td className={td}>{r.over15}</td>
              <td className={td}>{r.under15}</td>
              <td className={`${td} ${tone(r.priceChange)}`}>{pc(r.priceChange, 1)}</td>
              <td className={`${td} ${tone(r.navChange)}`}>{pc(r.navChange, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DropStudy({ rows }: { rows: HRow[] }) {
  const [basis, setBasis] = useState<'d' | 'w'>('d');
  const [k, setK] = useState(1);
  const table = useMemo(() => dropStudy(rows, basis, k), [rows, basis, k]);
  const unit = basis === 'd' ? 'day' : 'week';
  return (
    <Section title="What happened after a drop" hint="Price fell by at least the threshold, then the return that followed, by premium zone on the drop day.">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <Seg label="Period" value={basis} onChange={setBasis} options={[{ v: 'd', label: 'Daily' }, { v: 'w', label: 'Weekly' }]} />
        <label className="flex items-center gap-2">
          Look ahead
          <select value={k} onChange={(e) => setK(Number(e.target.value))} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200">
            {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} {unit}{n > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <span className="text-slate-500">Forward return is measured from the drop {unit}'s close.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/70">
            <tr><th className={th}>{basis === 'd' ? 'Daily' : 'Weekly'} drop</th>{ZONES.map((z) => <th key={z.key} className={th}>{z.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {table.map((r) => (
              <tr key={r.x} className={r.x === 0 ? 'bg-slate-950/50' : ''}>
                <td className={`${td} align-top text-slate-300`}>{r.x === 0 ? `Every ${unit} (baseline)` : `${unit[0].toUpperCase()}${unit.slice(1)} fell ${r.x}% or more`}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className={`${td} align-top leading-tight ${c && c.n < 10 ? 'opacity-40' : ''}`}>
                    {c ? (
                      <>
                        <b className={`block font-medium ${tone(c.avg)}`}>{pc(c.avg)}</b>
                        <small className="text-[11px] text-slate-500">n {c.n} · {c.winPct.toFixed(0)}% up</small>
                      </>
                    ) : '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Premium means close more than 0.15% above NAV, discount more than 0.15% below, near NAV is in between. Each cell is the average forward return, the number of events and the share that finished higher. Cells under 10 events are dimmed. Thresholds are cumulative, so “2% or more” includes the 3% events.
      </p>
    </Section>
  );
}

type Key = keyof HRow;
const COLS: [Key, string][] = [['d', 'Date'], ['o', 'Open'], ['h', 'High'], ['l', 'Low'], ['c', 'Close'], ['v', 'Volume'], ['nav', 'NAV'], ['raw', 'NAV (as published)'], ['p', 'Premium %'], ['pr', 'Price day %'], ['nr', 'NAV day %'], ['gap', 'Gap days']];

function RowsTable({ rows }: { rows: HRow[] }) {
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: 'd', dir: -1 });
  const [q, setQ] = useState('');
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const list = useMemo(() => {
    const a = rows.filter((r) => !q || r.d.includes(q));
    return [...a].sort((x, y) => {
      const u = x[sort.k];
      const v = y[sort.k];
      const nu = typeof u === 'number' && Number.isNaN(u);
      const nv = typeof v === 'number' && Number.isNaN(v);
      if (nu || nv) return Number(nu) - Number(nv);
      return (u < v ? -1 : u > v ? 1 : 0) * sort.dir;
    });
  }, [rows, sort, q]);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = list.slice(cur * size, cur * size + size);
  const cell = (k: Key, r: HRow) => {
    const v = r[k];
    if (k === 'd') return v as string;
    const n = v as number;
    if (k === 'v' || k === 'gap') return Number.isFinite(n) ? n.toLocaleString('en-IN') : '–';
    if (k === 'p') return <span className={tone(n)}>{signed(n, 3)}</span>;
    if (k === 'pr' || k === 'nr') return <span className={tone(n)}>{Number.isFinite(n) ? signed(n, 2) : '–'}</span>;
    if (k === 'nav' || k === 'raw') return inr(n, 4);
    return inr(n);
  };
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <label className="flex items-center gap-2">Find a date
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value.trim()); setPage(0); }} placeholder="2024-03" className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200" />
        </label>
        <label className="flex items-center gap-2">Rows
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200">
            {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/70">
            <tr>
              {COLS.map(([k, l]) => (
                <th key={k} className={th} aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="uppercase tracking-wider hover:text-slate-300" onClick={() => { setSort((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 })); setPage(0); }}>
                    {l}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {slice.map((r) => (
              <tr key={r.d}>{COLS.map(([k]) => <td key={k} className={`${td} ${k === 'd' ? 'text-slate-300' : ''}`}>{cell(k, r)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{list.length ? `Rows ${cur * size + 1}–${Math.min(list.length, cur * size + size)} of ${list.length.toLocaleString('en-IN')} · page ${cur + 1} of ${pages}` : 'No rows match that date.'}</span>
        <span className="flex gap-2">
          <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40">Previous</button>
          <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40">Next</button>
        </span>
      </div>
    </>
  );
}
