const MAX_IMAGE = 1000000;
const STORAGE_LIMIT = 200000000;
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2,'0')).join('');
export async function hash(value) { return hex(await crypto.subtle.digest('SHA-256',enc.encode(value))); }
export async function hmac(secret,value) {
  const key = await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,enc.encode(value)));
}
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(24)));
function equal(a,b) { let n=a.length ^ b.length; for(let i=0;i<Math.max(a.length,b.length);i++) n |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0); return n===0; }
class HttpError extends Error { constructor(status,code,message){super(message);Object.assign(this,{status,code});} }
function fail(status,code,message){throw new HttpError(status,code,message);}
function json(data,status=200,extra={}) { return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}}); }
function text(value,label,max=80) { if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value)) fail(400,'INVALID_INPUT',`${label}請填寫 1–${max} 個字。`); return value.trim(); }
async function bodyJson(request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'CONTENT_TYPE','請使用 JSON 資料。');
  const raw=await readLimited(request,16384);
  try { const data=JSON.parse(new TextDecoder().decode(raw));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data; } catch {fail(400,'INVALID_JSON','資料格式不正確。');}
}
async function readLimited(request,max) {
  const declared=Number(request.headers.get('Content-Length'));
  if(declared>max) fail(413,'TOO_LARGE','檔案或資料超過允許大小。');
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader(),chunks=[];let total=0;
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();fail(413,'TOO_LARGE','圖片須壓縮至 1 MB 以內。');}chunks.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function checkOrigin(request){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(origin!==url.origin)fail(403,'ORIGIN','請從本站頁面操作。');
  const site=request.headers.get('Sec-Fetch-Site');if(site&&site!=='same-origin'&&site!=='none')fail(403,'ORIGIN','請從本站頁面操作。');
}
function cookie(request,token='',maxAge=0){const secure=new URL(request.url).protocol==='https:';return `${secure?'__Host-':''}training_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;}
async function session(request,env) {
  const name=new URL(request.url).protocol==='https:'?'__Host-training_session':'training_session';
  const token=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
  if(!token||! /^[a-f0-9]{48}$/.test(token))fail(401,'LOGIN_REQUIRED','請先登入。');
  const s=await env.DB.prepare(`SELECT s.role,s.account_id,a.username,a.name,a.group_name,a.activity_id,a.disabled
    FROM sessions s LEFT JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await hmac(env.SESSION_SECRET,token),Date.now()).first();
  if(!s||s.role==='student'&&(s.disabled||!s.account_id))fail(401,'LOGIN_REQUIRED','登入已失效，請重新登入。');
  return {...s,tokenHash:await hmac(env.SESSION_SECRET,token)};
}
function admin(s){if(s.role!=='admin')fail(403,'FORBIDDEN','此功能僅供講師使用。');}
function student(s){if(s.role!=='student')fail(403,'FORBIDDEN','請使用學員帳號。');}
const toActivity=a=>a?{id:a.id,name:a.name,code:a.code,isOpen:!!a.is_open,accountCount:a.account_count??undefined,submissionCount:a.submission_count??undefined}:null;
async function me(s,env){return {role:s.role,user:s.role==='student'?{id:s.account_id,username:s.username,name:s.name,groupName:s.group_name,activityId:s.activity_id}:null,activity:s.role==='student'?toActivity(await env.DB.prepare('SELECT * FROM activities WHERE id=?').bind(s.activity_id).first()):null};}
const subMeta=row=>row?{id:row.id,version:row.version,updatedAt:row.updated_at,size:row.size,imageUrl:'/api/submission/image'}:null;
async function getSubmission(env,s){return env.DB.prepare('SELECT id,version,updated_at,size,digest,request_id FROM submissions WHERE account_id=? AND activity_id=?').bind(s.account_id,s.activity_id).first();}
async function login(request,env){
  const data=await bodyJson(request),username=text(data.username,'帳號',80).toLowerCase(),password=typeof data.password==='string'?data.password:'';
  if(password.length>256)fail(400,'INVALID_INPUT','密碼格式不正確。');
  const now=Date.now(),window=600000,ip=request.headers.get('CF-Connecting-IP')||'local';
  const limits=[[await hmac(env.AUTH_SECRET,'ip:'+ip),300],[await hmac(env.AUTH_SECRET,'user:'+username),12]];
  const res=await env.DB.batch(limits.map(([key])=>env.DB.prepare(`INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(key,now+window,now,now)));
  if(res.some((r,i)=>r.results[0].attempts>limits[i][1]))fail(429,'RATE_LIMIT','登入嘗試過多，請稍後再試或請講師協助。');
  let role='student',account=null,ok=false;
  if(username==='admin'){role='admin';ok=equal(await hmac(env.AUTH_SECRET,password),await hmac(env.AUTH_SECRET,env.ADMIN_PASSWORD));}
  else {account=await env.DB.prepare('SELECT * FROM accounts WHERE username=?').bind(username).first();const digest=await hmac(env.AUTH_SECRET,password);ok=!!account&&!account.disabled&&equal(digest,account.password_hash);}
  if(!ok)fail(401,'LOGIN_FAILED','帳號或密碼不正確，或帳號已停用。');
  const token=randomToken(),tokenHash=await hmac(env.SESSION_SECRET,token);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM login_limits WHERE expires_at<=?').bind(now),
    env.DB.prepare('INSERT INTO sessions(token_hash,account_id,role,expires_at) VALUES(?,?,?,?)').bind(tokenHash,account?.id||null,role,now+8*3600000)
  ]);
  const s={role,account_id:account?.id,username:account?.username,name:account?.name,group_name:account?.group_name,activity_id:account?.activity_id};
  return json(await me(s,env),200,{'Set-Cookie':cookie(request,token,28800)});
}
// Validate JPEG structure, dimensions and terminal marker; metadata is discarded by browser encoding.
export function jpegSize(bytes){
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
  let i=2,width=0,height=0,scan=false;
  while(i<bytes.length-2){if(bytes[i++]!==255)return null;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===218){scan=true;break;}if(marker===217)break;
    if(i+2>bytes.length)return null;const len=bytes[i]*256+bytes[i+1];if(len<2||i+len>bytes.length)return null;
    if([192,193,194].includes(marker)){if(len<8)return null;height=bytes[i+3]*256+bytes[i+4];width=bytes[i+5]*256+bytes[i+6];}
    i+=len;
  }
  return scan&&width>0&&height>0&&width<=2048&&height<=2048?{width,height}:null;
}
async function upload(request,env,s){
  student(s);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='image/jpeg')fail(415,'IMAGE_TYPE','請上傳經頁面轉換的 JPEG 圖片。');
  const expected=request.headers.get('If-Match')?.replace(/^"|"$/g,''),requestId=request.headers.get('X-Request-Id');
  if(!/^\d{1,9}$/.test(expected||'')||! /^[a-zA-Z0-9-]{16,80}$/.test(requestId||''))fail(400,'VERSION_REQUIRED','請重新載入交件頁後再試。');
  const bytes=await readLimited(request,MAX_IMAGE);if(!jpegSize(bytes))fail(400,'INVALID_IMAGE','圖片格式不正確，或長邊超過 2,048 像素，請重新選圖。');
  const digest=hex(await crypto.subtle.digest('SHA-256',bytes)),version=Number(expected),now=new Date().toISOString();
  const activity=await env.DB.prepare('SELECT is_open FROM activities WHERE id=?').bind(s.activity_id).first();
  if(!activity?.is_open)fail(409,'ACTIVITY_CLOSED','目前活動尚未開放或已截止交件。');
  if(!s.name||!s.group_name)fail(400,'PROFILE_REQUIRED','請先確認姓名、組別與活動代碼。');
  const old=await getSubmission(env,s);
  if(old?.request_id===requestId){if(old.digest!==digest)fail(409,'REQUEST_CONFLICT','請重新選圖再送出。');return json({submission:subMeta(old)});}
  if((old?.version||0)!==version)fail(409,'VERSION_CONFLICT','作品已更新，請重新載入後確認是否替換。');
  const id=old?.id||crypto.randomUUID();
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO submissions(id,activity_id,account_id,version,size,digest,request_id,updated_at)
      SELECT ?,a.activity_id,a.id,1,?,?,?,? FROM accounts a JOIN activities t ON t.id=a.activity_id
      WHERE a.id=? AND a.disabled=0 AND a.name<>'' AND a.group_name<>'' AND t.is_open=1 AND (?=0 OR EXISTS(SELECT 1 FROM submissions WHERE account_id=a.id))
      ON CONFLICT(activity_id,account_id) DO UPDATE SET version=submissions.version+1,size=excluded.size,digest=excluded.digest,request_id=excluded.request_id,updated_at=excluded.updated_at
      WHERE submissions.version=? AND submissions.request_id<>excluded.request_id RETURNING id,version`).bind(id,bytes.length,digest,requestId,now,s.account_id,version,version),
    env.DB.prepare(`INSERT INTO images(submission_id,data) SELECT id,? FROM submissions WHERE account_id=? AND activity_id=? AND request_id=? AND digest=?
      ON CONFLICT(submission_id) DO UPDATE SET data=excluded.data`).bind(bytes.buffer,s.account_id,s.activity_id,requestId,digest)
  ]);
  const saved=await getSubmission(env,s);
  if(saved?.request_id!==requestId||saved.digest!==digest)fail(409,'VERSION_CONFLICT','作品已更新或活動已截止，請重新載入。');
  if(!results[0].results.length&&saved.request_id!==requestId)fail(409,'VERSION_CONFLICT','請重新載入作品。');
  return json({submission:subMeta(saved)});
}
async function image(env,s,id=null,expected=null){
  if(expected!==null&&!/^\d{1,9}$/.test(expected))fail(400,'INVALID_VERSION','圖片版本不正確，請重新整理。');
  let q;if(s.role==='admin'&&id)q=env.DB.prepare('SELECT i.data,t.version FROM images i JOIN submissions t ON t.id=i.submission_id WHERE i.submission_id=?').bind(id);
  else {student(s);q=env.DB.prepare('SELECT i.data,t.version FROM images i JOIN submissions t ON t.id=i.submission_id WHERE t.account_id=? AND t.activity_id=?').bind(s.account_id,s.activity_id);}
  const row=await q.first();if(!row)fail(404,'NOT_FOUND','尚未找到圖片。');
  if(expected!==null&&row.version!==Number(expected))fail(409,'VERSION_CONFLICT','作品已更新，請重新整理交件清單後再下載。');
  return new Response(new Uint8Array(row.data),{headers:{'Content-Type':'image/jpeg','Content-Disposition':'inline; filename="submission.jpg"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
async function activityById(env,id){const a=await env.DB.prepare('SELECT * FROM activities WHERE id=?').bind(id).first();if(!a)fail(404,'NOT_FOUND','找不到活動。');return a;}
async function adminApi(request,env,s,path){
  admin(s);const method=request.method;
  if(path==='/api/admin/activities'){
    if(method==='GET'){
      const [list,usage]=await Promise.all([env.DB.prepare(`SELECT a.*,(SELECT COUNT(*) FROM accounts WHERE activity_id=a.id) account_count,(SELECT COUNT(*) FROM submissions WHERE activity_id=a.id) submission_count FROM activities a ORDER BY created_at DESC`).all(),env.DB.prepare('SELECT COALESCE(SUM(size),0) size FROM submissions').first()]);
      return json({activities:list.results.map(toActivity),storageBytes:usage.size,storageLimit:STORAGE_LIMIT});
    }
    if(method==='POST'){const d=await bodyJson(request),name=text(d.name,'活動名稱'),code=text(d.code,'活動代碼',32).toUpperCase();if(!/^[A-Z0-9-]{4,32}$/.test(code))fail(400,'INVALID_INPUT','活動代碼請使用 4–32 個英文字母、數字或連字號。');
      const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO activities(id,name,code,created_at) VALUES(?,?,?,?)').bind(id,name,code,new Date().toISOString()).run();return json({activity:toActivity(await activityById(env,id))},201);}
  }
  let m=path.match(/^\/api\/admin\/activities\/([^/]+)$/);
  if(m&&method==='PATCH'){const d=await bodyJson(request);if(typeof d.isOpen!=='boolean')fail(400,'INVALID_INPUT','請指定活動是否開放。');await activityById(env,m[1]);await env.DB.prepare('UPDATE activities SET is_open=? WHERE id=?').bind(d.isOpen?1:0,m[1]).run();return json({activity:toActivity(await activityById(env,m[1]))});}
  m=path.match(/^\/api\/admin\/activities\/([^/]+)\/accounts$/);
  if(m){const a=await activityById(env,m[1]);if(method==='GET'){const rows=await env.DB.prepare(`SELECT a.id,a.username,a.name,a.group_name groupName,a.disabled,EXISTS(SELECT 1 FROM submissions s WHERE s.account_id=a.id) hasSubmission FROM accounts a WHERE activity_id=? ORDER BY username`).bind(a.id).all();return json({accounts:rows.results.map(x=>({...x,disabled:!!x.disabled,hasSubmission:!!x.hasSubmission}))});}
    if(method==='POST'){const d=await bodyJson(request);if(!Number.isInteger(d.count)||d.count<1||d.count>100)fail(400,'INVALID_INPUT','每批帳號請設定 1–100 人。');
      const count=await env.DB.prepare('SELECT COUNT(*) n FROM accounts WHERE activity_id=?').bind(a.id).first();if(count.n+d.count>200)fail(409,'ACCOUNT_LIMIT','每場活動最多建立 200 個帳號。');
      const prefix=a.code.toLowerCase(),credentials=await Promise.all(Array.from({length:d.count},async()=>{const id=crypto.randomUUID(),username=prefix+'-'+randomToken().slice(0,8),password=randomToken().slice(0,24);return {id,username,password,digest:await hmac(env.AUTH_SECRET,password)};}));
      await env.DB.batch(credentials.map(c=>env.DB.prepare('INSERT INTO accounts(id,activity_id,username,password_hash,created_at) VALUES(?,?,?,?,?)').bind(c.id,a.id,c.username,c.digest,new Date().toISOString())));
      return json({activity:toActivity(a),credentials:credentials.map(({username,password})=>({username,password}))},201);
    }
  }
  m=path.match(/^\/api\/admin\/accounts\/([^/]+)(\/reset-password)?$/);
  if(m){const account=await env.DB.prepare('SELECT * FROM accounts WHERE id=?').bind(m[1]).first();if(!account)fail(404,'NOT_FOUND','找不到帳號。');
    if(m[2]&&method==='POST'){await bodyJson(request);const password=randomToken().slice(0,24);await env.DB.batch([env.DB.prepare('UPDATE accounts SET password_hash=? WHERE id=?').bind(await hmac(env.AUTH_SECRET,password),account.id),env.DB.prepare('DELETE FROM sessions WHERE account_id=?').bind(account.id)]);return json({username:account.username,password});}
    if(!m[2]&&method==='PATCH'){const d=await bodyJson(request),name=d.name===undefined?account.name:text(d.name,'姓名',50),group=d.groupName===undefined?account.group_name:text(d.groupName,'組別',50);if(d.disabled!==undefined&&typeof d.disabled!=='boolean')fail(400,'INVALID_INPUT','帳號狀態不正確。');const disabled=d.disabled===undefined?account.disabled:Number(d.disabled);
      await env.DB.batch([env.DB.prepare('UPDATE accounts SET name=?,group_name=?,disabled=? WHERE id=?').bind(name,group,disabled,account.id),env.DB.prepare('DELETE FROM sessions WHERE account_id=? AND ?=1').bind(account.id,disabled)]);return json({account:{id:account.id,username:account.username,name,groupName:group,disabled:!!disabled}});}
  }
  m=path.match(/^\/api\/admin\/activities\/([^/]+)\/submissions$/);
  if(m){const a=await activityById(env,m[1]);if(method==='GET'){const q=(new URL(request.url).searchParams.get('q')||'').trim().slice(0,80),rows=await env.DB.prepare(`SELECT s.id,a.username,a.name,a.group_name groupName,s.version,s.size,s.updated_at updatedAt FROM submissions s JOIN accounts a ON a.id=s.account_id WHERE s.activity_id=? AND (?='' OR instr(a.name,?)>0 OR instr(a.group_name,?)>0 OR instr(a.username,?)>0) ORDER BY s.updated_at DESC`).bind(a.id,q,q,q,q).all(),total=await env.DB.prepare('SELECT COUNT(*) n FROM submissions WHERE activity_id=?').bind(a.id).first();return json({submissions:rows.results.map(r=>({...r,imageUrl:`/api/admin/submissions/${r.id}/image`})),total:total.n});}
    if(method==='DELETE'){const d=await bodyJson(request);if(d.confirmCode!==a.code)fail(400,'CONFIRMATION','請輸入完整活動代碼以確認刪除。');if(a.is_open)fail(409,'ACTIVITY_OPEN','請先截止活動，再刪除作品。');const result=await env.DB.prepare('DELETE FROM submissions WHERE activity_id=?').bind(a.id).run();return json({deleted:result.meta.changes});}
  }
  m=path.match(/^\/api\/admin\/submissions\/([^/]+)\/image$/);if(m&&method==='GET')return image(env,s,m[1],new URL(request.url).searchParams.get('v'));
  fail(404,'NOT_FOUND','找不到此功能。');
}
async function api(request,env){
  if(!env.DB||!env.AUTH_SECRET||!env.SESSION_SECRET||!env.ADMIN_PASSWORD)fail(503,'NOT_CONFIGURED','交件服務尚未完成設定，請聯絡講師。');
  const path=new URL(request.url).pathname,method=request.method;
  if(!['GET','HEAD'].includes(method))checkOrigin(request);
  if(path==='/api/login'&&method==='POST')return login(request,env);
  const s=await session(request,env);
  if(path==='/api/logout'&&method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.tokenHash).run();return json({ok:true},200,{'Set-Cookie':cookie(request)});}
  if(path==='/api/me'&&method==='GET')return json(await me(s,env));
  if(path.startsWith('/api/admin/'))return adminApi(request,env,s,path);
  if(path==='/api/profile'&&method==='POST'){student(s);const d=await bodyJson(request),name=text(d.name,'姓名',50),group=text(d.groupName,'組別',50),code=text(d.activityCode,'活動代碼',32).toUpperCase(),a=await activityById(env,s.activity_id);if(code!==a.code)fail(400,'ACTIVITY_CODE','活動代碼不正確，請向講師確認。');if((s.name&&s.name!==name)||(s.group_name&&s.group_name!==group))fail(403,'PROFILE_LOCKED','姓名與組別已確認，請由講師協助更正。');
    await env.DB.prepare("UPDATE accounts SET name=?,group_name=? WHERE id=? AND disabled=0 AND (name='' OR name=?) AND (group_name='' OR group_name=?)").bind(name,group,s.account_id,name,group).run();const updated=await env.DB.prepare('SELECT name,group_name FROM accounts WHERE id=?').bind(s.account_id).first();if(updated.name!==name||updated.group_name!==group)fail(409,'PROFILE_LOCKED','資料已更新，請重新登入確認。');return json(await me({...s,name,group_name:group},env));}
  if(path==='/api/submission'){student(s);if(method==='GET')return json({submission:subMeta(await getSubmission(env,s))});if(method==='PUT')return upload(request,env,s);}
  if(path==='/api/submission/image'&&method==='GET')return image(env,s,null,new URL(request.url).searchParams.get('v'));
  fail(404,'NOT_FOUND','找不到此功能。');
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/api/')){
      if(!env.ASSETS)return new Response('Static assets are not configured.',{status:503});
      // Only the new sign-in surface and its licensed runtime are public. Existing
      // teaching material, PDFs and versioned apps require an authenticated session.
      const publicPaths=new Set(['/v2/submit','/v2/submit.html','/v2/admin','/v2/admin.html',
        '/v2/assets/training.css','/v2/assets/training-common.js','/v2/assets/submission.js',
        '/v2/assets/training-admin.js','/v2/assets/vendor/fflate.min.js',
        '/v2/assets/vendor/FFLATE-LICENSE.txt','/v2/assets/fonts/geist-latin.woff2',
        '/v2/assets/fonts/GEIST-LICENSE.txt','/THIRD_PARTY_NOTICES.md']);
      if(!publicPaths.has(path)){
        try{await session(request,env);}catch{const url=new URL(request.url),drawing=['/v2/','/v2/index.html'].includes(path)&&url.searchParams.get('mode')==='easy';return new Response(null,{status:302,headers:{Location:drawing?'/v2/submit.html?next=draw':'/v2/submit.html','Cache-Control':'no-store'}});}
      }
      const res=await env.ASSETS.fetch(request);const headers=new Headers(res.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');
      headers.set('Cache-Control','private, no-store');
      if(/\/v2\/(submit|admin)(\.html)?$/.test(path)){headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");headers.set('Cache-Control','no-store');}
      return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
    }
    try{const res=await api(request,env);res.headers.set('X-Content-Type-Options','nosniff');res.headers.set('Referrer-Policy','no-referrer');return res;}
    catch(e){if(e instanceof HttpError)return json({error:{code:e.code,message:e.message}},e.status);
      if(String(e.message).includes('STORAGE_CAPACITY'))return json({error:{code:'STORAGE_FULL',message:'作品儲存空間已滿，請通知講師先匯出與整理。'}},507);
      if(String(e.message).includes('UNIQUE constraint'))return json({error:{code:'DUPLICATE',message:'資料已存在，請重新整理後再試。'}},409);
      // Never expose SQL, credentials or internal exception details.
      return json({error:{code:'SERVICE_UNAVAILABLE',message:'服務暫時忙碌或已達免費額度，請保留圖片稍後重試，並通知講師。'}},503);
    }
  }
};
