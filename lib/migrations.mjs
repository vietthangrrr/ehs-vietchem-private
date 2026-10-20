import crypto from 'node:crypto';

function tableExists(db,name){
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}
function migrationDigest(m){
  return crypto.createHash('sha256').update(`${m.id}|${m.signature||m.description||''}`).digest('hex');
}
export function appliedMigrations(db){
  if(!tableExists(db,'schema_migrations')) return [];
  return db.prepare('SELECT id,checksum,applied_at,app_version FROM schema_migrations ORDER BY applied_at,id').all();
}
export function pendingMigrations(db,migrations){
  const applied=new Map(appliedMigrations(db).map(x=>[x.id,x]));
  const pending=[];
  for(const m of migrations){
    const checksum=migrationDigest(m),old=applied.get(m.id);
    if(old && old.checksum!==checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${m.id}`);
    if(!old) pending.push({...m,checksum});
  }
  return pending;
}
export function runMigrations(db,migrations,{appVersion}){
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(
    id TEXT PRIMARY KEY,checksum TEXT NOT NULL,description TEXT,applied_at TEXT NOT NULL,app_version TEXT NOT NULL
  )`);
  const pending=pendingMigrations(db,migrations);
  const applied=[];
  for(const m of pending){
    db.exec('BEGIN IMMEDIATE');
    try{
      m.up(db);
      db.prepare('INSERT INTO schema_migrations(id,checksum,description,applied_at,app_version) VALUES(?,?,?,?,?)')
        .run(m.id,m.checksum,m.description||null,new Date().toISOString(),appVersion);
      db.exec('COMMIT');
      applied.push(m.id);
    }catch(e){
      try{db.exec('ROLLBACK')}catch{}
      throw new Error(`MIGRATION_FAILED:${m.id}:${e.message||e}`);
    }
  }
  return {applied,pending_count:pending.length,latest:migrations.at(-1)?.id||null};
}
