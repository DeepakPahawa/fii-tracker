"""Build summary.json (the UI's only input) from per-stock holdings files."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Dict, List, Optional

HISTORY_QUARTERS = 8
FLAT_EPS = 0.01  # percentage points; smaller moves count as "flat" for streaks


def _series(doc: Dict) -> List[Dict]:
    qs = doc.get("quarters", {})
    out = [
        {"q": q, "pct": v["fpiPct"], "shares": v.get("fpiShares")}
        for q, v in sorted(qs.items())
        if v.get("fpiPct") is not None
    ]
    return out


def _streak(series: List[Dict]) -> int:
    """+n: rose n quarters in a row up to the latest; -n: fell n in a row; 0: flat/unknown."""
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


def build_summary(universe: List[Dict], holdings: List[Dict]) -> Dict:
    meta = {u["symbol"]: u for u in universe}
    by_symbol = {h["symbol"]: h for h in holdings}
    symbols = sorted(set(meta) | set(by_symbol))
    series_map = {s: _series(by_symbol.get(s, {})) for s in symbols}

    latest_q = _pick_latest_quarter(list(series_map.values()))
    all_quarters = sorted({p["q"] for s in series_map.values() for p in s})
    prev_q = _prev_quarter(latest_q, all_quarters) if latest_q else None

    rows = []
    for sym in symbols:
        series = series_map[sym]
        if latest_q:
            series = [p for p in series if p["q"] <= latest_q]
        if not series:
            continue
        m = meta.get(sym, {})
        cur = series[-1]
        prev = series[-2] if len(series) > 1 else None
        change = round(cur["pct"] - prev["pct"], 4) if prev else None
        shares_chg = None
        if prev and cur.get("shares") and prev.get("shares"):
            shares_chg = round((cur["shares"] / prev["shares"] - 1) * 100, 3)
        denominator = bool(
            change is not None
            and shares_chg is not None
            and abs(change) > FLAT_EPS
            and (change > 0) != (shares_chg > 0)
        )
        rows.append(
            {
                "symbol": sym,
                "name": m.get("name") or by_symbol.get(sym, {}).get("name") or sym,
                "industry": m.get("industry") or by_symbol.get(sym, {}).get("industry") or "Unknown",
                "quarter": cur["q"],
                "fpiPct": round(cur["pct"], 4),
                "prevPct": round(prev["pct"], 4) if prev else None,
                "changePp": change,
                "fpiShares": cur.get("shares"),
                "sharesChangePct": shares_chg,
                "denominatorEffect": denominator,
                "streak": _streak(series),
                "pending": bool(latest_q and cur["q"] < latest_q),
                "history": [{"q": p["q"], "pct": round(p["pct"], 4)} for p in series[-HISTORY_QUARTERS:]],
            }
        )

    return {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "latestQuarter": latest_q,
        "previousQuarter": prev_q,
        "quarters": [q for q in all_quarters if not latest_q or q <= latest_q][-HISTORY_QUARTERS:],
        "coverage": {
            "universe": len(universe),
            "withLatest": sum(1 for r in rows if not r["pending"]),
            "withAny": len(rows),
        },
        "rows": rows,
    }
