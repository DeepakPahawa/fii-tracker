// Full daily history for one ETF (exchange close vs end-of-day NAV) and the statistics built on it.
// Data comes from web/public/data/etf-history/daily/<SYMBOL>.csv, written by web/etf-proxy/fetch-history.mjs.

export interface HRow {
  /** yyyy-mm-dd */
  d: string;
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  nav: number;
  /** NAV exactly as AMFI published it (before split adjustment). */
  raw: number;
  /** Premium % = (close − NAV) / NAV × 100. */
  p: number;
  /** Close-to-close return %, NaN on the first row. */
  pr: number;
  /** NAV-to-NAV return %, NaN on the first row. */
  nr: number;
  gap: number;
}

export type Zone = 'prem' | 'near' | 'disc';
export const zoneOf = (p: number): Zone => (p > 0.15 ? 'prem' : p < -0.15 ? 'disc' : 'near');

export function parseCsv(text: string): HRow[] {
  const lines = text.trim().split('\n').slice(1);
  return lines.map((l) => {
    const a = l.split(',');
    const n = (i: number) => (a[i] === '' || a[i] === undefined ? NaN : Number(a[i]));
    return { d: a[1], t: Date.parse(a[1]), o: n(2), h: n(3), l: n(4), c: n(5), v: n(6), nav: n(7), raw: n(8), p: n(9), pr: n(10), nr: n(11), gap: n(12) };
  });
}

export async function loadHistory(symbol: string, signal?: AbortSignal): Promise<HRow[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/etf-history/daily/${encodeURIComponent(symbol)}.csv`, { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`No history file for ${symbol} (HTTP ${res.status}). Run: node web/etf-proxy/fetch-history.mjs ${symbol}`);
  const rows = parseCsv(await res.text());
  if (!rows.length) throw new Error(`History file for ${symbol} is empty`);
  return rows;
}

export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
export const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};
export const stdev = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** Rows from the last `years` years (0 = everything). */
export function sliceRange(rows: HRow[], years: number): HRow[] {
  if (!years) return rows;
  const cut = rows[rows.length - 1].t - years * 365.25 * 864e5;
  return rows.filter((r) => r.t >= cut);
}

export interface Summary {
  first: HRow;
  last: HRow;
  avg: number;
  med: number;
  sd: number;
  aboveNav: number;
  belowNav: number;
  over15: number;
  under15: number;
  maxPrem: HRow;
  maxDisc: HRow;
  trackingError: number;
  priceChange: number;
  navChange: number;
}

export function summarize(rows: HRow[]): Summary {
  const p = rows.map((r) => r.p);
  const pairs = rows.filter((r) => Number.isFinite(r.pr) && Number.isFinite(r.nr));
  return {
    first: rows[0],
    last: rows[rows.length - 1],
    avg: mean(p),
    med: median(p),
    sd: stdev(p),
    aboveNav: p.filter((x) => x > 0).length / p.length,
    belowNav: p.filter((x) => x < 0).length / p.length,
    over15: p.filter((x) => x > 0.15).length,
    under15: p.filter((x) => x < -0.15).length,
    maxPrem: rows.reduce((a, r) => (r.p > a.p ? r : a)),
    maxDisc: rows.reduce((a, r) => (r.p < a.p ? r : a)),
    trackingError: stdev(pairs.map((r) => r.pr - r.nr)) * Math.sqrt(252),
    priceChange: (rows[rows.length - 1].c / rows[0].c - 1) * 100,
    navChange: (rows[rows.length - 1].nav / rows[0].nav - 1) * 100,
  };
}

export interface YearRow {
  year: string;
  days: number;
  avgClose: number;
  avgNav: number;
  avgPrem: number;
  maxPrem: number;
  maxDisc: number;
  over15: number;
  under15: number;
  priceChange: number;
  navChange: number;
}

export function yearly(rows: HRow[]): YearRow[] {
  const by = new Map<string, HRow[]>();
  rows.forEach((r) => {
    const y = r.d.slice(0, 4);
    by.set(y, [...(by.get(y) ?? []), r]);
  });
  return [...by.entries()].map(([year, a]) => {
    const p = a.map((r) => r.p);
    return {
      year,
      days: a.length,
      avgClose: mean(a.map((r) => r.c)),
      avgNav: mean(a.map((r) => r.nav)),
      avgPrem: mean(p),
      maxPrem: Math.max(...p),
      maxDisc: Math.min(...p),
      over15: p.filter((x) => x > 0.15).length,
      under15: p.filter((x) => x < -0.15).length,
      priceChange: (a[a.length - 1].c / a[0].c - 1) * 100,
      navChange: (a[a.length - 1].nav / a[0].nav - 1) * 100,
    };
  });
}

/** Premium histogram, 0.05% bins from −1% to +1%; values beyond are folded into the end bins. */
export function histogram(rows: HRow[]) {
  const B = 0.05;
  const LIM = 1;
  const nb = Math.round((2 * LIM) / B);
  const counts = new Array<number>(nb).fill(0);
  rows.forEach((r) => {
    const v = Math.max(-LIM, Math.min(LIM - 1e-9, r.p));
    counts[Math.floor((v + LIM) / B)]++;
  });
  return { B, LIM, counts };
}

export function regression(rows: HRow[]) {
  const pts = rows.filter((r) => Number.isFinite(r.pr) && Number.isFinite(r.nr));
  if (pts.length < 3) return { pts, corr: NaN, slope: NaN };
  const mx = mean(pts.map((r) => r.nr));
  const my = mean(pts.map((r) => r.pr));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  pts.forEach((r) => {
    sxy += (r.nr - mx) * (r.pr - my);
    sxx += (r.nr - mx) ** 2;
    syy += (r.pr - my) ** 2;
  });
  return { pts, corr: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx };
}

function isoWeek(ds: string): string {
  const d = new Date(`${ds}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  return `${y}-${Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)}`;
}

