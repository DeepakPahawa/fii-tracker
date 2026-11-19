"""Daily FII/DII flows.

  cash   NSE "FII/DII trading activity": buy / sell / net in Rs crore, cash market.
         The API returns only the latest session, so history is built by running daily.
  fno    NSE participant-wise open interest CSV (one file per trading day, in NSE's
         archive): long/short contracts for FII, DII, Pro and Client.
  nsdl   NSDL FPI Monitor figures, imported from a CSV you download (see import_nsdl_csv).
         NSDL's public report pages were replaced by a login-only portal, so there is
         no fetcher for it.
"""
from __future__ import annotations

import csv
import io
import logging
import re
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional

from .http import PoliteClient

log = logging.getLogger(__name__)

BASE = "https://www.nseindia.com"
FIIDII_PAGE = f"{BASE}/reports/fii-dii"
FIIDII_API = f"{BASE}/api/fiidiiTradeReact"
OI_URL = "https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{ddmmyyyy}.csv"

PARTICIPANTS = ("FII", "DII", "Pro", "Client")

# CSV column header -> short key. Headers carry stray trailing spaces in NSE's files.
OI_COLUMNS = {
    "future index long": "idxFutLong",
    "future index short": "idxFutShort",
    "future stock long": "stkFutLong",
    "future stock short": "stkFutShort",
    "option index call long": "idxCallLong",
    "option index put long": "idxPutLong",
    "option index call short": "idxCallShort",
    "option index put short": "idxPutShort",
    "option stock call long": "stkCallLong",
    "option stock put long": "stkPutLong",
    "option stock call short": "stkCallShort",
    "option stock put short": "stkPutShort",
    "total long contracts": "totalLong",
    "total short contracts": "totalShort",
}


def _num(v) -> Optional[float]:
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _iso(s: str) -> Optional[str]:
    s = (s or "").strip()
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%b %d, %Y", "%B %d, %Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.title() if fmt.startswith(("%d-%b", "%d-%B", "%b", "%B")) else s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------- cash market

def parse_fii_dii(payload: List[dict]) -> Dict[str, Dict]:
    """[{category, date, buyValue, sellValue, netValue}, ...] -> {iso date: {fii: {...}, dii: {...}}}.

    Net is recomputed as buy - sell and compared with NSE's own figure; a mismatch
    bigger than rounding is logged, because it means the payload shape changed."""
    out: Dict[str, Dict] = {}
    for r in payload or []:
        d = _iso(r.get("date"))
        cat = str(r.get("category", "")).upper()
        key = "fii" if cat.startswith("FII") or cat.startswith("FPI") else "dii" if cat.startswith("DII") else None
        buy, sell, net = _num(r.get("buyValue")), _num(r.get("sellValue")), _num(r.get("netValue"))
        if not d or not key or buy is None or sell is None:
            log.warning("skipping unrecognised FII/DII row: %s", r)
            continue
        calc = round(buy - sell, 2)
        if net is None or abs(calc - net) > 0.05:
            log.warning("%s %s: net %s != buy - sell %s; using buy - sell", d, key, net, calc)
        out.setdefault(d, {})[key] = {"buy": buy, "sell": sell, "net": calc}
    return out


def fetch_cash(client: PoliteClient) -> Dict[str, Dict]:
    client.get(FIIDII_PAGE, accept="text/html")  # sets the session cookies the API expects
    resp = client.get(FIIDII_API, referer=FIIDII_PAGE, accept="application/json")
    return parse_fii_dii(resp.json())


# ------------------------------------------------------- F&O participant OI

def parse_participant_oi(text: str) -> Optional[Dict]:
    """Returns {"date": iso, "participants": {FII: {idxFutLong: n, ...}, ...}} or None if the
    file is not a participant OI report."""
    lines = text.lstrip("﻿").splitlines()
    if len(lines) < 3:
        return None
    m = re.search(r"as on\s+([A-Za-z]+ \d{1,2}, \d{4})", lines[0])
    d = _iso(m.group(1)) if m else None
    if not d:
        return None
    rows = list(csv.reader(io.StringIO("\n".join(lines[1:]))))
    head = [c.strip().lower() for c in rows[0]]
    if "client type" not in head:
        return None
    parts: Dict[str, Dict] = {}
    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        name = row[0].strip()
        if name.upper() == "TOTAL":
            continue
        rec = {}
        for col, val in zip(head[1:], row[1:]):
            key = OI_COLUMNS.get(col)
            n = _num(val)
            if key and n is not None:
                rec[key] = int(n)
        if rec:
            parts[name] = rec
    if "FII" not in parts:
        return None
    return {"date": d, "participants": parts}


def trading_days_back(end: date, days: int) -> Iterable[date]:
    """Weekdays from `end` going back `days` calendar days. NSE holidays simply 404."""
    for i in range(days):
        d = end - timedelta(days=i)
        if d.weekday() < 5:
            yield d


def fetch_fno(client: PoliteClient, have: Iterable[str], days: int, today: Optional[date] = None) -> Dict[str, Dict]:
    """Download participant OI for the last `days` calendar days, skipping dates already stored."""
    have = set(have)
    out: Dict[str, Dict] = {}
    for d in trading_days_back(today or date.today(), days):
        if d.isoformat() in have:
            continue
        url = OI_URL.format(ddmmyyyy=d.strftime("%d%m%Y"))
        try:
            resp = client.get(url, accept="text/csv,*/*")
        except Exception as exc:
            # 404 = holiday or not published yet; anything else is worth a line but must not stop the run.
            log.info("fno %s: not available (%s)", d, str(exc)[:80])
            continue
        parsed = parse_participant_oi(resp.text)
        if not parsed:
            log.warning("fno %s: file did not look like participant OI", d)
            continue
        out[parsed["date"]] = parsed["participants"]
    return out


def derive_fno(participants: Dict[str, Dict]) -> Dict:
    """Headline numbers per day for FII: net index futures and long share of index futures."""
    fii = participants.get("FII", {})
    lo, sh = fii.get("idxFutLong"), fii.get("idxFutShort")
    if lo is None or sh is None:
        return {}
    return {"fiiIdxFutNet": lo - sh, "fiiIdxFutLongPct": round(100.0 * lo / (lo + sh), 1) if lo + sh else None}


# --------------------------------------------------------------- NSDL import

NSDL_FIELDS = ("gross_purchases", "gross_sales", "net")


def import_nsdl_csv(text: str) -> Dict[str, Dict]:
    """Parse a CSV you assembled from the NSDL FPI Monitor (daily report).

    Columns (header names are case-insensitive, extra columns ignored):
        date, category, gross_purchases, gross_sales, net     (Rs crore)
    category is e.g. Equity, Debt-General, Debt-VRR, Debt-FAR, Hybrid, MF, AIF.
    Returns {iso date: {category: {buy, sell, net}}}."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    out: Dict[str, Dict] = {}
    for row in reader:
        r = {(k or "").strip().lower(): v for k, v in row.items()}
        d = _iso(r.get("date", ""))
        cat = (r.get("category") or "").strip()
        buy, sell, net = _num(r.get("gross_purchases")), _num(r.get("gross_sales")), _num(r.get("net"))
        if not d or not cat or buy is None or sell is None:
            log.warning("nsdl: skipping row %s", row)
            continue
        calc = round(buy - sell, 2)
        if net is not None and abs(calc - net) > 0.05:
            log.warning("nsdl %s %s: net %s != purchases - sales %s; using the latter", d, cat, net, calc)
        out.setdefault(d, {})[cat] = {"buy": buy, "sell": sell, "net": calc}
    return out
