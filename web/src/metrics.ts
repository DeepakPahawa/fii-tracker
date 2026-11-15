import type { Row } from './types';

export type Metric = 'fii' | 'dii';

export const METRIC_LABEL: Record<Metric, string> = { fii: 'FII', dii: 'DII' };
export const METRIC_LONG: Record<Metric, string> = {
  fii: 'Foreign institutional investors (FPIs)',
  dii: 'Domestic institutions (mutual funds, insurers, banks, pension funds)',
};
// Series colours (categorical slots 1 and 2), defined in index.css for light and dark.
export const METRIC_COLOR: Record<Metric, string> = { fii: 'var(--series-fii)', dii: 'var(--series-dii)' };

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
  return m === 'fii'
    ? {
        pct: r.fpiPct,
        prev: r.prevPct,
        change: r.changePp,
        shares: r.fpiShares,
        sharesChangePct: r.sharesChangePct,
        denominatorEffect: r.denominatorEffect,
        streak: r.streak,
        pending: r.pending,
      }
    : {
        pct: r.diiPct,
        prev: r.diiPrevPct,
        change: r.diiChangePp,
        shares: r.diiShares,
        sharesChangePct: r.diiSharesChangePct,
        denominatorEffect: r.diiDenominatorEffect,
        streak: r.diiStreak,
        pending: r.diiPending,
      };
}
