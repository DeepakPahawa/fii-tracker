"""Index constituents (Nifty 500 by default) from NSE's public archive CSV."""
from __future__ import annotations

import csv
import io
from typing import Dict, List

from .http import PoliteClient

INDEX_CSV = {
    "nifty500": "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv",
    "nifty200": "https://nsearchives.nseindia.com/content/indices/ind_nifty200list.csv",
    "nifty100": "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv",
    "nifty50": "https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv",
}


def parse_index_csv(text: str) -> List[Dict[str, str]]:
    rows = []
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
        symbol = r.get("Symbol")
        if not symbol:
            continue
        rows.append(
            {
                "symbol": symbol,
                "name": r.get("Company Name", symbol),
                "industry": r.get("Industry", "Unknown"),
                "isin": r.get("ISIN Code", ""),
            }
        )
    return rows


def fetch_universe(client: PoliteClient, index: str = "nifty500") -> List[Dict[str, str]]:
    url = INDEX_CSV[index]
    resp = client.get(url, accept="text/csv,*/*")
    rows = parse_index_csv(resp.text)
    if not rows:
        raise ValueError(f"No constituents parsed from {url}")
    return rows
