"""Stock-level daily feeds from NSE.

  deals     bulk and block deals: who bought or sold how much of which stock (daily)
  delivery  delivery volume and delivery % per stock from the daily bhavcopy
  sast      Reg 29 substantial-holder filings (a holder crossing 5%, or moving 2%)

None of these is a true "FII bought X today" feed (that is not published). Bulk and block
deals name the client, so foreign funds show up; `classify` tags a name as FII, DII or other
from keywords. It is a heuristic: anything it cannot place is "other".
"""
from __future__ import annotations

import csv
import io
import logging
import re
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Set

from .flows import _iso, _num, trading_days_back
from .http import PoliteClient

log = logging.getLogger(__name__)

BASE = "https://www.nseindia.com"
DEALS_CSV = "https://nsearchives.nseindia.com/content/equities/{kind}.csv"
SAST_PAGE = f"{BASE}/companies-listing/corporate-filings-regulation-29"
SAST_API = f"{BASE}/api/corporate-sast-reg29?index=equities&from_date={{frm}}&to_date={{to}}"
BHAV_URL = "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{ddmmyyyy}.csv"

# ----------------------------------------------------------------- classify

_FII = re.compile(
    r"\b(FPI|FII|FOREIGN|MAURITIUS|SINGAPORE|LUXEMBOURG|CAYMAN|IRELAND|OVERSEAS|OFFSHORE|ODI|"
    r"GOLDMAN SACHS|MORGAN STANLEY|JPMORGAN|J\.?P\.? MORGAN|CITIGROUP|CITIBANK|BNP|NOMURA|SOCIETE GENERALE|"
    r"UBS|BARCLAYS|MERRILL|CREDIT SUISSE|DEUTSCHE|HSBC GLOBAL|ABU DHABI|NORGES|VANGUARD|BLACKROCK|ISHARES|"
    r"FIDELITY|T\.? ROWE|CAPITAL GROUP|EMERGING MARKETS?|PTE\.?|GIC|SOVEREIGN|PENSION FUND BOARD)\b"
)
_DII = re.compile(
    r"(MUTUAL FUND|LIFE INSURANCE|GENERAL INSURANCE|ASSURANCE|ASSET MANAGEMENT|AMC\b|PENSION|"
    r"PROVIDENT FUND|NATIONAL PENSION|LIFE INSURANCE CORPORATION)"
)


def classify(name: str) -> str:
    """'FII', 'DII' or 'other' from a client / acquirer name. DII is checked first so
    'ABC Pension Fund' style domestic names are not captured by foreign keywords."""
    n = (name or "").upper()
    if _DII.search(n) and not _FII.search(n):
        return "DII"
    if _FII.search(n):
        return "FII"
    if _DII.search(n):
        return "DII"
    return "other"


def month_key(iso_date: str) -> str:
    return iso_date[:7]


def _chunks(frm: date, to: date, span: int = 30) -> Iterable[tuple]:
    cur = frm
    while cur <= to:
        end = min(to, cur + timedelta(days=span - 1))
        yield cur, end
        cur = end + timedelta(days=1)


def _dmy(d: date) -> str:
    return d.strftime("%d-%m-%Y")


# --------------------------------------------------------------- bulk / block
#
# NSE's archive CSVs hold the latest session in full. The historical JSON API looks
# like a backfill route but silently returns at most 70 rows per call (a day with 118
# bulk deals comes back as 70), so it is not used. History therefore builds up one
# session per run; a missed day cannot be recovered afterwards.

def parse_deals_csv(text: str) -> List[Dict]:
    out = []
    for r in csv.DictReader(io.StringIO(text.lstrip("\ufeff"))):
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        d = _iso(r.get("date", ""))
        qty = _num(r.get("quantity traded"))
        side = r.get("buy/sell", "").upper()
        price = _num(r.get("trade price / wght. avg. price"))
        if not d or not r.get("symbol") or qty is None or side not in ("BUY", "SELL"):
            if r.get("date", "").upper() != "NO RECORDS":
                log.warning("skipping unrecognised deal row: %s", r)
            continue
        client = r.get("client name", "")
        out.append({"d": d, "s": r["symbol"], "c": client, "side": side, "q": int(qty), "p": price, "t": classify(client)})
    return out


def deal_key(x: Dict) -> tuple:
    return (x["d"], x["s"], x["c"], x["side"], x["q"], x["p"])


def fetch_deals(client: PoliteClient) -> Dict[str, List[Dict]]:
    return {
        kind: parse_deals_csv(client.get(DEALS_CSV.format(kind=kind), accept="text/csv,*/*").text)
        for kind in ("bulk", "block")
    }


