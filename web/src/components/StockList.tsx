import { useEffect, type RefObject } from 'react';
import type { Row } from '../types';
import { METRIC_COLOR, METRIC_LABEL, metricView, type Metric } from '../metrics';
import { PRESETS, SORT_LABEL, type Preset, type SortKey } from '../listing';
import { fmtPct, fmtPp } from '../format';

export interface ListStats {
  up: number;
  down: number;
  median: number | null;
  compared: number;
}

const selectCls = 'h-9 rounded-lg border border-line bg-bg px-2.5 text-sm text-ink outline-none focus:border-ink-3';

function Chip({ row, metric, focus }: { row: Row; metric: Metric; focus: boolean }) {
  const v = metricView(row, metric);
  const up = (v.change ?? 0) > 0.01;
  const down = (v.change ?? 0) < -0.01;
  return (
    <span
      className={`num inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs ${
        focus ? 'ring-1 ring-ink-3' : ''
      } ${v.pending && v.pct != null ? 'opacity-60' : ''}`}
      title={v.pending && v.pct != null ? `${METRIC_LABEL[metric]}: has not filed for the latest quarter yet` : undefined}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: METRIC_COLOR[metric] }} />
      <span className="text-ink-3">{METRIC_LABEL[metric]}</span>
      {v.pct == null ? (
        <span className="text-ink-3">—</span>
      ) : (
        <>
          <span className="font-semibold text-ink">{fmtPct(v.pct)}</span>
          {v.change != null && (
            <span className="inline-flex items-center gap-0.5">
              <span aria-hidden className={up ? 'text-up' : down ? 'text-down' : 'text-ink-3'}>
                {up ? '▲' : down ? '▼' : '•'}
              </span>
              <span className="text-ink-2">{Math.abs(v.change).toFixed(2)}</span>
              <span className="sr-only">{up ? 'up' : down ? 'down' : 'flat'} percentage points</span>
            </span>
          )}
        </>
      )}
    </span>
  );
}

export function StockList({
  items,
  total,
  active,
  focus,
  onFocus,
  sortKey,
  onSortKey,
  dir,
  onDir,
  query,
  onQuery,
  searchRef,
  industry,
  industries,
  onIndustry,
  preset,
  onPreset,
  hidePending,
  onHidePending,
  selected,
  onSelect,
  onNavigate,
  stats,
}: {
  items: Row[];
  total: number;
  active: Metric[];
  focus: Metric;
  onFocus: (m: Metric) => void;
  sortKey: SortKey;
  onSortKey: (k: SortKey) => void;
  dir: 1 | -1;
  onDir: () => void;
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  industry: string;
  industries: string[];
  onIndustry: (i: string) => void;
  preset: Preset;
  onPreset: (p: Preset) => void;
  hidePending: boolean;
  onHidePending: (b: boolean) => void;
  selected: string | null;
  onSelect: (r: Row) => void;
  onNavigate: (to: 'next' | 'prev' | 'first' | 'last') => void;
  stats: ListStats;
}) {
  // Keep the selected stock in view when it changes (arrow keys, preset change).
  useEffect(() => {
    if (selected) document.getElementById(`row-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, 'next' | 'prev' | 'first' | 'last'> = {
      ArrowDown: 'next',
      ArrowUp: 'prev',
      Home: 'first',
      End: 'last',
    };
    const to = map[e.key];
    if (to) {
      e.preventDefault();
      onNavigate(to);
    }
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:h-full" aria-label="Stocks">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="relative">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search symbol or company"
            aria-label="Search stocks"
            className="h-10 w-full rounded-xl border border-line bg-bg pl-9 pr-9 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
          />
          <svg
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          {!query && (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-ink-3 lg:block">
              /
            </kbd>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-3">Rank by</span>
          <select value={focus} onChange={(e) => onFocus(e.target.value as Metric)} className={selectCls} aria-label="Rank by series">
            {active.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABEL[m]}
              </option>
            ))}
          </select>
          <select value={sortKey} onChange={(e) => onSortKey(e.target.value as SortKey)} className={`${selectCls} min-w-0 flex-1`} aria-label="Rank by value">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onDir}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-bg text-ink-2 hover:bg-surface-2"
            aria-label={dir === -1 ? 'Descending, click for ascending' : 'Ascending, click for descending'}
            title={dir === -1 ? 'High to low' : 'Low to high'}
          >
            {dir === -1 ? '↓' : '↑'}
          </button>
        </div>

        <select value={industry} onChange={(e) => onIndustry(e.target.value)} className={`${selectCls} w-full`} aria-label="Filter by industry">
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.title}
              onClick={() => onPreset(p.id)}
              aria-pressed={preset === p.id}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                preset === p.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink-2 hover:bg-surface-2'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="num flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>
            <span className="font-medium text-ink-2">{items.length}</span> of {total} ·{' '}
            <span className="text-up">▲</span> {stats.up} <span className="text-down">▼</span> {stats.down}
            {stats.median != null && <> · median {fmtPp(stats.median)}</>}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={hidePending} onChange={(e) => onHidePending(e.target.checked)} />
            Hide not yet filed
          </label>
        </div>
      </div>

      <ul
        role="listbox"
        tabIndex={0}
        aria-label="Stocks, use arrow keys to move"
        aria-activedescendant={selected ? `row-${selected}` : undefined}
        onKeyDown={onKeyDown}
        className="max-h-[60vh] min-h-0 flex-1 divide-y divide-line overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-3 lg:max-h-none"
      >
        {items.map((r) => {
          const isSel = r.symbol === selected;
          return (
            <li
              key={r.symbol}
              id={`row-${r.symbol}`}
              role="option"
              aria-selected={isSel}
              onClick={() => onSelect(r)}
              className={`relative cursor-pointer px-4 py-3 transition-colors before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-r-full ${
                isSel ? 'bg-surface-2 before:bg-ink' : 'before:bg-transparent hover:bg-surface-2/60'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-ink">{r.symbol}</span>
                <span className="truncate text-xs text-ink-3">{r.industry}</span>
              </div>
              <div className="truncate text-xs text-ink-3">{r.name}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {active.map((m) => (
                  <Chip key={m} row={r} metric={m} focus={m === focus && active.length > 1} />
                ))}
              </div>
            </li>
          );
        })}
        {!items.length && <li className="p-8 text-center text-sm text-ink-3">No stocks match these filters.</li>}
      </ul>
    </section>
  );
}
