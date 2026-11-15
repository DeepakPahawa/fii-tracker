import { useMemo, useState } from 'react';
import type { Row } from '../types';
import { fmtPct, fmtPp } from '../format';

export type Preset = 'all' | 'buys' | 'sells' | 'upStreak' | 'downStreak';
type SortKey = 'symbol' | 'fpiPct' | 'changePp' | 'streak';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buys', label: 'Top increases' },
  { id: 'sells', label: 'Top decreases' },
  { id: 'upStreak', label: 'Rising 3+ quarters' },
  { id: 'downStreak', label: 'Falling 3+ quarters' },
];

const PAGE = 50;

function Change({ v }: { v: number | null }) {
  if (v == null) return <span className="text-ink-3">—</span>;
  const up = v > 0.01;
  const down = v < -0.01;
  return (
    <span className="num inline-flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden className={up ? 'text-up' : down ? 'text-down' : 'text-ink-3'}>
        {up ? '▲' : down ? '▼' : '•'}
      </span>
      {fmtPp(v)}
    </span>
  );
}

function Streak({ v }: { v: number }) {
  if (v === 0) return <span className="text-ink-3">—</span>;
  return (
    <span className="num inline-flex items-center gap-1">
      <span aria-hidden className={v > 0 ? 'text-up' : 'text-down'}>
        {v > 0 ? '▲' : '▼'}
      </span>
      {Math.abs(v)}
      <span className="sr-only">{v > 0 ? 'quarters rising' : 'quarters falling'}</span>
    </span>
  );
}

export function HoldingsTable({
  rows,
  industry,
  onIndustry,
  onSelect,
  selected,
}: {
  rows: Row[];
  industry: string;
  onIndustry: (i: string) => void;
  onSelect: (r: Row) => void;
  selected: string | null;
}) {
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<Preset>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'changePp', dir: -1 });
  const [limit, setLimit] = useState(PAGE);
  const [hidePending, setHidePending] = useState(false);

  const industries = useMemo(() => [...new Set(rows.map((r) => r.industry))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter(
      (r) =>
        (!industry || r.industry === industry) &&
        (!hidePending || !r.pending) &&
        (!q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
    );
    let key = sort.key;
    let dir = sort.dir;
    if (preset === 'buys') {
      out = out.filter((r) => (r.changePp ?? 0) > 0 && !r.pending);
      key = 'changePp';
      dir = -1;
    } else if (preset === 'sells') {
      out = out.filter((r) => (r.changePp ?? 0) < 0 && !r.pending);
      key = 'changePp';
      dir = 1;
    } else if (preset === 'upStreak') {
      out = out.filter((r) => r.streak >= 3);
      key = 'streak';
      dir = -1;
    } else if (preset === 'downStreak') {
      out = out.filter((r) => r.streak <= -3);
      key = 'streak';
      dir = 1;
    }
    const val = (r: Row) => (key === 'symbol' ? r.symbol : (r[key] ?? (dir === -1 ? -Infinity : Infinity)));
    return [...out].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, query, industry, preset, sort, hidePending]);

  const toggleSort = (key: SortKey) => {
    setPreset('all');
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'symbol' ? 1 : -1 }));
  };

  const header = (key: SortKey, label: string, align = 'text-right') => (
    <th scope="col" className={`px-2 py-2 sm:px-3 font-medium ${align}`} aria-sort={sort.key === key && preset === 'all' ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => toggleSort(key)} className="hover:text-ink">
        {label}
        {sort.key === key && preset === 'all' ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <input
          type="search"
          placeholder="Search symbol or company"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink-3 sm:w-64"
          aria-label="Search stocks"
        />
        <select
          value={industry}
          onChange={(e) => onIndustry(e.target.value)}
          className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm"
          aria-label="Filter by industry"
        >
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          <input type="checkbox" checked={hidePending} onChange={(e) => setHidePending(e.target.checked)} />
          Hide not yet filed
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-2 py-2 sm:px-3" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPreset(p.id);
              setLimit(PAGE);
            }}
            aria-pressed={preset === p.id}
            className={`rounded-full border px-3 py-1 text-xs ${
              preset === p.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink-2 hover:bg-surface-2'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-3">
            <tr className="border-b border-line">
              {header('symbol', 'Stock', 'text-left')}
              <th scope="col" className="hidden px-2 py-2 sm:px-3 text-left font-medium md:table-cell">
                Industry
              </th>
              {header('fpiPct', 'FPI %')}
              {header('changePp', 'Change')}
              {header('streak', 'Streak')}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => (
              <tr
                key={r.symbol}
                onClick={() => onSelect(r)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(r)}
                tabIndex={0}
                className={`cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${
                  selected === r.symbol ? 'bg-surface-2' : ''
                }`}
              >
                <td className="px-2 py-2 sm:px-3">
                  <div className="font-medium text-ink">{r.symbol}</div>
                  <div className="max-w-28 truncate sm:max-w-56 text-xs text-ink-3">{r.name}</div>
                </td>
                <td className="hidden px-2 py-2 sm:px-3 text-ink-2 md:table-cell">{r.industry}</td>
                <td className="num px-2 py-2 sm:px-3 text-right">
                  {fmtPct(r.fpiPct)}
                  {r.pending && (
                    <div className="text-xs text-ink-3" title="Has not filed for the latest quarter yet">
                      not yet filed
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 sm:px-3 text-right">
                  <Change v={r.changePp} />
                  {r.denominatorEffect && (
                    <div
                      className="whitespace-nowrap text-xs text-ink-3"
                      title="Share count moved the other way; likely a buyback or issue, not FPI trading"
                    >
                      ⚠ share count
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 sm:px-3 text-right">
                  <Streak v={r.streak} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="p-6 text-center text-sm text-ink-3">No stocks match these filters.</p>}
      </div>
      <div className="flex items-center justify-between px-2 py-2 sm:px-3 text-xs text-ink-3">
        <span className="num">
          Showing {Math.min(limit, filtered.length)} of {filtered.length}
        </span>
        {limit < filtered.length && (
          <button onClick={() => setLimit((l) => l + PAGE)} className="rounded-md border border-line px-3 py-1 text-ink-2 hover:bg-surface-2">
            Show more
          </button>
        )}
      </div>
    </section>
  );
}
