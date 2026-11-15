"""Calendar quarter-end helpers.

Shareholding patterns are filed as of each calendar quarter end. Companies also file
off-cycle patterns (post-IPO, pre-listing, mid-quarter events) dated on other days,
e.g. 2026-06-04. Those are not comparable with quarter-end data and would show up as
a second "Jun 2026", so they are ignored.
"""
from __future__ import annotations

from typing import Optional

QUARTER_ENDS = {(3, 31), (6, 30), (9, 30), (12, 31)}


def is_quarter_end(iso: Optional[str]) -> bool:
    """'2026-06-30' -> True, '2026-06-04' -> False."""
    if not iso or len(iso) < 10:
        return False
    try:
        return (int(iso[5:7]), int(iso[8:10])) in QUARTER_ENDS
    except ValueError:
        return False
