import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runtimePaths, ensureRuntimeDirs } from '../lib/runtime-paths.mjs';
import { snapshotCounts } from '../lib/data-health.mjs';
const root=fileURLToPath(new URL('..', import.meta.url));const p=await ensureRuntimeDirs(runtimePaths(root));
console.log('VIETCHEM EHS persistent data status');console.log('===================================');
console.log('Home:     ',p.home);console.log('Database: ',p.dbPath);console.log('Uploads:  ',p.uploadDir);console.log('Backups:  ',p.backupDir);
if(!existsSync(p.dbPath)){console.log('\nDatabase chưa tồn tại. Chạy start-windows.bat để tạo mới hoặc MIGRATE_OLD_DATA.bat để nhận dữ liệu bản cũ.');process.exit(0)}
const db=new DatabaseSync(p.dbPath,{readOnly:true});
try{const counts=snapshotCounts(db);console.log('\nRows:');for(const [k,v] of Object.entries(counts))console.log(`- ${k}: ${v}`);const has=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();if(has){console.log('\nMigrations:');for(const m of db.prepare('SELECT id,applied_at,app_version FROM schema_migrations ORDER BY applied_at').all())console.log(`- ${m.id} | ${m.applied_at} | ${m.app_version}`)}}finally{db.close()}
