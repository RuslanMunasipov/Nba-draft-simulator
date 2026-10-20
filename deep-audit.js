export const meta = {
  name: 'fbl-deep-audit',
  description: 'Deep multi-agent audit of FBL draft and season scoring/forecast systems with adversarial verification',
  phases: [
    { title: 'Audit', detail: 'one deep auditor per dimension' },
    { title: 'Verify', detail: 'independent reproduce/refute per finding' },
    { title: 'Critic', detail: 'completeness critic finds uncovered zones' },
    { title: 'Gaps', detail: 'audit and verify uncovered zones' },
  ],
}

const SCR = '/tmp/claude-0/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/scratchpad'
const CONTEXT = `
You are part of a multi-agent, adversarial audit of the "FBL Draft Intelligence" repository at /home/user/Nba-draft-simulator
(branch claude/full-model-audit = latest main f5c0328). The owner ordered a complete audit of ALL scoring and forecasting
systems for the draft and the season: bugs, math/statistics errors, "hallucinations" (claims in docs/UI/Telegram text that the
code or data do not support, invented numbers, stale text), blind and grey zones the user never saw, and improvements backed by
probability theory, statistics, optimisation and game theory. Quality bar: "ultra" - nothing plausible-but-wrong.

DOMAIN
- FBL fantasy basketball league 2026/27: 8 teams, 10-round linear draft held 18.10.2026 on Sports.ru (picks: src/fbl-draft-2026.js),
  roster = exactly 2 PG, 2 SG, 2 SF, 2 PF, 2 C by Sports.ru single positions, >=1 rookie, <=2 players of one NBA club, cap 20000
  (Sports.ru prices), "white rule" (>=1 player on the league's list in data/fbl-league.json), FBL transfer limit 3 per week (Mon-Sun Moscow
  date), transfers only 08:00-22:00 Moscow; pre-season transfers free until 20.10 21:30 MSK. A player may be on only one FBL team.
- Scoring: Yahoo mirrors rosters and keeps standings (rotisserie category totals: GP, FGA, FGM, FTA, FTM, PTS, REB, AST, ST, BLK, TO, PF;
  no minutes category; no bench; daily roster changes; scoring 2026-10-20..2027-04-11), "the league counts them with the FBL formula".
  FBL per-game formula = PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF + (2 if minutes>=10 else 1). The Sports.ru team result bonus
  (+2/+3 win, -3/-2 loss) was REMOVED on 20.10.2026 everywhere (data/league-rules.json scoringFormula). Season games started 2026-10-20 (US);
  today is 2026-10-20, so live data probably has no played games yet - build synthetic cases where needed.
- Key docs: docs/ACCEPTANCE.md (long changelog of claimed methods and numbers), docs/SCORING_AUDIT.md, README.md, data/league-rules.json.

DATA YOU CAN USE (read-only)
- public/data/*.json: the deployed GitHub Pages data (database default-draft.json built 2026-10-20T12:18Z from previous main; audits
  projection-model-audit.json, forecast-audit.json, scoring-audit.json, team-context.json, etc.).
- ${SCR}/site/live-sports-current.json (live Sports.ru collection from branch data/season-live: weeks, clubs calendars, players, the 8 FBL
  teams with rosters/journals/balances, espnInjuries), ${SCR}/site/live-injury-history.json, live-league-state.json, live-notify-state.json.
- ${SCR}/site/projection-report-only.json = stdout of "python3 scripts/projection_model.py --report-only" on current main (takes ~100 s
  of CPU; reuse this file instead of re-running unless you need a modified experiment).
- data/raw/*.parquet game logs (2023-24..2025-26 league seasons; career_games.parquet 2002-2026). Tools: node 22, python3 with numpy and
  pyarrow. Tests: "npm test" (~25 s), "python3 -m unittest discover -s tests -p 'test_*.py'".

HARD RULES
- AUDIT ONLY. Never modify, create or delete files inside /home/user/Nba-draft-simulator (other agents share this checkout). Never run
  git commands that change state. Write scratch scripts/outputs only under ${SCR}/audit/<your-label>/ (mkdir -p it).
- Never run pipeline scripts that write into public/ or data/ (e.g. projection_model.py WITHOUT --report-only, build_*.py, apply_*.py,
  complete_forecasts.py, collect_*.py with default output paths). To experiment, import functions from a scratch script
  (sys.path.insert(0,'/home/user/Nba-draft-simulator/scripts'); run with cwd=/home/user/Nba-draft-simulator because paths are relative)
  or copy the file into your scratch dir and point it at copies.
- Never send Telegram or any network POST; never run scripts/league-feed.mjs, notify-transfers.mjs, league-announce.mjs, league-log.mjs,
  season_watch.py. Network GETs to ESPN/Sports.ru are allowed only if truly needed and must be light.
- Be CPU-considerate: 8 agents share 4 CPUs. Avoid full model refits unless the experiment is decisive.

EVIDENCE STANDARD
- A finding needs concrete evidence: exact file:line, the code path, and preferably an executed reproduction (a node -e / python3
  snippet with its actual output, or numbers computed from the real data). State magnitudes (FP per game, FP per season, rank changes,
  probability error, number of players affected). If you could not execute it, say so and lower confidence.
- Leads listed in your task are hypotheses, not facts - many will turn out fine; put those in verifiedCorrect with one line of proof.
- Do not report pure style, naming or refactoring opinions. Do report: wrong results, unsound statistics, invalid probability claims,
  leakage, mis-specified objectives, silently wrong edge cases, unit/timezone errors, stale or false claims shown to users, and
  improvements with a clear quantified or theoretical benefit (say how to measure it).
- Severity: critical = materially wrong numbers/decisions shown to the user (e.g. wrong transfer/draft advice, wrong rule verdicts,
  >0.5 FP/game bias for many players, broken probabilities); high = wrong for a meaningful subset or a significant method flaw;
  medium = real but limited impact; low = minor; info = noteworthy observation.
- Your final answer is data for the orchestrator (structured output), not a message to a human.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'one-line statement of the defect or improvement' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          kind: { type: 'string', enum: ['bug', 'math-error', 'hallucination', 'grey-zone', 'blind-spot', 'improvement', 'doc-mismatch', 'data-error'] },
          location: { type: 'string', description: 'file:line references, comma separated' },
          claim: { type: 'string', description: 'precise description of what is wrong and why' },
          evidence: { type: 'string', description: 'reproduction commands and their actual outputs, or computed numbers' },
          impact: { type: 'string', description: 'who/what is affected and by how much' },
          fix: { type: 'string', description: 'concrete code-level fix or experiment to adopt the improvement' },
          confidence: { type: 'number' },
        },
        required: ['title', 'severity', 'kind', 'location', 'claim', 'evidence', 'impact', 'fix', 'confidence'],
      },
    },
    verifiedCorrect: { type: 'array', items: { type: 'string' }, description: 'things checked and found correct, one line of proof each' },
    notChecked: { type: 'array', items: { type: 'string' }, description: 'what could not be checked and why' },
  },
  required: ['findings', 'verifiedCorrect', 'notChecked'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
    reasoning: { type: 'string' },
    reproduction: { type: 'string', description: 'what you ran and the actual output' },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    refinedFix: { type: 'string', description: 'the minimal correct fix, or empty if refuted' },
  },
  required: ['verdict', 'reasoning', 'reproduction', 'severity', 'refinedFix'],
}

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'short kebab-case label' },
          prompt: { type: 'string', description: 'self-contained audit task: files, functions, hypotheses to test' },
        },
        required: ['key', 'prompt'],
      },
    },
  },
  required: ['gaps'],
}

const group = args.group
const dims = args.dims

function auditPrompt(d) {
  return `${CONTEXT}
