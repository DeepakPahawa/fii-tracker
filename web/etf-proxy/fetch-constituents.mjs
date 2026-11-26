#!/usr/bin/env node
// Download the stocks each tracked ETF holds, via the index it tracks (NSE's official index
// constituent lists, nsearchives.nseindia.com — free, no key). Writes one JSON per ETF to
// web/public/data/etf-constituents/<SYMBOL>.json for the /etf drawer.
//
//   node web/etf-proxy/fetch-constituents.mjs
//   node web/etf-proxy/fetch-constituents.mjs --out ./somewhere
//
// Limits: NSE publishes membership and sector but no weights (those are in each index's factsheet PDF,
// linked in the JSON). Gold/silver ETFs hold metal, MON100 holds Nasdaq-100 shares and ICICIB22 tracks a
// BSE index, so none of those have an NSE constituent file; they get a short explanatory record instead.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outDir = path.resolve(outFlag >= 0 ? args[outFlag + 1] : path.join(here, '../public/data/etf-constituents'));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const LIST = 'https://nsearchives.nseindia.com/content/indices';
const FACT = 'https://www.niftyindices.com/Factsheet';

/** index key -> { name, csv (file under /content/indices), factsheet (pdf under /Factsheet) } */
const INDEXES = {
  nifty50: { name: 'NIFTY 50', csv: 'ind_nifty50list', fact: 'ind_nifty50' },
  bank: { name: 'NIFTY Bank', csv: 'ind_niftybanklist', fact: 'ind_niftybank' },
  it: { name: 'NIFTY IT', csv: 'ind_niftyitlist', fact: 'ind_niftyit' },
  psubank: { name: 'NIFTY PSU Bank', csv: 'ind_niftypsubanklist', fact: 'ind_niftypsubank' },
  next50: { name: 'NIFTY Next 50', csv: 'ind_niftynext50list', fact: 'ind_niftynext50' },
  cpse: { name: 'NIFTY CPSE', csv: 'ind_niftycpselist', fact: 'ind_niftycpse' },
  mid150: { name: 'NIFTY Midcap 150', csv: 'ind_niftymidcap150list', fact: 'ind_niftymidcap150' },
  pharma: { name: 'NIFTY Pharma', csv: 'ind_niftypharmalist', fact: 'ind_niftypharma' },
  auto: { name: 'NIFTY Auto', csv: 'ind_niftyautolist', fact: 'ind_niftyauto' },
  fmcg: { name: 'NIFTY FMCG', csv: 'ind_niftyfmcglist', fact: 'ind_niftyfmcg' },
  pvtbank: { name: 'NIFTY Private Bank', csv: 'ind_nifty_privatebanklist', fact: 'ind_nifty_privatebank' },
};

/** ETF ticker -> what it holds. */
const ETFS = {
  NIFTYBEES: { index: 'nifty50' },
  SBINIFTY50: { index: 'nifty50' },
  NIFTYIETF: { index: 'nifty50' },
  BANKBEES: { index: 'bank' },
  BANKNIFTY1: { index: 'bank' },
  ITBEES: { index: 'it' },
  PSUBNKBEES: { index: 'psubank' },
  JUNIORBEES: { index: 'next50' },
  CPSEETF: { index: 'cpse' },
  MID150BEES: { index: 'mid150' },
  PHARMABEES: { index: 'pharma' },
  AUTOBEES: { index: 'auto' },
  FMCGIETF: { index: 'fmcg' },
  PVTBANIETF: { index: 'pvtbank' },
  GOLDBEES: { kind: 'commodity', note: 'Holds physical gold (99.5% purity bullion) and tracks its domestic price. There are no stocks behind it.' },
  GOLDIETF: { kind: 'commodity', note: 'Holds physical gold and tracks its domestic price. There are no stocks behind it.' },
  SILVERBEES: { kind: 'commodity', note: 'Holds physical silver and tracks its domestic price. There are no stocks behind it.' },
  SILVERIETF: { kind: 'commodity', note: 'Holds physical silver and tracks its domestic price. There are no stocks behind it.' },
  MON100: { kind: 'foreign', index: 'Nasdaq-100', note: 'Invests in the 100 largest non-financial Nasdaq-listed US companies. NSE does not publish that list, so the holdings are not shown here.' },
  ICICIB22: { kind: 'unavailable', index: 'S&P BSE Bharat 22', note: 'Tracks the S&P BSE Bharat 22 index (22 government-linked companies and PSU banks). It is a BSE index, so NSE has no constituent file for it.' },
};

/** Minimal CSV line parser (handles quoted commas). */
function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) (out.push(cur), (cur = ''));
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function getText(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 700 * i));
    }
  }
}

const cache = new Map();
async function constituents(key) {
  if (cache.has(key)) return cache.get(key);
  const spec = INDEXES[key];
  const text = await getText(`${LIST}/${spec.csv}.csv`);
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = parseLine(head).map((c) => c.toLowerCase());
  const at = (name) => cols.findIndex((c) => c.includes(name));
  const iName = at('company');
  const iInd = at('industry');
  const iSym = at('symbol');
  const iIsin = at('isin');
  if ([iName, iInd, iSym].includes(-1)) throw new Error(`Unexpected columns in ${spec.csv}.csv: ${head}`);
  const rows = lines
    .map(parseLine)
    .filter((a) => a[iSym])
    .map((a) => ({ symbol: a[iSym], name: a[iName], industry: a[iInd], isin: iIsin >= 0 ? a[iIsin] : '' }));
  cache.set(key, rows);
  return rows;
}

await mkdir(outDir, { recursive: true });
const fetchedAt = new Date().toISOString();
let failed = 0;
for (const [symbol, spec] of Object.entries(ETFS)) {
  try {
    let rec;
    if (spec.kind) {
      rec = { symbol, kind: spec.kind, index: spec.index ?? null, note: spec.note, fetchedAt, constituents: [] };
    } else {
      const idx = INDEXES[spec.index];
      const list = await constituents(spec.index);
      if (!list.length) throw new Error('empty list');
      rec = {
        symbol,
        kind: 'equity',
        index: idx.name,
        source: `${LIST}/${idx.csv}.csv`,
        factsheet: `${FACT}/${idx.fact}.pdf`,
        fetchedAt,
        constituents: list,
      };
    }
    await writeFile(path.join(outDir, `${symbol}.json`), JSON.stringify(rec) + '\n');
    console.log(`✓ ${symbol.padEnd(11)} ${rec.kind.padEnd(11)} ${rec.index ?? ''} ${rec.constituents.length ? `(${rec.constituents.length} stocks)` : ''}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${symbol.padEnd(11)} ${e.message}`);
  }
}
console.log(`\nWrote ${Object.keys(ETFS).length - failed}/${Object.keys(ETFS).length} files to ${outDir}`);
if (failed) process.exitCode = 1;
