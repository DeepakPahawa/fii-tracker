// Mirrors fetcher/fii_fetcher/summary.py. Change both together.
export interface HistoryPoint {
  q: string;
  fii: number | null; // foreign portfolio investors, % of shares
  dii: number | null; // domestic institutions, % of shares
  pro: number | null; // promoters and promoter group, % of shares
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
  // Promoters and promoter group
  proPct: number | null;
  proPrevPct: number | null;
  proChangePp: number | null;
  proStreak: number;
  proPending: boolean;
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
    proWithLatest?: number;
    proWithAny?: number;
  };
  rows: Row[];
}
