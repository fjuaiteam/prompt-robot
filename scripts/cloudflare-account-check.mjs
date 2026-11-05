// Read-only account readiness. Existing Wrangler OAuth remains in memory and is never printed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const accountId=process.argv[2];if(!/^[a-f0-9]{32}$/.test(accountId||''))throw Error('Provide the account ID returned by wrangler whoami.');
let token=process.env.CLOUDFLARE_API_TOKEN;
if(!token){const path=join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml');const raw=await readFile(path,'utf8');token=raw.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];}
if(!token)throw Error('No existing Wrangler authentication found; use wrangler login.');
const summary={accountId,checkedAt:new Date().toISOString()};
for(const [key,path] of [['subscriptions','subscriptions'],['databases','d1/database'],['subdomain','workers/subdomain']]){
 const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${path}`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const data=await res.json();
 if(!res.ok||!data.success){summary[key]={available:false,httpStatus:res.status,errorCodes:data.errors?.map(e=>e.code)};continue;}
 if(key==='subscriptions')summary[key]={available:true,plans:data.result.map(s=>({name:s.rate_plan?.public_name||s.rate_plan?.name||s.rate_plan?.id,currency:s.currency,price:s.price,frequency:s.frequency,state:s.state}))};
 if(key==='databases')summary[key]={available:true,databases:data.result.map(d=>({id:d.uuid,name:d.name}))};
 if(key==='subdomain')summary[key]={available:true,subdomain:data.result.subdomain};
}
await mkdir('.deploy',{recursive:true});await writeFile('.deploy/cloudflare-readiness.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
