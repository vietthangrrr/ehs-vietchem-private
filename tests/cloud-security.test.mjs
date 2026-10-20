import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('CP7 private-cloud gateway enforces Cloudflare identity + same-origin writes',async(t)=>{
  const root=fileURLToPath(new URL('..', import.meta.url)),tmp=await mkdtemp(join(tmpdir(),'ehs-cloud-sec-')),port=19317;
  const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',EHS_DATA_DIR:join(tmp,'data'),EHS_UPLOAD_DIR:join(tmp,'uploads'),EHS_BACKUP_DIR:join(tmp,'backups'),EHS_LOG_DIR:join(tmp,'logs'),EHS_BOOTSTRAP_PASSWORD:'CloudTemp!2026',EHS_ENABLE_LEGAL_WATCH:'0',EHS_AUTO_BACKUP:'0',EHS_REQUIRE_CF_ACCESS:'1',EHS_CF_EMAIL_DOMAINS:'vietchem.test',EHS_ALLOWED_HOSTS:'ehs.vietchem.test',EHS_ALLOWED_ORIGINS:'https://ehs.vietchem.test',EHS_ENFORCE_ORIGIN:'1'},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=String(d));
  for(let i=0;i<160&&!out.includes('VIETCHEM EHS System CP7.1 Railway Web');i++)await new Promise(r=>setTimeout(r,50));
  assert.match(out,/CP7\.1 Railway Web/);t.after(async()=>{child.kill('SIGTERM');await rm(tmp,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${port}`,host={'x-forwarded-host':'ehs.vietchem.test'},cf={'cf-access-authenticated-user-email':'ehs@vietchem.test'};
  let r=await fetch(base+'/healthz');assert.equal(r.status,200);
  r=await fetch(base+'/',{headers:host});assert.equal(r.status,403);assert.equal((await r.json()).error,'PRIVATE_ACCESS_REQUIRED');
  r=await fetch(base+'/api/dashboard',{headers:{...host,...cf}});assert.equal(r.status,401);
  r=await fetch(base+'/api/auth/login',{method:'POST',headers:{...host,...cf,'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'CloudTemp!2026'})});assert.equal(r.status,403);assert.equal((await r.json()).error,'ORIGIN_NOT_ALLOWED');
  r=await fetch(base+'/api/auth/login',{method:'POST',headers:{...host,...cf,origin:'https://ehs.vietchem.test','content-type':'application/json'},body:JSON.stringify({username:'admin',password:'CloudTemp!2026'})});assert.equal(r.status,200);
  r=await fetch(base+'/',{headers:{...host,'cf-access-authenticated-user-email':'outsider@other.test'}});assert.equal(r.status,403);
});
