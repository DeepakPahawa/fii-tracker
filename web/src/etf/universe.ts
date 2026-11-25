import type { EtfInstrument } from './types';

/** The 20 monitored high-liquidity NSE ETFs. Seed prices only matter for the simulator. */
export const ETF_UNIVERSE: EtfInstrument[] = [
  { symbol: 'NIFTYBEES', name: 'Nippon Nifty 50', category: 'Broad Index', seedPrice: 285, seedVolume: 9_000_000 },
  { symbol: 'BANKBEES', name: 'Nippon Nifty Bank', category: 'Sectoral/Thematic', seedPrice: 560, seedVolume: 1_800_000 },
  { symbol: 'ITBEES', name: 'Nippon Nifty IT', category: 'Sectoral/Thematic', seedPrice: 42, seedVolume: 6_500_000 },
  { symbol: 'PSUBNKBEES', name: 'Nippon Nifty PSU Bank', category: 'Sectoral/Thematic', seedPrice: 85, seedVolume: 3_200_000 },
  { symbol: 'SILVERBEES', name: 'Nippon Silver', category: 'Commodity', seedPrice: 115, seedVolume: 14_000_000 },
  { symbol: 'GOLDBEES', name: 'Nippon Gold', category: 'Commodity', seedPrice: 95, seedVolume: 12_000_000 },
  { symbol: 'JUNIORBEES', name: 'Nippon Nifty Next 50', category: 'Broad Index', seedPrice: 720, seedVolume: 450_000 },
  { symbol: 'CPSEETF', name: 'CPSE ETF', category: 'Sectoral/Thematic', seedPrice: 100, seedVolume: 5_500_000 },
  { symbol: 'SBINIFTY50', name: 'SBI Nifty 50', category: 'Broad Index', seedPrice: 275, seedVolume: 600_000 },
  { symbol: 'NIFTYIETF', name: 'ICICI Prudential Nifty 50', category: 'Broad Index', seedPrice: 290, seedVolume: 2_400_000 },
  { symbol: 'BANKNIFTY1', name: 'Kotak Bank ETF', category: 'Sectoral/Thematic', seedPrice: 565, seedVolume: 250_000 },
  { symbol: 'GOLDIETF', name: 'ICICI Prudential Gold', category: 'Commodity', seedPrice: 100, seedVolume: 3_000_000 },
  { symbol: 'SILVERIETF', name: 'ICICI Prudential Silver', category: 'Commodity', seedPrice: 120, seedVolume: 6_000_000 },
  { symbol: 'PHARMABEES', name: 'Nippon Nifty Pharma', category: 'Sectoral/Thematic', seedPrice: 23, seedVolume: 1_300_000 },
  { symbol: 'AUTOBEES', name: 'Nippon Nifty Auto', category: 'Sectoral/Thematic', seedPrice: 270, seedVolume: 90_000 },
  { symbol: 'FMCGIETF', name: 'ICICI Prudential FMCG', category: 'Sectoral/Thematic', seedPrice: 55, seedVolume: 400_000 },
  { symbol: 'PVTBANIETF', name: 'ICICI Prudential Private Bank', category: 'Sectoral/Thematic', seedPrice: 27, seedVolume: 1_100_000 },
  { symbol: 'MID150BEES', name: 'Nippon Nifty Midcap 150', category: 'Broad Index', seedPrice: 205, seedVolume: 3_500_000 },
  { symbol: 'ICICIB22', name: 'ICICI Bharat 22', category: 'Sectoral/Thematic', seedPrice: 120, seedVolume: 700_000 },
  { symbol: 'MON100', name: 'Motilal Oswal Nasdaq 100', category: 'Global', seedPrice: 215, seedVolume: 4_500_000 },
];

export const UNIVERSE_BY_SYMBOL = new Map(ETF_UNIVERSE.map((e) => [e.symbol, e]));
