import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Row } from '../types';
import { fmtPp } from '../format';

interface SectorStat {
  industry: string;
  avg: number;
  up: number;
  down: number;
  n: number;
}

export function sectorStats(rows: Row[]): SectorStat[] {
  const m = new Map<string, SectorStat>();
  for (const r of rows) {
    if (r.pending || r.changePp == null) continue;
    const s = m.get(r.industry) ?? { industry: r.industry, avg: 0, up: 0, down: 0, n: 0 };
    s.avg += r.changePp;
    s.n += 1;
    if (r.changePp > 0.01) s.up += 1;
    else if (r.changePp < -0.01) s.down += 1;
    m.set(r.industry, s);
  }
  return [...m.values()]
    .map((s) => ({ ...s, avg: Math.round((s.avg / s.n) * 1000) / 1000 }))
    .sort((a, b) => b.avg - a.avg);
}

function SectorTooltip({ active, payload }: { active?: boolean; payload?: { payload: SectorStat }[] }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-ink">{s.industry}</div>
      <div className="num mt-1 text-ink-2">Average change: {fmtPp(s.avg)}</div>
      <div className="num text-ink-2">
        {s.up} up · {s.down} down · {s.n} stocks
      </div>
    </div>
  );
}

export function SectorChart({ rows, selected, onSelect }: { rows: Row[]; selected: string; onSelect: (industry: string) => void }) {
  const data = sectorStats(rows);
  if (!data.length) {
    return <p className="text-sm text-ink-3">Needs two quarters of data to show sector changes.</p>;
  }
  const height = Math.max(220, data.length * 26 + 40);
  return (
    <div style={{ height }} role="img" aria-label="Average FPI holding change by sector, percentage points">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
            tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="industry"
            width={170}
            tick={{ fill: 'var(--ink-2)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <ReferenceLine x={0} stroke="var(--ink-3)" />
          <Tooltip content={<SectorTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar
            dataKey="avg"
            radius={3}
            maxBarSize={18}
            cursor="pointer"
            onClick={(d: unknown) => {
              const s = (d as { payload?: SectorStat }).payload;
              if (s) onSelect(s.industry === selected ? '' : s.industry);
            }}
          >
            {data.map((d) => (
              <Cell
                key={d.industry}
                fill={d.avg >= 0 ? 'var(--up)' : 'var(--down)'}
                fillOpacity={selected && selected !== d.industry ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
