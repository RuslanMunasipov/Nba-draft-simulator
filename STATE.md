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
3. IN PROGRESS — Cluster verification (verify2): 3 workflow runs, script
   `fbl-verify-clusters` (copy: `verify-clusters.js`), args = the three groups in `verify-groups.json`.
   Run ids: wf_f9f9960f-ac0 (group 0), wf_0bd91bc0-8ac (group 1), wf_a7958ca7-ba4 (group 2).
   Verdicts so far: `verify2.json` (cluster key → list of verdicts with fixPlan/testPlan/ownerQuestion). Progress: `verify2-status.json`.
4. TODO — Fixes, grouped by files (one agent per group, git worktrees, then merge into claude/full-model-audit):
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
