#!/usr/bin/env python3
"""The transfer-backtest block of docs/ACCEPTANCE.md «Current state», written from the reports the scripts produce:
data/transfer-backtest.json (scripts/transfer_backtest.mjs), data/transfer-backtest-rivals.json (the same with rivals
that use the decision), data/transfer-policy.json (scripts/tune_transfer_policy.mjs) and data/confidence-calibration.json
(scripts/confidence_calibration.mjs). Every figure in the block comes from them; tests/test_docs_truth.py checks the
block is what this script writes.
Usage: backtest_docs.py [--write]   (prints the block; --write puts it between the markers in docs/ACCEPTANCE.md)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / 'docs' / 'ACCEPTANCE.md'
BEGIN, END = '<!-- transfer-backtest:begin -->', '<!-- transfer-backtest:end -->'
H = ['week', 'month', 'season']


def load(name):
    p = ROOT / 'data' / name
    return json.loads(p.read_text()) if p.exists() else None


def tag(s):
    return s.replace('-', '/')


def diff(d):
    return f"{d['mean']:+.0f} ({d['ci95'][0]:.0f} to {d['ci95'][1]:.0f}; {d['better']} of {d['leagues']} leagues better)"


def gains(m, key):
    return ' / '.join(f"{m[h][key]:+.1f}" for h in H)


def share(m):
    return ' / '.join(f"{m[h]['positive']:.1f}%" for h in H)


def brier(v):
    return ' / '.join(f"{v['brier'][h]:.4f}" for h in H)


def scores(ins, key):
    return ' / '.join(f"{ins[h][key]['brier']:.4f}" for h in H)


def render():
    b, pol, cal, riv = load('transfer-backtest.json'), load('transfer-policy.json'), load('confidence-calibration.json'), load('transfer-backtest-rivals.json')
    S = b['seasons']
    seasons = [s for s in S if s != 'all']
    each = lambda key: '; '.join(f"{tag(s)} {diff(S[s]['differences'][key])}" for s in seasons if key in S[s]['differences'])
    pts = lambda p: ', '.join(f"{tag(s)} {S[s]['policies'][p]['points']:.0f}" for s in seasons)
    d = b['design']
    inputs = b.get('inputStats') or {}
    priced = '; '.join(f"{tag(s)} {v['prices']['real']} of {v['population']['players']}" for s, v in inputs.items())
    rule = next(iter(inputs.values()))['prices']['rule'] if inputs else None
    lines = [
        f"- Transfer advice backtest (22.10; inputs `scripts/transfer_backtest_inputs.py`, then `node scripts/transfer_backtest.mjs --inputs .cache/transfer-backtest3 --seeds {d['seeds']} --from-seed {d['fromSeed']} --policies {','.join(d['policies'])}`; report `data/transfer-backtest.json`, the block is written by `scripts/backtest_docs.py`): "
        f"FBL leagues replayed week by week on the {', '.join(tag(s) for s in seasons)} regular seasons with only what was known at each moment: the career model, its ranges, the absence chain and the rookie model fitted on earlier seasons; the in-season update refitted on the two seasons before (from the survivor-selected career logs before 2023/24); "
        f"the NBA's injury report of the day before (`data/nba-injury-reports.json`: status only, no return dates); Sports.ru's price of the day, real for the players Sports.ru still lists ({priced}; the others an opening price modelled on that season's real ones, moved by Sports.ru's rule"
        + (f", +{rule['intercept']:.2f} + {rule['perFblPoint']:.3f} × the game's FBL points" if rule else '') + "), so a bank grows as its players score. "
        f"{d['leaguesPerSeason']} leagues a season ({d['leaguesPerSeason'] // 8} drafts × 8 draft slots), every FBL rule (positions, cap, a rookie, the white rule, 2 per NBA club, 3 transfers a FBL week), decisions on the Moscow Monday and Thursday at 12:00, transfers at the day's prices; rivals: {d['rivals']}. The advice is `src/season.js`'s and `src/transfer-plan.js`'s own code.",
        f"  - The advice as shipped on 22.10 (`recommendPackage` over 4 weeks, made when CONFIDENT) against doing nothing, the same league: {each('current-hold')}; all seasons {diff(S['all']['differences']['current-hold'])} FP a season (95% bootstrap over leagues).",
        f"  - The same rule on the current model (the absence chain started inside a current absence, the calibrated confidence) against the shipped one: {each('currentNewModel-current')}.",
        f"  - The decision (`src/transfer-plan.js`, parameters {json.dumps(pol['params'])}) against the shipped advice: {each('plan-current')}; against doing nothing: {each('plan-hold')}; "
        f"against the old rule on the same model, the part that is the decision itself: {each('plan-currentNewModel')}; all seasons {diff(S['all']['differences']['plan-currentNewModel'])}.",
    ]
    if 'planHeldOut-currentNewModel' in S['all']['differences']:
        cross = pol['crossSeason']
        lines.append(
            f"  - Out of sample: each season played with the parameters chosen on the other seasons' tuning leagues (`node scripts/tune_transfer_policy.mjs`, leagues of seed 5, which this report does not score: "
            + '; '.join(f"{tag(s)} {c['variant']}" for s, c in cross.items())
            + f") against the old rule on the same model: {each('planHeldOut-currentNewModel')}; all seasons {diff(S['all']['differences']['planHeldOut-currentNewModel'])}; against doing nothing {diff(S['all']['differences']['planHeldOut-hold'])}.")
    lines.append(f"  - Season points: doing nothing {pts('hold')}; as shipped {pts('current')}; the old rule on the current model {pts('currentNewModel')}; the decision {pts('plan')}.")
    for p, label in [('current', 'The shipped advice'), ('plan', 'The decision')]:
        x = S['all']['policies'][p]
        m, bb = x['moves'], x.get('buyBacks') or {}
        text = (f"  - {label}'s moves ({x['movesPerSeason']} a season): real gain per move {gains(m, 'meanRealGain')} (FBL week / 4 weeks / rest of the season), "
                f"positive {share(m)} of the time; expected {gains(m, 'meanPredicted')}.")
        if bb:
            text += f" Buy-backs (a player the team sold earlier in the season): {bb['perSeason']} a season"
            text += f", real gain {' / '.join(f'{v:+.1f}' for v in (bb['meanRealGain'][h] for h in H))}." if bb.get('meanRealGain') else '.'
        lines.append(text)
    if b.get('planNegativeSeason'):
        n = b['planNegativeSeason']
        lines.append(f"  - Moves the decision made with a negative expected season gain: {n['count']} of {n['of']}.")
    if riv:
        R = riv['seasons']
        lines.append(f"  - Rivals that use the decision themselves (`--rivals rivalsPlan`, {riv['design']['leaguesPerSeason']} leagues a season, `data/transfer-backtest-rivals.json`): the decision against the old rule on the same model "
                     + '; '.join(f"{tag(s)} {diff(R[s]['differences']['plan-currentNewModel'])}" for s in R if s != 'all' and 'plan-currentNewModel' in R[s]['differences'])
                     + f"; all seasons {diff(R['all']['differences']['plan-currentNewModel'])}.")
    earlier = ' on the earlier backtest of 2024/25-2025/26 (prices fixed, no injury report)' if pol.get('version', 1) < 2 else ''
    lines.append(f"  - Tuning (`data/transfer-policy.json`{earlier}): {len(pol['table'])} variants; shipped {pol['chosen']}; season by season, the variant chosen on the other seasons and its points there against the best there: "
                 + '; '.join(f"{tag(s)} {c['variant']} {c['points']} vs {c['bestHere']} {c['bestHerePoints']}" for s, c in pol['crossSeason'].items()) + '.')
    if cal and 'heldOut' not in cal:
        ins = cal['inSample']
        lines.append(f"  - Confidence (`data/confidence-calibration.json`, fitted on the earlier backtest of 2024/25-2025/26 (prices fixed, no injury report): {cal['method']}): in sample, swaps shown at 70-79% gained "
                     + ', '.join(f"{ins[h]['after']['at70']['actual']}% ({h})" for h in H) + '; fitted on one season and tested on the other: Brier '
                     + '; '.join(f"{tag(t)} " + ' / '.join(f"{v[h]['before']['brier']:.3f} → {v[h]['after']['brier']:.3f}" for h in H) for t, v in cal['crossSeason'].items())
                     + ' (raw → calibrated; week / 4 weeks / season).')
    if cal and 'heldOut' in cal:
        ho, form, ins, cross = cal['heldOut'], cal['form'], cal['inSample'], cal['crossSeason']
        b70 = lambda r: f"{r['at70']['actual']}%" if r.get('at70') else '—'
        params = '; '.join(f"{h} b = {cal['maps'][h]['early']['b']}" for h in H) if form == 'scale' else ''
        lines.append(
            f"  - Confidence (`data/confidence-calibration.json`, `node scripts/confidence_calibration.mjs`): {cal['samples'] // 3:,} candidate swaps per horizon (the best swap for every roster player at every decision of the hold runs) map the model's z (expected gain over its spread) to the share that really gained. "
            f"Each form fitted on two seasons and tested on the third (Brier week / 4 weeks / season, mean over the held-out seasons): "
            + '; '.join(f"{f} {brier(v)}" for f, v in ho.items())
            + f". Shipped: {form}" + (f" (Φ(b·z): {params}; the model's spread is too narrow)" if params else '') + ". "
            f"On all seasons together, swaps shown at 70-79% gained {' / '.join(b70(ins[h]['after']) for h in H)} of the time (week / 4 weeks / season), Brier {scores(ins, 'after')} against {scores(ins, 'before')} for Φ(z); "
            f"deciles of 400+ swaps within {max(abs(d['gap']) for h in H for d in ins[h]['after']['deciles'] if d['n'] >= 400):.1f} points. "
            f"Season by season (fitted on the other two) the share of swaps shown at 70-79% that gained over the season was "
            + ', '.join(f"{tag(t)} {b70(v['season']['after'])}" for t, v in cross.items())
            + ": the seasons differ more than any map fitted on the others can follow, so «70%» is 70% over the three seasons, not in each.")
    lines.append("  - Limits: the NBA's report has no return dates (ESPN's, which the app reads, has); positions of players gone from Sports.ru's market come from their stat profile; 2023/24's fits come from survivor-selected career logs; the rivals follow one rule" + (" (and, as a check, the decision itself)" if riv else '') + "; the leagues of a season share its games, so the bootstrap over leagues understates the uncertainty of a season, and three seasons are three samples.")
    return '\n'.join(lines)


def main():
    block = render()
    if '--write' in sys.argv:
        s = DOC.read_text()
        a, z = s.index(BEGIN) + len(BEGIN), s.index(END)
        DOC.write_text(s[:a] + '\n' + block + '\n' + s[z:])
    print(block)


if __name__ == '__main__':
    main()
