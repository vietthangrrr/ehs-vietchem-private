import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validateBackupArchive } from '../lib/backup.mjs';

async function start(root,env,port){
  const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,...env,PORT:String(port),EHS_ENABLE_LEGAL_WATCH:'0',EHS_AUTO_BACKUP:'0'},stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',d=>out+=String(d));child.stderr.on('data',d=>err+=String(d));
  for(let i=0;i<200;i++){if(out.includes('VIETCHEM EHS System CP7.2 Login Recovery'))return {child,out:()=>out,err:()=>err};if(child.exitCode!=null)break;await new Promise(r=>setTimeout(r,50))}
  child.kill('SIGTERM');throw new Error(`server did not start\nOUT=${out}\nERR=${err}`);
}
async function stop(child){child.kill('SIGTERM');for(let i=0;i<50&&child.exitCode==null;i++)await new Promise(r=>setTimeout(r,20))}

test('Checkpoint 6 persistent data + migration safety preserves live data across app updates',async()=>{
  const root=fileURLToPath(new URL('..', import.meta.url));
  const tmp=await mkdtemp(join(tmpdir(),'vietchem-ehs-cp6-'));
  const data=join(tmp,'Data'),uploads=join(data,'uploads'),backups=join(tmp,'Backups');
  const env={EHS_HOME_DIR:tmp,EHS_DATA_DIR:data,EHS_UPLOAD_DIR:uploads,EHS_BACKUP_DIR:backups,EHS_BOOTSTRAP_PASSWORD:'TempPass!2026'};
  let s=await start(root,env,19111);await stop(s.child);
  const dbPath=join(data,'ehs.sqlite');let db=new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO tasks(id,title,category,owner,status,progress,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).run('task_cp6_sentinel','DO NOT LOSE - update preservation','QA','EHS','in_progress',37,new Date().toISOString(),new Date().toISOString());
  const beforeEmployees=db.prepare('SELECT COUNT(*) c FROM employees').get().c;
  // Simulate a pre-Checkpoint-6 database: same business schema, no migration/update-hardening metadata.
  db.exec('DROP TABLE IF EXISTS schema_migrations; DROP TABLE IF EXISTS system_meta; DROP TABLE IF EXISTS upgrade_runs; DROP TABLE IF EXISTS backup_history;');
  db.close();
  await writeFile(join(uploads,'sentinel.txt'),'persistent evidence');
  s=await start(root,env,19112);await stop(s.child);
  db=new DatabaseSync(dbPath,{readOnly:true});
  assert.equal(db.prepare("SELECT title FROM tasks WHERE id='task_cp6_sentinel'").get().title,'DO NOT LOSE - update preservation');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM employees').get().c,beforeEmployees);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c,5);
  assert.equal(db.prepare("SELECT value FROM system_meta WHERE key='schema_version'").get().value,'004_cp63_final_five');
  const up=db.prepare('SELECT * FROM upgrade_runs ORDER BY started_at DESC LIMIT 1').get();assert.equal(up.status,'success');assert.ok(up.backup_path);
  db.close();
  const files=(await readdir(backups)).filter(x=>x.startsWith('pre_migration_')&&x.endsWith('.tar.gz'));assert.ok(files.length>=1);
  const check=validateBackupArchive(readFileSync(join(backups,files[0])));assert.equal(check.ok,true);
  assert.ok(check.manifest.files.some(x=>x.path==='uploads/sentinel.txt'));
  await rm(tmp,{recursive:true,force:true});
});
