export const meta = {
  name: 'fbl-verify-clusters',
  description: 'Independently verify deduplicated FBL audit issues (reproduce + skeptic lenses) and produce fix specs',
  phases: [
    { title: 'Verify', detail: 'one or two independent verifiers per issue' },
  ],
}

const SCR = '/tmp/claude-0/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/scratchpad'
const CONTEXT = `
You are an independent verifier in an adversarial audit of the "FBL Draft Intelligence" repository at /home/user/Nba-draft-simulator
(branch claude/full-model-audit = latest main f5c0328). Auditors reported issues; your job is to decide which are real, how much they
matter, and what the minimal correct fix is. Do not trust the auditors.

DOMAIN (short): FBL fantasy league 2026/27, 8 teams; draft 18.10.2026 on Sports.ru (picks src/fbl-draft-2026.js); roster exactly 2 per
Sports.ru position (PG SG SF PF C), >=1 rookie, <=2 per NBA club, cap 20000, white rule (data/fbl-league.json), FBL 3 transfers per week
(Mon-Sun Moscow date), transfers only 08:00-22:00 MSK, pre-season free until 20.10 21:30 MSK, a player on one FBL team only. Scoring on
Yahoo (category totals, no minutes category) with the FBL formula PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF+(2 if min>=10 else 1);
the Sports.ru team result bonus was removed on 20.10.2026. Today is 2026-10-20 (NBA season starts tonight). Rules: data/league-rules.json;
claimed methods: docs/ACCEPTANCE.md.

DATA: public/data/*.json = the CURRENT deployed GitHub Pages data (default-draft.json generatedAt 2026-10-20T12:41Z, built from f5c0328; it
has NO teamResult terms). Older pre-#84 copies are in ${SCR}/site/old/ (ignore unless relevant). Live Sports.ru/ESPN snapshot from branch
data/season-live: ${SCR}/site/live-sports-current.json (+ live-injury-history.json, live-league-state.json, live-notify-state.json).
${SCR}/site/projection-report-only.json = stdout of "python3 scripts/projection_model.py --report-only" (~100 s CPU; reuse it).
Raw logs data/raw/*.parquet. Tools: node 22, python3 + numpy + pyarrow. The auditors' scratch scripts are under ${SCR}/audit/ (you may
read them, but write your own reproduction).

THE ISSUE TEXT: the auditor findings are in ${SCR}/synth/findings.json (a JSON list; each item has id, title, severity, kind, location,
claim, evidence, impact, fix). Earlier verifier verdicts (if any) are in ${SCR}/synth/verdicts.json. Read the items whose ids you are
given.

HARD RULES: audit only - never modify files inside /home/user/Nba-draft-simulator, never change git state, never run pipeline scripts that
write to public/ or data/, never send Telegram or network POSTs, never run league-feed.mjs / notify-transfers.mjs / league-announce.mjs /
league-log.mjs / season_watch.py. Scratch work only in ${SCR}/verify2/<your-label>/ (mkdir -p). 6 agents share 4 CPUs: no full model
refits unless decisive. Be efficient: aim for a decisive reproduction in about 15-25 tool calls.

Your final answer is structured data for the orchestrator, not a message to a human.
`

const VERDICT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    reasoning: { type: 'string' },
    reproduction: { type: 'string', description: 'what you ran and the actual output (short)' },
    userImpact: { type: 'string', description: 'concrete effect on what the user sees or decides, with magnitudes' },
    needsOwnerDecision: { type: 'boolean', description: 'true if the correct behaviour depends on a league rule the owner must decide' },
    ownerQuestion: { type: 'string', description: 'the exact question for the league owner, or empty' },
    fixFiles: { type: 'array', items: { type: 'string' } },
    fixPlan: { type: 'string', description: 'minimal correct code-level fix, precise enough to implement; empty if refuted' },
    testPlan: { type: 'string', description: 'regression test(s) to add' },
  },
  required: ['verdict', 'severity', 'reasoning', 'reproduction', 'userImpact', 'needsOwnerDecision', 'ownerQuestion', 'fixFiles', 'fixPlan', 'testPlan'],
}
const BATCH = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, ...VERDICT.properties }, required: ['key', ...VERDICT.required] } } },
  required: ['items'],
}

const LENS = {
  reproduce: `LENS: REPRODUCE. Re-derive the issue from the code and the current data yourself and run your own reproduction. CONFIRMED only
if you observe the defect (or, for an improvement, verify the benefit is real and material). REFUTED if unreachable, already handled,
intended and documented by the league owner, or negligible. PLAUSIBLE if real but unproven/immaterial.`,
  skeptic: `LENS: SKEPTIC (math/domain). Try hard to refute: is the statistical / probabilistic / game-theoretic reasoning right? Is the
proposed alternative really better for this league (8 teams, total FBL points, Sports.ru rules, Yahoo scoring)? Is the behaviour an
explicit owner decision (data/league-rules.json, ACCEPTANCE)? Does the magnitude survive realistic inputs on the current data? Default to
REFUTED on a misreading, PLAUSIBLE if real but immaterial.`,
}

const items = args.items
phase('Verify')
const out = await parallel(items.map(it => async () => {
  if (it.batch) {
    const r = await agent(`${CONTEXT}
${LENS.reproduce}
You verify a BATCH of low-severity issues; judge each separately and return one item per key.
${it.batch.map(b => `- key ${b.key}: ${b.title} (finding ids ${b.ids.join(', ')})`).join('\n')}`, { label: `verify:${it.key}`, phase: 'Verify', schema: BATCH })
    return { key: it.key, batch: true, items: r ? r.items : null }
  }
  const votes = await parallel(it.lenses.map(lens => () => agent(`${CONTEXT}
${LENS[lens]}
ISSUE ${it.key} (claimed severity ${it.severity}): ${it.title}
Finding ids (the same issue reported from several angles): ${it.ids.join(', ')}`, { label: `verify:${it.key}:${lens}`, phase: 'Verify', schema: VERDICT })))
  return { key: it.key, votes: votes.filter(Boolean) }
}))
return out
