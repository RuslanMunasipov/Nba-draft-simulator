"""Season watcher: FBL transfer journals every minute, the full Sports.ru collection every two hours.
A new journal row triggers the Telegram notifier and a publish within about a minute,
so a player released by a rival is reported before the next full collection.
Usage: season_watch.py <sports-current.json> <notify-state.json> [--minutes 345] [--every 60] [--full-every 120]
"""
import argparse,json,os,signal,subprocess,sys,time
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
    # The stored rows carry seenAt (when the watcher first saw them); Sports.ru rows do not.
    # Rows of one date come in no stable order, so journals are compared as sorted lists.
    bare=lambda rows:sorted(json.dumps({k:v for k,v in r.items() if k not in ('seenAt','seenAfter')},ensure_ascii=False,sort_keys=True) for r in rows or [])
    return [t for t,rows in fresh.items() if bare(rows)!=bare(old.get(t,{}).get('journal')) and len(rows)>=len(old.get(t,{}).get('journal') or [])]
def mark_read(snapshot,fresh):
    """Remember when each journal was last read unchanged: a row that appears later was made after that read, which
    bounds the time of the transfer (FBL allows transfers only from 08:00 to 22:00 Moscow time)."""
    bare=lambda rows:sorted(json.dumps({k:v for k,v in r.items() if k not in ('seenAt','seenAfter')},ensure_ascii=False,sort_keys=True) for r in rows or [])
    stamp=now()
    for t,rows in fresh.items():
        entry=snapshot.get('teams',{}).get(t)
        if entry and bare(rows)==bare(entry.get('journal')):entry['journalReadAt']=stamp
    return snapshot
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
        stamp=now();previous=snapshot['teams'].get(t) or {}
        entry['journal']=sports.stamp_journal(previous.get('journal'),fresh[t],now=stamp,after=previous.get('journalReadAt'))
        entry['journalReadAt']=stamp;snapshot['teams'][t]=entry
    snapshot['teamsCheckedAt']=now()
    return snapshot

def telegram(text):
    """A plain service message to the FBL chat; silently skipped without the secrets."""
    token,chat=os.environ.get('TELEGRAM_BOT_TOKEN'),os.environ.get('TELEGRAM_CHAT_ID')
    if not token or not chat:return
    from datetime import datetime,timedelta,timezone
    text+=f"\n\n🕒 Отправлено: {datetime.now(timezone(timedelta(hours=3))).strftime('%d.%m.%Y, %H:%M')} МСК"
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
    def full(self,limit=40*60):
        try:result=subprocess.run([sys.executable,'scripts/collect_sports_current.py',str(self.live)],timeout=limit)
        except subprocess.TimeoutExpired:print('full collection timed out',flush=True);return False
        return result.returncode==0 and self.live.exists()
    def notify(self):
        """The league feed first, saved to GitHub at once (it is what must never repeat), then the personal advice."""
        self.feed();self.publish(f'League feed state {now()}')
        self.personal()
    def feed(self):
        # The league chat's feed: every transfer with the rules check, remembered in its own state file.
        try:result=subprocess.run(['node','scripts/league-feed.mjs',str(self.live),str(self.live.parent/'league-state.json')],timeout=10*60)
        except subprocess.TimeoutExpired:print('league feed timed out',flush=True);return
        if result.returncode:print(f'league feed failed with exit code {result.returncode}',flush=True)
    def personal(self):
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
        for name in ('injury-history.json','league-state.json'):
            if (folder/name).exists():git('add',name)
        git('commit','-qm',message,'--allow-empty')
        # What was posted must reach GitHub: the next run starts from it, and a lost state would post again.
        for attempt in range(4):
            pushed=subprocess.run(['git','-C',str(folder),'push','-qf',f'https://x-access-token:{token}@github.com/{repo}.git','data/season-live'],check=False)
            if not pushed.returncode:return True
            print(f'publish failed with exit code {pushed.returncode} (attempt {attempt+1})',flush=True);time.sleep(2**attempt*3)
        return False

def main():
    a=argparse.ArgumentParser();a.add_argument('live');a.add_argument('state')
    a.add_argument('--minutes',type=float,default=345);a.add_argument('--every',type=float,default=60);a.add_argument('--full-every',type=float,default=120)
    args=a.parse_args();w=Watch(args.live,args.state);config=teams_config()
    # A cancelled run (GitHub sends SIGINT, then SIGTERM) saves what was posted before it goes, so the next run never
    # posts it again.
    def leave(sig,frame):
        print(f'stopping on signal {sig}: saving state',flush=True)
        try:w.publish(f'Watch stopped {now()}')
        finally:sys.exit(0)
    signal.signal(signal.SIGINT,leave);signal.signal(signal.SIGTERM,leave)
    stop=time.time()+args.minutes*60;next_full=0
    while time.time()<stop:
        left=stop-time.time()
        # A full collection never starts so late that it could outlive the run: a run killed by its job timeout would
        # skip the step that starts the next run and break the chain.
        if time.time()>=next_full and left>15*60:
            ok=w.full(limit=min(40*60,left-5*60));w.collected(ok)
            if ok:
                w.notify();w.publish(f'Sports.ru live snapshot {now()}')
            # A failed collection retries soon; the journals keep being watched on the last snapshot.
            next_full=time.time()+(args.full_every if ok else 10)*60
        elif w.live.exists():
            snapshot=json.loads(w.live.read_text(encoding='utf-8'))
            fresh=journals(config);teams=changed_teams(snapshot,fresh);mark_read(snapshot,{t:r for t,r in fresh.items() if t not in teams})
            if teams:
                print(f'{now()} new journal rows: teams {teams}',flush=True)
                w.live.write_text(json.dumps(apply(snapshot,fresh,teams,config),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
                w.notify();w.publish(f'FBL transfer journals {now()} (teams {",".join(teams)})')
            else:
                # Nothing new: only the time of this read is kept (locally; it is published with the next change).
                w.live.write_text(json.dumps(snapshot,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        time.sleep(max(0,min(args.every,stop-time.time())))
    # The run hands over to the next one: everything posted is saved first.
    w.publish(f'Watch run ended {now()}')

if __name__=='__main__':main()
