# FBL Draft Intelligence

Mobile browser draft tracker, season assistant and simulation prototype for FBL 2026/27. The draft was held on 18 October 2026 (picks in `src/fbl-draft-2026.js`); the season runs from 20 October 2026.

`npm ci && npm run verify` tests and builds the app. The Pages workflow first installs pinned PyArrow and runs `python scripts/audit_parquet.py` to generate historical reference data from `data/raw`. No local Python installation is needed for users.

Draft rules: 8 teams, 10 straight rounds, two slots per PG/SG/SF/PF/C with one Sports.ru position per player, one rookie minimum, at most two players of one NBA club, Sports.ru prices with a 20,000 cap (on for the automatic database; only unpriced manual imports run without it). Saves are device-local; JSON export/import provides backups. Season rules (three FBL transfers a week, transfer hours, the white rule, one FBL team per player) are in `data/league-rules.json`.

Historical sources: three complete league seasons of Parquet game logs (`kaggle_v515`, 2023/24–2025/26) and the collected career game logs 2002–2026 (`data/raw/career_games.parquet`). Forecasts come from a projection model trained on the career logs and checked on the held-out 2025/26 season (`scripts/projection_model.py`; its report is published with the site as `data/projection-model-audit.json`, not shown in the app). 2025/26 was held out of every fit, but some design choices also looked at it (see the acceptance status). Sports.ru owns positions, prices and transfers; the dated price snapshot is from 17 October 2026 and the season tab reads live Sports.ru data. The league scores on Yahoo with the FBL formula: Sports.ru's without the team result bonus.

See [acceptance status](docs/ACCEPTANCE.md). **LIMITED: the advice is a model's expected points, validated on the held-out 2025/26 season only; not approved as a primary analytical advisor.**
