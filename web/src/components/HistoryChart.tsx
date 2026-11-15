import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint, Row } from '../types';
import { fmtPct, fmtPp, fmtQuarter, fmtShares, fmtShortQuarter } from '../format';
import { METRIC_COLOR, METRIC_LABEL, METRIC_LONG, metricView, type Metric } from '../metrics';

const METRICS: Metric[] = ['fii', 'dii'];
const keyOf = (m: Metric): 'pct' | 'dii' => (m === 'fii' ? 'pct' : 'dii');

function Swatch({ metric }: { metric: Metric }) {
  return (
    <span
      aria-hidden
      className="inline-block h-0.5 w-4 rounded-full align-middle"
      style={{ background: METRIC_COLOR[metric], height: 3 }}
    />
  );
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: HistoryPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <div className="text-ink-2">{fmtQuarter(p.q)}</div>
      {METRICS.map((m) => {
        const v = p[keyOf(m)];
        return (
          <div key={m} className="num mt-0.5 flex items-center gap-2 text-ink">
            <Swatch metric={m} />
            <span className="text-ink-2">{METRIC_LABEL[m]}</span>
            <span className="ml-auto pl-3 font-medium">{fmtPct(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Label only the last real point of a line, in text ink (colour sits on the mark, not the text). */
function endLabel(metric: Metric, data: HistoryPoint[]) {
  const k = keyOf(metric);
  let last = -1;
  data.forEach((d, i) => {
    if (d[k] != null) last = i;
  });
  return function EndLabel(props: { x?: number | string; y?: number | string; index?: number }) {
    if (props.index !== last || props.x == null || props.y == null) return <g />;
    return (
      <text x={Number(props.x) + 8} y={Number(props.y)} dy={4} fontSize={11} fontWeight={600} fill="var(--ink-2)">
        {METRIC_LABEL[metric]}
      </text>
    );
  };
}

function Block({ row, metric }: { row: Row; metric: Metric }) {
  const v = metricView(row, metric);
  const none = v.pct == null;
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Swatch metric={metric} />
        {METRIC_LABEL[metric]}
        <span className="text-xs font-normal text-ink-3">{metric === 'fii' ? 'foreign' : 'domestic'}</span>
      </div>
      {none ? (
        <p className="mt-2 text-sm text-ink-3">No {METRIC_LABEL[metric]} data for this stock yet.</p>
      ) : (
        <dl className="num mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-ink-3">Holding</dt>
            <dd className="text-base font-medium">{fmtPct(v.pct)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Change vs last quarter</dt>
            <dd className="text-base font-medium">{fmtPp(v.change)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Shares</dt>
            <dd className="font-medium">
              {fmtShares(v.shares)}
              {v.sharesChangePct != null && (
                <span className="ml-1 text-xs text-ink-2">
                  ({v.sharesChangePct > 0 ? '+' : ''}
                  {v.sharesChangePct.toFixed(1)}%)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Streak</dt>
            <dd className="font-medium">
              {v.streak === 0 ? 'none' : `${Math.abs(v.streak)} quarter${Math.abs(v.streak) > 1 ? 's' : ''} ${v.streak > 0 ? 'up' : 'down'}`}
            </dd>
          </div>
        </dl>
      )}
      {v.denominatorEffect && (
        <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs text-ink-2">
          <span aria-hidden>⚠ </span>
          The holding % and the {METRIC_LABEL[metric]} share count moved in opposite directions, so the % change most likely
          comes from the company's total share count changing (buyback, new issue, promoter sale).
        </p>
      )}
    </div>
  );
}

export function StockDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const hasFii = row.history.some((h) => h.pct != null);
  const hasDii = row.history.some((h) => h.dii != null);
  const shown = METRICS.filter((m) => (m === 'fii' ? hasFii : hasDii));
  const all = row.history.flatMap((h) => [h.pct, h.dii]).filter((x): x is number => x != null);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const pad = Math.max(0.5, (hi - lo) * 0.2);

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {row.symbol} <span className="font-normal text-ink-2">· {row.name}</span>
          </h2>
          <p className="text-sm text-ink-3">
            {row.industry} · latest filing {fmtQuarter(row.quarter)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:bg-surface-2"
          aria-label="Close stock detail"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Block row={row} metric="fii" />
        <Block row={row} metric="dii" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
        {shown.map((m) => (
          <span key={m} className="inline-flex items-center gap-2" title={METRIC_LONG[m]}>
            <Swatch metric={m} />
            {METRIC_LABEL[m]} % of shares
          </span>
        ))}
      </div>
      <div className="mt-2 h-56" role="img" aria-label={`${shown.map((m) => METRIC_LABEL[m]).join(' and ')} holding % of ${row.symbol} over ${row.history.length} quarters`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={row.history} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
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
            {shown.map((m) => (
              <Line
                key={m}
                type="monotone"
                dataKey={keyOf(m)}
                name={METRIC_LABEL[m]}
                stroke={METRIC_COLOR[m]}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 4, fill: METRIC_COLOR[m], stroke: 'var(--surface)', strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2 }}
                label={endLabel(m, row.history)}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
