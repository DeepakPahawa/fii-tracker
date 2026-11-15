const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-09-30' -> 'Sep 2026' (quarter-end month). */
export function fmtQuarter(q: string | null | undefined): string {
  if (!q) return '—';
  const [y, m] = q.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

export function fmtShortQuarter(q: string): string {
  const [y, m] = q.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} '${y.slice(2)}`;
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  return v == null ? '—' : `${v.toFixed(digits)}%`;
}

export function fmtPp(v: number | null | undefined): string {
  if (v == null) return '—';
  const s = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${s}${Math.abs(v).toFixed(2)} pp`;
}

export function fmtShares(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return v.toLocaleString('en-IN');
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST';
}
