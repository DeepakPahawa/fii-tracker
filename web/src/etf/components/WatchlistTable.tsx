import type { EtfRow } from '../types';
import type { SortKey } from '../utils/etfCalculations';
import { StatusBadge } from './StatusBadge';
import { compact, inr, pct, signed } from '../format';

interface Props {
  rows: EtfRow[];
  sortKey: SortKey;
  dir: 1 | -1;
  onSort: (k: SortKey) => void;
  onSelect: (symbol: string) => void;
  /** Symbols currently breaching the user's alert thresholds. */
  alerting: Set<string>;
  /** True while a fetch is running and no rows have arrived yet. */
  loading?: boolean;
}

export function WatchlistTable({ rows, sortKey, dir, onSort, onSelect, alerting, loading }: Props) {
  const Th = ({ k, children, right = true }: { k?: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th scope="col" className={`whitespace-nowrap px-3 py-2.5 font-medium ${right ? 'text-right' : 'text-left'}`} aria-sort={k && k === sortKey ? (dir === 1 ? 'ascending' : 'descending') : undefined}>
      {k ? (
        <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-slate-200 ${k === sortKey ? 'text-emerald-300' : ''}`}>
          {children}
          <span aria-hidden>{k === sortKey ? (dir === 1 ? '▲' : '▼') : '↕'}</span>
        </button>
      ) : (
        children
      )}
    </th>
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
          <tr>
            <Th k="symbol" right={false}>Symbol</Th>
            <Th right={false}>Category</Th>
            <Th>LTP (₹)</Th>
            <Th k="dayChangePct">Day change</Th>
            <Th>NAV (₹)</Th>
            <Th k="spreadPct">NAV diff</Th>
            <Th right={false}>Status</Th>
            <Th k="volume">Volume / Turnover</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {rows.map((r) => {
            const up = r.dayChange >= 0;
            const tone = up ? 'text-emerald-400' : 'text-rose-400';
            return (
              <tr key={r.symbol} onClick={() => onSelect(r.symbol)} className={`cursor-pointer hover:bg-slate-800/50 ${alerting.has(r.symbol) ? 'bg-amber-500/5' : ''}`}>
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-slate-100">
                    {alerting.has(r.symbol) && <span title="Alert threshold breached" className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />}
                    {r.symbol}
                  </div>
                  <div className="text-xs text-slate-500">{r.name}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-400">{r.category}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-100">{inr(r.ltp)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${tone}`}>
                  {signed(r.dayChange)} <span className="text-xs">({pct(r.dayChangePct)})</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{inr(r.inav)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${r.status === 'discount' ? 'text-emerald-400' : r.status === 'premium' ? 'text-amber-400' : 'text-slate-300'}`}>
                  {pct(r.spreadPct)} <span className="text-xs text-slate-500">({signed(r.spread)})</span>
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                  {compact(r.volume)} <span className="text-xs text-slate-500">/ ₹{compact(r.turnover)}</span>
                </td>
                <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => onSelect(r.symbol)} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Chart</button>
                  <a href={`https://www.nseindia.com/get-quotes/equity?symbol=${r.symbol}`} target="_blank" rel="noreferrer" className="ml-1.5 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">NSE ↗</a>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">{loading ? 'Fetching ETF data…' : 'No ETFs match.'}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
