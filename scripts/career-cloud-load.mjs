import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Twenty authenticated read requests, concurrency two; no writes or provider calls.
const env=Object.fromEntries(readFileSync('.env.cloud','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(base,'https://gmpjtvxpolmxtqvdxdit.supabase.co');
const fixtures=JSON.parse(readFileSync('tmp/cloud-fixtures.json','utf8'));
assert.equal(fixtures.length,2);
assert.ok(fixtures.every(f=>/^cp2-cloud-[01]-[a-f0-9-]+@example\.invalid$/.test(f.email)));
const tokens=[];
for(const fixture of fixtures){const c=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signInWithPassword(fixture);assert.ok(!r.error,'Test login failed');tokens.push(r.data.session.access_token);}
const samples=[];let next=0;
async function worker(){for(;;){const i=next++;if(i>=20)return;const path=i%2?'careers':'game',t=performance.now();let status=null,requestId=null,ok=false;
try{const r=await fetch(`${base}/functions/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${tokens[Math.floor(i/2)%2]}`},signal:AbortSignal.timeout(12000)});status=r.status;requestId=r.headers.get('x-request-id');const data=await r.json();ok=status===200&&(path==='game'?Number.isInteger(data.version):Array.isArray(data.careers));}catch{}
samples.push({index:i,path,status,requestId,durationMs:Math.round(performance.now()-t),ok});}}
await Promise.all([worker(),worker()]);
const times=samples.map(s=>s.durationMs).sort((a,b)=>a-b),p95=times[Math.ceil(.95*times.length)-1],errors=samples.filter(s=>!s.ok).length,errorRate=errors/20*100;
const report={testedAt:new Date().toISOString(),environment:'Supabase cloud; two dedicated synthetic accounts; read-only burst',requests:20,concurrency:2,p95Ms:p95,errorRatePercent:errorRate,passed:p95<2000&&errorRate<1,targets:{p95MsBelow:2000,errorRatePercentBelow:1},samples,limitations:'Small academic read burst; not a capacity or availability guarantee. Does not measure browser CORS or write latency. No narrative/provider calls.'};
writeFileSync('docs/evidencias/career-cloud-load.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,p95Ms:p95,errorRatePercent:errorRate}));if(!report.passed)process.exitCode=1;
