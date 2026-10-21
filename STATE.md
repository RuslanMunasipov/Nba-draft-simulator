# FBL full audit — resumable state

Owner's order (20.10.2026): complete audit of every scoring and forecasting system for the draft and the season — bugs, math/statistics
errors, hallucinations (claims not backed by code/data), blind and grey zones, improvements (probability, statistics, optimisation, game
theory); many parallel agents; then fix. Repo rule (CLAUDE.md): after pushing, open the PR and squash-merge into main right away after
`npm test`, `npm run build` and the touched Python tests pass.

Base: main f5c0328. Working branch for fixes: `claude/full-model-audit`. This branch (`claude/audit-state`) holds only this state.

## Phases
1. DONE — Audit: 4 workflows, 15 dimensions → 176 raw findings (`findings.json`, ids F001–F176). Coverage notes: `coverage.json`.
   Session limit killed most first-round verifiers; their partial verdicts are in `verdicts.json`.
2. DONE — Dedup: 77 clusters (`clusters.json`: key, title, finding ids, severity, status). status CONFIRMED/REFUTED/DISPUTED = already
   decided by first-round verifiers; null = needs verification.
3. DONE — Cluster verification (verify2): 3 workflow runs, script
   `fbl-verify-clusters` (copy: `verify-clusters.js`), args = the three groups in `verify-groups.json`.
   Run ids: wf_f9f9960f-ac0 (group 0), wf_0bd91bc0-8ac (group 1), wf_a7958ca7-ba4 (group 2).
   Verdicts so far: `verify2.json` (cluster key → list of verdicts with fixPlan/testPlan/ownerQuestion). Progress: `verify2-status.json`.
4. IN PROGRESS — Fixes, grouped by files (specs: fix-groups.json; script fix-groups.js; runs wf_2a2b0d3e-b79 [season-availability, docs-truth], wf_b5b6bb25-075 [season-transfers, draft-engine], wf_5d493399-715 [projection-model, collection], wf_e0589d74-0e4 [projection-inputs, season-ui]; each agent commits on branch audit-fix/<group> in its own worktree; resume with resumeFromRunId and the same args from fixargs-*.json) (one agent per group, git worktrees, then merge into claude/full-model-audit):
   - season core (src/season.js + tests/season.test.js): transfer-day credit, injury double count, playRate clamp, seasonEnding regex,
     GTD start, NBA Cup fill, zero hazards, return-date TZ, arrival games, gain split, acquisition edge, recommendPackage shared by UI
     and Telegram, verdict confidence, confidence recalibration
   - season UI / Telegram (src/season-ui.js, scripts/notify-transfers.mjs, telegram-format.mjs): stale texts, thresholds wording,
     pre-season ∞, ties, 4-week label, season tab from installed catalog (src/main.js render → seasonCatalog)
   - draft engine (src/completion.js, engine.js, simulation.js, main.js draft parts): forced-rookie club cap, rookiesLeftAfter,
     LIVE override, re-pick gate, white rule gate, LCG seeding
   - projection model (scripts/projection_model.py, availability_model.py, ESPN parser): birth-date imputation, share regression
     survivor dummy + monotone age, range calibration on deployed construction, chain anchoring bound, own logged hazards for display,
     earlier-drafted debutants, rookie rows, ESPN free agents, ESPN zero-stat parser
   - collection (scripts/collect_sports_current.py, season_watch.py): row score first, quality guard on games, merge overwrite,
     injury-feed outage
   - truth in docs/UI (ACCEPTANCE, SCORING_AUDIT, README, main.js texts, apply_sports_history.py no-bonus reference, insights.js,
     audit_scoring.py naming + external check)
5. TODO — Review combined diff adversarially; run npm test, npm run build, python unittest, `projection_model.py --report-only` gate.
6. TODO — Push claude/full-model-audit, PR, squash-merge (CLAUDE.md). Russian report artifact for the owner, with owner questions
   (Yahoo participation constant, transfer-day credit on Yahoo, ESPN games vs model games, objective P(1st)).

## How to resume after a limit / restart
- If a verify run died: `Workflow({scriptPath: <verify-clusters.js path>, resumeFromRunId: <run id>, args: <same group>})` — finished
  agents replay from cache. Then `python3 collect_verify2.py` (in synth/) to refresh verify2.json.
