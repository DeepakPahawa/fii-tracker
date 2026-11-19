# FII Tracker

Tracks where Foreign Portfolio Investors (FPIs, formerly FIIs) are investing in
Indian stocks: the FPI holding % of every Nifty 500 company, the change since last
quarter, and multi-quarter streaks of buying or selling.

* `fetcher/`: Python 3.9+ package that downloads and parses shareholding-pattern
  filings and writes JSON to `web/public/data/`
* `web/`: React + Vite + TypeScript + Tailwind + Recharts static site that reads
  `data/summary.json`
* `docs/PHASE1_PLAN.md`: design, data sources, data contract, roadmap

## Quick start

```bash
cd fetcher
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests       # parser and summary tests
.venv/bin/python -m fii_fetcher all --limit 20        # try 20 stocks first
.venv/bin/python -m fii_fetcher all                   # full Nifty 500, about 40 min the first time

cd ../web
npm install
npm run dev                                           # http://127.0.0.1:5174
```

## FII, DII and promoters

The dashboard shows the stock list on the left and the chart on the right. Three
checkboxes at the top (FII, DII, Promoters) choose which series are plotted and shown
in the list; the list can be ranked and filtered by any of them. Arrow keys move
through the list and `/` jumps to search. A "Sectors" tab shows the average change by
sector for the series you rank by.

**FII** is Category I + II foreign portfolio investors. **DII** is the filing's
"Institutions (Domestic)" block: mutual funds, insurers, banks, pension funds, AIFs and
similar. If the filing has a domestic subtotal row it is used; otherwise the component
rows are summed (never both). **Promoters** is "Promoter & Promoter Group" % from NSE's
filings list, so it needs no extra fetching. When series sit at very different levels
(promoters ~70% vs FII ~5%) the chart opens in "Change" view (percentage points since the
first quarter shown) so every line stays readable; "Holding %" is one click away.

Only calendar quarter-end filings (31 Mar, 30 Jun, 30 Sep, 31 Dec) are used.
Off-cycle patterns (post-IPO, mid-quarter events, e.g. dated 4 June) are ignored, so a
month never shows up twice.

Data fetched before DII support has no DII values. Re-download once:

```bash
cd fetcher
.venv/bin/python -m fii_fetcher fetch --force && .venv/bin/python -m fii_fetcher summarize
```

## Daily flows

The "Daily flows" tab shows FII/DII activity per trading day, from `web/public/data/flows.json`:

| Feed | Command | Content |
|---|---|---|
| NSE cash market | `flows --sources cash` | FII and DII buy / sell / net, Rs crore. NSE's API gives only the latest session, so run it daily to build history. |
| NSE F&O participant OI | `flows --sources fno [--days 30]` | Long and short contracts for FII, DII, Pro, Client across index and stock futures and options. Backfills the window; holidays are skipped. |
| NSDL FPI Monitor | `import-nsdl FILE.csv` | Equity, debt, hybrid etc. net investment. NSDL's public report pages were replaced by a login-only portal, so there is no fetcher: put the figures in a CSV with columns `date, category, gross_purchases, gross_sales, net` (Rs crore). |

`flows` with no options runs cash and F&O. `.github/workflows/fetch-flows.yml` runs it
weekdays at 19:00 IST; like the shareholding job it may be blocked on GitHub's IPs.

## Fetcher commands

| Command | What it does |
|---|---|
| `universe [--index nifty500]` | Index constituents → `universe.json` |
| `fetch [--symbols A,B] [--limit N] [--quarters 4] [--force]` | NSE filings + XBRL per stock → `holdings/<SYMBOL>.json`, incremental |
| `import-xbrl [--inbox DIR] [--symbol X]` | Parse XBRL files you downloaded by hand |
| `inspect-xbrl FILE` | Show which contexts and values the parser matched |
| `summarize` | `holdings/*` → `summary.json` |
| `all` | `universe`, then `fetch`, then `summarize` |
| `flows [--sources cash,fno] [--days N]` | Daily FII/DII cash and F&O OI → `flows.json` |
| `import-nsdl FILE` | Merge an NSDL FPI CSV into `flows.json` |

Global options: `--out DIR` (default `web/public/data`), `--delay SECONDS`
(default 1.0), `-v`.

## Data access, read this

NSE is the primary source. Its site uses bot protection and its terms restrict
automated access. The fetcher is slow on purpose and stops after repeated 403s.
Use it for personal research and check NSE's terms yourself. Datacenter IPs
(including GitHub Actions) are often blocked, so the scheduled workflow in
`.github/workflows/` may fail. Running locally on a schedule is the reliable route.

No-scraping fallback: on NSE (Corporate filings → Shareholding pattern) or BSE,
download a company's XBRL file into `fetcher/inbox/` (name it `SYMBOL_anything.xml`
if the file has no symbol inside), then:

```bash
.venv/bin/python -m fii_fetcher import-xbrl
.venv/bin/python -m fii_fetcher summarize
```

## Checking the parser on real filings

The tests use **synthetic** XBRL fixtures. SEBI's taxonomy names vary by version,
so the parser matches by pattern (see `fetcher/fii_fetcher/xbrl.py`). On your first
real filings, run `inspect-xbrl` and check `fpiPct` against the FPI line on the
company's NSE shareholding page. If a filing matches nothing, the holdings file
records `parseWarning`, and the regexes at the top of `xbrl.py` are what to adjust.