YOUR DIMENSION: ${d.title}  (label: ${group}/${d.key})
${d.prompt}

Method: read every listed file completely (and anything they call), trace the data flow end to end, then try to break it: edge cases,
units, off-by-one, time zones, empty/missing data, distribution assumptions, estimator bias, leakage between fit and test, selection
effects, objective mis-specification. Execute reproductions. Also look beyond the leads: the most valuable findings are the ones
nobody listed. Aim for depth over count; 4-15 solid findings is typical. Return structured output.`
}

function verifyPrompt(f, d, lens) {
  const lensText = lens === 'reproduce'
    ? `LENS: REPRODUCE. Independently re-derive the claim from the code and data. Write and run your own reproduction (do not just
re-run the finder's snippet). CONFIRMED only if you observe the defect yourself (or, for an improvement, you verify the claimed benefit
is real and material). If the code path is unreachable, already handled elsewhere, intended and documented, or the magnitude is
negligible, say REFUTED.`
    : `LENS: SKEPTIC (math/domain). Try hard to REFUTE: is the statistical/mathematical/game-theoretic reasoning actually right? Is the
"correct" alternative really better for this league's objective (8 teams, total FBL points, Sports.ru rules)? Is it intended behaviour
documented by the league owner in data/league-rules.json or docs/ACCEPTANCE.md? Does the impact survive realistic inputs? Default to
REFUTED when the claim rests on a misreading; PLAUSIBLE when real but unproven or immaterial.`
  return `${CONTEXT}