- If the container is gone: `git fetch origin claude/audit-state` and read this file; the journals are lost but every verdict collected
  so far is in verify2.json / verdicts.json. Re-verify only clusters missing from verify2.json.
- Data used by agents: deployed Pages data (re-download `https://ruslanmunasipov.github.io/Nba-draft-simulator/data/<file>` into
  public/data/), live branch `data/season-live`, `python3 scripts/projection_model.py --report-only > projection-report-only.json`.

## Owner decisions (21.10.2026, answered in the session)
- Participation bonus: exact by minutes (+2 at 10+ min, else +1), as now. Record in data/league-rules.json scoringFormula.participation = EXACT_MINUTES.
- Shared player (bought while another FBL team holds him): his points go only to the first holder; the later buyer's slot scores 0 until repaired.
  Purchases in one time window (cannot tell who was first): keep for both + lawyer check (state it).
- Objective: keep expected points for advice; ADD Monte Carlo probabilities of 1st place and top-3 for every team (standings).
- Games for ESPN-covered players: mean of ESPN and model games (as originally documented); fit the weight on 2026/27 with the frozen ESPN snapshot later.

## Integration (in progress)
- Hotfix PR #87 (live ESPN box-score points) merged to main 8f68413 at 02:52Z 21.10 (user asked for online points).
- Branch claude/full-model-audit = origin/main 8f68413 + merges of audit-fix/{docs-truth,collection,projection-inputs,season-transfers,
  season-ui,draft-engine} (conflicts resolved: season-ui imports + table note, notify-transfers imports + fresh keys, main.js imports).
  npm test 257 pass, build ok, python 158 ok (before draft-engine merge).
- All 8 groups merged (+ main #89 live refresh 20 s). Local: npm 278 pass, build ok, python 192 ok, full projection run on deployed copy: gate holds (gain95 14.9-40.3), coverage80 0.791, seasonBias +4.1, payload 3.26 MB.
- NEXT: CI on PR #88, then adversarial review workflow over the combined diff, fix confirmed review findings, update ACCEPTANCE final section, PR description, squash-merge, Russian report.
- Not pushed yet: claude/full-model-audit is local. If the container is lost, recreate it by merging the audit-fix/* branches
  (they exist only locally too!) -> push them first.
- Review: workflow run wf_d5b2cffc-28f (script review.js) on frozen worktree scratchpad/review-wt @967f2c6; resume with resumeFromRunId.
- Review split (04:20Z): wf_d5b2cffc-28f resumed [season-core, season-advice]; wf_03eb5e36-c98 [season-ui, model]; wf_117da8df-523 [collection-rules, draft-docs]; script review.js takes args.areas. CI green on ece9307 (PR #88). Hotfixes merged to main: #87 live ESPN points, #89 20 s refresh, #90 live stat lines + season panel; merged into audit branch.
- 07:10Z: Yahoo formula screenshot from owner: GP=+1 per game played (not +2/+1 by minutes). Implementing across the system on claude/full-model-audit. Remaining reviewers (collection-rules, draft-docs) rerun as wf_885a01d4-281 on review-wt@24c6897. Review results: synth/review-results.json (collect_review.py).
- 07:55Z: formula +1/GP committed 3fa0e89 (all Python/JS/tests/docs; calibration refit; golden regenerated); R21 fixed dd6a52a
  (collector keep_played + rebuild from player rows, `gone` flag, periodList rebuilds missing tours); ACCEPTANCE figures of the
  +1 build (MAE 231 vs 257, gain 14.2-38.1, cov 79.3%, deployed bias -40). Both pushed (PR #88).
- Review fix workflows: wf_e843cb60-4a2 [season-core R10,R11,R12/33,R14,R15,R16,R18/07,R19,R20; season-ui R22/13,R26-29,R39],
  wf_85863c51-544 [telegram R01-R08,R23,R34; model R30-32,R35,R38,R40]; script workflows/scripts/fbl-review-fix-wf_e843cb60-4a2.js;
  branches audit-fix2/<group>. Then merge, checks, ACCEPTANCE final section, merge #88 (before 04:00Z 22.10).
- Still running: wf_885a01d4-281 (collection-rules, draft-docs review).
