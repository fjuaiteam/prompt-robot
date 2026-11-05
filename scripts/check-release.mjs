import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const staged=execFileSync('git',['diff','--cached','--name-only','-z']).toString('utf8').split('\0').filter(Boolean);
assert.ok(staged.length,'No staged files to inspect.');
const sensitive=[];
for(const path of ['.deploy/local-secrets.json','.deploy/preview-secrets.json','.deploy/production-secrets.json']){try{sensitive.push(...Object.values(JSON.parse(await readFile(path,'utf8'))));}catch{}}
try{const rows=(await readFile('.deploy/TRAIN1118-學員帳密.csv','utf8')).trim().split(/\r?\n/).slice(1);sensitive.push(...rows.map(row=>row.split(',')[1].slice(1,-1)));}catch{}
for(const path of staged){assert.ok(!/^(\.deploy|\.wrangler|node_modules)\//.test(path),`Forbidden artifact: ${path}`);assert.ok(!/\.dev\.vars|\.env($|\.)|\.(mp4|pptx|db|sqlite|log|bak)$/.test(path),`Forbidden file: ${path}`);const bytes=execFileSync('git',['show',':'+path],{maxBuffer:20000000});for(const value of sensitive){assert.ok(!bytes.includes(Buffer.from(value)),`Secret found in staged file ${path}`);}}
assert.equal(execFileSync('git',['diff','origin/main','--','v1']).length,0,'v1 changed');
const manifest=JSON.parse(await readFile('.deploy/asset-manifest.json','utf8'));assert.ok(manifest.every(p=>!/(^|\/)(tests|docs|資源|\.deploy|node_modules)\//.test(p)&&!p.includes('.dev.vars')&&!p.endsWith('.mp4')),'Deployment contains private artifacts');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));assert.notEqual(config.d1_databases[0].database_id,config.env.preview.d1_databases[0].database_id);assert.equal(config.assets.run_worker_first,true);
console.log(`Release check passed: ${staged.length} staged files; no known secrets/private artifacts; v1 unchanged; ${manifest.length} allowlisted assets; isolated D1.`);
