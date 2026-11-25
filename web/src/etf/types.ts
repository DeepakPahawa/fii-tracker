export type EtfCategory = 'Broad Index' | 'Sectoral/Thematic' | 'Commodity' | 'Global';
export type CategoryFilter = 'All' | 'Indices' | 'Sectoral' | 'Commodity' | 'Global';

export interface EtfInstrument {
  symbol: string;
  name: string;
  category: EtfCategory;
  /** Approximate price used only to seed the simulator. */
  seedPrice: number;
  /** Typical daily volume (units) used only to seed the simulator. */
  seedVolume: number;
}

/** One raw tick for an ETF, as delivered by either the simulator or a live proxy. */
export interface EtfQuote {
  symbol: string;
  ltp: number;
  prevClose: number;
  inav: number;
  /** Cumulative traded units today. */
  volume: number;
  /** Cumulative traded value today (₹). Optional: derived from volume x LTP when missing. */
  turnover?: number;
}

export interface QuoteBatch {
  /** Epoch ms of the snapshot. */
  ts: number;
  quotes: EtfQuote[];
}

export type EtfStatus = 'fair' | 'discount' | 'premium' | 'marginal';

/** A quote plus everything derived from it (see utils/etfCalculations.ts). */
export interface EtfRow extends EtfQuote {
  name: string;
  category: EtfCategory;
  dayChange: number;
  dayChangePct: number;
  spread: number;
  spreadPct: number;
  status: EtfStatus;
  turnover: number;
}

export interface HistoryPoint {
  ts: number;
  ltp: number;
  inav: number;
}

export interface AlertSettings {
  enabled: boolean;
  /** Alert when an ETF trades at a discount deeper than this many % (positive number, e.g. 0.3). */
  discountPct: number;
  /** Alert when an ETF trades at a premium above this many %. */
  premiumPct: number;
  sound: boolean;
}

export type DataMode = 'mock' | 'live';
