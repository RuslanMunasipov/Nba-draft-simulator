# Scoring audit — 2026-10-17
## Resolved in this change
- Removed artificial stress-win percentages from primary recommendations. A random first-place share is not confidence in a season prediction.
- Replaced mixed veteran historical / rookie projection ordering with complete-formula season estimates where available.
- Removed uncalibrated role 0.85 and OUT 0.5 multipliers from the value calculation. Availability/risk evidence remains visible; high-risk candidates remain separate.
- Removed successful roster completion from player advantages. It is enforced as a feasibility constraint.
- Added complete Sports.ru formula estimates: provider counting statistics, estimated PF, participation and team-result bonuses. Formula source: https://www.sports.ru/fantasy/basketball/tournament/rules/150.html .
- Explicitly separated single-game P90, mean season, and high/low season scenarios. Never multiply game ceiling by 82.
- Reconstruct historical team outcomes only for two-team games with complete minute totals; report rejected games.
- Preserve joint empirical change in per-game production and games in season scenarios.
- Log a frozen historical holdout: residuals from 2023/24–2024/25, test 2025/26.
## Remaining grey areas / limitations
- The holdout validates historical persistence and scenario construction, not historical ESPN predictions. Rookie analogue ranges have no independent rookie-forecast validation.
- Analogue count (10), historical scenario construction and risk gates are explicit model design choices, not learned optimal parameters.
- Season ranges are empirical scenarios, not calibrated personal probabilities. Career peak is not modeled.
- Team outcome expectations use last season, not current roster-adjusted team win probabilities.
- PF and participation bonuses are modeled, not supplied individual ESPN forecast categories.
- Zero-appearance target players are now included as zero season output. Injury, retirement and departures are not distinguished by these logs.
- Source data are user-supplied and the 2024/25 schedule is incomplete.
- League rules were recovered from explicit user confirmations dated 2026-10-16: 8x10, two slots each, Yahoo eligibility, straight order, adjustable 20000 cap, Sports.ru prices, required rookie. Actual Yahoo player eligibility and Sports.ru prices in feeds remain unverified. No unconfirmed NBA club limit is enforced. See data/league-rules.json.
- Rookie timing and simulation now use the same full-formula season metric as recommendations. Imported datasets without full forecasts remain in a separate legacy metric. Missing recorded forecasts block scoring, never become zero. GM policies remain assumptions, not calibrated behavior.
## Decision
LIMITED. This change makes scores comparable and exposes a testable complete-formula estimate. It does not establish an ideal or proven season-winning prediction system.

## Accuracy follow-up
- Select persistence or conditional historical rate/games estimates by leave-player-out error on 2023/24 -> 2024/25 only. Test on 2025/26 stays untouched.
- Split calibration players by NBA id, separately from fitting/model selection. Use finite-sample 80% split-conformal padding and report average width alongside coverage.
- Refit production on both observed transitions only after recording frozen holdout results. Production fit diagnostics are not an independent accuracy test.
- ESPN point forecasts are preserved. Historical fallback rate and games may change; the learned rate correction is an explicit separate scoring component.
- Evaluate including zero-game seasons, and publish persistence MAE, selected-model MAE, absence MAE, coverage and width. No claim of validated ESPN/rookie accuracy or conditional personal probabilities.

- Neighborhood intervals retain the global transition-risk envelope. This safeguard was added after inspecting 2025/26 diagnostics; final metrics are retrospective development validation, not untouched external validation. No numerical hyperparameter is selected on 2025/26.
- Production calibration takes the worst nonconformity per player across observed transitions; a repeated player is not counted twice as independent calibration evidence.
- Report paired bootstrap uncertainty for MAE difference plus active-player per-game MAE and games MAE.

## End-to-end follow-up
- Full-formula scores drive rookie timing, bot selection, draft summaries and batch winners; no per-game/season or partial/full mixing.
- Availability candidates include historical absolute next-season games (median/mean) and paired changes, selected on fit-only player-excluded season MAE alongside persistence.
- Rookie missing-component transfer is tested using first-year NBA profiles, prior-season donors and current ESPN experience. Actual counting stats/minutes are known inputs, so this does not validate future rookie ESPN predictions. Current-roster survivorship remains a limitation.

- Forecast sensitivity pairs rookie-upside/veteran-downside and the reverse, using identical seeds and demand profiles for now-versus-next choices. A conflicting stress decision changes the headline to unstable. Bounds are deliberate extremes, not joint probabilities.
- Six surviving historical rookies passed the component-test cohort in the first run; donor transfer did not improve the zero-net-component comparator. This limitation is displayed rather than presented as successful rookie validation.
- Historical ESPN season endpoints are inspected in Actions; live past-season projections are excluded from forecast backtesting without independently dated preseason provenance.

## Published position evidence
- Actions fetches Dan Titus / Yahoo Sports' 2026/27 position table published on NBA.com. Exact, unique normalized-name mapping only; no editorial rank, team or forecast data is copied into the valuation.
- This corrects known ESPN mapping errors, including Wembanyama SF/PF -> C. Published analyst positions are labelled separately from an authenticated live Yahoo-league eligibility response; unmatched players retain ESPN estimates.
- The source season, table size, mapping coverage and Wembanyama regression are build gates. No silent replacement with old or incomplete position data.
