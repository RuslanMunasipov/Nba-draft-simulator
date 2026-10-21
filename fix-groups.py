import json
G=[
dict(group='season-availability',
 files='src/season.js (ONLY: stints, teamPoints, perGame, playRate, chainCurve, seasonEnding, injuryFactor, expectedPoints, horizons, gameWeeks/weekOf, boxScorePoints, liveGamePoints and their helpers), scripts/inseason_calibration.py, data/inseason-calibration.json, tests/test_inseason_calibration.py, new tests/season-availability.test.js',
 keys=['transfer-day-credit','shared-player-both','injury-double-count','playrate-clamp','gtd-never-fires','season-ending-regex','nba-cup-80-games','zero-hazards','return-date-tz','week-windows-mlk','inseason-rate-low','chain-overpredicts-healthy','yahoo-minutes-grey'],
 notes='''- transfer-day-credit: one shared predicate (export it, e.g. inStint) used by teamPoints AND exported for season-ui teamFact/playerFact
  (the UI group will call it: export `inStint(game, stint)` and keep `stints()` returning objects with from/to plus fromAt/toAt). Rule: a
  game belongs to the buyer only if it tipped off after the move. Use g.tip (UTC ISO, will be added by the collection group to club
  calendar games and player game rows) and the transfer's seenAt when present; without g.tip a game dated on the transfer's Moscow date
  belongs to the seller (they tip 02:00-05:30 MSK, before the 08:00 window), except the documented pre-season deadline-day case (20.10,
  opener at 22:00 MSK after the 21:30 deadline) if you can handle it cleanly. Check how allTransfers()/journal rows expose seenAt.
- shared-player-both: owner decision 2 (only the first holder scores; the later buyer's stint scores 0 while the other team holds him;
  undeterminable order = both, as a doubt). Read src/rules.js firstHolder (do not edit rules.js) and reuse it if it fits.
- injury-double-count: one source of availability per player. After an injured player's return, use a share NOT conditioned on the current
  report (forecast.availability.unconditionalGames/82 when present, else forecast.sources.model.games/82, else forecast.games/82);
  before the return the injury factor decides. Never subtract the reported absence twice. Players without injury unchanged.
- playrate-clamp: drop the 0.5 floor (keep a tiny floor like .01 and the .97 cap) per the verifier evidence.
- gtd-never-fires / season-ending-regex / return-date-tz / zero-hazards / nba-cup-80-games / week-windows-mlk: as the verifiers measured.
- inseason-rate-low: participation bonus (+2/+1) must not scale with minutes in perGame (split rate x minutes on the counting part, add the
  participation term). If the fitted weights must change, update scripts/inseason_calibration.py consistently and regenerate
  data/inseason-calibration.json, and make "python3 scripts/inseason_calibration.py --check" pass. Add a test pinning the JS estimator to
  the Python estimator on a fixed sequence.
- chain-overpredicts-healthy: fix only if a clear code defect; otherwise put the measured numbers in docNotes.
- yahoo-minutes-grey: owner decision 1 (exact minutes). Only the live-points side: mark ESPN-rounded "10" minute lines as uncertain (±1)
  in liveGamePoints (unsure flag), no formula change.'''),
dict(group='season-transfers',
 files='src/season.js (ONLY: selling, clubRoom, fits, swap, transferOptions, bestSwapFor, bestTransfers, bestPackage, transferVerdict, VERDICTS, acquisition, injuredTargets, marketAlerts, CONFIDENT/DOUBTFUL, normalCdf, pointsSpread, playerPicture, splitProduct, explainSwap and NEW exports), src/season-ui.js (ONLY the bodies of recommendation(), packageMoves(), packageCard(), optionRow()/takeAction() where package choice or confidence wording is decided), scripts/notify-transfers.mjs (ONLY the package/decision/confidence parts), new tests/season-transfers.test.js',
 keys=['acquisition-attribution','ui-telegram-packages','confidence-calibration','verdict-band','gain-split-zero','package-club-swap','package-legs-verdict','transfer-hours-advice','same-targets-gametheory','advice-threshold-wording','preseason-cap3'],
 notes='''- ui-telegram-packages: one shared recommendPackage() in src/season.js used by both the UI recommendation() and notify-transfers.mjs, so both
  channels give the same package and the same confidence number (same rounding).
- acquisition-attribution: judge a player by his marginal edge over the best package of the same transfers without him (verifier plans).
- confidence-calibration: the verifiers backtested over-confidence (pre-season roughly fine; in season and for the arg-max advised moves too
  sure). Implement a principled, data-backed correction you can justify with the backtest scripts under ${SCR}/audit/season-expected-points/
  and ${SCR}/verify2/ (e.g. stop narrowing the availability part of the level term, an sd multiplier fitted on 2024-25 and checked on 2025-26
  stored in data/inseason-calibration.json ONLY IF you coordinate: that file is owned by season-availability, so instead store any new
  constant in src/season.js with a comment naming the fit). State before/after calibration numbers.
- verdict-band (disputed): keep the expected-value verdict; append the model's confidence to the label (", неуверенно" below CONFIDENT).
- advice-threshold-wording: "Сделай"/"забирай" only at >= CONFIDENT (70%), never 60-69%; one rounding (Math.floor) everywhere so 70% is
  never printed with a "moderate" level.
- preseason-cap3: pre-season ended 20.10 21:30 MSK; implement only if trivial and safe, else skip with reason.
- same-targets-gametheory / transfer-hours-advice / package-legs-verdict / package-club-swap / gain-split-zero: per verifier plans; keep
  game-theory additions modest and explained (e.g. flag a target that other FBL teams are also advised to buy / note the transfer window).'''),
dict(group='season-ui',
 files='src/season-ui.js (everything except the bodies owned by season-transfers: recommendation, packageMoves, packageCard), src/main.js (season-tab wiring, forecast card texts: forecastSources, forecastCard, healthLine, range labels), src/database.js, src/insights.js (text only; the Sports.ru no-bonus comparison logic is owned by docs-truth), scripts/telegram-format.mjs, scripts/notify-transfers.mjs (ONLY alerts for returns/injuries and texts, not package logic), NEW src/standings.js, new tests/season-ui.test.js and tests/standings.test.js',
 keys=['stale-snapshots','season-ui-stale-text','ties-display','four-weeks-label','return-alerts','injury-feed-outage','espn-games-unvalidated','range-coverage','health-by-logs','objective-pfirst','sports-bonus-compare'],
 notes='''- stale-snapshots: the Season tab scores the league with the installed catalog (pure helper seasonCatalog(state,database) in src/database.js,
  used in main.js render), draft-tab snapshots unchanged.
- objective-pfirst: owner decision 3. NEW pure module src/standings.js: placeProbabilities(teams, sims, seed) -> per team P(1st), P(top-3),
  expected place, from each team's fact + remaining expected points and a remaining-season sd per team (sum of player variances from
  pointsSpread exported by src/season.js; players independent, as the model's measured teammate correlation is ~0). Deterministic seeded
  RNG. Show P(1st) and P(top-3) in the standings/Teams tab with an honest one-line method note. Tests: probabilities sum to 1 over teams for
  1st and to 3 for top-3, a dominant team -> ~1.
- espn-games-unvalidated: owner decision 4 changes the model (projection group makes games = mean of ESPN and model). Make forecastSources
  text match: "ФО за матч и число матчей — средние модели и ESPN" when forecast.gamesBasis === 'MEAN_ESPN_MODEL' (new field from the
  projection group), otherwise describe what the forecast says (games ESPN only for older data). Keep it data-driven from forecast.sources.
- range-coverage: replace hard-coded «в 8 сезонах из 10» / «проверенные на прошлых сезонах» with the measured held-out coverage read from the
  database (state.data/projectionModelAudit.holdout.coverage80 or the field the app has), with a generic fallback.
- health-by-logs: display the player's own logged absence rates from new fields forecast.availability.ownShortPer82 / ownLongPer82 (null
  when too few games) that the projection group adds; if absent, do NOT show scaled hazards as "по логам" — say "темп пропусков под прогноз
  N матчей" instead. Also «по истории травм» -> «по истории пропусков».
- sports-bonus-compare (UI side only): wherever a Sports.ru season per-game number is shown next to FBL forecasts, show v.fblPerGame when
  present (new field from the docs-truth group: Sports.ru points minus that season's result bonus) and otherwise label it «Sports.ru, с
  бонусом за результат».
- return-alerts / injury-feed-outage: notify side (DTD alerts, confidence wording, no repeats on status/date changes; when the snapshot says
  the ESPN injury fetch failed (field from the collection group, e.g. espnInjuriesOk===false or missing espnInjuries), never send «вернулся в
  строй» and do not treat players as healthy).'''),
dict(group='draft-engine',
 files='src/completion.js, src/engine.js, src/simulation.js, src/plan.js, src/rookie-watch.js, src/rookies.js, src/main.js (ONLY draft-tab pick flow: choose, cardAction, mode seeding), new tests/draft-engine.test.js',
 keys=['completion-forced-rookie','live-override-dead','repick-no-completion','white-rule-gate','lcg-seeding','rookie-warnings','real-draft-not-seeded','survival-odds'],
 notes='''- completion-forced-rookie: club capacity from the ORIGINAL fixed set (forced rookie cannot be a 3rd player of a full club); fix rookiesLeftAfter
  too. Add the regression test plus an extended brute-force test fixing 2-4 players with same-club pairs (reuse/adapt the oracle under
  ${SCR}/audit/draft-completion-solver/ and ${SCR}/audit/verify-completion-club-rookie/). Keep runtime of the test suite reasonable.
- survival-odds: the draft is over; implement only a cheap honest fix (e.g. label the odds as uncalibrated, or a calibration fitted on the
  real 18.10 picks if small and tested). Skip with reason if not worth it.
- Keep the draft tab behaviour documented in docs/ACCEPTANCE.md unless a verified bug.'''),
dict(group='projection-inputs',
 files='scripts/build_default_database.py, scripts/espn_context.py, scripts/espn_team_context.py, scripts/complete_forecasts.py, scripts/rookie_model.py, scripts/projection_model.py (ONLY apply() and the functions it calls for combining ESPN and model, injury/return handling, origins, rookie routing: do NOT change fitting, Ranges, Availability or evaluate - another agent does), tests for these (new tests/test_projection_inputs.py)',
 keys=['espn-parser-missing-stat','espn-free-agents','preseason-known-absence','earlier-drafted-debutants','role-prior-floors'],
 notes='''- Owner decision 4: for ESPN_MODEL_COMBINED players games = (model games + ESPN games)/2; the chain is anchored to that mean; set
  forecast.gamesBasis='MEAN_ESPN_MODEL' and update the basis text; keep forecast.sources.model.games and forecast.sources.espn.games.
  Keep forecast.availability.unconditionalGames = games NOT conditioned on the current injury report (the season-availability group relies
  on it for the post-return share).
- espn-parser-missing-stat: an omitted ESPN stat whose value is 0 must not discard the whole projection (validate what is required, treat
  missing optional zero-valued stats as 0 only where the verifiers proved ESPN omits zeros).
- espn-free-agents: free agents / not-on-roster players must not get roster-conditional projected games silently; follow verifier plan.
- preseason-known-absence: model-only players with an ESPN long absence/return date or out-for-season pre-season must get games consistent
  with it (and the same healthy-start logic), labelled.
- earlier-drafted-debutants: earlier-drafted players debuting now get the draft-pick model with their real pick.
- You cannot rebuild the whole pipeline (it needs CI checkpoints), but you can run scripts/projection_model.py on a COPY of the deployed
  database inside your worktree's public/data (gitignored) to check apply() output: report before/after for affected players.
- The build gate (projection_model.py __main__: pairedGain95 lower end > 0) must still hold: run "python3 scripts/projection_model.py
  --report-only" at the end (about 100 s) and report holdout numbers.'''),
dict(group='projection-model',
 files='scripts/projection_model.py (fitting: History/age, share regression, Ranges/conformal, forward, evaluate, rookie_rows/examples_for, teammate_correlation, slot_values, game_spread; NOT apply()), scripts/availability_model.py, tests/test_projection_model.py, tests/test_availability_model.py, tests/test_forecast_intervals.py, new tests/test_projection_fixes.py',
 keys=['missing-birthdates','centre-bias','chain-anchor-degenerate','health-by-logs','range-coverage','rookie-ranges','rookie-training-rows','teammate-corr-grouping','slot-value-math','availability-estimator'],
 notes='''- Every model change must be measured forward on the held-out 2025/26 (and 2024/25 forward where cheap): season MAE, per-game MAE, games MAE,
  mean bias (add bias to evaluate() output, overall and by age band), 80% coverage. Adopt a change only if it improves or is neutral on MAE
  and reduces bias; report before/after numbers in issues[].what and docNotes. The publishing gate (pairedGain95 lower end > 0) must hold.
- missing-birthdates: impute age from draft year / debut (verifier-measured) + indicator instead of age 27 / dropping rows.
- centre-bias: survivor-season indicator in the share regression and a monotone (hinge) age term clamped like the curves; add bias metrics.
- chain-anchor-degenerate: keep a frailty spread when the target games are near the season length (bisection lower bound / mean=min(games,
  L-2) per verifiers), so ranges are not [82,82].
- health-by-logs: availability_model hazards() returns the player's own decayed counts; projection_model writes
  forecast.availability.ownShortPer82 / ownLongPer82 (null below a minimum of available games), availableGames, forecastScale, keeping
  hazards (scaled) for the in-season chain. NOTE apply() is owned by projection-inputs: write these fields in the function that builds the
  availability dict if it lives outside apply(); if they can only be written inside apply(), put the exact code in crossGroupNotes.
- range-coverage: calibrate the season range on the deployed construction (healthy-start chain for opener players), optionally Mondrian by
  group, so held-out coverage is ~80%; publish per-group coverage in the report.
- rookie-ranges / rookie-training-rows / teammate-corr-grouping / slot-value-math / availability-estimator: per verifier plans, low priority;
  skip any that would destabilise the model, with reason.
- Run "python3 scripts/projection_model.py --report-only" before and after (about 100 s each; 4 CPUs shared - do not run more than one at a
  time) and put the key holdout numbers before/after in checks.'''),
dict(group='collection',
 files='scripts/collect_sports_current.py, scripts/season_watch.py, src/rules.js (ONLY checkRules rookie doubt for market-only players), tests/test_sports_current.py, tests/test_season_watch.py, tests/rules.test.js (append), new tests/test_collection_fixes.py',
 keys=['game-points-calendar','quality-guard-games','merge-overwrites','injury-feed-outage','sportsru-week-free','market-only-rookie','transfer-day-credit'],
 notes='''- game-points-calendar: points of a played game from the row's own score first, the calendar only as fallback; publish the count of games
  without a result; season-end cutoff by date not by zero FP (verifier plan).
- transfer-day-credit (collection side): add "tip" (UTC ISO tip-off time) to every club calendar game in the snapshot (from ESPN team
  schedules or the scoreboard, matched by Moscow date and opponent) and copy it onto each player game row; a failed tip fetch must never
  fail the collection. The season-availability group consumes g.tip.
- injury-feed-outage: when the ESPN injury fetch fails, keep the previous snapshot's injuries and publish a flag espnInjuriesOk=false (and
  the time of the last good fetch), never an empty map that reads as "everyone healthy".
- quality-guard-games / merge-overwrites / sportsru-week-free: per verifier plans.
- market-only-rookie: in src/rules.js checkRules, a roster whose only possible rookie has unknown status (NOT_SHOWN_BY_SPORTS_RU) is a doubt
  (lawyer check), not a certain breach; add a rules test. Keep league-feed behaviour otherwise identical.
- Network: tests must not hit the network; you may do one light GET to inspect an ESPN schedule format if needed.'''),
dict(group='docs-truth',
 files='docs/ACCEPTANCE.md, docs/SCORING_AUDIT.md, docs/DATA_FOUNDATION.md, README.md, data/league-rules.json, scripts/apply_sports_history.py, scripts/audit_scoring.py, scripts/verify-build.js (log text only), src/insights.js (Sports.ru trend logic only), tests/test_sports_history.py, tests/test_scoring_audit.py, new tests/test_docs_truth.py',
 keys=['doc-number-drift','sports-bonus-compare','scoring-audit-self','yahoo-minutes-grey','espn-games-unvalidated','season-ui-stale-text','season-accuracy-dead','yahoo-slot-fit','raw-data-defects','holdout-selection'],
 notes='''- Fix every false, stale or unverifiable claim the audit confirmed in docs/ACCEPTANCE.md, SCORING_AUDIT.md, DATA_FOUNDATION.md and
  README.md (README status line too). Do not invent new numbers: use the current audit outputs (public/data/*audit*.json, the scratchpad
  projection report) or remove the number. Mark superseded sections as superseded instead of deleting history.
- Owner decisions: record in data/league-rules.json scoringFormula.participation = "EXACT_MINUTES" (decided 21.10.2026), sharedPlayers
  scoring = first holder only, games basis for ESPN players = mean of ESPN and model, objective = expected points + place probabilities.
- sports-bonus-compare (data side): scripts/apply_sports_history.py computes per season fblPerGame = Sports.ru per game minus that season's
  mean team result bonus (from data/raw/career_games.parquet home/result) and uses it for sportsCheck; src/insights.js trends use fblPerGame
  when both seasons have it. Keep the Sports.ru number for display.
- scoring-audit-self: rename the check as a consistency check and add an external check against Sports.ru season totals (verifier plan),
  keeping fields verify-build.js asserts.
- holdout-selection / raw-data-defects / season-accuracy-dead / yahoo-slot-fit: document honestly as limitations (no code change needed).
- Do not describe changes made by other groups (the orchestrator adds a final dated section after merging).''')]
json.dump(G,open('fix-groups.json','w'),ensure_ascii=False,indent=1)
pairs=[['season-availability','docs-truth'],['season-transfers','draft-engine'],['projection-model','collection'],['projection-inputs','season-ui']]
by={g['group']:g for g in G}
for p in pairs:print(json.dumps({'groups':[by[x] for x in p]},ensure_ascii=False).replace('${SCR}','/tmp/claude-0/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/scratchpad'),file=open('fixargs-'+p[0]+'.json','w'))
print('ok')
