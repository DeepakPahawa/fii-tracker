"""Extract FII (foreign) and DII (domestic institutional) holdings from a SEBI
shareholding-pattern XBRL instance.

The parser does not hard-code the exact SEBI taxonomy element names, because they
have changed across taxonomy versions. Instead it:
  1. reads every context, with its period and its dimension members,
  2. classifies a context (FPI Cat I / Cat II / legacy FII / FPI, and the domestic
     institution rows: mutual funds, banks, insurance...) by regex on the member
     local names, taking the most specific (last) member that matches,
  3. for each class, takes the % and share-count facts from the context with the
     fewest dimensions (the category's own row, not a sub-breakdown).

DII = "Institutions (Domestic)" in the filing. If the filing has a subtotal row it is
used as is; otherwise the domestic rows are summed (never both, to avoid double counting).

Run `python -m fii_fetcher inspect-xbrl FILE` to see what was matched in a real file.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional, Tuple

# Order matters: Category II must be tested before Category I.
CATEGORY_PATTERNS: List[Tuple[str, "re.Pattern[str]"]] = [
    ("cat2", re.compile(r"ForeignPortfolioInvestors?.*Category(II|Two|2)(?![0-9I])", re.I)),
    ("cat1", re.compile(r"ForeignPortfolioInvestors?.*Category(I|One|1)(?![0-9I])", re.I)),
    ("fii", re.compile(r"ForeignInstitutionalInvestors?", re.I)),
    ("fpi", re.compile(r"ForeignPortfolioInvestors?(?!.*Category)", re.I)),
    # Domestic institutions. "dii" is the subtotal row, the rest are its components.
    ("dii", re.compile(r"Institutions?Domestic|DomesticInstitution|InstitutionsIndian", re.I)),
    ("mf", re.compile(r"MutualFunds?", re.I)),
    ("vc", re.compile(r"^VentureCapitalFunds?(Member)?$", re.I)),
    ("aif", re.compile(r"Alternat(e|ive)InvestmentFunds?", re.I)),
    ("banks", re.compile(r"^Banks?(Member)?$", re.I)),
    ("insurance", re.compile(r"InsuranceCompan", re.I)),
    ("pension", re.compile(r"ProvidentFunds?|PensionFunds?", re.I)),
    ("arc", re.compile(r"AssetReconstruction", re.I)),
    ("nbfc", re.compile(r"NBFC|NonBankingFinancial", re.I)),
    ("ofi", re.compile(r"OtherFinancialInstitutions?", re.I)),
]
FPI_PARTS = ("cat1", "cat2", "fii")
DII_PARTS = ("mf", "vc", "aif", "banks", "insurance", "pension", "arc", "nbfc", "ofi")

PCT_EXACT = re.compile(r"^ShareholdingAsAPercentageOfTotalNumberOfShares$", re.I)
PCT_LOOSE = re.compile(r"PercentageOfTotalNumberOfShares", re.I)
PCT_EXCLUDE = re.compile(r"Diluted|Conversion|Voting|Pledged|Encumbered|Locked", re.I)
SHARES_PATTERNS = [
    re.compile(r"^NumberOfFullyPaidUpEquityShares?Held$", re.I),
    re.compile(r"^TotalNumberOfSharesHeld$", re.I),
    re.compile(r"^NumberOfSharesHeld$", re.I),
]
SYMBOL_PATTERN = re.compile(r"^(NSE)?Symbol$", re.I)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag.split(":")[-1]


def _member_local(text: str) -> str:
    return (text or "").strip().split(":")[-1]


@dataclass
class Context:
    id: str
    period: Optional[str]
    members: List[str] = field(default_factory=list)


@dataclass
class Holding:
    quarter: Optional[str]
    symbol: Optional[str]
    fpiPct: Optional[float]
    fpiCat1Pct: Optional[float]
    fpiCat2Pct: Optional[float]
    fiiPct: Optional[float]
    fpiShares: Optional[int]
    diiPct: Optional[float]
    diiShares: Optional[int]
    mfPct: Optional[float]
    matched: Dict[str, str]  # category -> context id, for debugging

    def to_dict(self) -> dict:
        return asdict(self)


def _parse_contexts(root: ET.Element) -> Dict[str, Context]:
    out: Dict[str, Context] = {}
    for el in root.iter():
        if _local(el.tag) != "context":
            continue
        cid = el.get("id")
        if not cid:
            continue
        period = None
        members: List[str] = []
        for sub in el.iter():
            name = _local(sub.tag)
            if name in ("instant", "endDate") and sub.text:
                period = sub.text.strip()[:10]
            elif name == "explicitMember":
                members.append(_member_local(sub.text or ""))
            elif name == "typedMember":
                members.append(f"typed:{sub.get('dimension', '')}")
        out[cid] = Context(cid, period, members)
    return out


def _to_number(text: Optional[str]) -> Optional[float]:
    if text is None:
        return None
    t = text.strip().replace(",", "")
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _classify(ctx: Context) -> Optional[str]:
    # Most specific member first: for [parent, child] the child is the row's identity.
    for member in reversed(ctx.members):
        for cat, pat in CATEGORY_PATTERNS:
            if pat.search(member):
                return cat
    return None


def parse_xbrl(content: bytes) -> Holding:
    root = ET.fromstring(content)
    contexts = _parse_contexts(root)

    # facts[context_id][local_name] = value
    facts: Dict[str, Dict[str, float]] = {}
    pct_values: List[float] = []
    symbol: Optional[str] = None
    for el in root:
        cref = el.get("contextRef")
        if not cref:
            continue
        name = _local(el.tag)
        if SYMBOL_PATTERN.match(name) and el.text and el.text.strip():
            symbol = symbol or el.text.strip().upper()
            continue
        val = _to_number(el.text)
        if val is None:
            continue
        facts.setdefault(cref, {})[name] = val
        if PCT_LOOSE.search(name) and not PCT_EXCLUDE.search(name):
            pct_values.append(val)

    # SEBI files store percentages either as fractions (0.2345) or as 23.45.
    # The grand total row is always present, so the max tells us which.
    scale = 100.0 if pct_values and max(pct_values) <= 1.0001 else 1.0

    def pct_of(fs: Dict[str, float]) -> Optional[float]:
        for name, v in fs.items():
            if PCT_EXACT.match(name):
                return v * scale
        for name, v in fs.items():
            if PCT_LOOSE.search(name) and not PCT_EXCLUDE.search(name):
                return v * scale
        return None

    def shares_of(fs: Dict[str, float]) -> Optional[float]:
        for pat in SHARES_PATTERNS:
            for name, v in fs.items():
                if pat.match(name):
                    return v
        return None

    # best[cat] = (dimension_count, context_id)
    best: Dict[str, Tuple[int, str]] = {}
    for cid, ctx in contexts.items():
        cat = _classify(ctx)
        if not cat or cid not in facts:
            continue
        if pct_of(facts[cid]) is None and shares_of(facts[cid]) is None:
            continue
        cand = (len(ctx.members), cid)
        if cat not in best or cand < best[cat]:
            best[cat] = cand

    values: Dict[str, Tuple[Optional[float], Optional[float]]] = {}
    for cat, (_, cid) in best.items():
        values[cat] = (pct_of(facts[cid]), shares_of(facts[cid]))

    def pct(cat: str) -> Optional[float]:
        return values.get(cat, (None, None))[0]

    def total(cats: List[str], idx: int) -> Optional[float]:
        have = [values[c][idx] for c in cats if c in values and values[c][idx] is not None]
        return sum(have) if have else None

    # FPI: Cat I/II are the current regime; legacy FII is a separate row when present.
    # An uncategorised "FPI" row can be the parent subtotal of Cat I/II, so it is
    # used only when neither category row exists (avoids double counting).
    fpi_cats = list(FPI_PARTS)
    if "cat1" not in values and "cat2" not in values:
        fpi_cats.append("fpi")
    fpi_pct = total(fpi_cats, 0)
    fpi_shares = total(fpi_cats, 1)

    # DII: the filing's own subtotal wins; otherwise sum the component rows.
    if "dii" in values and values["dii"][0] is not None:
        dii_pct = values["dii"][0]
        dii_shares = values["dii"][1]
        if dii_shares is None:
            dii_shares = total(list(DII_PARTS), 1)
    else:
        dii_pct = total(list(DII_PARTS), 0)
        dii_shares = total(list(DII_PARTS), 1)

    periods = Counter(contexts[cid].period for _, cid in best.values() if contexts[cid].period)
    if not periods:
        periods = Counter(c.period for c in contexts.values() if c.period)
    quarter = periods.most_common(1)[0][0] if periods else None

    def rnd(v: Optional[float]) -> Optional[float]:
        return round(v, 4) if v is not None else None

    def rint(v: Optional[float]) -> Optional[int]:
        return int(round(v)) if v is not None else None

    return Holding(
        quarter=quarter,
        symbol=symbol,
        fpiPct=rnd(fpi_pct),
        fpiCat1Pct=rnd(pct("cat1")),
        fpiCat2Pct=rnd(pct("cat2")),
        fiiPct=rnd(pct("fii")),
        fpiShares=rint(fpi_shares),
        diiPct=rnd(dii_pct),
        diiShares=rint(dii_shares),
        mfPct=rnd(pct("mf")),
        matched={cat: cid for cat, (_, cid) in best.items()},
    )
