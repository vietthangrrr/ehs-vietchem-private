import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { restoreBackupArchive } from '../lib/backup.mjs';
import { runtimePaths, ensureRuntimeDirs } from '../lib/runtime-paths.mjs';
const backup=process.argv[2],target=process.argv[3]||null;
if(!backup){console.error('Usage: node scripts/restore-backup.mjs <backup.tar.gz> [optional-data-dir]');process.exit(2)}
const root=fileURLToPath(new URL('..', import.meta.url));
const paths=await ensureRuntimeDirs(runtimePaths(root));
const dataDir=target?resolve(target):paths.dataDir;
const uploadDir=target?join(dataDir,'uploads'):paths.uploadDir;
const manifest=await restoreBackupArchive(await readFile(resolve(backup)),{dataDir,uploadDir});
console.log(`Restored VIETCHEM EHS backup ${manifest.created_at}`);
console.log(`Database -> ${join(dataDir,'ehs.sqlite')}`);
console.log(`Uploads  -> ${uploadDir}`);
