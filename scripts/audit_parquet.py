#!/usr/bin/env python3
"""Validate three NBA game-log Parquet files in GitHub Actions.

This step intentionally does NOT publish fantasy projections until column semantics,
game identifiers and Sports.ru scoring bonuses are verified.
"""
import json
import sys
from pathlib import Path
import pandas as pd

SEASONS = ("2023-24", "2024-25", "2025-26")
SOURCE = Path("data/raw")
OUT = Path("data/reports")
OUT.mkdir(parents=True, exist_ok=True)
report = {"status": "inspected", "seasons": {}, "warnings": []}
failed = False
for season in SEASONS:
    path = SOURCE / f"game_logs_{season}.parquet"
    if not path.is_file():
        report["warnings"].append(f"Missing input: {path}")
        failed = True
        continue
    try:
        frame = pd.read_parquet(path, engine="pyarrow")
        details = {
            "rows": int(len(frame)),
            "columns": [{"name": str(k), "dtype": str(v)} for k, v in frame.dtypes.items()],
            "null_counts": {str(k): int(v) for k, v in frame.isna().sum().items()},
            "duplicate_full_rows": int(frame.duplicated().sum()),
        }
        report["seasons"][season] = details
        if frame.empty:
            report["warnings"].append(f"{season}: empty game logs")
            failed = True
    except Exception as exc:
        report["warnings"].append(f"{season}: {type(exc).__name__}: {exc}")
        failed = True
(OUT / "parquet-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(1 if failed else 0)
