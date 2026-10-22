import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {claudeJSON,claudeArgs,answerJSON,readResult,claudeConfigured,ClaudeError} from '../scripts/claude-text.mjs';

// A stand-in for the CLI: it records its arguments, stdin, directory and environment, then acts as FAKE_MODE says.
function fakeCli(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fake-claude-')),bin=path.join(dir,'claude'),log=path.join(dir,'log.json');
 fs.writeFileSync(bin,`#!/usr/bin/env node
const fs=require('fs');let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{
 const mode=process.env.FAKE_MODE;
 fs.writeFileSync(${JSON.stringify(log)},JSON.stringify({args:process.argv.slice(2),input,cwd:process.cwd(),
  apiKey:process.env.ANTHROPIC_API_KEY||process.env.ANTHROPIC_AUTH_TOKEN||null,mds:process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS||null,token:process.env.CLAUDE_CODE_OAUTH_TOKEN||null}));
 const ok=(extra)=>process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:false,total_cost_usd:0.01,usage:{output_tokens:5},...extra}));
 if(mode==='hang')return setTimeout(()=>{},60e3);
 if(mode==='fenced')return ok({result:'Вот:\\n\`\`\`json\\n{"title":"Да"}\\n\`\`\`'});
 if(mode==='schema')return ok({result:'{"title":"x"}',structured_output:{title:'Схема'}});
 if(mode==='prose')return ok({result:'Не могу.'});
 if(mode==='401'){process.stdout.write(JSON.stringify({type:'result',subtype:'success',is_error:true,api_error_status:401,result:'Failed to authenticate. API Error: 401 OAuth access token is invalid.'}));process.exit(1);}
 if(mode==='crash'){process.stderr.write('boom');process.exit(2);}
 ok({result:'{"title":"Чисто"}'});
});`);
 fs.chmodSync(bin,0o755);
 return {bin,read:()=>JSON.parse(fs.readFileSync(log,'utf8'))};
}
const run=(cli,mode,opts={})=>claudeJSON({system:'S',prompt:'Факты: 42',bin:cli.bin,env:{...process.env,FAKE_MODE:mode,
 ANTHROPIC_API_KEY:'sk-api',ANTHROPIC_AUTH_TOKEN:'bearer',CLAUDE_CODE_OAUTH_TOKEN:'sk-ant-oat01-x'},...opts});

test('claude text: headless, one JSON result, no tools, no settings, no MCP, no saved session',()=>{
 const a=claudeArgs({system:'Голос',model:'opus',schema:{type:'object'}});
 assert.deepEqual(a.slice(0,5),['-p','--output-format','json','--model','opus']);
 assert.equal(a[a.indexOf('--tools')+1],'','every tool off');assert.equal(a[a.indexOf('--setting-sources')+1],'','no settings files');
 for(const f of ['--strict-mcp-config','--no-session-persistence'])assert.ok(a.includes(f),f);
 assert.equal(a[a.indexOf('--system-prompt')+1],'Голос');assert.equal(a[a.indexOf('--json-schema')+1],'{"type":"object"}');
 assert.ok(!claudeArgs({}).includes('--system-prompt')&&!claudeArgs({}).includes('--json-schema'));
 assert.equal(claudeConfigured({CLAUDE_CODE_OAUTH_TOKEN:'t'}),true);assert.equal(claudeConfigured({ANTHROPIC_API_KEY:'k'}),false);
});

test('claude text: the prompt goes on stdin from an empty directory, with the subscription token and never an API key',async()=>{
 const cli=fakeCli(),r=await run(cli,'ok');
 assert.deepEqual(r.data,{title:'Чисто'});assert.equal(r.costUsd,0.01);assert.deepEqual(r.usage,{output_tokens:5});
 const seen=cli.read();
 assert.equal(seen.input,'Факты: 42');assert.equal(seen.apiKey,null,'a key would bill the API');assert.equal(seen.token,'sk-ant-oat01-x');assert.equal(seen.mds,'1','no CLAUDE.md');
 assert.notEqual(path.resolve(seen.cwd),path.resolve('.'),'never the repository');assert.equal(fs.existsSync(seen.cwd),false,'removed after');
});

test('claude text: JSON from a fence, the structured output of a schema; prose is an error',async()=>{
 const cli=fakeCli();
 assert.deepEqual((await run(cli,'fenced')).data,{title:'Да'});
 assert.deepEqual((await run(cli,'schema',{schema:{type:'object'}})).data,{title:'Схема'});
 await assert.rejects(run(cli,'prose'),e=>e instanceof ClaudeError&&/not JSON/.test(e.message)&&e.detail==='Не могу.');
 assert.deepEqual(answerJSON('{"a":1} '),{a:1});assert.equal(answerJSON('нет'),null);
});

test('claude text: clear errors — expired token, crash, timeout, no CLI, no prompt',async()=>{
 const cli=fakeCli();
 await assert.rejects(run(cli,'401'),e=>e.status===401&&/claude setup-token/.test(e.message)&&/CLAUDE_CODE_OAUTH_TOKEN/.test(e.message));
 await assert.rejects(run(cli,'crash'),e=>/no JSON result \(exit 2\): boom/.test(e.message));
 await assert.rejects(run(cli,'hang',{timeoutMs:300}),/no answer in 0 s/);
 await assert.rejects(claudeJSON({prompt:'x',bin:'/nonexistent/claude'}),/not installed \(npm install -g @anthropic-ai\/claude-code\)/);
 await assert.rejects(claudeJSON({prompt:''}),/no prompt/);
 assert.throws(()=>readResult('{"type":"result","subtype":"error_max_turns","is_error":false}'),/error_max_turns/);
 assert.throws(()=>readResult('{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["boom"]}'),/Claude Code: boom/);
 assert.throws(()=>readResult('{"is_error":true,"api_error_status":429,"result":"limit"}'),/usage limit/);
});
