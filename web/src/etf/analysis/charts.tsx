import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { histogram, regression, zoneOf, type HRow } from './history';
import { signed } from '../format';

export const C = { price: '#38bdf8', nav: '#fbbf24', up: '#34d399', down: '#fb7185', mid: '#64748b', grid: '#1e293b', text: '#94a3b8', ink: '#e2e8f0' };
const M = { l: 56, r: 12, t: 10, b: 24 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(min: number, max: number, n = 5): number[] {
  const span = max - min || 1;
  const s0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(s0));
  const r = s0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const t: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) t.push(+v.toFixed(10));
  return t;
}
const decimals = (step: number) => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step))));
const num = (v: number, d: number) => v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

interface Frame {
  W: number;
  H: number;
  n: number;
  pw: number;
  x: (i: number) => number;
  y: (v: number) => number;
  grid: ReactNode;
}

function makeFrame(rows: HRow[], W: number, H: number, lo: number, hi: number, fmtY?: (v: number) => string): Frame {
  const n = rows.length;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const x = (i: number) => M.l + (n > 1 ? (i / (n - 1)) * pw : 0);
  const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * ph;
  const ticks = niceTicks(lo, hi, Math.max(3, Math.round(ph / 55)));
  const dec = ticks.length > 1 ? decimals(ticks[1] - ticks[0]) : 0;
  const els: ReactNode[] = ticks.map((t) => (
    <g key={`y${t}`}>
      <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
      <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fill={C.text} fontSize="11" fontFamily="ui-monospace,monospace">{fmtY ? fmtY(t) : num(t, dec)}</text>
    </g>
  ));
  // x ticks: years for long views, months for short ones
  const spanYears = n > 1 ? (rows[n - 1].t - rows[0].t) / 864e5 / 365 : 0;
  let prev = '';
  let lastX = -99;
  for (let i = 0; i < n; i++) {
    const d = new Date(rows[i].t);
    const yr = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    const key = spanYears > 2.2 ? String(yr) : `${yr}-${mo}`;
    if (key === prev) continue;
    prev = key;
    const label = spanYears > 2.2 ? String(yr) : mo % (spanYears > 1.2 ? 3 : 1) === 0 ? `${MONTHS[mo]} ${String(yr).slice(2)}` : null;
    const xx = x(i);
    if (label && xx - lastX > 46 && xx < M.l + pw - 16) {
      lastX = xx;
      els.push(
        <g key={`x${i}`}>
          <line x1={xx} x2={xx} y1={M.t} y2={H - M.b} stroke={C.grid} opacity="0.6" />
          <text x={xx} y={H - 6} textAnchor="middle" fill={C.text} fontSize="11" fontFamily="ui-monospace,monospace">{label}</text>
        </g>,
      );
    }
  }
  return { W, H, n, pw, x, y, grid: els };
}

/** A time-series chart that shares one crosshair index with its siblings. */
function TimeChart({ rows, height, lo, hi, fmtY, hover, onHover, render }: {
  rows: HRow[];
  height: number;
  lo: number;
  hi: number;
  fmtY?: (v: number) => string;
  hover: number;
  onHover: (i: number) => void;
  render: (f: Frame) => ReactNode;
}) {
  const [ref, W] = useWidth();
  const body = useMemo(() => {
    if (W < 80) return null;
    const f = makeFrame(rows, W, height, lo, hi, fmtY);
    return { f, content: render(f) };
  }, [rows, W, height, lo, hi, fmtY, render]);
  const move = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left - M.l) / (rect.width - M.l - M.r);
    onHover(Math.max(0, Math.min(rows.length - 1, Math.round(frac * (rows.length - 1)))));
  };
  return (
    <div ref={ref} className="w-full touch-pan-y" onPointerMove={move} onPointerDown={move} onPointerLeave={() => onHover(-1)}>
      {body && (
        <svg width={body.f.W} height={height} className="block">
          {body.f.grid}
          {body.content}
          {hover >= 0 && hover < rows.length && <line x1={body.f.x(hover)} x2={body.f.x(hover)} y1={M.t} y2={height - M.b} stroke={C.ink} opacity="0.45" />}
        </svg>
      )}
    </div>
  );
}

export function PriceNavChart({ rows, hover, onHover }: { rows: HRow[]; hover: number; onHover: (i: number) => void }) {
  const { lo, hi } = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    rows.forEach((r) => {
      a = Math.min(a, r.c, r.nav);
      b = Math.max(b, r.c, r.nav);
    });
    const pad = (b - a) * 0.05 || 1;
    return { lo: a - pad, hi: b + pad };
  }, [rows]);
  const render = useCallback(
    (f: Frame) => {
      const path = (k: 'c' | 'nav') => rows.map((r, i) => `${i ? 'L' : 'M'}${f.x(i).toFixed(1)} ${f.y(r[k]).toFixed(1)}`).join('');
      return (
        <>
          <path d={path('nav')} stroke={C.nav} strokeWidth="1.5" fill="none" />
          <path d={path('c')} stroke={C.price} strokeWidth="1.5" fill="none" />
        </>
      );
    },
    [rows],
  );
  return <TimeChart rows={rows} height={290} lo={lo} hi={hi} hover={hover} onHover={onHover} render={render} />;
}