You are an independent verifier. Another agent reported the finding below in dimension "${d.title}". Do not trust it.
${lensText}

FINDING
title: ${f.title}
severity claimed: ${f.severity}; kind: ${f.kind}; location: ${f.location}
claim: ${f.claim}
evidence given: ${f.evidence}
impact claimed: ${f.impact}
proposed fix: ${f.fix}

Return verdict, your reasoning, your own reproduction with actual output, the severity you would assign, and the minimal correct fix
(code-level; must not break other documented behaviour).`
}

function combine(f, votes) {
  const v = votes.filter(Boolean)
  if (!v.length) return 'UNVERIFIED'
  const c = v.filter(x => x.verdict === 'CONFIRMED').length
  const r = v.filter(x => x.verdict === 'REFUTED').length
  if (v.length === 1) return v[0].verdict
  if (r === 0 && c >= 1) return 'CONFIRMED'
  if (c >= 1 && r >= 1) return 'DISPUTED'
  if (r >= 1) return 'REFUTED'
  return 'PLAUSIBLE'
}

async function verifyFinding(f, d, phaseName) {
  const lenses = (f.severity === 'critical' || f.severity === 'high') ? ['reproduce', 'skeptic'] : ['reproduce']
  const votes = await parallel(lenses.map(lens => () =>
    agent(verifyPrompt(f, d, lens), { label: `verify:${d.key}:${lens}:${(f.title || '').slice(0, 40)}`, phase: phaseName, schema: VERDICT_SCHEMA })))
  return { ...f, dimension: d.key, votes: votes.filter(Boolean), final: combine(f, votes) }
}

phase('Audit')
const results = await pipeline(
  dims,
  d => agent(auditPrompt(d), { label: `audit:${d.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA }),
  async (res, d) => {
    if (!res) return { dimension: d.key, title: d.title, failed: true, findings: [], verifiedCorrect: [], notChecked: [] }
    log(`${d.key}: ${res.findings.length} findings to verify`)
    const verified = await parallel(res.findings.map(f => () => verifyFinding(f, d, 'Verify')))
    return { dimension: d.key, title: d.title, findings: verified.filter(Boolean), verifiedCorrect: res.verifiedCorrect, notChecked: res.notChecked }
  },
)

phase('Critic')
const summary = results.filter(Boolean).map(r => `## ${r.dimension} (${r.title})\nFindings:\n` +
  r.findings.map(f => `- [${f.final}/${f.severity}] ${f.title} @ ${f.location}`).join('\n') +
  `\nVerified correct:\n` + (r.verifiedCorrect || []).map(x => `- ${x}`).join('\n') +
  `\nNot checked:\n` + (r.notChecked || []).map(x => `- ${x}`).join('\n')).join('\n\n')
const critic = await agent(`${CONTEXT}
You are the completeness critic for audit group "${group}". The dimensions and their outcomes so far:
${dims.map(d => `- ${d.key}: ${d.title}`).join('\n')}

${summary}

Identify up to 4 important zones of THIS group's scope that were NOT covered or were only superficially covered (files or functions
nobody read, claims nobody checked, code paths with no finding and no verifiedCorrect entry, items in notChecked that are actually
checkable). Read the code yourself to confirm each gap is real before listing it. Each gap must come with a self-contained audit
prompt (files, functions, concrete hypotheses). Return an empty list if coverage is genuinely complete.`, { label: `critic:${group}`, phase: 'Critic', schema: CRITIC_SCHEMA })

const gapDims = (critic?.gaps || []).slice(0, 4).map(g => ({ key: 'gap-' + g.key, title: 'Gap: ' + g.key, prompt: g.prompt }))
log(`critic found ${gapDims.length} gaps`)
const gapResults = await pipeline(
  gapDims,
  d => agent(auditPrompt(d), { label: `audit:${d.key}`, phase: 'Gaps', schema: FINDINGS_SCHEMA }),
  async (res, d) => {
    if (!res) return null
    const verified = await parallel(res.findings.map(f => () => verifyFinding(f, d, 'Gaps')))
    return { dimension: d.key, title: d.title, findings: verified.filter(Boolean), verifiedCorrect: res.verifiedCorrect, notChecked: res.notChecked }
  },
)

const all = [...results, ...gapResults].filter(Boolean)
const counts = {}
for (const r of all) for (const f of r.findings) counts[f.final] = (counts[f.final] || 0) + 1
log(`done: ${JSON.stringify(counts)}`)
return { group, counts, results: all }
