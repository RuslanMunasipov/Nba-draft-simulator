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

## Returning players and complete historical coverage
- All 800 historical players remain in the experimental catalog. A missing season never silently deletes a player or assigns zero ability.
- The latest available season with 20+ games is the reference; if none qualifies, a low-sample estimate is shown with VERY_HIGH uncertainty.
- Earlier-season and low-sample references do not fabricate expected season games or total season FP: those fields are null.
- Haliburton and Irving are regression cases using 2024/25. Source-dated return context is stored separately from statistical assumptions.
- The 20-game requirement still defines the held-out benchmark cohort; it no longer limits catalog coverage.
- Historical coverage is not a verified 2026/27 active roster. 2026 rookies without NBA history remain a separate unresolved input.

## Automatic default database and explanations
- Fresh opens automatically install the latest CI-built database. Users need no JSON or local setup. Existing picks retain their selected-player snapshots during refresh; cached databases survive network failures.
- Current teams, injuries, basketball positions and no-experience rookie flags come from source-dated ESPN team rosters. ESPN positions are explicitly NOT verified Yahoo eligibility. Provider IDs are namespaced when no NBA ID can be matched.
- Rookie numeric values are labelled empirical group priors, calculated as a median of an explicit historical reference cohort; they are not fabricated individual rookie performance. NBA rookie eligibility still needs league-rule verification.
- Injury/return/availability/role risks are automatic explanations. Role competition uses new high-volume teammates, with sourced context for Maxey. Stress factors are assumptions, not calibrated clinical or usage predictions.
- The confidence percentage is the fraction of 100 stress scenarios in which the player leads the compared candidate pool. Opponent-loss percentage is an explicit heuristic, not measured GM behavior or a season-win probability.
- Live Draft, automatic seven-bot training, full simulation, and 100-scenario batches use the installed database. The build verifies all 80 picks and 100 seeded runs on that exact database before publishing.
- Daily CI refreshes source data; failed builds preserve the previous published deployment.

## Completion-bound safeguard
- Recommended and manually chosen UI picks now require an exact single-team completion witness: ten unique players, two slots per position, fixed picks retained, at least one rookie, no opponent-owned players, and verified prices under cap when enabled.
- A min-cost circulation finds the cheapest legal full roster, not merely a cheap player per slot; multiposition players cannot fill two slots. Tests compare it with exhaustive independent subset enumeration, plus specific rookie/position/budget traps.
- This is a bound at current availability, not a global eight-team allocation or a guarantee against the next seven opponent choices. Simulator bots retain their heuristic policy; arbitrary externally imported histories are still recordable through the core engine.
- Pros/cons compare the candidate's base FP and identified risk with a named alternative. A 0% first-place frequency is explicitly not a claim that the player is useless. Season availability and total season FP remain unvalidated.

## Availability-first candidate selection
- The top-20 cutoff now follows an availability-aware index, not raw per-game FP. Recent historical game counts have double the prior season weight, divided by 82. This is a transparent caution policy, not expected games or calibrated injury probability. Role-change and OUT factors are explicit stress assumptions.
- Main recommendations use feasible non-HIGH-risk candidates whenever any exist. HIGH-risk candidates remain searchable and in a separate collapsed section. Required rookies/only legal high-risk completions fall back with explicit speculative wording; no names are blacklisted.
- Bots use the same availability-aware ordering; full 100-run acceptance must pass again.
- ESPN screenshots supplied on 16 October show one expert 8-team roto mock (Embiid pick 71, Davis pick 19). Those ranks are context, not ADP, FBL FP or season projections. No ESPN numeric projections were imported: the projections page rendered no player table in the inspected browser, and the attempted public feed returned HTTP 400. Never replace unavailable forecasts with invented numbers.
