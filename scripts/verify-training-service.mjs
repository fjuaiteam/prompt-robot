// Destructive ONLY to a newly-created synthetic test activity; never uses real learner data.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
const arg=name=>process.argv[process.argv.indexOf(name)+1];
const base=arg('--url'),file=arg('--secrets');
if(!base||!file)throw Error('Usage: node scripts/verify-training-service.mjs --url URL --secrets ignored-secrets.json');
const url=new URL(base);
if(!/^http:\/\/127\.0\.0\.1:878[78]$/.test(url.origin)&&!(url.protocol==='https:'&&/^prompt-robot-training-preview\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)))throw Error('Only isolated localhost or dedicated preview Worker may be tested.');
const secrets=JSON.parse(await readFile(file,'utf8'));
function client(){let cookie='';return {async req(path,method='GET',body,headers={}){const h={Origin:url.origin,...(cookie?{Cookie:cookie}:{}),...headers};let data;if(body!==undefined){if(body instanceof Uint8Array){data=body;h['Content-Type']='image/jpeg';}else{data=JSON.stringify(body);h['Content-Type']='application/json';}}const res=await fetch(new URL(path,url),{method,headers:h,body:data,signal:AbortSignal.timeout(120000)});const c=res.headers.get('Set-Cookie');if(c)cookie=c.split(';')[0];return res;},async json(path,method,body,headers){const res=await this.req(path,method,body,headers);if(!res.ok){await res.body?.cancel();throw Error(`${method||'GET'} ${path} -> HTTP ${res.status}`);}return res.json();}};}
const baseImage=await readFile('.deploy/test-image.jpg');
function paddedImage(image,target=950000){const blocks=[image.subarray(0,2)];let left=target-image.length;while(left>=4){const length=Math.min(left-4,65533);blocks.push(Buffer.from([255,254,(length+2)>>8,(length+2)&255]),Buffer.alloc(length,32));left-=length+4;}blocks.push(image.subarray(2));return Buffer.concat(blocks);}
const jpeg=paddedImage(baseImage),digest=createHash('sha256').update(jpeg).digest('hex');
const admin=client();await admin.json('/api/login','POST',{username:'admin',password:secrets.ADMIN_PASSWORD});
const code='VERIFY'+randomBytes(4).toString('hex').toUpperCase(),activity=(await admin.json('/api/admin/activities','POST',{name:'隔離負載驗證 '+code,code})).activity;
const prefix=`/api/admin/activities/${activity.id}`;let outcome=null;
const keepForExport=process.argv.includes('--keep-for-export');
try{
 const {credentials}=await admin.json(prefix+'/accounts','POST',{count:50});await admin.json('/api/admin/activities/'+activity.id,'PATCH',{isOpen:true});
 const start=performance.now();const users=await Promise.all(credentials.map(async(c,i)=>{const user=client();await user.json('/api/login','POST',c);await user.json('/api/profile','POST',{name:keepForExport?'長姓名測試'+'測'.repeat(45):`合成測試${i+1}`,groupName:keepForExport?'同組'+'組'.repeat(48):`測試${i%5+1}組`,activityCode:code});return user;}));
 const loginMs=performance.now()-start;
 console.log('50 isolated learner logins completed; starting concurrent image uploads.');
 async function round(version){const start=performance.now();const result=await Promise.all(users.map(user=>user.json('/api/submission','PUT',jpeg,{'If-Match':String(version),'X-Request-Id':crypto.randomUUID()})));assert.ok(result.every(r=>r.submission.version===version+1));return Math.round(performance.now()-start);}
 const uploadMs=await round(0),replaceMs=await round(1);
 const {submissions,total}=await admin.json(prefix+'/submissions');assert.equal(total,50);assert.ok(submissions.every(s=>s.version===2));
 for(let i=0;i<submissions.length;i+=5){await Promise.all(submissions.slice(i,i+5).map(async s=>{const res=await admin.req(s.imageUrl);assert.equal(res.status,200);const bytes=await res.arrayBuffer();assert.equal(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),digest);}));}
 assert.equal((await client().req(submissions[0].imageUrl)).status,401);assert.equal((await users[1].req(submissions[0].imageUrl)).status,403);assert.equal((await users[0].req('/api/submission','PUT',jpeg,{'If-Match':'0','X-Request-Id':crypto.randomUUID()})).status,409);
 outcome={environment:url.origin,accounts:50,imageBytes:jpeg.length,loginMs:Math.round(loginMs),simultaneousUploadMs:uploadMs,simultaneousReplaceMs:replaceMs,latestSubmissionCount:total,verifiedImageHashes:50,passed:true};
 console.log(JSON.stringify(outcome,null,2));
}finally{
 await admin.json('/api/admin/activities/'+activity.id,'PATCH',{isOpen:false});
 if(outcome&&keepForExport)await writeFile('.deploy/export-verification-activity.json',JSON.stringify({environment:url.origin,activityId:activity.id,code,digest,imageBytes:jpeg.length},null,2)+'\n');
 else {await admin.json(prefix+'/submissions','DELETE',{confirmCode:code});const {accounts}=await admin.json(prefix+'/accounts');for(let i=0;i<accounts.length;i+=5)await Promise.all(accounts.slice(i,i+5).map(a=>admin.json('/api/admin/accounts/'+a.id,'PATCH',{disabled:true})));}
 await mkdir('.deploy',{recursive:true});if(outcome)await writeFile('.deploy/'+(url.hostname==='127.0.0.1'?'local-runtime':'cloud-preview')+'-verification.json',JSON.stringify(outcome,null,2)+'\n');
}
