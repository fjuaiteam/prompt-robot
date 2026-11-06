import {execFileSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const files=['cloudflare/worker.mjs','v2/assets/training-common.js','v2/assets/submission.js','v2/assets/training-admin.js','v2/assets/session-tracking.js','v2/assets/v2.js','v2/assets/studio.js',...readdirSync('scripts').filter(f=>f.endsWith('.mjs')).map(f=>'scripts/'+f),...readdirSync('v2/tests').filter(f=>f.endsWith('.mjs')).map(f=>'v2/tests/'+f)];
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('Training JavaScript syntax checks passed.');
