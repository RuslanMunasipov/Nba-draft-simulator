export const meta = {
  name: 'fbl-review-combined-fix',
  description: 'Adversarial review of the combined audit-fix diff (6 dimensions) with independent verification of each finding',
  phases: [
    { title: 'Review', detail: 'one reviewer per area of the combined diff' },
    { title: 'Verify', detail: 'independent skeptic per finding' },
  ],
}
const SCR = '/tmp/claude-0/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/scratchpad'
const WT = SCR + '/review-wt'
const CONTEXT = `
You review the COMBINED diff of an audit-fix branch of the "FBL Draft Intelligence" repository before it is merged.
Frozen checkout: ${WT} (commit 967f2c6; node_modules linked; public/data = the deployed data of 20.10 12:41Z). Base = origin/main.
See the diff with: git -C ${WT} diff origin/main...HEAD -- <paths>. Eight independent agents fixed verified audit issues in parallel worktrees;
their branches were merged with conflict resolution by the orchestrator. Integration bugs between groups are the main risk: two groups
assuming different field names or semantics, double application of one correction, a fix in one module undone in another, merge
resolution mistakes, tests that pass only because fixtures dodge the real path.

DOMAIN (short): FBL fantasy league 2026/27, 8 teams; Sports.ru draft/transfers/prices; roster 2 per Sports.ru position, >=1 rookie, <=2 per
NBA club, cap 20000, white rule; 3 FBL transfers/week Mon-Sun MSK, 08:00-22:00 MSK; scoring on Yahoo with the FBL formula
PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF+(2 if min>=10 else 1), no team result bonus. Owner decisions 21.10: exact-minutes
participation; a shared player scores only for the first holder (ambiguous order: both, as a doubt); advice maximises expected points and
the standings show P(1st)/P(top-3); games of ESPN-covered players = mean of ESPN and model games.
What each group did is in ${SCR}/synth/fix-results.json (per group: issues fixed, crossGroupNotes, docNotes, risks). Read the risks and
crossGroupNotes of the groups touching your area FIRST - they name what to double-check.

RULES: read-only. Never modify ${WT} or /home/user/Nba-draft-simulator; scratch work only under ${SCR}/review2/<label>/. You may run tests
(cd ${WT}; npm test; python3 -m unittest ...) and node/python snippets against ${WT}. Do not run projection_model.py without
--report-only (and avoid it at all unless decisive; ~7 min CPU). No network POSTs, no Telegram.
Report only real defects with a concrete reproduction (input -> wrong output) or a precise proof from the code; no style opinions. Severity:
critical = wrong numbers/advice/rule verdicts users see, or a CI/deploy break; high = wrong for a meaningful subset; medium/low otherwise.
Your final answer is structured data.`

const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
  location: { type: 'string' }, claim: { type: 'string' }, reproduction: { type: 'string' }, fix: { type: 'string' } },
  required: ['title', 'severity', 'location', 'claim', 'reproduction', 'fix'] } },
  checkedOk: { type: 'array', items: { type: 'string' } } }, required: ['findings', 'checkedOk'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }, reasoning: { type: 'string' }, reproduction: { type: 'string' },
  fix: { type: 'string' } }, required: ['verdict', 'severity', 'reasoning', 'reproduction', 'fix'] }

