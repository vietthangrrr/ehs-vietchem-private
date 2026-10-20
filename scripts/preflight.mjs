import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { runtimePaths, ensureRuntimeDirs } from '../lib/runtime-paths.mjs';

const root=fileURLToPath(new URL('..', import.meta.url));
const paths=await ensureRuntimeDirs(runtimePaths(root));
const checks=[];
function cmd(name,args=['--version']){
  const r=spawnSync(name,args,{encoding:'utf8'});
  return {ok:r.status===0,detail:(r.stdout||r.stderr||'').trim().split('\n')[0]||`exit ${r.status}`};
}
checks.push(['Node >=22.5',(()=>{const [maj,min]=process.versions.node.split('.').map(Number);return {ok:maj>22||(maj===22&&min>=5),detail:process.versions.node}})()]);
for(const [label,name,args] of [
  ['pdftotext','pdftotext',['-v']],
  ['pdftoppm','pdftoppm',['-v']],
  ['tesseract','tesseract',['--version']],
]) checks.push([label,cmd(name,args)]);
let im=cmd('magick',['-version']);if(!im.ok)im=cmd('convert',['-version']);checks.push(['ImageMagick (magick/convert)',im]);
for(const [label,p] of [['Persistent Data',paths.dataDir],['Uploads',paths.uploadDir],['Backups',paths.backupDir],['Logs',paths.logDir]]){
  await mkdir(p,{recursive:true});let ok=true,detail=p;try{await access(p,constants.R_OK|constants.W_OK)}catch(e){ok=false;detail=e.message}checks.push([`${label} readable+writable`,{ok,detail}]);
}
const width=Math.max(...checks.map(x=>x[0].length));
console.log('VIETCHEM EHS CP7.0A local/runtime preflight');
console.log('='.repeat(44));
for(const [label,r] of checks)console.log(`${r.ok?'PASS':'FAIL'}  ${label.padEnd(width)}  ${r.detail}`);
const hardFail=checks.filter(([label,r])=>!r.ok && (label.startsWith('Node')||label.includes('readable')));
const ocrFail=checks.filter(([label,r])=>!r.ok && ['pdftotext','pdftoppm','tesseract','ImageMagick (magick/convert)'].includes(label));
console.log(`\nPersistent home: ${paths.home}`);
console.log(`Database:        ${paths.dbPath}`);
console.log(`Uploads:         ${paths.uploadDir}`);
console.log(`Backups:         ${paths.backupDir}`);
console.log('\nCore:',hardFail.length?'BLOCKED':'READY');
console.log('OCR runtime:',ocrFail.length?`DEGRADED (${ocrFail.map(x=>x[0]).join(', ')})`:'READY');
process.exitCode=hardFail.length?1:0;
