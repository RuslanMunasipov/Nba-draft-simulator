"""The FBL scoring formula as the league counts it on Yahoo (league settings shown by the owner, 21.10.2026):
PTS + REB + AST + ST + BLK + FGM - FGA + FTM - FTA - 2*TO - PF, plus 1 for every game played (GP).
Sports.ru's own formula, behind its season totals, its prices and its per-game points, gives +2 for 10 minutes or
more (+1 below) and the team result bonus instead: sports_participation keeps that rule for the comparisons with it."""
GAME_PLAYED=1
def fbl_points(s):
    """FBL points of one game: the league's official formula, the only truth for FBL points (league owner, 22.10.2026),
    whatever source the box score comes from. s: pts, reb, ast, stl, blk, fgm, fga, ftm, fta, tov, pf."""
    return s['pts']+s['reb']+s['ast']+s['stl']+s['blk']-(s['fga']-s['fgm'])-(s['fta']-s['ftm'])-2*s['tov']-s['pf']+GAME_PLAYED
def participation(minutes=None):
    """FBL points for having played a game: one per GP, whatever the minutes."""
    return GAME_PLAYED
def sports_participation(minutes):
    """Sports.ru's term for having played: +2 for 10 minutes or more, +1 below."""
    return 2 if minutes>=10 else 1
