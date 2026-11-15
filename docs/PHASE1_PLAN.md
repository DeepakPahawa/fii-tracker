# Phase 1 — Quarterly FPI holdings tracker

Goal: for every Nifty 500 stock, show how much of the company Foreign Portfolio
Investors (FPIs, formerly "FIIs") own, how that changed since last quarter, and
whether they have been adding or cutting for several quarters in a row.

## Why Python for the fetcher (Node for the UI)

| Need | Python | Node |
|---|---|---|
| Parse SEBI shareholding XBRL (XML with contexts, dimensions) | stdlib `xml.etree`, easy namespace handling | needs `fast-xml-parser` + hand-rolled context logic |
| CSV / tabular data, later analytics (pandas) | first-class | weaker |
| Indian market tooling to learn from (nsepython, jugaad-data) | mature | little |
| Later phases: NSDL fortnightly Excel, SAST PDFs | `openpyxl`, `pdfplumber` | patchy |
| Runs in GitHub Actions | yes | yes |

So: **Python 3.9+ for data**, with only one dependency (`requests`).
**React + Vite + TypeScript** for the UI, because it is a static site that only
reads JSON. The JSON files are the contract between the two (see "Data contract").

## Source of truth

SEBI LODR Regulation 31: every listed company files a shareholding pattern each
quarter, within 21 days of quarter end, as XBRL on NSE and BSE. The FPI rows
(Category I and Category II, plus legacy "Foreign Institutional Investors") are
what we extract.

* Universe: `https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv`
* Filings list per company: NSE `api/corporate-share-holdings-master?index=equities&symbol=X`
  (returns quarter date, submission date, promoter %, public %, and the XBRL URL)
* Per-filing XBRL: the `xbrl` URL from that list (hosted on `nsearchives.nseindia.com`)

### Access caveats (read before running)

* NSE's site is behind bot protection and its terms of use restrict automated
  access. The fetcher is deliberately slow (default 1 request/second, stops after
  repeated 403s) and is meant for personal use. Check NSE's terms yourself.
* NSE often blocks datacenter IPs, so the GitHub Actions run may get 403.
  Running the fetcher locally (cron or launchd) and committing the output is the
  reliable route. The workflow is included but marked optional.
* Fallback that needs no scraping: download XBRL files by hand from NSE or BSE
  corporate filings into `fetcher/inbox/` and run `import-xbrl`.

## Pipeline

```
universe   → web/public/data/universe.json          (Nifty 500: symbol, name, industry, ISIN)
fetch      → web/public/data/holdings/<SYMBOL>.json  (one file per stock, all quarters, incremental)
import-xbrl→ same holdings files, from fetcher/inbox/*.xml
summarize  → web/public/data/summary.json            (the only file the UI loads)
```

Incremental rule: a quarter is downloaded again only if NSE lists a newer
`recordId` for it (a revised filing). The first full run takes about 40 minutes for
500 stocks × 4 quarters; weekly runs after that are quick.

## Metrics (in summarize)

* `fpiPct`: FPI Cat I + Cat II + legacy FII, % of total shares, latest quarter
* `changePp`: percentage-point change since the previous quarter
* `sharesChangePct`: % change in FPI share count. When it disagrees in sign with
  `changePp`, the move came from the total share count changing (buyback, QIP,
  promoter sale), not FPI buying. This is flagged as `denominatorEffect`.
* `streak`: consecutive quarters of rising (+n) or falling (−n) FPI %
* `pending`: the company has not filed for the latest quarter yet

## UI (web/)

* Header: latest vs previous quarter, coverage (how many stocks have filed)
* Tiles: stocks where FPIs increased, decreased, and the median change
* Sector chart: average pp change by industry
* Table: search, industry filter, presets (top buys, top sells, streaks ≥ 3),
  sortable columns; click a row for its 8-quarter history chart

## Data contract (`summary.json`)

```jsonc
{
  "generatedAt": "2026-11-15T14:00:00Z",
  "latestQuarter": "2026-09-30",
  "previousQuarter": "2026-06-30",
  "quarters": ["2024-12-31", "...", "2026-09-30"],
  "coverage": { "universe": 500, "withLatest": 431, "withAny": 497 },
  "rows": [{
    "symbol": "INFY", "name": "Infosys Ltd.", "industry": "Information Technology",
    "quarter": "2026-09-30", "fpiPct": 33.1, "prevPct": 32.4, "changePp": 0.7,
    "fpiShares": 1373000000, "sharesChangePct": 2.1, "denominatorEffect": false,
    "streak": 3, "pending": false,
    "history": [{ "q": "2026-06-30", "pct": 32.4 }, { "q": "2026-09-30", "pct": 33.1 }]
  }]
}
```

## Steps

1. Python package `fetcher/fii_fetcher`: HTTP client, universe, NSE filings,
   XBRL parser, store, summary, CLI. Unit tests with a synthetic XBRL fixture.
2. Workflow `.github/workflows/fetch-shareholding.yml`: weekly plus manual,
   fetch, summarize, commit data, build the UI.
3. `web/`: Vite + React + TS + Tailwind v4 + Recharts, reading `/data/summary.json`.
4. Verify: run the tests, run summarize on the fixtures, build the UI, preview it.

## Out of scope (later phases)

Bulk/block deal feed (phase 2), NSDL flows and sector heatmap (phase 3),
F&O participant OI and ETF/N-PORT holdings (phase 4), rupee value of changes
(needs prices).