def merge_deals(existing: Dict[str, List[Dict]], new: List[Dict], kind: str) -> int:
    """Add rows not already present. Returns how many were added."""
    rows = existing.setdefault(kind, [])
    seen = {deal_key(x) for x in rows}
    added = 0
    for x in new:
        if deal_key(x) not in seen:
            rows.append(x)
            seen.add(deal_key(x))
            added += 1
    rows.sort(key=lambda x: (x["d"], x["s"], x["c"], x["side"], x["q"]))
    return added


# -------------------------------------------------------------------- delivery

def parse_bhavcopy(text: str, symbols: Optional[Set[str]] = None) -> Dict:
    """-> {"date": iso, "rows": {SYMBOL: [traded_qty, delivery_qty, delivery_pct, close]}} for EQ series."""
    rd = csv.reader(io.StringIO(text.lstrip("﻿")))
    head = [h.strip().upper() for h in next(rd, [])]
    idx = {h: i for i, h in enumerate(head)}
    need = ("SYMBOL", "SERIES", "DATE1", "CLOSE_PRICE", "TTL_TRD_QNTY", "DELIV_QTY", "DELIV_PER")
    if any(k not in idx for k in need):
        return {}
    day: Optional[str] = None
    rows: Dict[str, List] = {}
    for r in rd:
        if len(r) < len(head):
            continue
        r = [c.strip() for c in r]
        if r[idx["SERIES"]] != "EQ":
            continue
        day = day or _iso(r[idx["DATE1"]])
        sym = r[idx["SYMBOL"]]
        if symbols is not None and sym not in symbols:
            continue
        ttl, dq, dp, close = _num(r[idx["TTL_TRD_QNTY"]]), _num(r[idx["DELIV_QTY"]]), _num(r[idx["DELIV_PER"]]), _num(r[idx["CLOSE_PRICE"]])
        if ttl is None or dq is None or dp is None:
            continue
        rows[sym] = [int(ttl), int(dq), dp, close]
    return {"date": day, "rows": rows} if day and rows else {}


def fetch_delivery(client: PoliteClient, have: Iterable[str], days: int, symbols: Optional[Set[str]], today: Optional[date] = None) -> Dict[str, Dict]:
    have = set(have)
    out: Dict[str, Dict] = {}
    for d in trading_days_back(today or date.today(), days):
        if d.isoformat() in have:
            continue
        try:
            resp = client.get(BHAV_URL.format(ddmmyyyy=d.strftime("%d%m%Y")), accept="text/csv,*/*")
        except Exception as exc:
            log.info("delivery %s: not available (%s)", d, str(exc)[:80])
            continue
        parsed = parse_bhavcopy(resp.text, symbols)
        if not parsed:
            log.warning("delivery %s: file did not look like a bhavcopy", d)
            continue
        out[parsed["date"]] = parsed["rows"]
    return out


# ------------------------------------------------------------------------ SAST

def parse_sast(rows: List[dict]) -> List[Dict]:
    out = []
    for r in rows or []:
        ts = str(r.get("timestamp") or r.get("sysTime") or "")
        filed = _iso(ts.split(" ")[0])
        if not filed or not r.get("application_no") or not r.get("symbol"):
            log.warning("skipping unrecognised SAST row: %s", r)
            continue
        who = str(r.get("acquirerName") or "").strip()
        out.append(
            {
                "id": str(r["application_no"]),
                "filed": filed,
                "s": r["symbol"],
                "co": r.get("company"),
                "who": who,
                "t": "promoter" if r.get("promoterType") == "Y" else classify(who),
                "kind": r.get("acqSaleType"),
                "mode": r.get("acquisitionMode"),
                "reg": r.get("regType"),
                "on": r.get("acquirerDate"),
                "acq": _num(r.get("noOfShareAcq")),
                "sold": _num(r.get("noOfShareSale")),
                "after": _num(r.get("noOfShareAft")),
                "acqPct": _num(r.get("totAcqShare")),
                "soldPct": _num(r.get("totSaleShare")),
                "afterPct": _num(r.get("totAftShare")),
            }
        )
    return out


def fetch_sast(client: PoliteClient, frm: date, to: date) -> List[Dict]:
    client.get(SAST_PAGE, accept="text/html")
    out: List[Dict] = []
    for a, b in _chunks(frm, to, span=15):
        resp = client.get(SAST_API.format(frm=_dmy(a), to=_dmy(b)), referer=SAST_PAGE, accept="application/json")
        j = resp.json()
        out += parse_sast(j.get("data", []) if isinstance(j, dict) else j)
    return out
