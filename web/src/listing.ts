import type { Row } from './types';
import { metricView, type Metric } from './metrics';

export type SortKey = 'change' | 'pct' | 'streak' | 'name';
export type Preset = 'all' | 'up' | 'down' | 'rising' | 'falling';

export const SORT_LABEL: Record<SortKey, string> = {
  change: 'Change',
  pct: 'Holding',
  streak: 'Streak',
  name: 'Name',
};

export const PRESETS: { id: Preset; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'Every stock' },
  { id: 'up', label: 'Increased', title: 'Holding went up since last quarter' },
  { id: 'down', label: 'Decreased', title: 'Holding went down since last quarter' },
  { id: 'rising', label: 'Rising 3+', title: 'Up for 3 or more quarters in a row' },
  { id: 'falling', label: 'Falling 3+', title: 'Down for 3 or more quarters in a row' },
];

export interface ListOptions {
  query: string;
  industry: string;
  hidePending: boolean;
  focus: Metric; // the metric the filters and the ranking apply to
  sortKey: SortKey;
  dir: 1 | -1;
  preset: Preset;
}

export function listStocks(rows: Row[], o: ListOptions): Row[] {
  const q = o.query.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (o.industry && r.industry !== o.industry) return false;
    if (q && !r.symbol.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
    const v = metricView(r, o.focus);
    if (o.hidePending && v.pending) return false;
    switch (o.preset) {
      case 'up':
        return !v.pending && (v.change ?? 0) > 0.01;
      case 'down':
        return !v.pending && (v.change ?? 0) < -0.01;
      case 'rising':
        return v.streak >= 3;
      case 'falling':
        return v.streak <= -3;
      default:
        return true;
    }
  });

  const num = (r: Row): number | null => {
    const v = metricView(r, o.focus);
    return o.sortKey === 'pct' ? v.pct : o.sortKey === 'change' ? v.change : v.streak;
  };

  return out.sort((a, b) => {
    if (o.sortKey === 'name') return a.symbol.localeCompare(b.symbol) * o.dir;
    const x = num(a);
    const y = num(b);
    if (x == null && y == null) return a.symbol.localeCompare(b.symbol);
    if (x == null) return 1; // stocks without a value always go last
    if (y == null) return -1;
    return (x - y) * o.dir || a.symbol.localeCompare(b.symbol);
  });
}
