import type { Summary } from './types';

/** Shape of one history point as older fetcher versions wrote it: FII was called "pct", no DII or promoters. */
interface LegacyPoint {
  q: string;
  pct?: number | null;
  fii?: number | null;
  dii?: number | null;
  pro?: number | null;
}

/**
 * Accept a summary.json written by an older fetcher. Missing fields become null so the
 * page never crashes, and the old history key "pct" is read as FII so that line still
 * draws. `legacy` is true when DII or promoter data could not have been present, which
 * means the viewer needs to re-run `summarize`.
 */
export function normalizeSummary(data: Summary): { data: Summary; legacy: boolean } {
  let legacy = false;
  const rows = data.rows.map((r) => {
    if (r.diiPct === undefined || r.proPct === undefined) legacy = true;
    const history = ((r.history ?? []) as unknown as LegacyPoint[]).map((h) => {
      if (h.fii === undefined && h.pct !== undefined) legacy = true;
      return { q: h.q, fii: h.fii ?? h.pct ?? null, dii: h.dii ?? null, pro: h.pro ?? null };
    });
    return {
      ...r,
      diiPct: r.diiPct ?? null,
      diiPrevPct: r.diiPrevPct ?? null,
      diiChangePp: r.diiChangePp ?? null,
      diiShares: r.diiShares ?? null,
      diiSharesChangePct: r.diiSharesChangePct ?? null,
      diiDenominatorEffect: r.diiDenominatorEffect ?? false,
      diiStreak: r.diiStreak ?? 0,
      diiPending: r.diiPending ?? true,
      proPct: r.proPct ?? null,
      proPrevPct: r.proPrevPct ?? null,
      proChangePp: r.proChangePp ?? null,
      proStreak: r.proStreak ?? 0,
      proPending: r.proPending ?? true,
      history,
    };
  });
  return { data: { ...data, rows }, legacy };
}
