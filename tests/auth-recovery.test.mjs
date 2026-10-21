import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function freePort(){
  const s=createServer();
  await new Promise(ok=>s.listen(0,'127.0.0.1',ok));
  const p=s.address().port;
  await new Promise(ok=>s.close(ok));
  return p;
}

async function start({home,password}){
  const port=await freePort();
  const env={...process.env,PORT:String(port),HOST:'127.0.0.1',EHS_HOME_DIR:home,EHS_ADMIN_PASSWORD:password,EHS_ENABLE_LEGAL_WATCH:'0',EHS_AUTO_BACKUP:'0',EHS_ENFORCE_ORIGIN:'0',EHS_SECURE_COOKIE:'0'};
  const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',d=>stdout+=String(d));
  child.stderr.on('data',d=>stderr+=String(d));
  for(let i=0;i<200;i++){
    if(stdout.includes('CP7.2 Login Recovery')) return {child,port,get stdout(){return stdout},get stderr(){return stderr}};
    if(child.exitCode!=null) throw new Error(`server exited ${child.exitCode}: ${stderr}\n${stdout}`);
    await wait(25);
  }
  child.kill('SIGTERM');
  throw new Error(`server start timeout: ${stderr}\n${stdout}`);
}

async function stop(child){
  if(child.exitCode!=null)return;
  child.kill('SIGTERM');
  for(let i=0;i<100&&child.exitCode==null;i++)await wait(20);
  if(child.exitCode==null)child.kill('SIGKILL');
}

async function login(port,password){
  const r=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password})});
  return {status:r.status,body:await r.json().catch(()=>({}))};
}

test('CP7.2 Railway admin password is deterministic, clears locks, and survives persistent-volume restart',async()=>{
  const home=await mkdtemp(join(tmpdir(),'ehs-auth-recovery-'));
  let a,b;
  try{
    a=await start({home,password:'FirstAdmin!2026'});
    let ok=await login(a.port,'FirstAdmin!2026');
    assert.equal(ok.status,200);

    for(let i=0;i<5;i++){
      const bad=await login(a.port,'wrong-password');
      assert.equal(bad.status,401);
    }
    const blocked=await login(a.port,'still-wrong');
    assert.equal(blocked.status,429);
    assert.equal(blocked.body.error,'LOGIN_LOCKED');

    // Correct credential is allowed to self-recover even while a guard exists.
    ok=await login(a.port,'FirstAdmin!2026');
    assert.equal(ok.status,200);
    await stop(a.child); a=null;

    // Same persistent home, new Railway variable: startup must re-sync admin and clear any lock/session state.
    b=await start({home,password:'SecondAdmin!2026'});
    assert.match(b.stdout,/Admin credential synchronized from EHS_ADMIN_PASSWORD\/environment and login lock cleared/);
    const old=await login(b.port,'FirstAdmin!2026');
    assert.equal(old.status,401);
    const fresh=await login(b.port,'SecondAdmin!2026');
    assert.equal(fresh.status,200);
  } finally {
    if(a)await stop(a.child);
    if(b)await stop(b.child);
    await rm(home,{recursive:true,force:true});
  }
});
