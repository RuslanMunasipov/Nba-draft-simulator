# FBL 2026/27 — acceptance status

Deadline: 18 October 2026. Target: 8 teams, 10 straight rounds, 2 slots per position, at least one rookie. Prices currently OFF.

## Implemented and covered by automated tests
- Pick uniqueness, straight order, position matching and rookie completion constraint.
- Optional price enforcement, cap, legacy save migration, JSON backups.
- Interactive bots, full simulation, seeded batches in a Web Worker.
- Historical Parquet audit with SHA256, schema, dates, duplicate and invalid-row checks.
- Historical reference generated during CI from three supplied files. It is not a forecast.
- Scoring arithmetic tests cover independent categories, misses, bonuses and minute thresholds.

## Unfinished / blocks primary-advisor GO
- Yahoo 2026/27 positions, current teams and rookie flags have not been independently verified.
- Sports.ru prices and complete game-result bonus mapping are unconfirmed.
- Supplied source is labelled kaggle_v515; authenticity and minute encoding need verification.
- 2024/25 contains 1223 game IDs, not 1230. Missing games must not silently count as DNP.
- No validated 2026/27 projections, injury/news ingestion, calendars, usage or historical holdout evaluation.
- No global feasibility guarantee for completion after each pick or strategic look-ahead.
- Bots use heuristic styles; their wins are not probabilities of winning the actual season.
- Arbitrary old-pick editing is absent; only last-pick undo.
- Persistence is local to a browser/device, not cloud synchronization. JSON export is the backup.
- Real iPhone/iPad Safari acceptance is pending; desktop browser tests do not establish it.
- White-rule commissioner confirmation is not implemented.

## Decision
LIMITED: usable for recording picks and controlled simulations with explicitly supplied valid inputs. NO GO as the primary analytical advisor until the above data and analytical gates pass.

Do not convert historical averages into a season prediction, invent missing prices, derive Yahoo positions from box scores, or treat the latest historical team as the current team.

## Experimental baseline milestone
- A single held-out 2025/26 comparison uses only 2023/24 and 2024/25 inputs.
- Models: previous-season means versus 75% recent / 25% earlier season.
- MAE is reported for base FP per game, minutes and observed games. Cohort excludes players with fewer than 20 games in recent training or test season.
- The lower base-FP MAE selects a candidate for 2026/27, refit using the allowed past seasons. Model selection has no second independent test.
- Outputs are ESTIMATED, high uncertainty, exclude result bonuses and current roster/injury/role effects, and are not imported as full projectedFP.
- D-01/D-08 remain partial; this does not clear the analytical GO gate.
- Upstream documents decimal minutes and seven missing game IDs for 2024/25. This explains provenance, not independent statistical verification.
