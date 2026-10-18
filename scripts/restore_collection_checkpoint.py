"""Restore a named data checkpoint from this repository and branch."""
import json,os,subprocess,tempfile,zipfile
from pathlib import Path
repo=os.environ['GITHUB_REPOSITORY'];name=os.environ['CHECKPOINT_NAME'];current=int(os.environ['GITHUB_RUN_ID']);target=Path(os.environ['CHECKPOINT_PATH'])
if not target.resolve().is_relative_to(Path('.cache').resolve()):raise ValueError('Checkpoint target must be inside .cache')
artifacts=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/actions/artifacts?name={name}&per_page=100']))['artifacts']
previous=[a for a in artifacts if not a['expired'] and a.get('workflow_run',{}).get('id')!=current and a.get('workflow_run',{}).get('head_branch')==os.environ.get('CHECKPOINT_BRANCH',os.environ['GITHUB_REF_NAME'])]
if previous:
 artifact=max(previous,key=lambda a:a['created_at']);target.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryFile() as handle:
  subprocess.run(['gh','api',f"repos/{repo}/actions/artifacts/{int(artifact['id'])}/zip"],stdout=handle,check=True);handle.seek(0)
  with zipfile.ZipFile(handle) as archive:
   for info in archive.infolist():
    if not (target/info.filename).resolve().is_relative_to(target.resolve()):raise ValueError('Unsafe checkpoint member')
   archive.extractall(target)
 print('Restored data checkpoint',artifact['id'],artifact['created_at'])
else:print('No retained checkpoint available')
