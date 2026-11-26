#!/usr/bin/env node
// Download the full daily history of every tracked ETF — exchange price (Yahoo Finance) joined
// with the official end-of-day NAV (AMFI via mfapi.in) — and write analysis-ready CSVs.
//
//   node web/etf-proxy/fetch-history.mjs                 # all 20 ETFs, whole history
//   node web/etf-proxy/fetch-history.mjs NIFTYBEES GOLDBEES
//   node web/etf-proxy/fetch-history.mjs --out ./somewhere
//
// Output (default web/public/data/etf-history/, which the /etf page serves and reads):
//   daily/<SYMBOL>.csv   one row per trading day
//   weekly/<SYMBOL>.csv  one row per ISO week (last trading day's close / NAV)
//   all-daily.csv, all-weekly.csv   every ETF stacked, for pandas / Excel (only with --combined)
//   manifest.json        fetch time, row counts, date ranges, failures
//
// NOTE: "nav" is the fund's end-of-day NAV, not intraday iNAV (no free source publishes that).
// price and nav are both back-adjusted to the latest share basis (splits detected per series);
// nav_raw is the NAV exactly as AMFI published it.
// premium_pct = (close - nav) / nav * 100, so positive = premium, negative = discount.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEME_CODES } from './history.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outDir = path.resolve(outFlag >= 0 ? args[outFlag + 1] : path.join(here, '../public/data/etf-history'));
const wanted = args.filter((a, i) => !a.startsWith('--') && (outFlag < 0 || i !== outFlag + 1));
const symbols = wanted.length ? wanted.map((s) => s.toUpperCase()) : Object.keys(SCHEME_CODES);

const unknown = symbols.filter((s) => !(s in SCHEME_CODES));
if (unknown.length) {
  console.error(`Unknown symbol(s): ${unknown.join(', ')}\nKnown: ${Object.keys(SCHEME_CODES).join(', ')}`);
  process.exit(1);
}

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 800 * i));
    }
  }
}

const istDate = (sec) => new Date((sec + 19800) * 1000).toISOString().slice(0, 10);
const amfiDate = (d) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : '');
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : '');
const ret = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : NaN);

/** ISO week key like 2025-W47, computed from the calendar date (UTC-safe). */
function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

/**
 * Back-adjust a series for splits it contains. A one-day move that is ~1/k (or k) for a whole
 * number k >= 2 is a split / consolidation, never a market move, so earlier values are rescaled
 * to the latest share basis. Done per series because Yahoo prices and AMFI NAVs switch basis on
 * different days (and Yahoo adjusts some tickers but not others).
 * Returns { values, events: [{ date, factor }] }.
 */
function backAdjust(dates, vals) {
  const out = vals.slice();
  const events = [];
  let f = 1;
  for (let i = vals.length - 1; i >= 0; i--) {
    out[i] = vals[i] * f;
    if (i === 0) break;
    const r = vals[i] / vals[i - 1];
    const k = r < 0.6 ? 1 / r : r > 1.7 ? r : 0;
    if (k >= 2 && Math.abs(k - Math.round(k)) / Math.round(k) < 0.07) {
      const factor = r < 1 ? 1 / Math.round(k) : Math.round(k);
      f *= factor;
      events.push({ date: dates[i], factor: r < 1 ? `${Math.round(k)}:1 split` : `1:${Math.round(k)} consolidation` });
    }
  }
  return { values: out, events: events.reverse() };
}

async function buildDaily(symbol) {
  const code = SCHEME_CODES[symbol];
  const [chart, fund] = await Promise.all([
    getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?period1=0&period2=${Math.floor(Date.now() / 1000) + 86400}&interval=1d`),
    getJson(`https://api.mfapi.in/mf/${code}`),
  ]);
  const res = chart?.chart?.result?.[0];
  if (!res?.timestamp) throw new Error('No price history from Yahoo Finance');
  const q = res.indicators.quote[0];
  const bars = new Map();
  res.timestamp.forEach((t, i) => {
    if (!Number.isFinite(q.close[i])) return;
    bars.set(istDate(t), { open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] });
  });
  const navs = new Map();
  for (const { date, nav } of fund.data ?? []) {
    const n = Number.parseFloat(nav);
    if (Number.isFinite(n) && n > 0) navs.set(amfiDate(date), n);
  }
  const dates = [...bars.keys()].filter((d) => navs.has(d)).sort();

  // Put price and NAV on the same (latest) share basis, each corrected at its own split date.
  const px = backAdjust(dates, dates.map((d) => bars.get(d).close));
  const nv = backAdjust(dates, dates.map((d) => navs.get(d)));

  const rows = [];
  let prev = null;
  dates.forEach((date, i) => {
    const b = bars.get(date);
    const k = px.values[i] / b.close; // scale open/high/low like the close
    const close = px.values[i];
    const nav = nv.values[i];
    rows.push({
      symbol,
      date,
      open: b.open * k,
      high: b.high * k,
      low: b.low * k,
      close,
      volume: b.volume ?? '',
      nav,
      nav_raw: navs.get(date),
      premium_pct: ret(close, nav),
      price_ret_pct: prev ? ret(close, prev.close) : NaN,
      nav_ret_pct: prev ? ret(nav, prev.nav) : NaN,
      gap_days: prev ? Math.round((Date.parse(date) - Date.parse(prev.date)) / 86400000) : '',
    });
    prev = { date, close, nav };
  });
  return { rows, adjustments: { price: px.events, nav: nv.events }, name: fund.meta?.scheme_name ?? '', priceDays: bars.size, navDays: navs.size };
}

