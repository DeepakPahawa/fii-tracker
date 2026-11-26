import { useMemo, useState } from 'react';
import { dayMoves, mean, zoneOf, type DayMove, type HRow } from './history';
import { inr, signed } from '../format';

const tone = (v: number) => (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-300');
const pc = (v: number, d = 2) => (Number.isFinite(v) ? `${signed(v, d)}%` : '–');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (d: string) => `${d.slice(8, 10)}-${MON[+d.slice(5, 7) - 1]}-${d.slice(0, 4)}`;

const DAY: [string, (x: number) => boolean][] = [
  ['Any day', () => true],
  ['Fell 1% or more', (x) => x <= -1],
  ['Fell 2% or more', (x) => x <= -2],
  ['Fell 3% or more', (x) => x <= -3],
  ['Fell 4% or more', (x) => x <= -4],
  ['Fell 5% or more', (x) => x <= -5],
  ['Rose 1% or more', (x) => x >= 1],
  ['Rose 2% or more', (x) => x >= 2],
  ['Rose 3% or more', (x) => x >= 3],
];
const NEXT: [string, (x: number) => boolean][] = [
  ['Any next day', () => true],
  ['Rose', (x) => x > 0],
  ['Rose 1% or more', (x) => x >= 1],
  ['Rose 2% or more', (x) => x >= 2],
  ['Rose 3% or more', (x) => x >= 3],
  ['Fell', (x) => x < 0],
  ['Fell 1% or more', (x) => x <= -1],
  ['Fell 2% or more', (x) => x <= -2],
];
const ZONE = [['all', 'Any premium'], ['prem', 'At a premium'], ['near', 'Near NAV'], ['disc', 'At a discount']] as const;

type Key = 'd' | 'c' | 'day' | 'next' | 'next5' | 'p';
const COLS: [Key, string][] = [['d', 'Date'], ['c', 'Close'], ['day', 'Day change'], ['next', 'Next day'], ['next5', 'Next 5 days'], ['p', 'Premium to NAV']];
const sel = 'rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200';

/** Every trading day with its own % change and the move that followed, filterable (e.g. fell 3%, then rose 2% next day). */
export function DayMoves({ rows }: { rows: HRow[] }) {
  const all = useMemo(() => dayMoves(rows), [rows]);
  const [dayF, setDayF] = useState(0);
  const [nextF, setNextF] = useState(0);
  const [zone, setZone] = useState<(typeof ZONE)[number][0]>('all');
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: 'd', dir: -1 });
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);

  const list = useMemo(() => {
    const f = all.filter((r) => Number.isFinite(r.day) && DAY[dayF][1](r.day) && (nextF === 0 || (Number.isFinite(r.next) && NEXT[nextF][1](r.next))) && (zone === 'all' || zoneOf(r.p) === zone));
    return [...f].sort((a, b) => {
      const u = a[sort.k];
      const v = b[sort.k];
      const nu = typeof u === 'number' && Number.isNaN(u);
      const nv = typeof v === 'number' && Number.isNaN(v);
      if (nu || nv) return Number(nu) - Number(nv);
      return (u < v ? -1 : u > v ? 1 : 0) * sort.dir;
    });
  }, [all, dayF, nextF, zone, sort]);

  const withNext = list.filter((r) => Number.isFinite(r.next));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = list.slice(cur * size, cur * size + size);
  const reset = (fn: () => void) => () => { fn(); setPage(0); };
  const cell = (k: Key, r: DayMove) => {
    if (k === 'd') return niceDate(r.d);
    if (k === 'c') return inr(r.c);
    if (k === 'p') return <span className={tone(r.p)}>{pc(r.p, 3)}</span>;
    return <span className={tone(r[k])}>{pc(r[k])}</span>;
  };

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-sm font-semibold text-slate-100">Day-by-day moves</h3>
        <p className="text-xs text-slate-500">Each day's change and what the price did after it. Click a heading to sort.</p>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <label className="flex items-center gap-2">Day
          <select className={sel} value={dayF} onChange={(e) => { setDayF(+e.target.value); setPage(0); }}>{DAY.map(([l], i) => <option key={l} value={i}>{l}</option>)}</select>
        </label>
        <label className="flex items-center gap-2">Then
          <select className={sel} value={nextF} onChange={(e) => { setNextF(+e.target.value); setPage(0); }}>{NEXT.map(([l], i) => <option key={l} value={i}>{l}</option>)}</select>
        </label>
        <label className="flex items-center gap-2">Premium
          <select className={sel} value={zone} onChange={(e) => { setZone(e.target.value as typeof zone); setPage(0); }}>{ZONE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="flex items-center gap-2">Rows
          <select className={sel} value={size} onChange={(e) => { setSize(+e.target.value); setPage(0); }}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <button type="button" className="rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800" onClick={reset(() => { setDayF(0); setNextF(0); setZone('all'); })}>Reset</button>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        {list.length.toLocaleString('en-IN')} matching days
        {withNext.length > 0 && <> · next day averaged <b className={`tabular-nums ${tone(mean(withNext.map((r) => r.next)))}`}>{pc(mean(withNext.map((r) => r.next)))}</b>, up on <b className="tabular-nums text-slate-200">{Math.round((withNext.filter((r) => r.next > 0).length / withNext.length) * 100)}%</b> of them</>}
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/70">
            <tr>
              {COLS.map(([k, l]) => (
                <th key={k} className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-slate-500 first:text-left" aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="uppercase tracking-wider hover:text-slate-300" onClick={() => { setSort((s) => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 })); setPage(0); }}>
                    {l}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {slice.map((r) => (
              <tr key={r.d}>{COLS.map(([k]) => <td key={k} className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums first:text-left ${k === 'd' ? 'text-slate-300' : ''}`}>{cell(k, r)}</td>)}</tr>
            ))}
            {!slice.length && <tr><td colSpan={COLS.length} className="px-3 py-3 text-slate-500">No days match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{list.length ? `Rows ${cur * size + 1}–${Math.min(list.length, cur * size + size)} of ${list.length.toLocaleString('en-IN')} · page ${cur + 1} of ${pages}` : ''}</span>
        <span className="flex gap-2">
          <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40">Previous</button>
          <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40">Next</button>
        </span>
      </div>
    </section>
  );
}
