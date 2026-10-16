# FBL Draft Intelligence

Mobile browser draft tracker and simulation prototype for FBL 2026/27, 18 October 2026.

`npm ci && npm run verify` tests and builds the app. The Pages workflow first installs pinned PyArrow and runs `python scripts/audit_parquet.py` to generate historical reference data from `data/raw`. No local Python installation is needed for users.

Draft rules: 8 teams, 10 straight rounds, two slots per PG/SG/SF/PF/C with multi-position matching, one rookie minimum. Official-price/cap checks are optional until prices are available. Saves are device-local; JSON export/import provides backups.

Historical source: three user-supplied Parquet game logs, marked `kaggle_v515`. CI validates structure and arithmetic consistency, not external source authenticity. Historical base FP excludes result bonuses. No historical value is published as a 2026/27 forecast. Yahoo positions, current teams, injuries and prices are still unverified.

See [acceptance status](docs/ACCEPTANCE.md). **LIMITED utility; not approved as a primary analytical draft advisor.**
