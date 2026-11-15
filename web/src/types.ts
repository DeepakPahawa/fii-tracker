// Mirrors fetcher/fii_fetcher/summary.py. Change both together.
export interface HistoryPoint {
  q: string;
  pct: number | null; // FII %
  dii: number | null; // DII %
}

export interface Row {
  symbol: string;
  name: string;
  industry: string;
  quarter: string;
  // FII: foreign portfolio investors
  fpiPct: number | null;
  prevPct: number | null;
  changePp: number | null;
  fpiShares: number | null;
  sharesChangePct: number | null;
  denominatorEffect: boolean;
  streak: number;
  pending: boolean;
  // DII: domestic institutions (mutual funds, insurers, banks, pension funds...)
  diiPct: number | null;
  diiPrevPct: number | null;
  diiChangePp: number | null;
  diiShares: number | null;
  diiSharesChangePct: number | null;
  diiDenominatorEffect: boolean;
  diiStreak: number;
  diiPending: boolean;
  history: HistoryPoint[];
}

export interface Summary {
  generatedAt: string;
  latestQuarter: string | null;
  previousQuarter: string | null;
  quarters: string[];
  coverage: {
    universe: number;
    withLatest: number;
    withAny: number;
    diiWithLatest?: number;
    diiWithAny?: number;
  };
  rows: Row[];
}
