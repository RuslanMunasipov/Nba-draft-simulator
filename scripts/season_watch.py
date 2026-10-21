"""Season watcher: FBL transfer journals every minute, the full Sports.ru collection every two hours.
A new journal row triggers the Telegram notifier and a publish within about a minute,
so a player released by a rival is reported before the next full collection.
Usage: season_watch.py <sports-current.json> <notify-state.json> [--minutes 345] [--every 60] [--full-every 120]
"""
import argparse,json,os,shutil,signal,subprocess,sys,time
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
    """Teams whose journal differs from the published snapshot. Fewer events is a failed parse, not a reversal."""
    old=snapshot.get('teams',{})
    # Journals are compared as multisets of events (date, side, name, price): the stored rows carry the watcher's stamps
    # and keep the day's earlier pairing, Sports.ru lists a date's rows in no stable order and re-pairs them.
    ev=sports.journal_events
    return [t for t,rows in fresh.items() if ev(rows)!=ev(old.get(t,{}).get('journal')) and sum(ev(rows).values())>=sum(ev(old.get(t,{}).get('journal')).values())]
def mark_read(snapshot,fresh,stamp=None):
    """Remember when each journal was last read unchanged: a row that appears later was made after that read, which
    bounds the time of the transfer (FBL allows transfers only from 08:00 to 22:00 Moscow time). The stamp is the time
    the read began: a deal made while the pages were being fetched may be missing from them."""
    stamp=stamp or now()
    for t,rows in fresh.items():
        entry=snapshot.get('teams',{}).get(t)
        if entry and sports.journal_events(rows)==sports.journal_events(entry.get('journal')):entry['journalReadAt']=stamp
    return snapshot
# A team's profile as Sports.ru shows it, read as one page (parse_team).
PROFILE=('name','value','balance','transfersLeft','transfersUnlimited','place','of','deadline','week')
def merge_full(full,cur):
    """The full collection's snapshot, with each team's journal as the minute watcher knows it: the watcher read the
    journals while the collection ran, so its rows (and their pairing) and their times stand; events only the collection
    saw are stamped as new (by sale and purchase, as everywhere). The profile (bank, transfers left) and the roster are
    the later read's: a deal the watcher applied meanwhile read them after the collection did."""
    if not cur:return full
    for t,entry in (full.get('teams') or {}).items():
        mine=(cur.get('teams') or {}).get(t)
        # Stamps compare as text (one ISO format); a copy without one (older data) never wins.
        later=lambda key:mine and mine.get(key) and mine[key]>(entry.get(key) or '')
        if later('profileReadAt'):
            for k in PROFILE:
                if k in mine:entry[k]=mine[k]
                else:entry.pop(k,None)
            entry['profileReadAt']=mine['profileReadAt']
        if later('rosterReadAt') and mine.get('roster'):entry['roster'],entry['rosterReadAt']=mine['roster'],mine['rosterReadAt']
        if not mine or not mine.get('journal'):continue
        # Every event the collection saw is already known (it read the journal earlier): the watcher's journal stands.
        if not sports.journal_events(entry.get('journal'))-sports.journal_events(mine['journal']):entry['journal']=mine['journal']
        else:entry['journal']=sports.stamp_journal(mine['journal'],entry.get('journal'),now=full.get('collectedAt') or entry.get('journalReadAt'),after=mine.get('journalReadAt'))
        entry['journalReadAt']=max(filter(None,(mine.get('journalReadAt'),entry.get('journalReadAt'))),default=None)
    # A player the watcher took from a roster (new to the market) stays known: the collection may have started before.
    # One whose page failed keeps his last entry, marked stale, with only its box-scored games as FBL points: an older
    # collector's rows (Sports.ru's ФО, 0 till it counts a game) cannot be scored again without the page.
    players=full.setdefault('players',{})
    for sid,p in (cur.get('players') or {}).items():
        if sid not in players:players[sid]=p if p.get('fromRoster') else {**p,'stale':True,'games':sports.unscored([dict(g) for g in p.get('games') or []])}
    return full
def unscore_old_rows(snapshot):
    """The snapshot a run starts from may be an older collector's: its played rows carry Sports.ru's ФО (0 till it counts
    a game, then its own formula), never FBL points. They wait for the first full collection without points, so a
    journal change published meanwhile never shows them as FBL's."""
    for p in ((snapshot or {}).get('players') or {}).values():sports.unscored(p.get('games'))
    return snapshot
