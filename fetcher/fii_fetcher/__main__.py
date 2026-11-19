"""CLI: python -m fii_fetcher <command> [options]

  universe       download index constituents      -> universe.json
  fetch          NSE filings + XBRL per stock     -> holdings/<SYMBOL>.json
  import-xbrl    parse XBRL files you downloaded  -> holdings/<SYMBOL>.json
  inspect-xbrl   show what the parser matched in one XBRL file
  summarize      holdings -> summary.json (what the UI reads)
  flows          daily FII/DII cash + F&O participant OI -> flows.json
  import-nsdl    merge a NSDL FPI Monitor CSV into flows.json
  all            universe + fetch + summarize
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional

from . import flows as flows_mod
from .http import BlockedError, PoliteClient
from .nse import NseSource
from .store import DEFAULT_OUT, Store
from .summary import build_summary
from .universe import INDEX_CSV, fetch_universe
from .xbrl import parse_xbrl

log = logging.getLogger("fii_fetcher")
INBOX = Path(__file__).resolve().parents[1] / "inbox"


def _entry(h, quarter: str, extra: Dict) -> Dict:
    e = {
        "fpiPct": h.fpiPct,
        "fpiCat1Pct": h.fpiCat1Pct,
        "fpiCat2Pct": h.fpiCat2Pct,
        "fiiPct": h.fiiPct,
        "fpiShares": h.fpiShares,
        "diiPct": h.diiPct,
        "diiShares": h.diiShares,
        "mfPct": h.mfPct,
    }
    if h.fpiPct is None and h.diiPct is None:
        e["parseWarning"] = "no FPI or DII rows matched; run inspect-xbrl on this filing"
    e.update(extra)
    return e


def cmd_universe(args, store: Store, client: Optional[PoliteClient]) -> None:
    rows = fetch_universe(client, args.index)
    store.write_universe(rows)
    log.info("universe: %d symbols (%s)", len(rows), args.index)


def _target_symbols(args, store: Store) -> List[str]:
    if args.symbols:
        return [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    syms = [u["symbol"] for u in store.read_universe()]
    if not syms:
        sys.exit("universe.json is empty; run `universe` first or pass --symbols")
    return syms[: args.limit] if args.limit else syms


def cmd_fetch(args, store: Store, client: PoliteClient) -> None:
    nse = NseSource(client)
    meta = {u["symbol"]: u for u in store.read_universe()}
    symbols = _target_symbols(args, store)
    fetched = skipped = failed = 0
    for i, sym in enumerate(symbols, 1):
        try:
            filings = nse.filings(sym)[: args.quarters]
        except BlockedError:
            raise
        except Exception as exc:  # one bad symbol must not stop the run
            failed += 1
            log.warning("[%d/%d] %s: filings list failed: %s", i, len(symbols), sym, exc)
            continue
        doc = store.read_holding(sym)
        doc["symbol"] = sym
        if sym in meta:
            doc["name"], doc["industry"] = meta[sym]["name"], meta[sym]["industry"]
        changed = False
        for f in filings:
            q = f["quarter"]
            old = doc["quarters"].get(q)
            if old and old.get("recordId") == f["recordId"] and not args.force:
                skipped += 1
                continue
            if not f["xbrlUrl"]:
                log.info("%s %s: no XBRL link", sym, q)
                continue
            try:
                h = parse_xbrl(nse.xbrl(f["xbrlUrl"]))
            except BlockedError:
                raise
            except Exception as exc:
                failed += 1
                log.warning("%s %s: XBRL failed: %s", sym, q, exc)
                continue
            if h.quarter and h.quarter != q:
                log.warning("%s: NSE lists %s but XBRL period is %s; using NSE date", sym, q, h.quarter)
            doc["quarters"][q] = _entry(
                h,
                q,
                {
                    "promoterPct": f["promoterPct"],
                    "publicPct": f["publicPct"],
                    "recordId": f["recordId"],
                    "submittedOn": f["submittedOn"],
                    "xbrlUrl": f["xbrlUrl"],
                    "source": "nse",
                },
            )
            fetched += 1
            changed = True
        if changed:
            store.write_holding(doc)  # per symbol, so an interrupted run resumes
        log.info("[%d/%d] %s done", i, len(symbols), sym)
    log.info("fetch: %d filings parsed, %d unchanged, %d failures", fetched, skipped, failed)


def cmd_import(args, store: Store, client) -> None:
    inbox = Path(args.inbox)
    files = sorted(list(inbox.glob("*.xml")) + list(inbox.glob("*.xbrl")))
    if not files:
        sys.exit(f"no .xml/.xbrl files in {inbox}")
    meta = {u["symbol"]: u for u in store.read_universe()}
    for path in files:
        h = parse_xbrl(path.read_bytes())
        sym = (args.symbol or h.symbol or path.stem.split("_")[0]).upper()
        if not h.quarter:
            log.warning("%s: no period found, skipped", path.name)
            continue
        doc = store.read_holding(sym)
        doc["symbol"] = sym
        if sym in meta:
            doc["name"], doc["industry"] = meta[sym]["name"], meta[sym]["industry"]
        doc["quarters"][h.quarter] = _entry(h, h.quarter, {"source": "manual", "file": path.name})
        store.write_holding(doc)
        log.info("%s -> %s %s fpi=%s%%", path.name, sym, h.quarter, h.fpiPct)


def cmd_inspect(args, store, client) -> None:
    h = parse_xbrl(Path(args.file).read_bytes())
    print(json.dumps(h.to_dict(), indent=2))


def cmd_summarize(args, store: Store, client) -> None:
    s = build_summary(store.read_universe(), store.all_holdings())
    store.write_summary(s)
    c = s["coverage"]
    log.info(
        "summary: latest %s vs %s, %d rows (%d filed latest)",
        s["latestQuarter"], s["previousQuarter"], c["withAny"], c["withLatest"],
    )


def cmd_flows(args, store: Store, client: PoliteClient) -> None:
    doc = store.read_flows()
    sources = {x.strip() for x in args.sources.split(",")}
    failed = False
    if "cash" in sources:
        try:
            new = flows_mod.fetch_cash(client)
            doc["cash"].update(new)
            log.info("cash: %s", ", ".join(sorted(new)) or "nothing returned")
        except BlockedError:
            raise
        except Exception as exc:
            failed = True
            log.error("cash flows failed: %s", exc)
    if "fno" in sources:
        try:
            new = flows_mod.fetch_fno(client, doc["fno"].keys(), args.days)
            doc["fno"].update(new)
            log.info("fno: %d new days", len(new))
        except BlockedError:
            raise
        except Exception as exc:
            failed = True
            log.error("fno flows failed: %s", exc)
    store.write_flows(doc)
    if failed:
        sys.exit(1)


def cmd_import_nsdl(args, store: Store, client) -> None:
    rows = flows_mod.import_nsdl_csv(Path(args.file).read_text(encoding="utf-8"))
    if not rows:
        sys.exit("no usable rows; expected columns: date, category, gross_purchases, gross_sales, net")
    doc = store.read_flows()
    for d, cats in rows.items():
        doc["nsdl"].setdefault(d, {}).update(cats)
    store.write_flows(doc)
    log.info("nsdl: %d days imported", len(rows))


def main(argv: Optional[List[str]] = None) -> None:
    p = argparse.ArgumentParser(prog="fii_fetcher", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default=str(DEFAULT_OUT), help="output data dir (default web/public/data)")
    p.add_argument("--delay", type=float, default=1.0, help="seconds between requests (default 1.0)")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    def fetch_opts(sp):
        sp.add_argument("--symbols", help="comma-separated, overrides the universe")
        sp.add_argument("--limit", type=int, help="only the first N universe symbols (testing)")
        sp.add_argument("--quarters", type=int, default=4, help="latest N quarters per stock (default 4)")
        sp.add_argument("--force", action="store_true", help="re-download even if recordId is unchanged")

    for name in ("universe", "all"):
        sp = sub.add_parser(name)
        sp.add_argument("--index", choices=sorted(INDEX_CSV), default="nifty500")
        if name == "all":
            fetch_opts(sp)
    fetch_opts(sub.add_parser("fetch"))
    sp = sub.add_parser("import-xbrl")
    sp.add_argument("--inbox", default=str(INBOX))
    sp.add_argument("--symbol", help="force this symbol for every file")
    sp = sub.add_parser("inspect-xbrl")
    sp.add_argument("file")
    sub.add_parser("summarize")
    sp = sub.add_parser("flows")
    sp.add_argument("--sources", default="cash,fno", help="comma-separated: cash,fno (default both)")
    sp.add_argument("--days", type=int, default=30, help="F&O backfill window in calendar days (default 30)")
    sp = sub.add_parser("import-nsdl")
    sp.add_argument("file", help="CSV: date, category, gross_purchases, gross_sales, net")

    args = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    store = Store(Path(args.out))
    needs_net = args.cmd in ("universe", "fetch", "all", "flows")
    client = PoliteClient(delay=args.delay) if needs_net else None
    try:
        if args.cmd == "all":
            cmd_universe(args, store, client)
            cmd_fetch(args, store, client)
            cmd_summarize(args, store, client)
        else:
            {
                "universe": cmd_universe,
                "fetch": cmd_fetch,
                "import-xbrl": cmd_import,
                "inspect-xbrl": cmd_inspect,
                "summarize": cmd_summarize,
                "flows": cmd_flows,
                "import-nsdl": cmd_import_nsdl,
            }[args.cmd](args, store, client)
    except BlockedError as exc:
        log.error("%s", exc)
        if args.cmd in ("fetch", "all"):
            cmd_summarize(args, store, client)  # keep whatever was saved
        sys.exit(2)


if __name__ == "__main__":
    main()
