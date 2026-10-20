#!/bin/sh
# Refresh collected verdicts and push the audit state to branch claude/audit-state (retries on network errors).
S=/tmp/claude-0/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/scratchpad
cd $S/synth && python3 collect_verify2.py >/dev/null
cp STATE.md findings.json clusters.json coverage.json verdicts.json verify2.json verify2-status.json verify-groups.json \
   verify-clusters.js deep-audit.js collect_verify2.py extract.py clusters.py save-state.sh $S/state-wt/ 2>/dev/null
cd $S/state-wt && git add -A && git -c user.name='Claude' -c user.email='noreply@anthropic.com' commit -qm "Audit state $(date -u +%FT%TZ)" || true
for d in 2 4 8 16 0; do git push -q -u origin claude/audit-state && exit 0; [ $d = 0 ] && exit 1; sleep $d; done
