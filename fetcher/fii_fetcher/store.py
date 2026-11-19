"""JSON files under the output dir (default web/public/data)."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "web" / "public" / "data"

_SAFE = re.compile(r"[^A-Z0-9&_-]")


def safe_symbol(symbol: str) -> str:
    # Symbols like M&M or BAJAJ-AUTO are kept; anything else odd becomes _.
    return _SAFE.sub("_", symbol.upper())


class Store:
    def __init__(self, out_dir: Path = DEFAULT_OUT) -> None:
        self.out = Path(out_dir)
        (self.out / "holdings").mkdir(parents=True, exist_ok=True)

    def _write(self, path: Path, data: Any, compact: bool = False) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            if compact:  # big numeric tables: one line per top-level key keeps files and diffs small
                json.dump(data, f, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            else:
                json.dump(data, f, indent=1, ensure_ascii=False, sort_keys=True)
            f.write("\n")
        os.replace(tmp, path)

    def _read(self, path: Path, default: Any) -> Any:
        if not path.exists():
            return default
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    # universe
    def write_universe(self, rows: List[Dict]) -> None:
        self._write(self.out / "universe.json", rows)

    def read_universe(self) -> List[Dict]:
        return self._read(self.out / "universe.json", [])

    # holdings
    def holding_path(self, symbol: str) -> Path:
        return self.out / "holdings" / f"{safe_symbol(symbol)}.json"

    def read_holding(self, symbol: str) -> Dict:
        return self._read(self.holding_path(symbol), {"symbol": symbol, "quarters": {}})

    def write_holding(self, doc: Dict) -> None:
        self._write(self.holding_path(doc["symbol"]), doc)

    def all_holdings(self) -> List[Dict]:
        docs = []
        for p in sorted((self.out / "holdings").glob("*.json")):
            docs.append(self._read(p, None))
        return [d for d in docs if d]

    # summary
    def write_summary(self, summary: Dict) -> None:
        self._write(self.out / "summary.json", summary)

    def read_summary(self) -> Optional[Dict]:
        return self._read(self.out / "summary.json", None)

    # daily flows: {"cash": {date: {fii, dii}}, "fno": {date: {FII: {...}}}, "nsdl": {date: {category: {...}}}}
    def read_flows(self) -> Dict:
        doc = self._read(self.out / "flows.json", {})
        for k in ("cash", "fno", "nsdl"):
            doc.setdefault(k, {})
        return doc

    def write_flows(self, doc: Dict) -> None:
        from datetime import datetime, timezone

        doc["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self._write(self.out / "flows.json", doc)

    # monthly files: deals/2026-11.json, delivery/2026-11.json, sast/2026-11.json
    def read_month(self, kind: str, month: str, default: Any) -> Any:
        return self._read(self.out / kind / f"{month}.json", default)

    def write_month(self, kind: str, month: str, data: Any) -> None:
        (self.out / kind).mkdir(parents=True, exist_ok=True)
        self._write(self.out / kind / f"{month}.json", data, compact=True)
