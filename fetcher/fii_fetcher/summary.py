"""Build summary.json (the UI's only input) from per-stock holdings files."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .quarters import is_quarter_end

HISTORY_QUARTERS = 8
FLAT_EPS = 0.01  # percentage points; smaller moves count as "flat" for streaks


def _points(doc: Dict) -> List[Dict]:
    """One point per calendar quarter-end, oldest first. Off-cycle filings
    (e.g. 2026-06-04) are skipped so a month never appears twice."""
    out = []
    for q, v in sorted(doc.get("quarters", {}).items()):
        if not is_quarter_end(q):
            continue
        if all(v.get(k) is None for k in ("fpiPct", "diiPct", "promoterPct")):
            continue
        out.append(
            {
                "q": q,
                "fpi": v.get("fpiPct"),
                "fpiShares": v.get("fpiShares"),
                "dii": v.get("diiPct"),
                "diiShares": v.get("diiShares"),
                "pro": v.get("promoterPct"),
            }
        )
    return out


def _streak(series: List[Dict]) -> int:
    """+n: rose n quarters in a row up to the latest; -n: fell n in a row; 0: flat/unknown.
    `series` items need a "pct" key."""
    streak = 0
    for i in range(len(series) - 1, 0, -1):
        d = series[i]["pct"] - series[i - 1]["pct"]
        step = 1 if d > FLAT_EPS else -1 if d < -FLAT_EPS else 0
        if step == 0:
            break
        if streak == 0:
            streak = step
        elif (streak > 0) == (step > 0):
            streak += step
        else:
            break
    return streak


def _pick_latest_quarter(all_series: List[List[Dict]]) -> Optional[str]:
    """The quarter most companies have filed as their latest. Avoids one early filer
    for a new quarter making everyone else look 'pending'."""
    latest = Counter(s[-1]["q"] for s in all_series if s)
    if not latest:
        return None
    total = sum(latest.values())
    # Newest quarter that at least 20% of filers have reached.
    for q in sorted(latest, reverse=True):
        reached = sum(n for qq, n in latest.items() if qq >= q)
        if reached >= 0.2 * total:
            return q
    return max(latest)


def _prev_quarter(q: str, quarters: List[str]) -> Optional[str]:
    earlier = [x for x in quarters if x < q]
    return earlier[-1] if earlier else None


def _metric(points: List[Dict], pkey: str, skey: str, latest_q: Optional[str]) -> Optional[Dict]:
    """Latest value, change vs the previous available quarter, streak. None if no data."""
    pts = [p for p in points if p[pkey] is not None and (latest_q is None or p["q"] <= latest_q)]
    if not pts:
        return None
    cur = pts[-1]
    prev = pts[-2] if len(pts) > 1 else None
    change = round(cur[pkey] - prev[pkey], 4) if prev else None
    shares_chg = None
    if prev and cur.get(skey) and prev.get(skey):
        shares_chg = round((cur[skey] / prev[skey] - 1) * 100, 3)
    denominator = bool(
        change is not None
        and shares_chg is not None
        and abs(change) > FLAT_EPS
        and (change > 0) != (shares_chg > 0)
    )
    return {
        "quarter": cur["q"],
        "pct": round(cur[pkey], 4),
        "prev": round(prev[pkey], 4) if prev else None,
        "change": change,
        "shares": cur.get(skey),
        "sharesChg": shares_chg,
        "denominator": denominator,
        "streak": _streak([{"pct": p[pkey]} for p in pts]),
    }


def _round(v: Optional[float]) -> Optional[float]:
    return round(v, 4) if v is not None else None


def build_summary(universe: List[Dict], holdings: List[Dict]) -> Dict:
    meta = {u["symbol"]: u for u in universe}
    by_symbol = {h["symbol"]: h for h in holdings}
    symbols = sorted(set(meta) | set(by_symbol))
    series_map = {s: _points(by_symbol.get(s, {})) for s in symbols}

    latest_q = _pick_latest_quarter(list(series_map.values()))
    all_quarters = sorted({p["q"] for s in series_map.values() for p in s})
    prev_q = _prev_quarter(latest_q, all_quarters) if latest_q else None

    rows = []
    for sym in symbols:
        pts = series_map[sym]
        if latest_q:
            pts = [p for p in pts if p["q"] <= latest_q]
        if not pts:
            continue
        m = meta.get(sym, {})
        f = _metric(pts, "fpi", "fpiShares", latest_q)
        d = _metric(pts, "dii", "diiShares", latest_q)
        pr = _metric(pts, "pro", "proShares", latest_q)  # promoters: no share counts in the source
        rows.append(
            {
                "symbol": sym,
                "name": m.get("name") or by_symbol.get(sym, {}).get("name") or sym,
                "industry": m.get("industry") or by_symbol.get(sym, {}).get("industry") or "Unknown",
                "quarter": pts[-1]["q"],
                # FII (foreign portfolio investors)
                "fpiPct": f["pct"] if f else None,
                "prevPct": f["prev"] if f else None,
                "changePp": f["change"] if f else None,
                "fpiShares": f["shares"] if f else None,
                "sharesChangePct": f["sharesChg"] if f else None,
                "denominatorEffect": f["denominator"] if f else False,
                "streak": f["streak"] if f else 0,
                "pending": bool(f is None or (latest_q and f["quarter"] < latest_q)),
                # DII (domestic institutions: mutual funds, insurers, banks, pension funds...)
                "diiPct": d["pct"] if d else None,
                "diiPrevPct": d["prev"] if d else None,
                "diiChangePp": d["change"] if d else None,
                "diiShares": d["shares"] if d else None,
                "diiSharesChangePct": d["sharesChg"] if d else None,
                "diiDenominatorEffect": d["denominator"] if d else False,
                "diiStreak": d["streak"] if d else 0,
                "diiPending": bool(d is None or (latest_q and d["quarter"] < latest_q)),
                # Promoters and promoter group (from the NSE filings list)
                "proPct": pr["pct"] if pr else None,
                "proPrevPct": pr["prev"] if pr else None,
                "proChangePp": pr["change"] if pr else None,
                "proStreak": pr["streak"] if pr else 0,
                "proPending": bool(pr is None or (latest_q and pr["quarter"] < latest_q)),
                "history": [
                    {"q": p["q"], "fii": _round(p["fpi"]), "dii": _round(p["dii"]), "pro": _round(p["pro"])}
                    for p in pts[-HISTORY_QUARTERS:]
                ],
            }
        )

    fpi_rows = [r for r in rows if r["fpiPct"] is not None]
    dii_rows = [r for r in rows if r["diiPct"] is not None]
    pro_rows = [r for r in rows if r["proPct"] is not None]
    return {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "latestQuarter": latest_q,
        "previousQuarter": prev_q,
        "quarters": [q for q in all_quarters if not latest_q or q <= latest_q][-HISTORY_QUARTERS:],
        "coverage": {
            "universe": len(universe),
            "withLatest": sum(1 for r in fpi_rows if not r["pending"]),
            "withAny": len(fpi_rows),
            "diiWithLatest": sum(1 for r in dii_rows if not r["diiPending"]),
            "diiWithAny": len(dii_rows),
            "proWithLatest": sum(1 for r in pro_rows if not r["proPending"]),
            "proWithAny": len(pro_rows),
        },
        "rows": rows,
    }
