import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import worker from '../cloudflare/worker.mjs';
import {LocalD1} from './local-d1.mjs';
const root=resolve('.'),data=resolve(root,'.deploy');await mkdir(data,{recursive:true});
const privateFile=(key,fallback)=>{const name=process.env[key]||fallback;if(name!==name.split(/[\\/]/).at(-1)||name==='.'||name==='..')throw Error(`${key} must be a filename within .deploy.`);return resolve(data,name);};
const secretsPath=privateFile('TRAINING_PREVIEW_SECRETS','local-secrets.json');let secrets;try{secrets=JSON.parse(await readFile(secretsPath,'utf8'));}catch{secrets={ADMIN_PASSWORD:randomBytes(24).toString('hex'),AUTH_SECRET:randomBytes(32).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex')};await writeFile(secretsPath,JSON.stringify(secrets));}
const db=new LocalD1(privateFile('TRAINING_PREVIEW_DB','local.sqlite'));const exists=db.db.prepare("SELECT 1 FROM sqlite_master WHERE name='activities'").get();if(!exists)db.db.exec(await readFile('cloudflare/migrations/0001_training.sql','utf8'));
const usageExists=db.db.prepare("SELECT 1 FROM sqlite_master WHERE name='usage_sessions'").get();if(!usageExists)db.db.exec(await readFile('cloudflare/migrations/0002_usage_tracking.sql','utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8'};
const publicRoot=resolve(data,'site');
const env={DB:db,...secrets,ASSETS:{async fetch(request){let path;try{path=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Bad path',{status:400});}if(path.endsWith('/'))path+='index.html';let file=resolve(publicRoot,'.'+path);if(!file.startsWith(publicRoot+sep))return new Response('Forbidden',{status:403});try{await stat(file);}catch{if(!extname(file))file+='.html';}try{return new Response(await readFile(file),{headers:{'Content-Type':mime[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}};
const server=createServer(async(req,res)=>{try{const host=`http://127.0.0.1:${server.address().port}`,request=new Request(new URL(req.url,host),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Local preview error');}});
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>{console.log(`Local SQLite preview: http://127.0.0.1:${server.address().port}/v2/submit.html`);console.log('Local-only admin credentials are in .deploy/local-secrets.json (ignored by Git).');});
process.on('SIGINT',()=>server.close(()=>{db.close();process.exit(0);}));
