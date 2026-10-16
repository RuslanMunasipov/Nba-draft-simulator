# Scoring audit — 2026-10-16
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
- Zero-appearance target players are absent from holdout. This understates availability uncertainty for full-season absences.
- Source data are user-supplied and the 2024/25 schedule is incomplete.
- Yahoo eligibility, salary cap/prices, FBL-specific rule differences, player availability, roster roles and draft order still require league validation.
- Rookie timing retains an explicitly partial common ESPN metric, separate from full estimates in main recommendations. Its GM policies are assumptions, not calibrated behavior.
## Decision
LIMITED. This change makes scores comparable and exposes a testable complete-formula estimate. It does not establish an ideal or proven season-winning prediction system.
