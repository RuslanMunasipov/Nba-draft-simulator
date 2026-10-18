# Sports.ru historical statistics — acquisition status

Generated: 2026-10-18

## Status
No historical Sports.ru player-season dataset has been downloaded or independently verified in this task. Do not treat existing Kaggle game logs as Sports.ru data.

## Required output
- Player identity and Sports.ru profile ID, position and team
- Every available season, including team splits and totals
- Full season statistics and per-game logs when publicly exposed
- Source URL, retrieval time, raw field names and missing-value indicators
- Reconciliation against published season totals and duplicate checks

## Next steps
1. Identify and validate Sports.ru's public season/player data endpoints using actual response samples.
2. Determine whether authenticated access or access restrictions apply; respect site terms and rate limits.
3. Collect all pages and seasons with retries, checkpoints and reproducible provenance.
4. Export versioned JSON/Parquet files and a coverage report.
5. Run the collector in GitHub Actions and commit only verified results.

**Important:** This file is a status manifest, not a completed data export.