const AREAS = [
  { key: 'season-core', prompt: `AREA: src/season.js (all changes: stints/inStint/tipOf/shadowed, teamPoints, perGame with participation split and offsets, playRate with injuries and spellMisses, chainCurve, injuryFactor GTD, seasonEnding, expectedPoints incl. CUP fill and ctx.now, withBoxScores (from PR #87) interplay with g.tip and the new inStint, liveGamePoints unsure/counting, gameWeeks) and data/inseason-calibration.json + scripts/inseason_calibration.py (JS estimator must equal the Python one: tests/fixtures/inseason-golden.json). Check the transfer-day rule end to end with journal transfers (seenAt/seenAfter), the shared-player first-holder logic vs src/rules.js firstHolder, and that the injury double-count fix uses forecast.availability.unconditionalGames as the projection-inputs group now writes it (with knownAbsence and gamesBasis MEAN_ESPN_MODEL).` },
  { key: 'season-advice', prompt: `AREA: src/season.js transfer functions (bestPackage include/exclude, acquisition edge, recommendPackage/pickPackage, confidencePercent/Level, pointsSpread without narrowing, transferVerdict confidence and package legs: netChange/dealGroups/packageVerdict, contestedBy, transferWindow, clubRoom in packages) and their callers in src/season-ui.js (recommendation, packageCard, optionRow) and scripts/notify-transfers.mjs (decide(), the merged keys/fresh logic, injuryState). Build adversarial rosters from the live snapshot (${SCR}/site/live-now.json) and check: suggestions legal (positions, club<=2, cap/bank, rookie, white, uniqueness, transfers left), UI and Telegram give the same package and the same %, no 'Сделай'/'забирай' below 70%, no crash on edge inputs (no transfers left, empty market, injured-only targets).` },
  { key: 'season-ui', prompt: `AREA: src/season-ui.js (non-advice parts), src/standings.js (placeProbabilities, leagueRace, teamPlace, periodWindows, windowFact), src/forecast-text.js, src/database.js seasonCatalog, src/main.js season wiring and forecast texts, src/insights.js, scripts/telegram-format.mjs. Check: the P(1st)/P(top-3) Monte Carlo (correct variance per team, sums to 1 / 3, deterministic, includes running ESPN points once, uses fact points through the new inStint), windowFact vs the old teamFact semantics (transfer-day, shared players), the overlay of PR #87 (withBoxScores via scoreBoxes) still feeding all fact numbers after the season-ui rewrite, 20 s live polling (PR #89) intact, method texts true to the code (no stale 10-game prior, Sports.ru-with-bonus labels, ESPN/model mean games wording only when gamesBasis says so), and the season tab reading the installed catalog. Run the app logic in node against public/data + the live snapshot to render key numbers if feasible.` },
  { key: 'model', prompt: `AREA: scripts/projection_model.py and scripts/availability_model.py (both groups: projection-inputs changed apply() - ESPN/model mean games, known absences via the ESPN report and club schedules, draft_pick for earlier-drafted debutants, conditionalOnRoster - and projection-model changed fitting - age imputation, survivor indicator and linear clamped age in the share regression, HEALTHY_SHIFT refit, MIN_SCALE chain floor, deployed-construction Mondrian range calibration, absence_history own rates, rookie levels/residuals, teammate_correlation with history), plus scripts/espn_context.py, scripts/espn_team_context.py (schedule), scripts/build_default_database.py (injury report merge), scripts/pack_online_evidence.py. Integration risks: apply() of one group calling Availability/Ranges APIs whose signature or semantics the other group changed (distribution(... L=left, healthy=True), info fields, Ranges.interval group keys, rookies.interval with games_scale, healthy_mean capped at L); absence_history running after apply() on knownAbsence/season-ending chains (hazards present? division by zero?); fields the JS reads (forecast.availability.unconditionalGames, ownShortPer82, gamesBasis, knownAbsence, conditionalOnRoster) actually written for every relevant origin. A full model run on a copy of the deployed DB is at ${SCR}/fullrun (model.log, public/data/default-draft.json after apply, projection-model-audit.json) - use it instead of re-running.` },
  { key: 'collection-rules', prompt: `AREA: scripts/collect_sports_current.py (row score first, gamesWithoutResult, season-end cutoff by date, tip times from ESPN schedules copied to player game rows, injury fetch outage keeping the previous report with espnInjuriesOk/espnInjuriesAt, quality guard on games/calendar, transfersUnlimited clearing), scripts/season_watch.py (merge does not overwrite newer watcher fields), src/rules.js (rookie doubt for market-only players; isDoubt), scripts/league-feed.mjs and scripts/notify-transfers.mjs consumers of these fields (do NOT run them against the network; you may import pure functions). Check the snapshot schema the JS expects (g.tip, espnInjuriesOk) is exactly what the collector writes, failure paths never publish empty/zero data as fresh, and league-feed verdicts for real past deals (the live snapshot's journals) are unchanged except the intended rookie doubt.` },
  { key: 'draft-docs', prompt: `AREA: (a) draft engine: src/completion.js (forced rookie club capacity from the original fixed set, white option), src/engine.js, src/simulation.js (rookiesLeftAfter, LCG seeding), src/plan.js, src/rookie-watch.js, src/rookies.js, src/main.js draft flow (LIVE override for rivals, re-pick gate via replaceCompletion, whiteFor, real-draft seeding from DRAFT_PICKS) - verify with randomized brute force against an independent oracle (cases with fixed same-club pairs, rookies, white list, caps) and that the real 80-pick draft replays legally; (b) docs truth: docs/ACCEPTANCE.md, docs/SCORING_AUDIT.md, docs/DATA_FOUNDATION.md, README.md, data/league-rules.json - every number/method stated in the new or edited text must match the code and the outputs (${SCR}/fullrun/public/data/projection-model-audit.json is the CURRENT model's holdout after all fixes; the docs may still quote the 20.10 deployed figures - flag every figure that the merged code no longer produces, e.g. coverage 74.6% vs ~79.1% now, season bias, slot figures, healthy-start numbers).` },
]

phase('Review')
const results = await pipeline(
  AREAS,
  a => agent(`${CONTEXT}\n${a.prompt}\nReturn every real defect you can reproduce; list what you checked and found correct in checkedOk.`, { label: `review:${a.key}`, phase: 'Review', schema: FINDINGS }),
  async (r, a) => {
    if (!r) return { area: a.key, failed: true, findings: [] }
    log(`${a.key}: ${r.findings.length} findings`)
    const verified = await parallel(r.findings.map(f => () => agent(`${CONTEXT}
You are an independent skeptic. A reviewer reported this defect in area ${a.key}. Try hard to refute it; reproduce it yourself.
CONFIRMED only if you observe it; REFUTED if unreachable, intended (owner decision/doc), or a misreading; PLAUSIBLE if real but unproven.
FINDING: ${f.title}
severity: ${f.severity}; location: ${f.location}
claim: ${f.claim}
reproduction given: ${f.reproduction}
proposed fix: ${f.fix}
Return your verdict, severity, reasoning, your own reproduction and the minimal correct fix.`, { label: `verify:${a.key}:${f.title.slice(0, 40)}`, phase: 'Verify', schema: VERDICT })
      .then(v => ({ ...f, area: a.key, verdict: v }))))
    return { area: a.key, findings: verified.filter(Boolean), checkedOk: r.checkedOk }
  },
)
const all = results.filter(Boolean)
const counts = {}
for (const r of all) for (const f of r.findings) { const k = f.verdict?.verdict || 'UNVERIFIED'; counts[k] = (counts[k] || 0) + 1 }
log('review done: ' + JSON.stringify(counts))
return { counts, results: all }
