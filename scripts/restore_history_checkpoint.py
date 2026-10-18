"""Restore a checkpoint artifact without running build, tests or deployment.
Artifacts are interim 90-day checkpoints, not the final permanent data store.
"""
import json,os,subprocess,zipfile,tempfile
from pathlib import Path
repo=os.environ['GITHUB_REPOSITORY']
raw=subprocess.check_output(['gh','api',f'repos/{repo}/actions/artifacts?name=history-checkpoint&per_page=100'])
artifacts=json.loads(raw)['artifacts']
current=int(os.environ['GITHUB_RUN_ID'])
previous=[a for a in artifacts if not a['expired'] and a.get('workflow_run',{}).get('id')!=current and a.get('workflow_run',{}).get('head_branch')==os.environ.get('GITHUB_REF_NAME')]
if previous:
 artifact=max(previous,key=lambda a:a['created_at'])
 target=Path('.cache/history');target.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryFile() as handle:
  subprocess.run(['gh','api',f"repos/{repo}/actions/artifacts/{int(artifact['id'])}/zip"],stdout=handle,check=True)
  handle.seek(0)
  with zipfile.ZipFile(handle) as archive:
   for info in archive.infolist():
    path=(target/info.filename).resolve()
    if not path.is_relative_to(target.resolve()):raise ValueError('Unsafe artifact member')
   archive.extractall(target)
 print('Restored evidence checkpoint',artifact['id'],artifact['created_at'])
else:print('No retained checkpoint; starting a new collection')
