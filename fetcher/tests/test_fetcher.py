"""Run from fetcher/: python3 -m unittest discover -s tests -v"""
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from fii_fetcher.nse import normalise_filings  # noqa: E402
from fii_fetcher.store import Store  # noqa: E402
from fii_fetcher.summary import _streak, build_summary  # noqa: E402
from fii_fetcher.universe import parse_index_csv  # noqa: E402
from fii_fetcher.xbrl import parse_xbrl  # noqa: E402

FIX = HERE / "fixtures"


class XbrlTests(unittest.TestCase):
    def test_fraction_scale_categories_and_no_double_count(self):
        h = parse_xbrl((FIX / "synthetic_shp_fraction.xml").read_bytes())
        self.assertEqual(h.quarter, "2026-09-30")
        self.assertEqual(h.symbol, "TESTCO")
        self.assertAlmostEqual(h.fpiCat1Pct, 20.0)  # not the diluted 19, not holder 6
        self.assertAlmostEqual(h.fpiCat2Pct, 1.5)
        self.assertAlmostEqual(h.fpiPct, 21.5)  # parent subtotal 21.5 not added again
        self.assertEqual(h.fpiShares, 215_000_000)
        self.assertEqual(h.matched["cat1"], "FPICat1")

    def test_percent_scale_legacy_rows(self):
        h = parse_xbrl((FIX / "synthetic_shp_percent_legacy.xml").read_bytes())
        self.assertEqual(h.quarter, "2019-03-31")
        self.assertIsNone(h.fpiCat1Pct)
        self.assertAlmostEqual(h.fiiPct, 1.25)
        self.assertAlmostEqual(h.fpiPct, 11.75)  # FII + uncategorised FPI
        self.assertEqual(h.fpiShares, 11_750_000)

    def test_no_fpi_rows(self):
        xml = b'<xbrl xmlns="http://www.xbrl.org/2003/instance"><context id="a"><period><instant>2026-06-30</instant></period></context></xbrl>'
        h = parse_xbrl(xml)
        self.assertIsNone(h.fpiPct)
        self.assertEqual(h.quarter, "2026-06-30")


class NseTests(unittest.TestCase):
    def test_revision_replaces_original(self):
        raw = [
            {"date": "30-SEP-2026", "recordId": "1", "xbrl": "u1", "submissionDate": "15-Oct-2026", "pr_and_prgrp": "50.1", "public_val": "49.9"},
            {"date": "30-SEP-2026", "recordId": "2", "xbrl": "u2", "submissionDate": "15-Oct-2026", "revisionDate": "20-Oct-2026 10:00:00"},
            {"date": "30-JUN-2026", "recordId": "0", "xbrl": "u0", "submissionDate": "18-Jul-2026"},
            {"date": "garbage"},
        ]
        out = normalise_filings(raw)
        self.assertEqual([f["quarter"] for f in out], ["2026-09-30", "2026-06-30"])
        self.assertEqual(out[0]["recordId"], "2")
        self.assertEqual(out[0]["submittedOn"], "2026-10-20")


class UniverseTests(unittest.TestCase):
    def test_csv(self):
        text = "﻿Company Name,Industry,Symbol,Series,ISIN Code\nM&M Ltd.,Automobile,M&M,EQ,INE101A01026\n,,,,\n"
        rows = parse_index_csv(text)
        self.assertEqual(rows, [{"symbol": "M&M", "name": "M&M Ltd.", "industry": "Automobile", "isin": "INE101A01026"}])


def _doc(sym, pcts, shares=None):
    qs = ["2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"][-len(pcts):]
    return {
        "symbol": sym,
        "quarters": {
            q: {"fpiPct": p, "fpiShares": (shares[i] if shares else None)} for i, (q, p) in enumerate(zip(qs, pcts))
        },
    }


class SummaryTests(unittest.TestCase):
    def test_streak(self):
        s = lambda xs: [{"q": str(i), "pct": x} for i, x in enumerate(xs)]  # noqa: E731
        self.assertEqual(_streak(s([10, 11, 12, 13])), 3)
        self.assertEqual(_streak(s([13, 12, 12.5, 11])), -1)
        self.assertEqual(_streak(s([10, 10.005])), 0)
        self.assertEqual(_streak(s([10])), 0)

    def test_build(self):
        universe = [
            {"symbol": "AAA", "name": "A", "industry": "IT"},
            {"symbol": "BBB", "name": "B", "industry": "Banks"},
            {"symbol": "CCC", "name": "C", "industry": "IT"},
        ]
        holdings = [
            _doc("AAA", [10, 11, 12, 13], shares=[100, 110, 120, 130]),
            # pct up while FPI share count fell -> denominator effect (buyback)
            _doc("BBB", [20.0, 20.5], shares=[200, 190]),
            # has not filed the latest quarter yet
            _doc("CCC", [5, 4, 3]),
        ]
        holdings[2]["quarters"] = {
            "2025-12-31": {"fpiPct": 5}, "2026-03-31": {"fpiPct": 4}, "2026-06-30": {"fpiPct": 3},
        }
        s = build_summary(universe, holdings)
        self.assertEqual(s["latestQuarter"], "2026-09-30")
        self.assertEqual(s["previousQuarter"], "2026-06-30")
        rows = {r["symbol"]: r for r in s["rows"]}
        self.assertEqual(rows["AAA"]["changePp"], 1)
        self.assertEqual(rows["AAA"]["streak"], 3)
        self.assertFalse(rows["AAA"]["denominatorEffect"])
        self.assertTrue(rows["BBB"]["denominatorEffect"])
        self.assertTrue(rows["CCC"]["pending"])
        self.assertEqual(rows["CCC"]["streak"], -2)
        self.assertEqual(s["coverage"], {"universe": 3, "withLatest": 2, "withAny": 3})

    def test_store_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            st = Store(Path(d))
            st.write_holding({"symbol": "M&M", "quarters": {"2026-09-30": {"fpiPct": 1}}})
            self.assertEqual(st.read_holding("M&M")["quarters"]["2026-09-30"]["fpiPct"], 1)
            self.assertEqual(len(st.all_holdings()), 1)


if __name__ == "__main__":
    unittest.main()
