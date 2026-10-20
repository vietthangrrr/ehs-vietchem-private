import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, dirname, normalize, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import crypto from 'node:crypto';

const BLOCK=512;
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const pad=(n,m=BLOCK)=>Math.ceil(n/m)*m;
function oct(n,len){const s=Math.max(0,Number(n)||0).toString(8);return (s.padStart(len-1,'0')+'\0').slice(-len)}
function writeStr(buf,off,len,s){Buffer.from(String(s||''),'utf8').copy(buf,off,0,len)}
function tarHeader(name,size,mtime=Math.floor(Date.now()/1000),mode=0o600){
  if(Buffer.byteLength(name)>100) throw new Error(`Backup path too long: ${name}`);
  const h=Buffer.alloc(BLOCK,0);
  writeStr(h,0,100,name);writeStr(h,100,8,oct(mode,8));writeStr(h,108,8,oct(0,8));writeStr(h,116,8,oct(0,8));writeStr(h,124,12,oct(size,12));writeStr(h,136,12,oct(mtime,12));
  h.fill(0x20,148,156);h[156]='0'.charCodeAt(0);writeStr(h,257,6,'ustar\0');writeStr(h,263,2,'00');
  let sum=0;for(const b of h)sum+=b;writeStr(h,148,8,oct(sum,8));return h;
}
function makeTar(entries){
  const parts=[];
  for(const e of entries){const data=Buffer.isBuffer(e.data)?e.data:Buffer.from(e.data);parts.push(tarHeader(e.name,data.length,e.mtime,e.mode),data);const extra=pad(data.length)-data.length;if(extra)parts.push(Buffer.alloc(extra));}
  parts.push(Buffer.alloc(BLOCK*2));return Buffer.concat(parts);
}
function parseOct(buf){return parseInt(buf.toString('utf8').replace(/\0.*$/,'').trim()||'0',8)||0}
function safeArchivePath(name){const n=normalize('/'+name).replace(/^[/\\]+/,'');if(!n||n.startsWith('..')||n.includes('/../')||n.includes('\\..\\'))throw new Error(`Unsafe backup entry: ${name}`);return n.replaceAll('\\','/')}
function parseTar(tar){
  const entries=[];let off=0;
  while(off+BLOCK<=tar.length){const h=tar.subarray(off,off+BLOCK);if(h.every(b=>b===0))break;const name=safeArchivePath(h.subarray(0,100).toString('utf8').replace(/\0.*$/,''));const size=parseOct(h.subarray(124,136));const type=String.fromCharCode(h[156]||48);off+=BLOCK;if(off+size>tar.length)throw new Error('Truncated backup archive');const data=Buffer.from(tar.subarray(off,off+size));if(type==='0'||type==='\0')entries.push({name,data,size});off+=pad(size);}
  return entries;
}
async function walkFiles(dir,prefix='uploads'){
  const out=[];async function walk(current,rel=''){for(const ent of await readdir(current,{withFileTypes:true})){const full=join(current,ent.name),r=rel?`${rel}/${ent.name}`:ent.name;if(ent.isDirectory())await walk(full,r);else if(ent.isFile())out.push({full,name:`${prefix}/${r}`})}};
  try{await walk(dir)}catch(e){if(e.code!=='ENOENT')throw e}return out;
}
function sqlQuote(s){return `'${String(s).replaceAll("'","''")}'`}

export async function createBackupArchive({db,dataDir,uploadDir,appVersion='unknown'}){
  const work=join(tmpdir(),`gami-ehs-backup-${crypto.randomUUID()}`);await mkdir(work,{recursive:true});
  try{
    const snap=join(work,'ehs.sqlite');
    db.exec('PRAGMA wal_checkpoint(FULL)');
    db.exec(`VACUUM INTO ${sqlQuote(snap)}`);
    const files=[{full:snap,name:'data/ehs.sqlite'},...(await walkFiles(uploadDir))];
    const manifest={format:'GAMI_EHS_BACKUP',format_version:1,created_at:new Date().toISOString(),app_version:appVersion,files:[]};
    const entries=[];
    for(const f of files){const data=await readFile(f.full);manifest.files.push({path:f.name,size_bytes:data.length,sha256:sha256(data)});entries.push({name:f.name,data})}
    const m=Buffer.from(JSON.stringify(manifest,null,2));entries.unshift({name:'manifest.json',data:m});
    return {buffer:gzipSync(makeTar(entries),{level:6}),manifest};
  }finally{await rm(work,{recursive:true,force:true})}
}

export function validateBackupArchive(buffer){
  const raw=gunzipSync(buffer);const entries=parseTar(raw);const map=new Map(entries.map(e=>[e.name,e.data]));const mb=map.get('manifest.json');if(!mb)throw new Error('Backup manifest missing');
  const manifest=JSON.parse(mb.toString('utf8'));if(manifest.format!=='GAMI_EHS_BACKUP'||manifest.format_version!==1)throw new Error('Unsupported backup format');
  const problems=[];for(const f of manifest.files||[]){const data=map.get(safeArchivePath(f.path));if(!data)problems.push(`Missing ${f.path}`);else{if(data.length!==f.size_bytes)problems.push(`Size mismatch ${f.path}`);if(sha256(data)!==f.sha256)problems.push(`Checksum mismatch ${f.path}`)}}
  if(!map.has('data/ehs.sqlite'))problems.push('Database snapshot missing');
  return {ok:problems.length===0,problems,manifest,entries};
}

export async function restoreBackupArchive(buffer,{dataDir,uploadDir}){
  const check=validateBackupArchive(buffer);if(!check.ok)throw new Error(`Invalid backup: ${check.problems.join('; ')}`);
  const map=new Map(check.entries.map(e=>[e.name,e.data]));await mkdir(dataDir,{recursive:true});await mkdir(uploadDir,{recursive:true});
  const dbData=map.get('data/ehs.sqlite');const tmpDb=join(dataDir,`ehs.restore.${crypto.randomUUID()}.sqlite`);await writeFile(tmpDb,dbData);
  const stagedUploads=join(dirname(uploadDir),`.uploads.restore.${crypto.randomUUID()}`);await mkdir(stagedUploads,{recursive:true});
  for(const [name,data] of map){if(!name.startsWith('uploads/'))continue;const rel=name.slice('uploads/'.length);if(!rel)continue;const dest=join(stagedUploads,rel);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data)}
  await rm(join(dataDir,'ehs.sqlite'),{force:true});await writeFile(join(dataDir,'ehs.sqlite'),await readFile(tmpDb));await rm(tmpDb,{force:true});
  await rm(uploadDir,{recursive:true,force:true});await mkdir(uploadDir,{recursive:true});
  try{const children=await readdir(stagedUploads,{withFileTypes:true});for(const ent of children){const src=join(stagedUploads,ent.name),dst=join(uploadDir,ent.name);if(ent.isDirectory()){await mkdir(dst,{recursive:true});await copyTree(src,dst)}else await writeFile(dst,await readFile(src))}}finally{await rm(stagedUploads,{recursive:true,force:true})}
  return check.manifest;
}
async function copyTree(src,dst){await mkdir(dst,{recursive:true});for(const e of await readdir(src,{withFileTypes:true})){const s=join(src,e.name),d=join(dst,e.name);if(e.isDirectory())await copyTree(s,d);else await writeFile(d,await readFile(s))}}
