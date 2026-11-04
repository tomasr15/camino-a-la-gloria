import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { bestLineup } from '../supabase/functions/_shared/game/data.ts';

const env = Object.fromEntries(readFileSync('.env.cloud','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(base, 'https://gmpjtvxpolmxtqvdxdit.supabase.co');
const fixtures = JSON.parse(readFileSync('tmp/cloud-fixtures.json','utf8'));
assert.equal(fixtures.length,2);
assert.ok(fixtures.every(f=>/^cp2-cloud-[01]-[a-f0-9-]+@example\.invalid$/.test(f.email)), 'Only dedicated CP2 test accounts may be mutated');
const origin = 'https://camino-a-la-gloria-dusky.vercel.app';
const report = { testedAt:new Date().toISOString(), environment:'Supabase cloud', project:'gmpjtvxpolmxtqvdxdit', checks:[], requests:[], providerCalls:0, limitations:[] };
async function check(name, fn){try{await fn();report.checks.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){report.checks.push({name,status:'FAIL',reason:error instanceof assert.AssertionError ? error.message.slice(0,220) : error.name});console.log('FAIL '+name);}}
async function call(path, token, body, method){const trace=crypto.randomUUID(),t=performance.now();const r=await fetch(`${base}/functions/v1/${path}`,{method:method??(body?'POST':'GET'),headers:{Origin:origin,apikey:key,'x-request-id':trace,...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});report.requests.push({path,method:method??(body?'POST':'GET'),status:r.status,requestId:r.headers.get('x-request-id'),durationMs:Math.round(performance.now()-t)});return {status:r.status,body:r.status===204?null:await r.json(), trace, returnedTrace:r.headers.get('x-request-id'), allowedHeaders:r.headers.get('access-control-allow-headers')};}
try {
  await check('Health and trace propagation',async()=>{const r=await call('health');assert.equal(r.status,200);assert.equal(r.body.status,'ok');assert.equal(r.body.requestId,r.trace);assert.equal(r.returnedTrace,r.trace);});
  await check('Browser preflight allows x-request-id',async()=>{const r=await call('careers',null,undefined,'OPTIONS');assert.ok(r.allowedHeaders?.includes('x-request-id'),'Cloud CORS omits x-request-id required by frontend');});
  await check('Game rejects missing JWT',async()=>assert.equal((await call('game')).status,401));
  await check('Narrative function deployed',async()=>assert.equal((await call('narrative',null,undefined,'POST')).status,401));
  const users=[];
  for(const fixture of fixtures){const client=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword(fixture);assert.ok(!login.error,'Dedicated fixture login failed');users.push({client,token:login.data.session.access_token});}
  const [a,b]=users;
  let careerA;
  await check('Dedicated careers persist',async()=>{for(const u of users){const read=await call('careers',u.token);assert.equal(read.status,200);if(!read.body.careers.length)assert.equal((await call('careers',u.token,{managerName:'DT prueba CP2 cloud'})).status,201);}const own=await call('careers',a.token);careerA=own.body.careers[0].id;assert.ok(careerA);});
  await check('Cross-user REST and endpoint isolation',async()=>{const other=await call('careers',b.token);assert.equal(other.status,200);assert.ok(other.body.careers.every(c=>c.id!==careerA));const direct=await b.client.from('careers').select('id').eq('id',careerA);assert.ok(!direct.error);assert.deepEqual(direct.data,[]);});
  let snapshot;
  await check('Game contract and real dataset available',async()=>{snapshot=await call('game',a.token);assert.equal(snapshot.status,200);assert.equal(snapshot.body.isSynthetic,false);assert.ok(snapshot.body.clubs?.some(c=>c.tier==='low'));});
  await check('Game initialization and exact replay',async()=>{assert.ok(snapshot?.status===200,'Game read unavailable');if(snapshot.body.game){assert.equal(snapshot.body.game.datasetCode,'cp2-real-v1');report.limitations.push('Existing dedicated game retained; initialization replay skipped on repeat run.');return;}const command={requestId:crypto.randomUUID(),expectedVersion:snapshot.body.version,command:{type:'initialize',clubId:snapshot.body.clubs.find(c=>c.tier==='low').id}};const first=await call('game',a.token,command);assert.equal(first.status,200);assert.equal(first.body.game.datasetCode,'cp2-real-v1');const replay=await call('game',a.token,command);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.version,first.body.version);});
  await check('Play, automatic resolution and reload persist once',async()=>{let s=await call('game',a.token);assert.equal(s.status,200);assert.ok(s.body.game,'Game not initialized');if(s.body.game.phase==='ready'){const g=s.body.game,c=s.body.clubs.find(c=>c.id===g.clubId);s=await call('game',a.token,{requestId:crypto.randomUUID(),expectedVersion:s.body.version,command:{type:'start',season:g.season,round:g.round,formation:'4-3-3',tactic:'offensive',lineup:bestLineup(c,'4-3-3')}});assert.equal(s.status,200);}if(s.body.game.phase==='playing'){const g=s.body.game;s=await call('game',a.token,{requestId:crypto.randomUUID(),expectedVersion:s.body.version,command:{type:'auto',season:g.season,round:g.round}});assert.equal(s.status,200);}assert.ok(s.body.game.lastMatch,'lastMatch required by UI');const reload=await call('game',a.token);assert.equal(reload.body.version,s.body.version);assert.deepEqual(reload.body.game.results,s.body.game.results);});
  await check('Other synthetic account cannot read first game',async()=>{const r=await call('game',b.token);assert.equal(r.status,200);assert.equal(r.body.game,null);});
} catch(error){report.checks.push({name:'Prerequisites',status:'FAIL',reason:error.name});}
finally{report.limitations.push('Narrative provider intentionally not invoked; no cloud outage induced. Only dedicated synthetic accounts mutated; retained for repeat tests. Frontend candidate not deployed.');writeFileSync('docs/evidencias/career-cloud.json',JSON.stringify(report,null,2)+'\n');}
if(report.checks.some(c=>c.status==='FAIL'))process.exitCode=1;
