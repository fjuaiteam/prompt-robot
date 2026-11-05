// Only connects this project's existing Worker to its approved GitHub repository.
// Reuses existing Wrangler authentication; never prints OAuth or build tokens.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!/^[a-f0-9]{32}$/.test(accountId||''))throw Error('Set CLOUDFLARE_ACCOUNT_ID from wrangler whoami.');
let token=process.env.CLOUDFLARE_API_TOKEN;
if(!token){const raw=await readFile(join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');token=raw.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];}
if(!token)throw Error('No existing Cloudflare authentication.');
async function cf(path,method='GET',body){const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${path}`,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await res.json();if(!res.ok||!data.success)throw Error(`${method} ${path} rejected (HTTP ${res.status}; codes ${data.errors?.map(e=>e.code).join(',')||'unknown'}).`);return data.result;}
const workers=await cf('workers/scripts'),worker=workers.find(w=>w.id==='prompt-robot-training');
if(!worker?.tag)throw Error('Deploy this project Worker before connecting Git.');
const list=await cf('builds/tokens'),tokens=Array.isArray(list)?list:list.tokens||[];
const safe=tokens.map(t=>({id:t.build_token_uuid,name:t.build_token_name}));
if(!process.argv.includes('--connect')){console.log(JSON.stringify({workerFound:true,workerTag:worker.tag,availableBuildTokens:safe},null,2));process.exit(0);}
const buildTokenId=process.env.CLOUDFLARE_BUILD_TOKEN_UUID;
if(!buildTokenId||!safe.some(t=>t.id===buildTokenId))throw Error('Select an existing authorized build token explicitly with CLOUDFLARE_BUILD_TOKEN_UUID; no other project token is selected automatically.');
const body={script_tag:worker.tag,git_repository:{provider_type:'github',provider_account_id:'343028677',provider_account_name:'fjuaiteam',repo_id:'1421910354',repo_name:'prompt-robot',branch:'main'},production_settings:{build_command:'npm run check && npm test && npm run build',deploy_command:'npx wrangler deploy',build_token_uuid:buildTokenId,root_directory:'/',environment_variables:{NODE_VERSION:{value:'24.12.0',is_secret:false}}},previews_enabled:false};
await cf('builds/workers','POST',body);
const verified=await cf('builds/workers/'+worker.tag);
await mkdir('.deploy',{recursive:true});
const summary={worker:'prompt-robot-training',repository:'fjuaiteam/prompt-robot',productionBranch:verified.git_repository?.branch||verified.repo_connection?.production_branch,previewsEnabled:verified.previews_enabled,verifiedAt:new Date().toISOString()};
await writeFile('.deploy/github-build-connection.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
