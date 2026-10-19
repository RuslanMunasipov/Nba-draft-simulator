"""Season watcher: FBL transfer journals every minute, the full Sports.ru collection every two hours.
A new journal row triggers the Telegram notifier and a publish within about a minute,
so a player released by a rival is reported before the next full collection.
Usage: season_watch.py <sports-current.json> <notify-state.json> [--minutes 345] [--every 60] [--full-every 120]
"""
import argparse,json,os,subprocess,sys,time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from pathlib import Path
try:
    import collect_sports_current as sports
except ImportError:
    from scripts import collect_sports_current as sports

def now():return datetime.now(timezone.utc).isoformat(timespec='seconds')
def teams_config():return json.loads(sports.TEAMS.read_text(encoding='utf-8')).get('teams',{})
def journals(config):
    """Current journal of every team; a team whose page fails this round is left out, not emptied."""
    def one(item):
        team,sid=item
        try:page=sports.fetch(sports.JOURNAL_URL.format(id=sid))
        except Exception as e:  # noqa: BLE001
            print(f'journal {team}: {e}',flush=True);return team,None
        return team,(sports.parse_journal(page) if page else None)
    with ThreadPoolExecutor(8) as ex:return {t:j for t,j in ex.map(one,config.items()) if j is not None}
def changed_teams(snapshot,fresh):
    """Teams whose journal differs from the published snapshot. A shorter journal is a failed parse, not a reversal."""
    old=snapshot.get('teams',{})
    return [t for t,rows in fresh.items() if rows!=old.get(t,{}).get('journal') and len(rows)>=len(old.get(t,{}).get('journal') or [])]
def apply(snapshot,fresh,teams,config):
    for t in teams:
        entry=dict(snapshot.setdefault('teams',{}).get(t) or {'sportsTeamId':config[t]})
        try:
            profile=sports.fetch(sports.TEAM_URL.format(id=config[t]))
            if profile:entry.update(sports.parse_team(profile))
            roster=sports.fetch(sports.ROSTER_URL.format(id=config[t]))
            if roster:entry['roster']=sports.parse_roster(roster)
        except Exception as e:  # noqa: BLE001
            print(f'team {t}: {e}',flush=True)
        entry['journal']=fresh[t];snapshot['teams'][t]=entry
    snapshot['teamsCheckedAt']=now()
    return snapshot

def telegram(text):
    """A plain service message to the FBL chat; silently skipped without the secrets."""
    token,chat=os.environ.get('TELEGRAM_BOT_TOKEN'),os.environ.get('TELEGRAM_CHAT_ID')
    if not token or not chat:return
    import urllib.request
    try:
        req=urllib.request.Request(f'https://api.telegram.org/bot{token}/sendMessage',data=json.dumps({'chat_id':chat,'text':text}).encode(),headers={'content-type':'application/json'})
        urllib.request.urlopen(req,timeout=20).read()
    except Exception as e:  # noqa: BLE001
        print(f'telegram: {e}',flush=True)

class Watch:
    # After this many failed collections in a row (about 30 minutes) the chat is told the data is stale, once.
    ALERT_AFTER=3
    def __init__(self,live,state):
        self.live,self.state=Path(live),Path(state);self.failures=0
    def collected(self,ok):
        """Track consecutive failures: one alert when data goes stale, one when it recovers."""
        if ok:
            if self.failures>=self.ALERT_AFTER:telegram('✅ Сбор Sports.ru снова работает: данные свежие.')
            self.failures=0;return
        self.failures+=1
        if self.failures==self.ALERT_AFTER:
            telegram(f'⚠️ Сбор Sports.ru не удаётся {self.failures} раза подряд: цены, очки и трансферы в помощнике могут быть устаревшими. '
                     'Вероятно, Sports.ru изменил страницы или ограничил запросы.')
    def full(self):
        try:result=subprocess.run([sys.executable,'scripts/collect_sports_current.py',str(self.live)],timeout=40*60)
        except subprocess.TimeoutExpired:print('full collection timed out',flush=True);return False
        return result.returncode==0 and self.live.exists()
    def notify(self):
        # The notifier remembers what it reported in the state file; a failure must not stop the watch, but is logged.
        try:result=subprocess.run(['node','scripts/notify-transfers.mjs',str(self.live),str(self.state)],timeout=10*60)
        except subprocess.TimeoutExpired:print('notifier timed out',flush=True);return
        if result.returncode:print(f'notifier failed with exit code {result.returncode}',flush=True)
    def publish(self,message):
        token=os.environ.get('GH_TOKEN');repo=os.environ.get('GITHUB_REPOSITORY')
        if not token or not repo:print('publish skipped: no GH_TOKEN/GITHUB_REPOSITORY',flush=True);return
        folder=self.live.parent;git=lambda *a:subprocess.run(['git','-C',str(folder),*a],check=True)
        if not (folder/'.git').exists():
            git('init','-q','-b','data/season-live')
            git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com')
        git('add',self.live.name);
        if self.state.exists():git('add',self.state.name)
        git('commit','-qm',message,'--allow-empty')
        pushed=subprocess.run(['git','-C',str(folder),'push','-qf',f'https://x-access-token:{token}@github.com/{repo}.git','data/season-live'],check=False)
        if pushed.returncode:print(f'publish failed with exit code {pushed.returncode}',flush=True)

def main():
    a=argparse.ArgumentParser();a.add_argument('live');a.add_argument('state')
    a.add_argument('--minutes',type=float,default=345);a.add_argument('--every',type=float,default=60);a.add_argument('--full-every',type=float,default=120)
    args=a.parse_args();w=Watch(args.live,args.state);config=teams_config()
    stop=time.time()+args.minutes*60;next_full=0
    while time.time()<stop:
        if time.time()>=next_full:
            ok=w.full();w.collected(ok)
            if ok:
                w.notify();w.publish(f'Sports.ru live snapshot {now()}')
            # A failed collection retries soon; the journals keep being watched on the last snapshot.
            next_full=time.time()+(args.full_every if ok else 10)*60
        elif w.live.exists():
            snapshot=json.loads(w.live.read_text(encoding='utf-8'))
            fresh=journals(config);teams=changed_teams(snapshot,fresh)
            if teams:
                print(f'{now()} new journal rows: teams {teams}',flush=True)
                w.live.write_text(json.dumps(apply(snapshot,fresh,teams,config),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
                w.notify();w.publish(f'FBL transfer journals {now()} (teams {",".join(teams)})')
        time.sleep(max(0,min(args.every,stop-time.time())))

if __name__=='__main__':main()
