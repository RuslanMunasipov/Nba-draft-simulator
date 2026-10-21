# Scoring audit — 2026-10-17
A dated log. Statements later entries changed are marked in brackets; the current scoring checks are in «Current — 2026-10-21» at the end.
## Resolved in this change
- Removed artificial stress-win percentages from primary recommendations. A random first-place share is not confidence in a season prediction.
- Replaced mixed veteran historical / rookie projection ordering with complete-formula season estimates where available.
- Removed uncalibrated role 0.85 and OUT 0.5 multipliers from the value calculation. Availability/risk evidence remains visible; high-risk candidates remain separate.
- Removed successful roster completion from player advantages. It is enforced as a feasibility constraint.
- Added complete Sports.ru formula estimates: provider counting statistics, estimated PF, participation and team-result bonuses [the team-result bonus left the FBL formula on 20.10, next line]. Formula source: https://www.sports.ru/fantasy/basketball/tournament/rules/150.html .
- 20.10.2026 (league owner): the FBL formula has no team result bonus (Yahoo, where the league scores, cannot award points for a team's wins or take them for its losses). Every forecast, the live box-score points and the in-season calibration use Sports.ru's formula without it; every played game is scored on its own row (no reconstructed outcome needed).
- Explicitly separated single-game P90, mean season, and high/low season scenarios. Never multiply game ceiling by 82.
- Reconstruct historical team outcomes only for two-team games with complete minute totals; report rejected games. [Superseded 20.10: without the result bonus no team outcome is reconstructed.]
- Preserve joint empirical change in per-game production and games in season scenarios.
- Log a frozen historical holdout: residuals from 2023/24–2024/25, test 2025/26. [This is the legacy SeasonModel stage, see «Accuracy follow-up».]
## Remaining grey areas / limitations
- The holdout validates historical persistence and scenario construction, not historical ESPN predictions. Rookie analogue ranges have no independent rookie-forecast validation.
- Analogue count (10), historical scenario construction and risk gates are explicit model design choices, not learned optimal parameters.
- Season ranges are empirical scenarios, not calibrated personal probabilities. Career peak is not modeled. [Superseded 19.10: the shipped ranges come from out-of-sample errors calibrated per tail, see «Superseded — 2026-10-19».]
- Team outcome expectations use last season, not current roster-adjusted team win probabilities. [Superseded 20.10: no team outcome enters the FBL formula.]
- PF and participation bonuses are modeled, not supplied individual ESPN forecast categories.
- Zero-appearance target players are now included as zero season output. Injury, retirement and departures are not distinguished by these logs.
- Source data are user-supplied and the 2024/25 schedule is incomplete.
- League rules were recovered from explicit user confirmations dated 2026-10-16/17: 8x10, two slots each, Sports.ru positions (Yahoo mirrors rosters and transfers; since 20.10 it keeps the league's scoring and standings, see data/league-rules.json), straight order, 20000 cap, Sports.ru prices, required rookie. The Sports.ru rule of at most two players per NBA club is enforced in season advice since 2026-10-19. See data/league-rules.json.
- Rookie timing and simulation now use the same full-formula season metric as recommendations. Imported datasets without full forecasts remain in a separate legacy metric. Missing recorded forecasts block scoring, never become zero. GM policies remain assumptions, not calibrated behavior.
## Decision
LIMITED. This change makes scores comparable and exposes a testable complete-formula estimate. It does not establish an ideal or proven season-winning prediction system.

## Accuracy follow-up
- [These items describe the legacy SeasonModel stage (`scripts/build_forecasts.py` with `scripts/season_accuracy.py`). Since 19.10 every shown forecast comes from `scripts/projection_model.py` (or, for three players, `scripts/complete_forecasts.py`), so `forecastAudit.holdout` and `forecast-audit.json` do not describe the shown forecasts. The shipped model's calibration is temporal (each season's errors from a model fitted on earlier seasons, so a player can be on both sides), not split by player, and it reports coverage per tail, not interval width.]
- Select persistence or conditional historical rate/games estimates by leave-player-out error on 2023/24 -> 2024/25 only. Test on 2025/26 stays untouched.
- Split calibration players by NBA id, separately from fitting/model selection. Use finite-sample 80% split-conformal padding and report average width alongside coverage.
- Refit production on both observed transitions only after recording frozen holdout results. Production fit diagnostics are not an independent accuracy test.
- ESPN point forecasts are preserved. Historical fallback rate and games may change; the learned rate correction is an explicit separate scoring component.
- Evaluate including zero-game seasons, and publish persistence MAE, selected-model MAE, absence MAE, coverage and width. No claim of validated ESPN/rookie accuracy or conditional personal probabilities.

- Neighborhood intervals retain the global transition-risk envelope. This safeguard was added after inspecting 2025/26 diagnostics; final metrics are retrospective development validation, not untouched external validation. No numerical hyperparameter is selected on 2025/26. [Legacy stage only. The shipped absence chain's parameters were chosen forward on 2021–2026, which includes 2025/26; see docs/ACCEPTANCE.md «Current state».]
- Production calibration takes the worst nonconformity per player across observed transitions; a repeated player is not counted twice as independent calibration evidence.
- Report paired bootstrap uncertainty for MAE difference plus active-player per-game MAE and games MAE.

## End-to-end follow-up
- Full-formula scores drive rookie timing, bot selection, draft summaries and batch winners; no per-game/season or partial/full mixing.
- Availability candidates include historical absolute next-season games (median/mean) and paired changes, selected on fit-only player-excluded season MAE alongside persistence.
- Rookie missing-component transfer is tested using first-year NBA profiles, prior-season donors and current ESPN experience. Actual counting stats/minutes are known inputs, so this does not validate future rookie ESPN predictions. Current-roster survivorship remains a limitation.

- [Rookie timing study only; not in the UI since 20.10 (#81).] Forecast sensitivity pairs rookie-upside/veteran-downside and the reverse, using identical seeds and demand profiles for now-versus-next choices. A conflicting stress decision changes the headline to unstable. Bounds are deliberate extremes, not joint probabilities.
- Six surviving historical rookies passed the component-test cohort in the first run; donor transfer did not improve the zero-net-component comparator. This limitation is displayed rather than presented as successful rookie validation.
- Historical ESPN season endpoints are inspected in Actions; live past-season projections are excluded from forecast backtesting without independently dated preseason provenance.

## Published position evidence
- Actions fetches Dan Titus / Yahoo Sports' 2026/27 position table published on NBA.com. Exact, unique normalized-name mapping only; no editorial rank, team or forecast data is copied into the valuation.
- This corrects known ESPN mapping errors, including Wembanyama SF/PF -> C. Published analyst positions are labelled separately from an authenticated live Yahoo-league eligibility response; unmatched players retain ESPN estimates. [Since 17.10 Sports.ru positions govern the draft and transfers; Yahoo positions are a reference only.]
- The source season, table size, mapping coverage and Wembanyama regression are build gates. No silent replacement with old or incomplete position data.

## Superseded — 2026-10-19
- The ad hoc value penalties (group prior −18%, limited history −10%, chronic −8%, OUT −4%) are removed: the projection model now shrinks short records and widens their ranges, so a second penalty would count the same risk twice. A bot or user style only states a downside preference.
- The 80% season range is now built from out-of-sample errors and calibrated per tail (see docs/ACCEPTANCE.md); its lower bound is no longer pinned near zero by players who missed a whole season.
- The rookie component audit (one player) is no longer shown; rookies are checked by the draft-pick model on the complete 2025 class.

## Current — 2026-10-21
- `scripts/audit_scoring.py` runs two checks. The consistency check restates the FBL formula term by term against `build_forecasts.full()` on 78,901 games and checks that every forecast's components add up to its per-game value; both sides are the repository's own code, so it can catch a typo in one copy but not a wrong rule (before 20.10 it passed with the result bonus, after with none). Mismatches are now counted, not a constant 0.
- The external check compares Sports.ru's official season totals (`data/sports-fantasy-history.json`) with Sports.ru's own formula (the FBL terms with its +2/+1 minutes rule) plus its result bonus on the same games of the league logs, for player-seasons whose games match: 387 player-seasons 2023/24–2025/26, 151 exact, 318 within ±2 FP a season, mean residual +1.2; without the bonus the mean gap is 35.7. It confirms the counting terms, Sports.ru's 10-minute rule and its result bonus, so Sports.ru's game points can be turned into FBL points by removing both. It passes at 100+ player-seasons, 75% within ±2 and a bonus-free gap at least five times the residual.
- Participation (league owner, 21.10, Yahoo league settings): 1 point per game played (GP), whatever the minutes. Sports.ru's formula gives +2 for 10 minutes or more and +1 below; the game rows (Sports.ru's points) are turned into FBL points by removing its result bonus and its extra point for 10+ minutes. The external check runs Sports.ru's own rule (+2/+1 and the result bonus) against its own totals.
- Not checked: per-game agreement of the live ESPN box-score points with Sports.ru's points minus the bonus, and whether a Sports.ru-legal roster fits Yahoo's ten fixed slots under Yahoo eligibility (see docs/ACCEPTANCE.md «Current state»).