function toWeekly(daily) {
  const byWeek = new Map();
  for (const r of daily) byWeek.set(isoWeek(r.date), r); // later days overwrite -> last trading day of the week
  const rows = [];
  let prev = null;
  for (const [week, r] of byWeek) {
    rows.push({
      symbol: r.symbol,
      week,
      date: r.date,
      close: r.close,
      nav: r.nav,
      premium_pct: r.premium_pct,
      price_ret_pct: prev ? ret(r.close, prev.close) : NaN,
      nav_ret_pct: prev ? ret(r.nav, prev.nav) : NaN,
    });
    prev = r;
  }
  return rows;
}

const DAILY_COLS = ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'nav', 'nav_raw', 'premium_pct', 'price_ret_pct', 'nav_ret_pct', 'gap_days'];
const WEEKLY_COLS = ['symbol', 'week', 'date', 'close', 'nav', 'premium_pct', 'price_ret_pct', 'nav_ret_pct'];
const fmt = (k, v) => (typeof v === 'number' ? (['premium_pct', 'price_ret_pct', 'nav_ret_pct'].includes(k) ? r4(v) : k === 'nav' || k === 'nav_raw' ? v : r2(v)) : v);
const csv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => fmt(c, r[c])).join(','))].join('\n') + '\n';

await mkdir(path.join(outDir, 'daily'), { recursive: true });
await mkdir(path.join(outDir, 'weekly'), { recursive: true });

const allDaily = [];
const allWeekly = [];
const manifest = { fetchedAt: new Date().toISOString(), source: 'Yahoo Finance (price) + AMFI via mfapi.in (end-of-day NAV)', etfs: {}, failed: {} };

for (const symbol of symbols) {
  try {
    const { rows, name, priceDays, navDays, adjustments } = await buildDaily(symbol);
    if (!rows.length) throw new Error('No overlapping dates between price and NAV');
    const weekly = toWeekly(rows);
    await writeFile(path.join(outDir, 'daily', `${symbol}.csv`), csv(DAILY_COLS, rows));
    await writeFile(path.join(outDir, 'weekly', `${symbol}.csv`), csv(WEEKLY_COLS, weekly));
    allDaily.push(...rows);
    allWeekly.push(...weekly);
    manifest.etfs[symbol] = {
      scheme: name,
      schemeCode: SCHEME_CODES[symbol],
      dailyRows: rows.length,
      weeklyRows: weekly.length,
      from: rows[0].date,
      to: rows.at(-1).date,
      splitAdjustments: adjustments,
      yahooDays: priceDays,
      navDays,
    };
    console.log(`✓ ${symbol.padEnd(11)} ${String(rows.length).padStart(5)} days  ${rows[0].date} → ${rows.at(-1).date}  (yahoo ${priceDays}, nav ${navDays})`);
  } catch (e) {
    manifest.failed[symbol] = e instanceof Error ? e.message : String(e);
    console.error(`✗ ${symbol.padEnd(11)} ${manifest.failed[symbol]}`);
  }
  await new Promise((res) => setTimeout(res, 300)); // be polite to the free APIs
}

if (allDaily.length && args.includes('--combined')) {
  await writeFile(path.join(outDir, 'all-daily.csv'), csv(DAILY_COLS, allDaily));
  await writeFile(path.join(outDir, 'all-weekly.csv'), csv(WEEKLY_COLS, allWeekly));
}
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nWrote ${Object.keys(manifest.etfs).length}/${symbols.length} ETFs to ${outDir}`);
if (Object.keys(manifest.failed).length) process.exitCode = 1;
