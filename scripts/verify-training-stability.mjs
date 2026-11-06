// Synthetic data only. Never accepts a production URL or production secrets.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const base=new URL(arg('--url','https://prompt-robot-training-preview.ooo-training.workers.dev'));
if(base.protocol!=='https:'||!/^prompt-robot-training-preview\.[a-z0-9-]+\.workers\.dev$/.test(base.hostname)||base.pathname!=='/'||base.port||base.username||base.password||base.search||base.hash)throw Error('Only the isolated preview Worker is accepted.');
const secretFile=arg('--secrets','.deploy/preview-secrets.json');
if(!/preview-secrets\.json$/.test(secretFile))throw Error('Use preview credentials only.');
const count=Number(arg('--accounts','50')),rounds=Number(arg('--rounds','3')),duration=Number(arg('--duration','180')),imageBytes=Number(arg('--image-bytes','1000000'));
if(!Number.isInteger(count)||count<40||count>50||!Number.isInteger(rounds)||rounds<1||rounds>10||!Number.isInteger(duration)||duration<0||duration>1800||!Number.isInteger(imageBytes)||imageBytes<40000||imageBytes>1000000)throw Error('Invalid load parameters.');
const secrets=JSON.parse(await readFile(secretFile,'utf8')),source=await readFile('.deploy/test-image.jpg');
const runId=new Date().toISOString().replace(/[:.]/g,'-'),reportPath=`.deploy/stability-${runId}.json`;
const report={startedAt:new Date().toISOString(),environment:base.origin,count,rounds,durationSeconds:duration,imageBytes,requests:[],failures:[],checks:[],passed:false,cleanup:false};
const hash=data=>createHash('sha256').update(data).digest('hex');
function image(index,round){const marker=Buffer.from(`stability:${runId}:${index}:${round}`),parts=[source.subarray(0,2),Buffer.from([255,254,(marker.length+2)>>8,(marker.length+2)&255]),marker];let left=imageBytes-source.length-marker.length-4;while(left>=4){const n=Math.min(left-4,65533);parts.push(Buffer.from([255,254,(n+2)>>8,(n+2)&255]),Buffer.alloc(n,32));left-=n+4;}if(left)throw Error('JPEG padding must be exact.');parts.push(source.subarray(2));return Buffer.concat(parts);}
function client(role){
 let cookie='';
 return {async req(path,method='GET',body,{op=method+' '+path.replace(/[a-f0-9-]{32,}/gi,':id'),headers={},expected=[200],binary=false}={}){
  const start=performance.now();let res,recorded=false,failureRecorded=false;
  try{
   const h={Origin:base.origin,...(cookie?{Cookie:cookie}:{}),...headers};let data;
   if(body!==undefined){if(body instanceof Uint8Array){data=body;h['Content-Type']='image/jpeg';}else{data=JSON.stringify(body);h['Content-Type']='application/json';}}
   res=await fetch(new URL(path,base),{method,headers:h,body:data,signal:AbortSignal.timeout(120000)});
   if(res.headers.has('Set-Cookie'))cookie=res.headers.get('Set-Cookie').split(';')[0];
   const bytes=Buffer.from(await res.arrayBuffer());report.requests.push({role,op,status:res.status,ms:Math.round(performance.now()-start),bytes:bytes.length});recorded=true;
   if(!expected.includes(res.status)){const detail=bytes.toString('utf8').replace(/<[^>]*>/g,' ').slice(0,240);report.failures.push({role,op,status:res.status,detail,ray:res.headers.get('cf-ray')});failureRecorded=true;throw Error(`${op}: HTTP ${res.status} ${detail}`);}
   return binary?bytes:JSON.parse(bytes.toString('utf8'));
  }catch(e){
   if(!recorded)report.requests.push({role,op,status:res?.status||0,ms:Math.round(performance.now()-start)});
   if(!failureRecorded)report.failures.push({role,op,status:res?.status||0,detail:e.message});
   throw e;
  }
 },async asset(path){return this.req(path,'GET',undefined,{op:'page/assets',binary:true});}};
}
async function parallel(label,items,fn){const started=performance.now(),results=await Promise.allSettled(items.map(fn));const failed=results.filter(x=>x.status==='rejected');console.log(`${label}: ${items.length-failed.length}/${items.length}, ${Math.round(performance.now()-started)} ms`);if(failed.length)throw new AggregateError(failed.map(x=>x.reason),`${label}: ${failed.length} failures`);return results.map(x=>x.value);}
function check(name){report.checks.push(name);}
const admin=client('instructor'),anonymous=client('anonymous'),stop=new AbortController();
let activity,prefix,users=[],accounts=[],background=[],credentials=[];
async function loop(ms,work){while(!stop.signal.aborted){try{await delay(ms,undefined,{signal:stop.signal});}catch{break;}if(stop.signal.aborted)break;try{await work();}catch(e){console.log('Background check failed: '+e.message);}}}
try{
 await admin.req('/api/login','POST',{username:'admin',password:secrets.ADMIN_PASSWORD},{op:'instructor login'});
 const code='VERIFY'+randomBytes(4).toString('hex').toUpperCase();activity=(await admin.req('/api/admin/activities','POST',{name:'隔離負載驗證 '+code,code},{expected:[201],op:'create synthetic activity'})).activity;report.syntheticActivity={id:activity.id,code:activity.code};prefix='/api/admin/activities/'+activity.id;
 credentials=(await admin.req(prefix+'/accounts','POST',{count},{expected:[201],op:'create synthetic accounts'})).credentials;
 await admin.req(prefix,'PATCH',{isOpen:true},{op:'open synthetic activity'});
 users=await parallel('login and profile',credentials,async(c,i)=>{const user=client('learner');await user.req('/api/login','POST',c,{op:'learner login'});await user.req('/api/profile','POST',{name:`合成學員${i+1}`,groupName:`測試${i%5+1}組`,activityCode:code},{op:'profile'});return user;});
 const sessionStart=performance.now();
 await parallel('open teaching page',users,u=>u.asset('/v2/?mode=easy'));
 await parallel('load teaching script',users,u=>u.asset('/v2/assets/easy.js'));
 await parallel('initial usage heartbeat',users,u=>u.req('/api/usage/heartbeat','POST',{}, {op:'usage heartbeat'}));
 background=[loop(60000,()=>parallel('periodic usage heartbeat',users,u=>u.req('/api/usage/heartbeat','POST',{}, {op:'usage heartbeat'}))),loop(15000,async()=>{await admin.req(prefix+'/accounts','GET',undefined,{op:'instructor accounts'});await admin.req(prefix+'/submissions','GET',undefined,{op:'instructor submissions'});})];
 const latest=[];
 for(let round=0;round<rounds;round++){
  const target=sessionStart+(duration*1000/rounds)*round;if(performance.now()<target)await delay(target-performance.now());
  const ids=users.map(()=>crypto.randomUUID()),images=users.map((_,i)=>image(i,round));
  const write=()=>parallel(`round ${round+1} simultaneous upload`,users,async(u,i)=>{const saved=(await u.req('/api/submission','PUT',images[i],{op:'upload',headers:{'If-Match':String(round),'X-Request-Id':ids[i]}})).submission;assert.equal(saved.version,round+1);latest[i]={version:saved.version,digest:hash(images[i])};});
  const concurrent=await Promise.allSettled([write(),admin.req(prefix+'/accounts','GET',undefined,{op:'instructor during upload'})]);if(concurrent.some(x=>x.status==='rejected'))throw new AggregateError(concurrent.filter(x=>x.status==='rejected').map(x=>x.reason),'upload with instructor polling');
  await parallel(`round ${round+1} simultaneous own image preview`,users,async(u,i)=>{const bytes=await u.req('/api/submission/image?v='+(round+1),'GET',undefined,{op:'own image preview',binary:true});assert.equal(hash(bytes),latest[i].digest);});
  await parallel(`round ${round+1} duplicate request`,users,async(u,i)=>{const saved=(await u.req('/api/submission','PUT',images[i],{op:'idempotent duplicate',headers:{'If-Match':String(round),'X-Request-Id':ids[i]}})).submission;assert.equal(saved.version,round+1);});
  const list=await admin.req(prefix+'/submissions','GET',undefined,{op:'instructor submissions'});assert.equal(list.total,count);assert.ok(list.submissions.every(s=>s.version===round+1));check(`round ${round+1}: ${count} unique latest records, matching own image hashes, idempotent replay`);
 }
 const remaining=duration*1000-(performance.now()-sessionStart);if(remaining>0)await delay(remaining);
 stop.abort();await Promise.allSettled(background);background=[];
 await parallel('logout and close usage',users,u=>u.req('/api/logout','POST',{}, {op:'learner logout'}));
 accounts=(await admin.req(prefix+'/accounts','GET',undefined,{op:'final usage totals'})).accounts;assert.equal(accounts.length,count);assert.ok(accounts.every(a=>a.loginCount===1&&a.lastLoginAt&&!a.isUsing&&a.usageSeconds>=Math.max(0,duration-20)));check('all usage sessions closed, durations and login counts match');
 users=await parallel('relogin and persisted image',credentials,async(c,i)=>{const u=client('learner');await u.req('/api/login','POST',c,{op:'learner relogin'});assert.equal((await u.req('/api/submission','GET',undefined,{op:'persisted metadata'})).submission.version,rounds);const bytes=await u.req('/api/submission/image','GET',undefined,{op:'persisted image',binary:true});assert.equal(hash(bytes),latest[i].digest);return u;});check('relogin retains every latest image');
 const list=await admin.req(prefix+'/submissions','GET',undefined,{op:'instructor final list'});const first=list.submissions[0];await anonymous.req(first.imageUrl,'GET',undefined,{op:'anonymous image denied',expected:[401]});await users[0].req(first.imageUrl,'GET',undefined,{op:'learner instructor URL denied',expected:[403]});check('private images reject anonymous and learner instructor access');
 // Match the instructor ZIP flow: serial downloads with each account's image hash and version.
 const byName=new Map(credentials.map((c,i)=>[c.username,latest[i].digest]));for(const s of list.submissions){const bytes=await admin.req(s.imageUrl+'?v='+s.version,'GET',undefined,{op:'instructor export image',binary:true});assert.equal(hash(bytes),byName.get(s.username));}check('instructor export image count, per-account hashes and versions match');
 assert.equal(report.failures.length,0);report.passed=true;
}catch(e){report.error=e.message;console.error('Stability test failed: '+e.message);if(e.errors)for(const x of e.errors.slice(0,3))console.error(x.message);}
finally{
 stop.abort();await Promise.allSettled(background);
 if(activity){try{await admin.req(prefix,'PATCH',{isOpen:false},{op:'cleanup close activity'});await admin.req(prefix+'/submissions','DELETE',{confirmCode:activity.code},{op:'cleanup delete synthetic images'});accounts=(await admin.req(prefix+'/accounts','GET',undefined,{op:'cleanup list accounts'})).accounts;for(let i=0;i<accounts.length;i+=5)await parallel('disable synthetic accounts',accounts.slice(i,i+5),a=>admin.req('/api/admin/accounts/'+a.id,'PATCH',{disabled:true},{op:'cleanup disable account'}));assert.equal((await admin.req(prefix+'/submissions','GET',undefined,{op:'cleanup verify zero images'})).total,0);report.cleanup=true;}catch(e){report.cleanupError=e.message;report.passed=false;}}
 report.finishedAt=new Date().toISOString();report.actualSeconds=Math.round((Date.parse(report.finishedAt)-Date.parse(report.startedAt))/1000);
 const groups={};for(const r of report.requests){(groups[r.op]??=[]).push(r);}report.metrics=Object.fromEntries(Object.entries(groups).map(([op,rows])=>{const times=rows.map(r=>r.ms).sort((a,b)=>a-b);return [op,{requests:rows.length,statuses:rows.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.min(times.length-1,Math.floor(times.length*.95))],maxMs:times.at(-1)}];}));
 await mkdir('.deploy',{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({reportPath,passed:report.passed,cleanup:report.cleanup,checks:report.checks,failures:report.failures,actualSeconds:report.actualSeconds},null,2));
}
if(!report.passed)process.exitCode=1;
