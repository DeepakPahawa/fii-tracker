import type { HistoryPoint } from '../types';

/** Minimal SVG dual-line chart: LTP (solid) vs iNAV (dashed), shared y-scale. */
export function Sparkline({ points, height = 140 }: { points: HistoryPoint[]; height?: number }) {
  if (points.length < 2) return <div className="grid place-items-center text-xs text-slate-500" style={{ height }}>Collecting ticks…</div>;
  const W = 420;
  const H = height;
  const pad = 4;
  const all = points.flatMap((p) => [p.ltp, p.inav]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const path = (key: 'ltp' | 'inav') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label="LTP versus iNAV intraday">
      <path d={path('inav')} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={path('ltp')} fill="none" stroke="#34d399" strokeWidth="1.8" />
    </svg>
  );
}
