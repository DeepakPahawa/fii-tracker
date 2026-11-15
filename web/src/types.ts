// Mirrors fetcher/fii_fetcher/summary.py. Change both together.
export interface HistoryPoint {
  q: string;
  pct: number;
}

export interface Row {
  symbol: string;
  name: string;
  industry: string;
  quarter: string;
  fpiPct: number;
  prevPct: number | null;
  changePp: number | null;
  fpiShares: number | null;
  sharesChangePct: number | null;
  denominatorEffect: boolean;
  streak: number;
  pending: boolean;
  history: HistoryPoint[];
}

export interface Summary {
  generatedAt: string;
  latestQuarter: string | null;
  previousQuarter: string | null;
  quarters: string[];
  coverage: { universe: number; withLatest: number; withAny: number };
  rows: Row[];
}
