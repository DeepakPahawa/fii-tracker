import { useEffect, useMemo, useState } from 'react';
import type { DailyHistory } from '../types';
import { fetchDailyHistory } from '../services/marketData';
import { classify } from '../utils/etfCalculations';
import { inr, pct } from '../format';

const RANGES = [
  { label: '1M', days: 22 },
  { label: '3M', days: 66 },
  { label: '6M', days: 1000 },
] as const;

const BAR: Record<string, string> = { discount: '#34d399', premium: '#fbbf24', fair: '#38bdf8', marginal: '#64748b' };

/** Daily premium/discount history: bar chart of (close − NAV) / NAV per day, summary stats and a recent-days table. */
export function DailyHistoryPanel({ symbol, isGlobal }: { symbol: string; isGlobal: boolean }) {
  const [data, setData] = useState<DailyHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetchDailyHistory(symbol, ctrl.signal)
      .then(setData)
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [symbol]);

  const rows = useMemo(() => (data ? data.rows.slice(-range.days) : []), [data, range]);
  const stats = useMemo(() => {
    if (!rows.length) return null;
    const avg = rows.reduce((a, r) => a + r.spreadPct, 0) / rows.length;
    const max = rows.reduce((a, r) => (r.spreadPct > a.spreadPct ? r : a));
    const min = rows.reduce((a, r) => (r.spreadPct < a.spreadPct ? r : a));
    return { avg, max, min, outside: rows.filter((r) => Math.abs(r.spreadPct) > 0.15).length };
  }, [rows]);

  const W = 420;
  const H = 130;
  const lim = Math.max(0.3, ...rows.map((r) => Math.abs(r.spreadPct)));
  const y = (v: number) => H / 2 - (v / lim) * (H / 2 - 4);
  const bw = rows.length ? W / rows.length : W;

  return (
    <section className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-3" aria-label="Daily premium and discount history">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Daily history: close vs NAV</h3>
        <div role="group" aria-label="History range" className="inline-flex rounded-full border border-slate-800 bg-slate-900 p-0.5 text-xs">
          {RANGES.map((r) => (
            <button key={r.label} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={`rounded-full px-2.5 py-1 ${range === r ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!data && !error && <p className="py-8 text-center text-xs text-slate-500">Loading daily history…</p>}
      {error && <p role="alert" className="py-4 text-xs text-rose-300">Could not load history: {error}</p>}

      {data && !rows.length && <p className="py-6 text-center text-xs text-slate-500">No overlapping price and NAV days found.</p>}
      {stats && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily premium or discount percent bars">
            <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#475569" strokeWidth="1" />
            {rows.map((r, i) => {
              const top = Math.min(y(r.spreadPct), H / 2);
              const h = Math.max(1, Math.abs(y(r.spreadPct) - H / 2));
              return (
                <rect key={r.date} x={i * bw + bw * 0.12} y={top} width={bw * 0.76} height={h} fill={BAR[classify(r.spreadPct)]}>
                  <title>{`${r.date}: ${pct(r.spreadPct)} (close ${inr(r.close)}, NAV ${inr(r.nav, 4)})`}</title>
                </rect>
              );
            })}
          </svg>
          <p className="mb-2 flex justify-between text-[10px] text-slate-500">
            <span>{rows[0].date}</span>
            <span>▲ premium · ▼ discount · scale ±{lim.toFixed(2)}%</span>
            <span>{rows[rows.length - 1].date}</span>
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Average', pct(stats.avg)],
              ['Days beyond ±0.15%', `${stats.outside} of ${rows.length}`],
              ['Max premium', `${pct(stats.max.spreadPct)} · ${stats.max.date.slice(5)}`],
              ['Max discount', `${pct(stats.min.spreadPct)} · ${stats.min.date.slice(5)}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-900/80 p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p>
                <p className="tabular-nums text-slate-100">{v}</p>
              </div>
            ))}
          </div>

          <table className="mt-3 w-full text-xs tabular-nums">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="py-1 text-left font-medium">Date</th><th className="text-right font-medium">Close</th><th className="text-right font-medium">NAV</th><th className="text-right font-medium">Spread</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {rows.slice(-10).reverse().map((r) => (
                <tr key={r.date}>
                  <td className="py-1 text-slate-300">{r.date}</td>
                  <td className="text-right text-slate-200">{inr(r.close)}</td>
                  <td className="text-right text-slate-400">{inr(r.nav)}</td>
                  <td className={`text-right ${r.spreadPct < -0.15 ? 'text-emerald-400' : r.spreadPct > 0.15 ? 'text-amber-400' : 'text-slate-300'}`}>{pct(r.spreadPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Close: Yahoo Finance. NAV: AMFI end-of-day via mfapi.in. Days missing in either source are skipped.
        {isGlobal && ' Overseas-index NAVs are struck on prior-day foreign closes, so this spread mixes timing with a real premium.'} Not intraday iNAV.
      </p>
    </section>
  );
}
