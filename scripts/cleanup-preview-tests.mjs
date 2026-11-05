// Cleanup only synthetic activities made by this test suite in the dedicated preview.
import {readFile,writeFile} from 'node:fs/promises';
const base='https://prompt-robot-training-preview.canadaur77.workers.dev';
const secrets=JSON.parse(await readFile('.deploy/preview-secrets.json','utf8'));let cookie='';
async function api(path,method='GET',data){const res=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)});if(res.headers.has('Set-Cookie'))cookie=res.headers.get('Set-Cookie').split(';')[0];if(!res.ok)throw Error(`Preview cleanup: ${method} ${path} -> ${res.status}`);return res.json();}
await api('/api/login','POST',{username:'admin',password:secrets.ADMIN_PASSWORD});
const {activities}=await api('/api/admin/activities');let activityCount=0,disabled=0,deleted=0;
for(const a of activities){if(!/^(TEST|VERIFY)[A-F0-9]{8}$/.test(a.code)||!(a.name==='瀏覽器驗收活動'||a.name==='隔離負載驗證 '+a.code))continue;
 const path='/api/admin/activities/'+a.id;await api(path,'PATCH',{isOpen:false});deleted+=(await api(path+'/submissions','DELETE',{confirmCode:a.code})).deleted;const {accounts}=await api(path+'/accounts');const active=accounts.filter(x=>!x.disabled);for(let i=0;i<active.length;i+=5)await Promise.all(active.slice(i,i+5).map(x=>api('/api/admin/accounts/'+x.id,'PATCH',{disabled:true})));disabled+=active.length;activityCount++;
}
await api('/api/logout','POST',{});const report={environment:base,closedSyntheticActivities:activityCount,deletedSyntheticImages:deleted,disabledSyntheticAccounts:disabled,cleanedAt:new Date().toISOString()};await writeFile('.deploy/preview-cleanup.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
