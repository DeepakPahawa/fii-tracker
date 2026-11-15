import type { Row } from './types';

export type Metric = 'fii' | 'dii' | 'pro';

export const METRICS: Metric[] = ['fii', 'dii', 'pro'];

export const METRIC_LABEL: Record<Metric, string> = { fii: 'FII', dii: 'DII', pro: 'Promoters' };
export const METRIC_HINT: Record<Metric, string> = { fii: 'foreign', dii: 'domestic', pro: 'founders' };
export const METRIC_LONG: Record<Metric, string> = {
  fii: 'Foreign institutional investors (Category I + II FPIs)',
  dii: 'Domestic institutions: mutual funds, insurers, banks, pension funds',
  pro: 'Promoters and promoter group',
};
// Series colours (categorical slots 1 to 3), defined in index.css for light and dark.
export const METRIC_COLOR: Record<Metric, string> = {
  fii: 'var(--series-fii)',
  dii: 'var(--series-dii)',
  pro: 'var(--series-pro)',
};

export interface MetricView {
  pct: number | null;
  prev: number | null;
  change: number | null;
  shares: number | null;
  sharesChangePct: number | null;
  denominatorEffect: boolean;
  streak: number;
  pending: boolean;
}

export function metricView(r: Row, m: Metric): MetricView {
  switch (m) {
    case 'fii':
      return {
        pct: r.fpiPct,
        prev: r.prevPct,
        change: r.changePp,
        shares: r.fpiShares,
        sharesChangePct: r.sharesChangePct,
        denominatorEffect: r.denominatorEffect,
        streak: r.streak,
        pending: r.pending,
      };
    case 'dii':
      return {
        pct: r.diiPct,
        prev: r.diiPrevPct,
        change: r.diiChangePp,
        shares: r.diiShares,
        sharesChangePct: r.diiSharesChangePct,
        denominatorEffect: r.diiDenominatorEffect,
        streak: r.diiStreak,
        pending: r.diiPending,
      };
    case 'pro':
      return {
        pct: r.proPct,
        prev: r.proPrevPct,
        change: r.proChangePp,
        shares: null,
        sharesChangePct: null,
        denominatorEffect: false,
        streak: r.proStreak,
        pending: r.proPending,
      };
  }
}
