// The league bots' texts (Зак Онн, Майк Роффон, the awards bot) are written by Claude through the owner's Claude
// subscription: the Claude Code CLI in headless mode (claude -p), authenticated by CLAUDE_CODE_OAUTH_TOKEN, the
// long-lived (one year) token `claude setup-token` prints. No API key and no other provider: ANTHROPIC_API_KEY and
// ANTHROPIC_AUTH_TOKEN are taken out of the CLI's environment, since in -p mode either wins over the subscription token
// (code.claude.com/docs/en/authentication, 22.10.2026). Not --bare: bare mode never reads the subscription token.
// One call is one answer: a system prompt and a prompt in, JSON out. The CLI runs with no tools, no MCP servers, no
// settings files, no CLAUDE.md and no saved session, in an empty temporary directory, so it never reads this repository;
// it only writes. Install: npm install -g @anthropic-ai/claude-code (Node 22).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// An alias of the CLI (sonnet, opus, haiku) or a full model name.
// Opus for every text of the bots (owner, 23.10.2026: a Max subscription, the limits are not to be spared).
export const CLAUDE_MODEL=process.env.CLAUDE_TEXT_MODEL||'opus';
// The subscription token as pasted into the secret: spaces, line breaks and quotes around it are not part of it.
export const subscriptionToken=(env=process.env)=>String(env.CLAUDE_CODE_OAUTH_TOKEN||'').trim().replace(/^["']+|["']+$/g,'').trim();
// Whether a run can write at all: the subscription token is set (CI). Without it the bots write nothing.
export const claudeConfigured=(env=process.env)=>Boolean(subscriptionToken(env));
// What a refused token is, without showing it: `claude setup-token` prints one that starts with sk-ant-oat.
export function tokenHint(token){
 if(!token)return 'the secret is empty';
 if(/^sk-ant-oat\d*-/.test(token))return `the secret holds a setup-token token (${token.length} characters): it was revoked, expired or cut short`;
 if(/^sk-ant-api/.test(token))return 'the secret holds an API key, not a subscription token';
 return `the secret does not hold a \`claude setup-token\` token (those start with sk-ant-oat01-; this one has ${token.length} characters)`;
}

export class ClaudeError extends Error{
 constructor(message,{status=null,detail=''}={}){super(`Claude Code: ${message}`);this.name='ClaudeError';this.status=status;this.detail=detail;}
}

// The CLI's arguments: print mode, one JSON result, nothing but the model.
export function claudeArgs({system,model=CLAUDE_MODEL,schema}={}){
 return ['-p','--output-format','json','--model',model,'--tools','','--strict-mcp-config','--setting-sources','',
  '--no-session-persistence','--disable-slash-commands',...system?['--system-prompt',system]:[],
  ...schema?['--json-schema',JSON.stringify(schema)]:[]];
}

// The JSON of an answer's text: the whole text, or the object inside a ```json fence or around it. null when none.
export function answerJSON(text){
 const s=String(text||'').trim(),fenced=s.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
 for(const t of [s,fenced,s.slice(s.indexOf('{'),s.lastIndexOf('}')+1)])
  if(t)try{return JSON.parse(t);}catch{}
 return null;
}

// The CLI's result object as {data, text, usage, costUsd}, or a ClaudeError that says what went wrong.
export function readResult(stdout,{code=0,stderr='',schema,token}={}){
 let r;try{r=JSON.parse(stdout);}catch{
  throw new ClaudeError(`no JSON result (exit ${code})${stderr.trim()?`: ${stderr.trim().slice(-500)}`:''}`,{detail:stdout.slice(-500)});}
 if(r.is_error||r.subtype!=='success'){
  const status=r.api_error_status??null,text=String(r.result||r.errors?.join('; ')||r.subtype||'error').slice(0,500);
  const hint=status===401?` — the subscription token is invalid or expired${token!==undefined?` (${tokenHint(token)})`:''}: run \`claude setup-token\` and update the CLAUDE_CODE_OAUTH_TOKEN secret`
   :status===429?' — the subscription\'s usage limit is reached, try later':'';
  throw new ClaudeError(`${status?`${status} `:''}${text}${hint}`,{status,detail:text});
 }
 const data=schema&&r.structured_output!=null?r.structured_output:answerJSON(r.result);
 if(data==null||typeof data!=='object')throw new ClaudeError('the answer is not JSON',{detail:String(r.result||'').slice(0,500)});
 return {data,text:r.result,usage:r.usage||null,costUsd:r.total_cost_usd||0};
}

// One answer of Claude as JSON. system: the voice and the rules; prompt: the task and its facts (sent on stdin);
// schema: a JSON Schema the answer must follow (optional; without it the prompt asks for JSON). Answers
// {data, text, usage, costUsd} (costUsd is what the API would charge; the subscription bills nothing per call),
// or throws a ClaudeError: no CLI, no answer in timeoutMs, an API error, or an answer that is not JSON.
export async function claudeJSON({system,prompt,schema,model=CLAUDE_MODEL,timeoutMs=180e3,bin=process.env.CLAUDE_BIN||'claude',env=process.env}={}){
 if(!prompt)throw new ClaudeError('no prompt');
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'claude-text-'));
 const {ANTHROPIC_API_KEY,ANTHROPIC_AUTH_TOKEN,...rest}=env,token=subscriptionToken(env);
 const childEnv={...rest,...token?{CLAUDE_CODE_OAUTH_TOKEN:token}:{},CLAUDE_CODE_DISABLE_CLAUDE_MDS:'1',DISABLE_UPDATES:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
 try{
  const {stdout,stderr,code,timedOut}=await new Promise((resolve,reject)=>{
   const child=spawn(bin,claudeArgs({system,model,schema}),{cwd,env:childEnv,stdio:['pipe','pipe','pipe']});
   let out='',err='',timedOut=false;
   const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),5e3).unref();},timeoutMs);
   child.stdout.on('data',d=>{out+=d;});child.stderr.on('data',d=>{err+=d;});
   child.on('error',e=>{clearTimeout(timer);reject(e.code==='ENOENT'
    ?new ClaudeError(`the CLI "${bin}" is not installed (npm install -g @anthropic-ai/claude-code)`):new ClaudeError(e.message));});
   child.on('close',code=>{clearTimeout(timer);resolve({stdout:out,stderr:err,code,timedOut});});
   child.stdin.on('error',()=>{});child.stdin.end(prompt);
  });
  if(timedOut)throw new ClaudeError(`no answer in ${Math.round(timeoutMs/1e3)} s`);
  return readResult(stdout,{code,stderr,schema,token});
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
}
