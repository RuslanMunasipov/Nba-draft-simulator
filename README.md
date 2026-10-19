# FBL Draft Intelligence

Mobile browser draft tracker and simulation prototype for FBL 2026/27, 18 October 2026.

`npm ci && npm run verify` tests and builds the app. The Pages workflow first installs pinned PyArrow and runs `python scripts/audit_parquet.py` to generate historical reference data from `data/raw`. No local Python installation is needed for users.

Draft rules: 8 teams, 10 straight rounds, two slots per PG/SG/SF/PF/C with multi-position matching, one rookie minimum. Official-price/cap checks are optional until prices are available. Saves are device-local; JSON export/import provides backups.

Historical sources: three complete league seasons of Parquet game logs (`kaggle_v515`, 2023/24–2025/26) and the collected career game logs 2002–2026 (`data/raw/career_games.parquet`). Forecasts come from a projection model trained on the career logs and checked on the untouched 2025/26 season (`scripts/projection_model.py`, report in the app). Sports.ru owns positions, prices and transfers; the dated price snapshot is from 17 October 2026 and the season tab reads live Sports.ru data.

See [acceptance status](docs/ACCEPTANCE.md). **LIMITED utility; not approved as a primary analytical draft advisor.**