# A team whose roster cannot be read waits for it this many reads at most (one a minute).
HOLD=3
def apply(snapshot,fresh,teams,config,read_from=None,held=None):
    """New rows of the changed teams: seenAt is now (after the read), the next lower bound is when the read began.
    The exact players of a new deal come from the roster change, so a team whose roster read fails or comes back empty
    is held: its journal stays as it was and the next read reports it again. held counts each team's such reads in a
    row (the caller keeps it); the HOLD-th applies the rows without exact players. Teams still held are left in held."""
    held=held if held is not None else {}
    for t in teams:
        entry=dict(snapshot.setdefault('teams',{}).get(t) or {'sportsTeamId':config[t]})
        # When this read began: merge_full keeps the later of this profile and roster and the full collection's.
        read=now()
        try:
            profile=sports.fetch(sports.TEAM_URL.format(id=config[t]))
            got=sports.parse_team(profile) if profile else {}
            # ∞ is the pre-season counter: a number read now ends it (parse_team marks only ∞).
            if 'transfersLeft' in got and not got.get('transfersUnlimited'):entry.pop('transfersUnlimited',None)
            entry.update(got)
            if 'balance' in got:entry['profileReadAt']=read
        except Exception as e:  # noqa: BLE001
            print(f'team {t}: {e}',flush=True)
        try:
            roster=sports.fetch(sports.ROSTER_URL.format(id=config[t]));roster=sports.parse_roster(roster) if roster else None
        except Exception as e:  # noqa: BLE001
            print(f'team {t} roster: {e}',flush=True);roster=None
        if roster:held.pop(t,None);entry['roster'],entry['rosterReadAt']=roster,read
        else:
            held[t]=held.get(t,0)+1
            # Without the roster a namesake («Уайт», «Джонсон») would resolve to the wrong player.
            if held[t]<HOLD:print(f'team {t}: roster unread, new rows held ({held[t]})',flush=True);continue
            print(f'team {t}: roster unread {held[t]} times in a row, new rows applied without exact players',flush=True);held.pop(t)
        stamp=now();previous=snapshot['teams'].get(t) or {}
        # The exact players of a new deal come from the roster change, only when the roster was read just now.
        entry['journal']=sports.stamp_journal(previous.get('journal'),fresh[t],now=stamp,after=previous.get('journalReadAt'),
                                              old_roster=previous.get('roster'),new_roster=entry.get('roster') if roster else None)
        entry['journalReadAt']=read_from or stamp;snapshot['teams'][t]=entry
        # A player new to the Sports.ru market is known from the roster until the next full collection lists him.
        for p in (entry.get('roster') or []) if roster else []:
            if p.get('sportsId') and p.get('price') and p.get('position') and p['sportsId'] not in snapshot.setdefault('players',{}):
                snapshot['players'][p['sportsId']]={'name':p.get('name'),'fullName':p.get('name'),'club':p.get('club'),'position':p['position'],
                                                    'price':p['price'],'initialPrice':p['price'],'fromRoster':True}
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

def main_moved(env=None,run=subprocess.run):
    """The new head of the run's branch (main) on GitHub when it is no longer the commit this run checked out, else None:
    a six-hour run would keep its code and data/fbl-league.json till its end. Never in a local run (no GITHUB_SHA or
    GITHUB_REPOSITORY); a failed check is no news. The branch is the run's own, the one the next run starts on."""
    env=os.environ if env is None else env
    sha,repo,branch=env.get('GITHUB_SHA'),env.get('GITHUB_REPOSITORY'),env.get('GITHUB_REF_NAME') or 'main'
    if not sha or not repo:return None
    try:out=run(['git','ls-remote',f'https://github.com/{repo}.git',f'refs/heads/{branch}'],capture_output=True,text=True,timeout=30,env={**env,'GIT_TERMINAL_PROMPT':'0'})
    except Exception as e:  # noqa: BLE001
        print(f'main check: {e}',flush=True);return None
    head=(out.stdout or '').split()[:1]
    return head[0] if not out.returncode and head and head[0]!=sha else None

