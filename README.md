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

## Fetcher commands

| Command | What it does |
|---|---|
| `universe [--index nifty500]` | Index constituents → `universe.json` |
| `fetch [--symbols A,B] [--limit N] [--quarters 4] [--force]` | NSE filings + XBRL per stock → `holdings/<SYMBOL>.json`, incremental |
| `import-xbrl [--inbox DIR] [--symbol X]` | Parse XBRL files you downloaded by hand |
| `inspect-xbrl FILE` | Show which contexts and values the parser matched |
| `summarize` | `holdings/*` → `summary.json` |
| `all` | `universe`, then `fetch`, then `summarize` |

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
