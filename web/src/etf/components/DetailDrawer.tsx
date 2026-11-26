import { useEffect } from 'react';
import type { EtfRow, HistoryPoint } from '../types';
import { Sparkline } from './Sparkline';
import { STATUS_LABEL } from '../utils/etfCalculations';
import { compact, inr, pct, signed } from '../format';
import { StatusBadge } from './StatusBadge';
import { HistoryAnalysis } from '../analysis/HistoryAnalysis';

export function DetailDrawer({ row, history, onClose }: { row: EtfRow | null; history: HistoryPoint[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!row) return null;
  const up = row.dayChange >= 0;
  const stat = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg bg-slate-950/60 p-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 tabular-nums text-slate-100">{value}</p>
    </div>
  );
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`${row.symbol} detail`}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-5xl overflow-y-auto border-l border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">{row.symbol}</h2>
            <p className="text-sm text-slate-400">{row.name} · {row.category}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-2.5 py-1 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>
        <p className="mt-4 text-3xl font-semibold tabular-nums text-slate-100">
          ₹{inr(row.ltp)} <span className={`text-base ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{signed(row.dayChange)} ({pct(row.dayChangePct)})</span>
        </p>
        <div className="mt-2"><StatusBadge status={row.status} /> <span className="ml-1 text-xs text-slate-500">{STATUS_LABEL[row.status]}</span></div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
            <span>LTP vs NAV, this session</span>
            <span><span className="text-emerald-400">━</span> LTP <span className="ml-2 text-slate-400">╌</span> NAV</span>
          </div>
          <Sparkline points={history} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {stat('NAV', `₹${inr(row.inav)}`)}
          {stat('Spread', `${signed(row.spread)} ₹ · ${pct(row.spreadPct)}`)}
          {stat('Prev close', `₹${inr(row.prevClose)}`)}
          {stat('Volume', compact(row.volume))}
          {stat('Turnover', `₹${compact(row.turnover)}`)}
          {stat('Ticks charted', history.length)}
        </div>
        <p className="mt-4 text-xs text-slate-500">Execution tip: prefer limit orders; avoid market orders when the spread is wide.</p>

        <HistoryAnalysis symbol={row.symbol} />
      </aside>
    </div>
  );
}
