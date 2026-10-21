export const meta = {
  name: 'fbl-fix-groups',
  description: 'Implement verified FBL audit fixes in isolated worktrees, one agent per file group, with tests',
  phases: [{ title: 'Fix', detail: 'one implementer per file group in its own git worktree' }],
}

const SCR = '/tmp/claude-0/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/scratchpad'
const REPO = '/home/user/Nba-draft-simulator'
const COMMON = `
You implement verified fixes from a multi-agent audit of the "FBL Draft Intelligence" repository. You run inside your OWN git worktree
(your current working directory; check with "pwd" and "git rev-parse --show-toplevel"). The base is main f5c0328.

DOMAIN (short): FBL fantasy league 2026/27, 8 teams; draft 18.10.2026 on Sports.ru (picks src/fbl-draft-2026.js); roster exactly 2 per
Sports.ru position, >=1 rookie, <=2 per NBA club, cap 20000, white rule, FBL 3 transfers a week (Mon-Sun Moscow date), transfers only
08:00-22:00 MSK, pre-season free until 20.10 21:30 MSK, a player on one FBL team only. Scoring on Yahoo with the FBL formula
PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF+(2 if min>=10 else 1); no team result bonus since 20.10.2026.

LEAGUE OWNER DECISIONS (21.10.2026, binding):
1. Participation bonus stays EXACT by minutes (+2 at 10+ min, else +1).
2. A player bought while another FBL team holds him: his points go ONLY to the first holder; the later buyer's slot scores 0 for those
   games until the breach is repaired. When the first holder cannot be determined (purchases in one watcher window, see rules.js
   firstHolder), keep crediting both and say it is under the lawyer's check.
3. Advice keeps maximising expected points; ADD Monte Carlo probabilities of 1st place and of top-3 for every team in the standings.
4. Games for ESPN-covered players = the mean of ESPN's projected games and the model's games (as originally documented), not ESPN alone.

WHERE THE AUDIT IS: ${SCR}/synth/findings.json (raw findings F001-F176: claim, evidence, fix), ${SCR}/synth/clusters.json (issue keys ->
finding ids), ${SCR}/synth/verify2.json (verifier verdicts per key with fixPlan/testPlan/reasoning), ${SCR}/synth/verdicts.json (earlier
verifier verdicts, label "verify:<dimension>:<lens>:<title prefix>"), ${SCR}/synth/final-status.json. For each issue key you own, read the
findings AND all verdicts first. Verifier fix plans are strong suggestions, not orders: implement the minimal CORRECT fix; if you find a
better or safer fix, or that a plan would break documented behaviour or tests, deviate and say why.

DATA: the deployed data is in ${REPO}/public/data/ (gitignored, current, generatedAt 2026-10-20T12:41Z); live Sports.ru snapshot in
${SCR}/site/live-sports-current.json (+ live-injury-history.json). To run code that needs public/data or node_modules in your worktree:
"ln -s ${REPO}/node_modules node_modules" and "mkdir -p public && cp -r ${REPO}/public/data public/data" (both gitignored; never commit
them). Python has numpy and pyarrow. Do not touch ${REPO} itself (other agents and the orchestrator use it) - work only in your worktree.

RULES
- Edit only the files of your group (listed below) plus NEW test files. If a fix needs a change in a file owned by another group, do not
  make it: describe it in crossGroupNotes. Never edit docs/*.md or README.md (the docs group owns them): put what the docs must say, with
  exact numbers, in docNotes.
- Match the surrounding code style: terse one-line JS, comments stating why, Russian UI strings in the existing tone.
- Add regression tests for every behaviour fix (prefer NEW test files named after your group, e.g. tests/<group>.test.js or
  tests/test_<group>.py, to avoid merge conflicts; small edits to existing tests only when an expectation must change - say which and why).
- Run before committing: "npm test" (node --test tests/*.test.js) and "python3 -m unittest discover -s tests -p 'test_*.py'" and, if you
  touched src/, "npm run build". All must pass. If a pre-existing test must change, justify it.
- Never send Telegram, never push, never run league-feed.mjs / notify-transfers.mjs against the network, never run collectors that write
  to the repo's data/ with network results.
- Commit your work on a NEW branch named audit-fix/<group> (git checkout -b audit-fix/<group>; git add -A minus symlinks/public;
  commit with a clear message per logical fix or one commit with a bullet list). Make sure "git status" is clean afterwards except for
  the gitignored links. Do not merge or rebase anything.

Your final answer is structured data for the orchestrator.
`

const RESULT = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    headSha: { type: 'string' },
    worktree: { type: 'string', description: 'absolute path of your worktree' },
    issues: { type: 'array', items: { type: 'object', properties: {
      key: { type: 'string' }, outcome: { type: 'string', enum: ['fixed', 'partially-fixed', 'skipped', 'not-a-bug'] },
      what: { type: 'string', description: 'what changed and why, with before/after numbers when measured' },
      tests: { type: 'string', description: 'tests added or changed' } }, required: ['key', 'outcome', 'what', 'tests'] } },
    checks: { type: 'string', description: 'commands run and their pass/fail summary' },
    crossGroupNotes: { type: 'string' },
    docNotes: { type: 'string', description: 'what docs/ACCEPTANCE.md etc. must now say, with numbers' },
    risks: { type: 'string', description: 'anything a reviewer should double-check' },
  },
  required: ['branch', 'headSha', 'worktree', 'issues', 'checks', 'crossGroupNotes', 'docNotes', 'risks'],
}

phase('Fix')
const out = await parallel(args.groups.map(g => () => agent(`${COMMON}
YOUR GROUP: ${g.group}
FILES YOU OWN: ${g.files}
ISSUE KEYS (all verified): ${g.keys.join(', ')}
${g.notes}`, { label: `fix:${g.group}`, phase: 'Fix', schema: RESULT, isolation: 'worktree' })))
return out