class Watch:
    # After this many failed collections in a row (about 30 minutes) the chat is told the data is stale, once.
    ALERT_AFTER=3
    def __init__(self,live,state):
        # held: each team whose new rows wait for its roster, with its failed roster reads in a row (see apply).
        self.live,self.state=Path(live),Path(state);self.failures=0;self.held={}
    def collected(self,ok):
        """Track consecutive failures: one alert when data goes stale, one when it recovers."""
        if ok:
            if self.failures>=self.ALERT_AFTER:telegram('✅ Сбор Sports.ru снова работает: данные свежие.')
            self.failures=0;return
        self.failures+=1
        if self.failures==self.ALERT_AFTER:
            telegram(f'⚠️ Сбор Sports.ru не удаётся {self.failures} раза подряд: цены, очки и трансферы в помощнике могут быть устаревшими. '
                     'Вероятно, Sports.ru изменил страницы или ограничил запросы.')
    # The full collection (about four minutes) runs in the background on a copy, so the journals are still read every
    # minute meanwhile; its result is merged into the live snapshot when it ends.
    full_proc=None
    def start_full(self,limit=40*60):
        self.full_path=self.live.with_name('sports-full.json')
        if self.live.exists():shutil.copyfile(self.live,self.full_path)
        self.full_proc=subprocess.Popen([sys.executable,'scripts/collect_sports_current.py',str(self.full_path)])
        self.full_deadline=time.time()+limit
    def poll_full(self):
        """None while the collection runs; then whether it succeeded (its snapshot merged into the live one)."""
        p=self.full_proc
        if p is None:return None
        if p.poll() is None:
            if time.time()<self.full_deadline:return None
            p.kill();p.wait();print('full collection timed out',flush=True);self.full_proc=None;return False
        self.full_proc=None
        if p.returncode or not self.full_path.exists():return False
        full=json.loads(self.full_path.read_text(encoding='utf-8'))
        cur=json.loads(self.live.read_text(encoding='utf-8')) if self.live.exists() else None
        self.live.write_text(json.dumps(merge_full(full,cur),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        return True
    # When the feed or the notifier failed (a network error, Telegram down) the watch runs them again: in a minute, then
    # less often while they keep failing (at most every ten minutes), so a deal is never left for the next journal change.
    failed=0;retry_at=None
    @property
    def retry(self):return self.retry_at is not None and time.time()>=self.retry_at
    def notify(self):
        """The league feed first, saved to GitHub at once (it is what must never repeat), then the personal advice."""
        ok=self.feed();self.publish(f'League feed state {now()}')
        ok=self.personal() and ok
        self.failed=0 if ok else self.failed+1
        self.retry_at=None if ok else time.time()+60*min(10,2**(self.failed-1))
    def run(self,name,script,state):
        try:result=subprocess.run(['node',script,str(self.live),str(state)],timeout=10*60)
        except subprocess.TimeoutExpired:print(f'{name} timed out',flush=True);return False
        if result.returncode:print(f'{name} failed with exit code {result.returncode}',flush=True)
        return not result.returncode
    def feed(self):
        # The league chat's feed: every transfer with the rules check, remembered in its own state file.
        return self.run('league feed','scripts/league-feed.mjs',self.live.parent/'league-state.json')
    def personal(self):
        # The notifier remembers what it reported in the state file; a failure must not stop the watch, but is logged.
        return self.run('notifier','scripts/notify-transfers.mjs',self.state)
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
    # The live branch may still hold an older collector's snapshot: its rows never go out again as FBL points.
    if w.live.exists():w.live.write_text(json.dumps(unscore_old_rows(json.loads(w.live.read_text(encoding='utf-8'))),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    # A cancelled run (GitHub sends SIGINT, then SIGTERM) saves what was posted before it goes, so the next run never
    # posts it again.
    def leave(sig,frame):
        print(f'stopping on signal {sig}: saving state',flush=True)
        try:w.publish(f'Watch stopped {now()}')
        finally:sys.exit(0)
    signal.signal(signal.SIGINT,leave);signal.signal(signal.SIGTERM,leave)
    stop=time.time()+args.minutes*60;next_full=0;next_check=0
    while time.time()<stop:
        # A merge to main hands over to a run on the new code and data (the feed reads the white list from the checkout).
        if time.time()>=next_check:
            next_check=time.time()+5*60;head=main_moved()
            if head:print(f'{now()} {os.environ.get("GITHUB_REF_NAME") or "main"} moved to {head[:7]}: handing over to a run on it',flush=True);break
        left=stop-time.time()
        # A full collection never starts so late that it could outlive the run: a run killed by its job timeout would
        # skip the step that starts the next run and break the chain.
        if w.full_proc is None and time.time()>=next_full and left>15*60:
            w.start_full(limit=min(40*60,left-5*60))
        ok=w.poll_full()
        if ok is not None:
            w.collected(ok)
            if ok:
                w.notify();w.publish(f'Sports.ru live snapshot {now()}')
            # A failed collection retries soon; the journals keep being watched on the last snapshot.
            next_full=time.time()+(args.full_every if ok else 10)*60
        if w.live.exists():
            snapshot=json.loads(w.live.read_text(encoding='utf-8'))
            read_from=now();fresh=journals(config);teams=changed_teams(snapshot,fresh)
            mark_read(snapshot,{t:r for t,r in fresh.items() if t not in teams},read_from)
            # A held team's count is of reads in a row that showed its new rows.
            w.held={t:n for t,n in w.held.items() if t in teams}
            if teams:
                print(f'{now()} new journal rows: teams {teams}',flush=True)
                snapshot=apply(snapshot,fresh,teams,config,read_from,w.held);teams=[t for t in teams if t not in w.held]
            # With nothing new (or only held teams) just the time of this read is kept, locally: published with the next change.
            w.live.write_text(json.dumps(snapshot,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
            if teams:w.notify();w.publish(f'FBL transfer journals {now()} (teams {",".join(teams)})')
            elif w.retry:print(f'{now()} retrying the feed and the notifier',flush=True);w.notify()
        time.sleep(max(0,min(args.every,stop-time.time())))
    # The run hands over to the next one: a collection still running is stopped, everything posted is saved first.
    if w.full_proc and w.full_proc.poll() is None:w.full_proc.kill()
    w.publish(f'Watch run ended {now()}')

if __name__=='__main__':main()