/** Last trading day of each ISO week with its week-on-week price return. */
export function weekly(rows: HRow[]): { c: number; p: number; pr: number }[] {
  const m = new Map<string, HRow>();
  rows.forEach((r) => m.set(isoWeek(r.d), r));
  const a = [...m.values()];
  return a.map((r, i) => ({ c: r.c, p: r.p, pr: i ? (r.c / a[i - 1].c - 1) * 100 : NaN }));
}

export interface EventCell {
  n: number;
  avg: number;
  winPct: number;
}
export const ZONES: { key: 'all' | Zone; label: string }[] = [
  { key: 'all', label: 'Any' },
  { key: 'prem', label: 'At a premium' },
  { key: 'near', label: 'Near NAV' },
  { key: 'disc', label: 'At a discount' },
];

/**
 * What the price did over the next `k` periods after a period that fell by at least `x`% (x = 0 gives the
 * every-period baseline), grouped by the premium zone on the drop day.
 */
export function dropStudy(rows: HRow[], basis: 'd' | 'w', k: number, thresholds = [0, 1, 2, 3, 4, 5]) {
  const src = basis === 'd' ? rows.map((r) => ({ c: r.c, p: r.p, pr: r.pr })) : weekly(rows);
  const S = src.map((r, i) => ({
    r: r.pr,
    z: zoneOf(r.p),
    f: i + k < src.length ? (src[i + k].c / r.c - 1) * 100 : NaN,
  }));
  return thresholds.map((x) => ({
    x,
    cells: ZONES.map(({ key }): EventCell | null => {
      const a = S.filter((s) => Number.isFinite(s.f) && Number.isFinite(s.r) && (x === 0 || s.r <= -x) && (key === 'all' || s.z === key));
      if (!a.length) return null;
      const f = a.map((s) => s.f);
      return { n: a.length, avg: mean(f), winPct: (f.filter((v) => v > 0).length / f.length) * 100 };
    }),
  }));
}
