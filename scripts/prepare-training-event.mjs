// Provision only this project's seeded training event; secrets and account CSV remain ignored locally.
import {readFile,writeFile,access} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://prompt-robot-training.ooo-training.workers.dev';
const secrets=JSON.parse(await readFile('.deploy/production-secrets.json','utf8'));let cookie='';
async function api(path,method='GET',data){const res=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)});if(res.headers.has('Set-Cookie'))cookie=res.headers.get('Set-Cookie').split(';')[0];if(!res.ok)throw Error(`${method} ${path} -> HTTP ${res.status}`);return res.json();}
await api('/api/login','POST',{username:'admin',password:secrets.ADMIN_PASSWORD});
const path='/api/admin/activities/training-20261118';const {accounts}=await api(path+'/accounts');
if(accounts.length===0){const {credentials}=await api(path+'/accounts','POST',{count:50});const rows=[['帳號','密碼','活動代碼'],...credentials.map(c=>[c.username,c.password,'TRAIN1118'])];const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\r\n');await writeFile('.deploy/TRAIN1118-學員帳密.csv',csv,{flag:'wx'});}
else {assert.equal(accounts.length,50,'Refusing to alter an unexpected number of existing real accounts.');await access('.deploy/TRAIN1118-學員帳密.csv');}
const verified=await api('/api/admin/activities'),activity=verified.activities.find(a=>a.id==='training-20261118');assert.equal(activity.accountCount,50);assert.equal(activity.submissionCount,0);assert.equal(activity.isOpen,false);
const handoff=`# 11/18 教育訓練交接（內含管理密碼，勿上傳 GitHub）\n\n網站：${base}\n學員交件：${base}/v2/submit.html\n講師管理：${base}/v2/admin.html\n活動名稱：2026/11/18 教育訓練\n活動代碼：TRAIN1118\n講師管理密碼：${secrets.ADMIN_PASSWORD}\n\n50 組學員帳密：同資料夾的 TRAIN1118-學員帳密.csv。請一人發一組。\n活動目前未開放，講師準備好後在管理頁按「開放交件」即可。\n\n## 最簡單的上課流程\n1. 講師登入管理頁，選擇11/18活動，按「開放交件」。\n2. 發網站網址、每人帳密與活動代碼。\n3. 學員登入，確認姓名與組別；按「畫圖片」使用易學版，至自己的 AI 帳號產圖並下載。\n4. 回「登入／交件」選圖片、看預覽、按「確認上傳」。每人一張，可重交。\n5. 講師登入管理頁查看已交人數，課後下載全部圖片 ZIP 與清單 CSV。\n\n密碼遺失：在「學員帳號」重設，再下載新帳密；舊密碼會失效。\n作品不會自動刪除；先匯出、截止活動，再依活動代碼確認刪除。\n\n課前仍須在教室實際網路與電腦演練一次，確認現場可登入 AI、下載圖片與回站交件。\n`;
await writeFile('.deploy/教育訓練交接_勿上傳.md',handoff);
await writeFile('.deploy/production-readiness.json',JSON.stringify({url:base,activityId:activity.id,accountCount:activity.accountCount,submissionCount:activity.submissionCount,isOpen:activity.isOpen,preparedAt:new Date().toISOString()},null,2)+'\n');
console.log('Production event prepared: 50 accounts, no submissions, remains CLOSED for lecturer to open. Credentials and handoff saved under .deploy; no secret values printed.');
