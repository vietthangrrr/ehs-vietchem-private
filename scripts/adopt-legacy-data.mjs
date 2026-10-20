import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runtimePaths, ensureRuntimeDirs } from '../lib/runtime-paths.mjs';
import { createBackupArchive, validateBackupArchive, restoreBackupArchive } from '../lib/backup.mjs';

const root=fileURLToPath(new URL('..', import.meta.url));
const sourceRaw=process.argv[2];const replace=process.argv.includes('--replace');
if(!sourceRaw){console.error('Usage: node scripts/adopt-legacy-data.mjs <old-app-folder> [--replace]');process.exit(2)}
const source=resolve(String(sourceRaw).replace(/^"|"$/g,''));
const sourceDb=join(source,'data','ehs.sqlite');const sourceUploads=join(source,'uploads');
if(!existsSync(sourceDb)){console.error('Không tìm thấy database bản cũ:',sourceDb);process.exit(1)}
const p=await ensureRuntimeDirs(runtimePaths(root));
if(existsSync(p.dbPath)&&!replace){console.error('Persistent database đã tồn tại:',p.dbPath);console.error('Không ghi đè. Nếu chắc chắn muốn thay thế, chạy lại với --replace.');process.exit(3)}
await mkdir(p.backupDir,{recursive:true});
function stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}
async function backupDb(db,uploadDir,appVersion,prefix){const out=await createBackupArchive({db,dataDir:'',uploadDir,appVersion});const chk=validateBackupArchive(out.buffer);if(!chk.ok)throw new Error(`Backup invalid: ${chk.problems.join('; ')}`);const path=join(p.backupDir,`${prefix}_${stamp()}.tar.gz`);await writeFile(path,out.buffer);return {path,out}}
if(existsSync(p.dbPath)&&replace){const targetDb=new DatabaseSync(p.dbPath);try{const safety=await backupDb(targetDb,p.uploadDir,'pre-legacy-replace','before_legacy_replace');console.log('Đã backup dữ liệu persistent hiện tại:',safety.path)}finally{targetDb.close()}}
const legacyDb=new DatabaseSync(sourceDb);let legacy;try{legacy=await backupDb(legacyDb,sourceUploads,'legacy-import','legacy_import')}finally{legacyDb.close()}
console.log('Đã tạo backup nguồn legacy:',legacy.path);
await restoreBackupArchive(legacy.out.buffer,{dataDir:p.dataDir,uploadDir:p.uploadDir});
console.log('Đã nhận dữ liệu bản cũ vào persistent store.');console.log('Database:',p.dbPath);console.log('Uploads :',p.uploadDir);console.log('Backups :',p.backupDir);console.log('Bây giờ chạy start-windows.bat của Checkpoint 6 để migration schema an toàn.');