const fmtPct1 = (v: number) => signed(v, 1);

export function PremiumChart({ rows, hover, onHover }: { rows: HRow[]; hover: number; onHover: (i: number) => void }) {
  const { lo, hi } = useMemo(() => {
    const p = rows.map((r) => r.p);
    const a = Math.min(-0.3, ...p);
    const b = Math.max(0.3, ...p);
    const pad = (b - a) * 0.06;
    return { lo: a - pad, hi: b + pad };
  }, [rows]);
  const render = useCallback(
    (f: Frame) => {
      const y0 = f.y(0).toFixed(1);
      let up = '';
      let dn = '';
      rows.forEach((r, i) => {
        const s = `M${f.x(i).toFixed(1)} ${y0}V${f.y(r.p).toFixed(1)}`;
        if (r.p >= 0) up += s;
        else dn += s;
      });
      return (
        <>
          <line x1={M.l} x2={f.W - M.r} y1={y0} y2={y0} stroke={C.mid} />
          {[0.15, -0.15].map((v) => <line key={v} x1={M.l} x2={f.W - M.r} y1={f.y(v)} y2={f.y(v)} stroke={C.mid} strokeDasharray="4 4" />)}
          <path d={up} stroke={C.up} fill="none" />
          <path d={dn} stroke={C.down} fill="none" />
        </>
      );
    },
    [rows],
  );
  return <TimeChart rows={rows} height={180} lo={lo} hi={hi} fmtY={fmtPct1} hover={hover} onHover={onHover} render={render} />;
}

export function PremiumHistogram({ rows }: { rows: HRow[] }) {
  const [ref, W] = useWidth();
  const H = 230;
  const h = useMemo(() => histogram(rows), [rows]);
  if (W < 80) return <div ref={ref} style={{ height: H }} />;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const ticks = niceTicks(0, Math.max(...h.counts), 4);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => M.t + (1 - v / top) * ph;
  const bw = pw / h.counts.length;
  const fill = { prem: C.up, disc: C.down, near: C.mid };
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fill={C.text} fontSize="11" fontFamily="ui-monospace,monospace">{t}</text>
          </g>
        ))}
        {[-1, -0.5, 0, 0.5, 1].map((v) => (
          <text key={v} x={M.l + ((v + h.LIM) / (2 * h.LIM)) * pw} y={H - 6} textAnchor="middle" fill={C.text} fontSize="11" fontFamily="ui-monospace,monospace">{signed(v, 1)}%</text>
        ))}
        {h.counts.map((c, i) => {
          const lo = -h.LIM + i * h.B;
          return (
            <rect key={i} x={M.l + i * bw + 0.5} y={y(c)} width={Math.max(1, bw - 1)} height={Math.max(0, ph - (y(c) - M.t))} fill={fill[zoneOf(lo + h.B / 2)]}>
              <title>{`${signed(lo, 2)}% to ${signed(lo + h.B, 2)}%: ${c} days`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

export function ReturnScatter({ rows }: { rows: HRow[] }) {
  const [ref, W] = useWidth();
  const H = 230;
  const { pts, corr, slope } = useMemo(() => regression(rows), [rows]);
  if (W < 80 || pts.length < 3) return <div ref={ref} style={{ height: H }} className="text-sm text-slate-500">{pts.length < 3 ? 'Not enough days for a scatter.' : ''}</div>;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const ext = Math.max(1, Math.min(8, Math.ceil(Math.max(...pts.map((r) => Math.max(Math.abs(r.pr), Math.abs(r.nr)))))));
  const clip = (v: number) => Math.max(-ext, Math.min(ext, v));
  const x = (v: number) => M.l + ((clip(v) + ext) / (2 * ext)) * pw;
  const y = (v: number) => M.t + (1 - (clip(v) + ext) / (2 * ext)) * ph;
  const step = ext > 4 ? 4 : ext > 2 ? 2 : 1;
  const marks: number[] = [];
  for (let v = -ext; v <= ext; v += step) marks.push(v);
  const dots = pts.map((r) => `M${x(r.nr).toFixed(1)} ${y(r.pr).toFixed(1)}h0`).join('');
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} className="block">
        {marks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={C.grid} />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fill={C.text} fontSize="11" fontFamily="ui-monospace,monospace">{signed(v, 0)}</text>
            <text x={x(v)} y={H - 6} textAnchor="middle" fill={C.text} fontSize="11" fontFamily="ui-monospace,monospace">{signed(v, 0)}</text>
          </g>
        ))}
        <line x1={x(-ext)} y1={y(-ext)} x2={x(ext)} y2={y(ext)} stroke={C.mid} strokeDasharray="4 4" />
        <path d={dots} stroke={C.price} strokeWidth="3" strokeLinecap="round" opacity="0.28" fill="none" />
        <text x={M.l + 8} y={M.t + 12} fill={C.text} fontSize="11" fontFamily="ui-monospace,monospace">x: NAV day %   y: price day %</text>
      </svg>
      <p className="mt-1 text-xs text-slate-500">Correlation {corr.toFixed(3)}, slope {slope.toFixed(3)}. Dashed line is a perfect match. Axes clipped at ±{ext}%.</p>
    </div>
  );
}
