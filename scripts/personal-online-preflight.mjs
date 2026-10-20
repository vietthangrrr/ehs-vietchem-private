import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { runtimePaths, ensureRuntimeDirs } from '../lib/runtime-paths.mjs';
import { tailscaleIPv4 } from '../lib/private-network.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const paths=await ensureRuntimeDirs(runtimePaths(root));
const ts=tailscaleIPv4();
const checks=[];
function cmd(name,args=['--version']){const r=spawnSync(name,args,{encoding:'utf8',windowsHide:true});return {ok:r.status===0,detail:(r.stdout||r.stderr||'').trim().split('\n')[0]||`exit ${r.status}`}}
const [maj,min]=process.versions.node.split('.').map(Number);checks.push(['Node >=22.5',{ok:maj>22||(maj===22&&min>=5),detail:process.versions.node}]);
checks.push(['Tailscale connected',{ok:!!ts.ip,detail:ts.ip?`${ts.ip} (${ts.source})`:'Không tìm thấy Tailscale IPv4 100.64.0.0/10'}]);
for(const [label,p] of [['Persistent Data',paths.dataDir],['Uploads',paths.uploadDir],['Backups',paths.backupDir],['Logs',paths.logDir]]){await mkdir(p,{recursive:true});let ok=true,detail=p;try{await access(p,constants.R_OK|constants.W_OK)}catch(e){ok=false;detail=e.message}checks.push([`${label} read/write`,{ok,detail}])}
for(const [label,name,args] of [['pdftotext','pdftotext',['-v']],['pdftoppm','pdftoppm',['-v']],['tesseract','tesseract',['--version']]])checks.push([label,cmd(name,args)]);
let im=cmd('magick',['-version']);if(!im.ok)im=cmd('convert',['-version']);checks.push(['ImageMagick',im]);
const width=Math.max(...checks.map(x=>x[0].length));
console.log('VIETCHEM EHS CP7.0A - Personal Private Online preflight');console.log('='.repeat(58));
for(const [label,r] of checks)console.log(`${r.ok?'PASS':'FAIL'}  ${label.padEnd(width)}  ${r.detail}`);
console.log(`\nData home: ${paths.home}`);if(ts.ip)console.log(`Private URL: http://${ts.ip}:${process.env.PORT||8787}`);
const hard=checks.filter(([label,r])=>!r.ok&&(label.startsWith('Node')||label.startsWith('Tailscale')||label.includes('read/write')));
const ocr=checks.filter(([label,r])=>!r.ok&&['pdftotext','pdftoppm','tesseract','ImageMagick'].includes(label));
console.log(`Core private-online: ${hard.length?'BLOCKED':'READY'}`);console.log(`OCR runtime: ${ocr.length?`DEGRADED (${ocr.map(x=>x[0]).join(', ')})`:'READY'}`);
process.exitCode=hard.length?1:0;
