import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://prompt-robot-training.canadaur77.workers.dev';
const secrets=JSON.parse(await readFile('.deploy/production-secrets.json','utf8'));
const csv=(await readFile('.deploy/TRAIN1118-學員帳密.csv','utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
assert.equal(csv.length,51);const [username,password]=csv[1].split(',').map(s=>s.slice(1,-1));
function client(){let cookie='';return {async req(path,method='GET',body){const r=await fetch(base+path,{method,redirect:'manual',headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(r.headers.has('Set-Cookie')){const c=r.headers.get('Set-Cookie');assert.ok(c.includes('Secure')&&c.includes('HttpOnly')&&c.includes('SameSite=Strict'));cookie=c.split(';')[0];}return r;},async json(path,method,body){const r=await this.req(path,method,body);assert.ok(r.ok,`Unexpected HTTP ${r.status} on ${path}`);return r.json();}};}
const anon=client();for(const path of ['/','/v2/index.html','/v2/assets/data.js','/v1/assets/data.js','/v2/assets/book/成品範例_看手機與玩遊戲的規則.pdf']){const r=await anon.req(path);assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'/v2/submit.html');await r.body?.cancel();}
assert.equal((await anon.req('/api/submission/image')).status,401);
for(const path of ['v2/assets/submission.js','v2/assets/training-admin.js']){const res=await anon.req('/'+path);assert.equal(res.status,200);const actual=await res.arrayBuffer(),expected=await readFile(path);assert.equal(createHash('sha256').update(new Uint8Array(actual)).digest('hex'),createHash('sha256').update(expected).digest('hex'),'Deployed frontend differs from reviewed source: '+path);}
const student=client();const who=await student.json('/api/login','POST',{username,password});assert.equal(who.role,'student');assert.equal(who.user.name,'');assert.equal(who.user.groupName,'');assert.equal((await student.json('/api/submission')).submission,null);assert.equal((await student.req('/api/admin/activities')).status,403);
// The canonical HTML URL may redirect; the protected JS proves authenticated runtime access.
const source=await student.req('/v2/assets/studio.js');assert.equal(source.status,200);assert.ok((await source.text()).includes('登入／圖片交件'));
await student.json('/api/logout','POST',{});
const teacher=client();await teacher.json('/api/login','POST',{username:'admin',password:secrets.ADMIN_PASSWORD});const {activities}=await teacher.json('/api/admin/activities');assert.equal(activities.length,1);const activity=activities[0];assert.equal(activity.accountCount,50);assert.equal(activity.submissionCount,0);assert.equal(activity.isOpen,false);await teacher.json('/api/logout','POST',{});
const report={url:base,checkedAt:new Date().toISOString(),accounts:50,realSubmissions:0,eventOpen:false,privateAssetsVerified:true,secureCookieVerified:true,learnerLoginVerified:true,adminLoginVerified:true,passed:true};
await writeFile('.deploy/production-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
