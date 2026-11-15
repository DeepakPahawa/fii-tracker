"""NSE shareholding-pattern filings list (per company) and XBRL download."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, List, Optional

from .http import PoliteClient
from .quarters import is_quarter_end

log = logging.getLogger(__name__)

BASE = "https://www.nseindia.com"
SHP_PAGE = f"{BASE}/companies-listing/corporate-filings-shareholding-pattern"
SHP_API = f"{BASE}/api/corporate-share-holdings-master?index=equities&symbol={{symbol}}"


def _iso(d: Optional[str]) -> Optional[str]:
    """'30-SEP-2026' or '30-Sep-2026 18:22:11' -> '2026-09-30'."""
    if not d:
        return None
    d = d.strip()
    for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(d.title() if "-" in d else d, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _num(v) -> Optional[float]:
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def normalise_filings(raw: List[dict]) -> List[Dict]:
    """One entry per quarter, keeping the latest submission (revisions replace originals)."""
    by_q: Dict[str, Dict] = {}
    for r in raw:
        q = _iso(r.get("date"))
        if not q:
            continue
        if not is_quarter_end(q):
            # Off-cycle pattern (post-IPO, mid-quarter event). Not comparable with
            # quarter-end data and would appear as a second entry for the same month.
            log.debug("ignoring off-cycle filing dated %s", q)
            continue
        item = {
            "quarter": q,
            "recordId": str(r.get("recordId") or ""),
            "xbrlUrl": r.get("xbrl") or None,
            "submittedOn": _iso(r.get("revisionDate") or r.get("submissionDate") or r.get("broadcastDate")),
            "promoterPct": _num(r.get("pr_and_prgrp")),
            "publicPct": _num(r.get("public_val")),
        }
        prev = by_q.get(q)
        if prev is None or (item["submittedOn"] or "") >= (prev["submittedOn"] or ""):
            by_q[q] = item
    return sorted(by_q.values(), key=lambda x: x["quarter"], reverse=True)


class NseSource:
    def __init__(self, client: PoliteClient) -> None:
        self.client = client
        self._primed = False

    def _prime(self) -> None:
        # NSE's own pages set session cookies on the first page view; the JSON API
        # expects them. One page view per run.
        if not self._primed:
            self.client.get(SHP_PAGE, accept="text/html")
            self._primed = True

    def filings(self, symbol: str) -> List[Dict]:
        self._prime()
        resp = self.client.get(
            SHP_API.format(symbol=symbol),
            referer=SHP_PAGE,
            accept="application/json",
        )
        data = resp.json()
        if isinstance(data, dict):
            data = data.get("data", [])
        return normalise_filings(data or [])

    def xbrl(self, url: str) -> bytes:
        return self.client.get(url, referer=SHP_PAGE, accept="application/xml,text/xml,*/*").content
