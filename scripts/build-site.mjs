import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.deploy/site');
if(!output.startsWith(resolve(root,'.deploy')+sep))throw Error('Unsafe build path');
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
const runtime=p=>p==='index.html'||p==='THIRD_PARTY_NOTICES.md'||/^v[12]\/[^/]+\.html$/.test(p)||/^v[12]\/assets\//.test(p)&&/\.(js|css|woff2|png|jpg|svg|pdf|txt)$/.test(p);
const additions=['v2/submit.html','v2/admin.html','v2/assets/training.css','v2/assets/training-common.js','v2/assets/submission.js','v2/assets/training-admin.js','v2/assets/vendor/fflate.min.js','v2/assets/vendor/FFLATE-LICENSE.txt'];
await mkdir(resolve(root,'v2/assets/vendor'),{recursive:true});
// Vendored runtime has no CDN dependency. npm integrity is recorded in package-lock.json.
try{await copyFile(resolve(root,'node_modules/fflate/umd/index.js'),resolve(root,'v2/assets/vendor/fflate.min.js'));await copyFile(resolve(root,'node_modules/fflate/LICENSE'),resolve(root,'v2/assets/vendor/FFLATE-LICENSE.txt'));}
catch{await readFile(resolve(root,'v2/assets/vendor/fflate.min.js'));}
const files=[...new Set([...tracked.filter(runtime),...additions])].sort();
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const path of files){const target=resolve(output,path);if(!target.startsWith(output+sep))throw Error('Unsafe asset path');await mkdir(dirname(target),{recursive:true});await copyFile(resolve(root,path),target);}
await writeFile(resolve(root,'.deploy/asset-manifest.json'),JSON.stringify(files,null,2)+'\n');
console.log(`Built ${files.length} allowlisted runtime files. Local media, credentials and test files excluded.`);
