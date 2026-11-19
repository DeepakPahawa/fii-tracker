import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Row } from '../types';
import { fmtPct, fmtPp, fmtQuarter, fmtShares, fmtShortQuarter } from '../format';
import { StockActivity } from './StockActivity';
import { METRICS, METRIC_COLOR, METRIC_HINT, METRIC_LABEL, METRIC_LONG, metricView, type Metric } from '../metrics';

type View = 'level' | 'change';
type Datum = { q: string } & Record<string, number | string | null>;

const dKey = (m: Metric) => `${m}D`; // change since the first quarter shown, in percentage points
const round = (v: number) => Math.round(v * 10000) / 10000;

function Swatch({ metric }: { metric: Metric }) {
  return <span aria-hidden className="inline-block w-4 shrink-0 rounded-full align-middle" style={{ background: METRIC_COLOR[metric], height: 3 }} />;
}

function ChartTooltip({ active, payload, series }: { active?: boolean; payload?: { payload: Datum }[]; series: Metric[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{fmtQuarter(d.q)}</div>
      {series.map((m) => {
        const lvl = d[m] as number | null;
        const delta = d[dKey(m)] as number | null;
        return (
          <div key={m} className="num mt-0.5 flex items-center gap-2">
            <Swatch metric={m} />
            <span className="text-ink-2">{METRIC_LABEL[m]}</span>
            <span className="ml-auto pl-3 font-semibold text-ink">{fmtPct(lvl)}</span>
            {delta != null && <span className="w-16 text-right text-ink-3">{fmtPp(delta)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Label only the last real point of a line, in text ink (the colour sits on the mark, not the text). */
function endLabel(metric: Metric, data: Datum[], key: string) {
  let last = -1;
  data.forEach((d, i) => {
    if (d[key] != null) last = i;
  });
  return function EndLabel(props: { x?: number | string; y?: number | string; index?: number }) {
    if (props.index !== last || props.x == null || props.y == null) return <g />;
    return (
      <text x={Number(props.x) + 9} y={Number(props.y)} dy={4} fontSize={11} fontWeight={600} fill="var(--ink-2)">
        {METRIC_LABEL[metric]}
      </text>
    );
  };
}

function StatCard({ row, metric }: { row: Row; metric: Metric }) {
  const v = metricView(row, metric);
  const up = (v.change ?? 0) > 0.01;
  const down = (v.change ?? 0) < -0.01;
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Swatch metric={metric} />
        {METRIC_LABEL[metric]}
        <span className="text-xs font-normal text-ink-3" title={METRIC_LONG[metric]}>
          {METRIC_HINT[metric]}
        </span>
      </div>
      {v.pct == null ? (
        <p className="mt-3 text-sm text-ink-3">No {METRIC_LABEL[metric]} data for this stock.</p>
      ) : (
        <>
          <div className="num mt-2 text-2xl font-semibold tracking-tight text-ink">{fmtPct(v.pct)}</div>
          <div className="num mt-1 flex items-center gap-1.5 text-sm">
            <span aria-hidden className={up ? 'text-up' : down ? 'text-down' : 'text-ink-3'}>
              {up ? '▲' : down ? '▼' : '•'}
            </span>
            <span className="font-medium text-ink">{fmtPp(v.change)}</span>
            <span className="text-xs text-ink-3">vs last quarter</span>
          </div>
          <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-3">
            <span>
              Streak:{' '}
              <span className="text-ink-2">
                {v.streak === 0 ? 'none' : `${Math.abs(v.streak)}Q ${v.streak > 0 ? 'up' : 'down'}`}
              </span>
            </span>
            {v.shares != null && (
              <span>
                Shares: <span className="text-ink-2">{fmtShares(v.shares)}</span>
                {v.sharesChangePct != null && (
                  <span>
                    {' '}
                    ({v.sharesChangePct > 0 ? '+' : ''}
                    {v.sharesChangePct.toFixed(1)}%)
                  </span>
                )}
              </span>
            )}
          </div>
          {v.pending && <p className="mt-2 text-xs text-ink-3">Not filed for the latest quarter yet.</p>}
          {v.denominatorEffect && (
            <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs text-ink-2">
              <span aria-hidden>⚠ </span>
              % and share count moved in opposite directions. The change likely comes from the company's total shares changing
              (buyback, new issue, promoter sale).
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function StockDetail({ row, active }: { row: Row; active: Record<Metric, boolean> }) {
  const [userView, setUserView] = useState<View | null>(null);
  const activeList = METRICS.filter((m) => active[m]);

  const { data, series, wide } = useMemo(() => {
    const firsts = {} as Record<Metric, number | null>;
    for (const m of METRICS) firsts[m] = row.history.find((h) => h[m] != null)?.[m] ?? null;
    const data: Datum[] = row.history.map((h) => {
      const d: Datum = { q: h.q };
      for (const m of METRICS) {
        const v = h[m];
        d[m] = v;
        const f = firsts[m];
        d[dKey(m)] = v != null && f != null ? round(v - f) : null;
      }
      return d;
    });
    const series = activeList.filter((m) => row.history.some((h) => h[m] != null));

    // Series on very different scales (promoters ~70% vs FII ~5%) look flat next to each other.
    const levels = data.flatMap((d) => series.map((m) => d[m] as number | null)).filter((x): x is number => x != null);
    const spread = levels.length ? Math.max(...levels) - Math.min(...levels) : 0;
    const biggest = Math.max(
      0.5,
      ...series.map((m) => {
        const xs = data.map((d) => d[m] as number | null).filter((x): x is number => x != null);
        return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
      }),
    );
    return { data, series, wide: series.length > 1 && spread > 5 * biggest };
  }, [row, activeList.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Until the viewer picks a scale, choose the one that keeps every line readable.
  const view: View = userView ?? (wide ? 'change' : 'level');
  const autoChange = userView === null && wide;

  const domain = useMemo<[number, number]>(() => {
    const keyOf = (m: Metric) => (view === 'level' ? m : dKey(m));
    const shown = data.flatMap((d) => series.map((m) => d[keyOf(m)] as number | null)).filter((x): x is number => x != null);
    let lo = shown.length ? Math.min(...shown) : 0;
    let hi = shown.length ? Math.max(...shown) : 1;
    if (view === 'change') {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    const pad = Math.max(view === 'level' ? 0.5 : 0.25, (hi - lo) * 0.16);
    return view === 'level' ? [Math.max(0, lo - pad), Math.min(100, hi + pad)] : [lo - pad, hi + pad];
  }, [data, series, view]);
  const setView = (v: View) => setUserView(v);
  const hint = wide && view === 'level';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          {row.symbol} <span className="font-normal text-ink-2">· {row.name}</span>
        </h2>
        <p className="text-sm text-ink-3">
          {row.industry} · latest filing {fmtQuarter(row.quarter)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        {activeList.map((m) => (
          <StatCard key={m} row={row} metric={m} />
        ))}
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
            {series.map((m) => (
              <span key={m} className="inline-flex items-center gap-2" title={METRIC_LONG[m]}>
                <Swatch metric={m} />
                {METRIC_LABEL[m]}
              </span>
            ))}
            {!series.length && <span className="text-ink-3">No data for the selected series.</span>}
          </div>
          <div role="group" aria-label="Chart scale" className="inline-flex rounded-full border border-line bg-bg p-0.5 text-xs">
            {(
              [
                ['level', 'Holding %', 'Each series as % of the company'],
                ['change', 'Change', 'Change since the first quarter shown, in percentage points'],
              ] as [View, string, string][]
            ).map(([v, label, title]) => (
              <button
                key={v}
                type="button"
                title={title}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${view === v ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {hint && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            These series sit at very different levels, so the smaller ones look flat.{' '}
            <button type="button" onClick={() => setView('change')} className="font-semibold text-ink underline underline-offset-2">
              Switch to Change
            </button>{' '}
            to compare how each one moved.
          </p>
        )}

        <div
          className="mt-3 h-72"
          role="img"
          aria-label={`${series.map((m) => METRIC_LABEL[m]).join(', ')} holding of ${row.symbol} over ${row.history.length} quarters`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 84, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="q" tickFormatter={fmtShortQuarter} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={domain}
                tickFormatter={(v: number) => (view === 'level' ? `${v.toFixed(0)}%` : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)}
                tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              {view === 'change' && <ReferenceLine y={0} stroke="var(--ink-3)" />}
              <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: 'var(--ink-3)', strokeDasharray: '3 3' }} />
              {series.map((m) => {
                const key = view === 'level' ? m : dKey(m);
                return (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={key}
                    name={METRIC_LABEL[m]}
                    stroke={METRIC_COLOR[m]}
                    strokeWidth={2.25}
                    connectNulls={false}
                    dot={{ r: 4, fill: METRIC_COLOR[m], stroke: 'var(--surface)', strokeWidth: 2 }}
                    activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2 }}
                    label={endLabel(m, data, key)}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {view === 'level' ? 'Percent of total shares held.' : `Change since ${fmtQuarter(row.history[0]?.q)}, in percentage points.`}
          {autoChange && ' Showing Change because the series sit at very different levels; Holding % would flatten the smaller ones.'} Hover a point for exact
          values.
        </p>
      </section>
      <StockActivity symbol={row.symbol} />
    </div>
  );
}
