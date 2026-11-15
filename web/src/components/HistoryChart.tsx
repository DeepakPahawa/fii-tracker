import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Row } from '../types';
import { fmtPct, fmtPp, fmtQuarter, fmtShares, fmtShortQuarter } from '../format';

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: { q: string; pct: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <div className="text-ink-2">{fmtQuarter(p.q)}</div>
      <div className="num font-medium text-ink">FPI {fmtPct(p.pct)}</div>
    </div>
  );
}

export function StockDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const pcts = row.history.map((h) => h.pct);
  const lo = Math.min(...pcts);
  const hi = Math.max(...pcts);
  const pad = Math.max(0.5, (hi - lo) * 0.2);
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {row.symbol} <span className="font-normal text-ink-2">· {row.name}</span>
          </h2>
          <p className="text-sm text-ink-3">{row.industry}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:bg-surface-2"
          aria-label="Close stock detail"
        >
          Close
        </button>
      </div>
      <dl className="num mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink-3">FPI holding ({fmtQuarter(row.quarter)})</dt>
          <dd className="text-base font-medium">{fmtPct(row.fpiPct)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Change since last quarter</dt>
          <dd className="text-base font-medium">{fmtPp(row.changePp)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">FPI shares</dt>
          <dd className="text-base font-medium">
            {fmtShares(row.fpiShares)}
            {row.sharesChangePct != null && (
              <span className="ml-1 text-xs text-ink-2">
                ({row.sharesChangePct > 0 ? '+' : ''}
                {row.sharesChangePct.toFixed(1)}%)
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-3">Streak</dt>
          <dd className="text-base font-medium">
            {row.streak === 0 ? 'none' : `${Math.abs(row.streak)} quarter${Math.abs(row.streak) > 1 ? 's' : ''} ${row.streak > 0 ? 'up' : 'down'}`}
          </dd>
        </div>
      </dl>
      {row.denominatorEffect && (
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">
          <span aria-hidden>⚠ </span>
          The holding % and the FPI share count moved in opposite directions. The % change most likely comes from the
          company's total share count changing (buyback, new issue, promoter sale), not from FPIs buying or selling.
        </p>
      )}
      <div className="mt-4 h-56" role="img" aria-label={`FPI holding % of ${row.symbol} over ${row.history.length} quarters`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={row.history} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="q" tickFormatter={fmtShortQuarter} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[Math.max(0, lo - pad), hi + pad]}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<HistoryTooltip />} cursor={{ stroke: 'var(--ink-3)', strokeDasharray: '3 3' }} />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="var(--up)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--up)', stroke: 'var(--surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
