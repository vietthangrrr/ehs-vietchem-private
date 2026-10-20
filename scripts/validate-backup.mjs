import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateBackupArchive } from '../lib/backup.mjs';
const f=process.argv[2];if(!f){console.error('Usage: node scripts/validate-backup.mjs <backup.tar.gz>');process.exit(2)}
const out=validateBackupArchive(await readFile(resolve(f)));console.log(JSON.stringify({ok:out.ok,problems:out.problems,manifest:out.manifest},null,2));if(!out.ok)process.exit(1);
