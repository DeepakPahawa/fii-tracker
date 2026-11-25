import type { AlertSettings, CategoryFilter, EtfCategory, EtfQuote, EtfRow, EtfStatus } from '../types';
import { UNIVERSE_BY_SYMBOL } from '../universe';

/** Status thresholds, in percent. Between 0.10 and 0.15 either way is "marginal" (not yet actionable). */
export const FAIR_BAND = 0.1;
export const ALERT_BAND = 0.15;

/** Spread = LTP - iNAV (₹). */
export const spreadAmount = (ltp: number, inav: number) => ltp - inav;

/** Spread % = (LTP - iNAV) / iNAV * 100. */
export const spreadPercent = (ltp: number, inav: number) => (inav > 0 ? ((ltp - inav) / inav) * 100 : 0);

export function classify(spreadPct: number): EtfStatus {
  if (spreadPct < -ALERT_BAND) return 'discount';
  if (spreadPct > ALERT_BAND) return 'premium';
  if (Math.abs(spreadPct) <= FAIR_BAND) return 'fair';
  return 'marginal';
}

export const STATUS_LABEL: Record<EtfStatus, string> = {
  fair: 'Fair value',
  discount: 'Discount · buy alert',
  premium: 'Premium · risk',
  marginal: 'Marginal',
};

/** Turn a raw quote into a fully derived row. Returns null for symbols outside the universe. */
export function enrich(q: EtfQuote): EtfRow | null {
  const meta = UNIVERSE_BY_SYMBOL.get(q.symbol);
  if (!meta) return null;
  const spreadPct = spreadPercent(q.ltp, q.inav);
  const dayChange = q.ltp - q.prevClose;
  return {
    ...q,
    name: meta.name,
    category: meta.category,
    dayChange,
    dayChangePct: q.prevClose > 0 ? (dayChange / q.prevClose) * 100 : 0,
    spread: spreadAmount(q.ltp, q.inav),
    spreadPct,
    status: classify(spreadPct),
    turnover: q.turnover ?? q.volume * q.ltp,
  };
}

const CATEGORY_MAP: Record<Exclude<CategoryFilter, 'All'>, EtfCategory> = {
  Indices: 'Broad Index',
  Sectoral: 'Sectoral/Thematic',
  Commodity: 'Commodity',
  Global: 'Global',
};

export function matchesFilter(row: EtfRow, filter: CategoryFilter, query: string): boolean {
  if (filter !== 'All' && row.category !== CATEGORY_MAP[filter]) return false;
  const q = query.trim().toLowerCase();
  return !q || row.symbol.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
}

export type SortKey = 'spreadPct' | 'volume' | 'dayChangePct' | 'symbol';

export function sortRows(rows: EtfRow[], key: SortKey, dir: 1 | -1): EtfRow[] {
  return [...rows].sort((a, b) => (key === 'symbol' ? a.symbol.localeCompare(b.symbol) * dir : (a[key] - b[key]) * dir));
}

/** Biggest discount (most negative spread %) and biggest premium (most positive). */
export function extremes(rows: EtfRow[]) {
  let discount: EtfRow | null = null;
  let premium: EtfRow | null = null;
  for (const r of rows) {
    if (!discount || r.spreadPct < discount.spreadPct) discount = r;
    if (!premium || r.spreadPct > premium.spreadPct) premium = r;
  }
  return { discount, premium };
}

export function breadth(rows: EtfRow[]) {
  let advancing = 0;
  let declining = 0;
  for (const r of rows) {
    if (r.dayChange > 0) advancing++;
    else if (r.dayChange < 0) declining++;
  }
  return { advancing, declining, unchanged: rows.length - advancing - declining };
}

/** Does this row breach the user's alert thresholds? Returns the breach kind or null. */
export function alertBreach(row: EtfRow, s: AlertSettings): 'discount' | 'premium' | null {
  if (!s.enabled) return null;
  if (row.spreadPct <= -s.discountPct) return 'discount';
  if (row.spreadPct >= s.premiumPct) return 'premium';
  return null;
}

// ---- Market hours (NSE equity: Mon-Fri 09:15-15:30 IST; holidays are not modelled) ----

const IST_OFFSET_MIN = 330;

function istParts(now: number) {
  const d = new Date(now + IST_OFFSET_MIN * 60_000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), seconds: d.getUTCSeconds() };
}

export interface MarketState {
  open: boolean;
  label: string;
  /** Human countdown, e.g. "closes in 2h 14m" or "opens in 15h 02m". */
  countdown: string;
}

export function marketState(now: number): MarketState {
  const { day, minutes, seconds } = istParts(now);
  const OPEN = 9 * 60 + 15;
  const CLOSE = 15 * 60 + 30;
  const weekday = day >= 1 && day <= 5;
  const fmt = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  const secsLeft = (target: number) => Math.max(0, target * 60 - (minutes * 60 + seconds));

  if (weekday && minutes >= OPEN && minutes < CLOSE) {
    return { open: true, label: 'Market open', countdown: `closes in ${fmt(Math.ceil(secsLeft(CLOSE) / 60))}` };
  }
  // Minutes until the next weekday 09:15.
  let daysAhead = 0;
  let d = day;
  if (!(weekday && minutes < OPEN)) {
    do {
      d = (d + 1) % 7;
      daysAhead++;
    } while (d === 0 || d === 6);
  }
  const total = daysAhead ? daysAhead * 1440 + OPEN - minutes : Math.ceil(secsLeft(OPEN) / 60);
  return { open: false, label: 'Market closed', countdown: `opens in ${fmt(total)}` };
}

export function formatIstTime(ts: number): string {
  const { minutes, seconds } = istParts(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(minutes / 60))}:${p(minutes % 60)}:${p(seconds)} IST`;
}
