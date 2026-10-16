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
- Yahoo eligibility, salary cap/prices, FBL-specific rule differences, player availability, roster roles and draft order still require league validation.
- Rookie timing retains an explicitly partial common ESPN metric, separate from full estimates in main recommendations. Its GM policies are assumptions, not calibrated behavior.
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
