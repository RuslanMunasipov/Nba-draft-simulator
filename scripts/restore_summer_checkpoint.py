"""Restore this branch's previous summer checkpoint; no model execution."""
import json,os,subprocess,tempfile,zipfile
from pathlib import Path
repo=os.environ['GITHUB_REPOSITORY'];current=int(os.environ['GITHUB_RUN_ID'])
artifacts=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/actions/artifacts?name=summer-league-protocols&per_page=100']))['artifacts']
previous=[a for a in artifacts if not a['expired'] and a.get('workflow_run',{}).get('id')!=current and a.get('workflow_run',{}).get('head_branch')==os.environ['GITHUB_REF_NAME']]
if previous:
 artifact=max(previous,key=lambda a:a['created_at']);target=Path('.cache/summer-games');target.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryFile() as handle:
  subprocess.run(['gh','api',f"repos/{repo}/actions/artifacts/{int(artifact['id'])}/zip"],stdout=handle,check=True);handle.seek(0)
  with zipfile.ZipFile(handle) as archive:
   for info in archive.infolist():
    if not (target/info.filename).resolve().is_relative_to(target.resolve()):raise ValueError('Unsafe checkpoint member')
   archive.extractall(target)
 print('Restored summer source checkpoint',artifact['id'],artifact['created_at'])
else:print('No summer checkpoint available')
