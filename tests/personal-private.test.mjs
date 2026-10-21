import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTailscaleIPv4, detectTailscaleIPv4FromInterfaces } from '../lib/private-network.mjs';

test('CP7.0A detects only Tailscale CGNAT IPv4 range',()=>{
  assert.equal(isTailscaleIPv4('100.64.0.1'),true);
  assert.equal(isTailscaleIPv4('100.127.255.254'),true);
  assert.equal(isTailscaleIPv4('100.63.255.255'),false);
  assert.equal(isTailscaleIPv4('192.168.1.10'),false);
  const fake={Ethernet:[{family:'IPv4',internal:false,address:'192.168.1.20'}],Tailscale:[{family:'IPv4',internal:false,address:'100.88.77.66'}]};
  assert.equal(detectTailscaleIPv4FromInterfaces(fake),'100.88.77.66');
});

test('CP7.0A health exposes personal-private runtime only after authenticated health call',async(t)=>{
  const root=fileURLToPath(new URL('..', import.meta.url)),tmp=await mkdtemp(join(tmpdir(),'ehs-personal-private-')),port=19327;
  const child=spawn(process.execPath,[join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',EHS_HOME_DIR:tmp,EHS_DATA_DIR:join(tmp,'data'),EHS_UPLOAD_DIR:join(tmp,'uploads'),EHS_BACKUP_DIR:join(tmp,'backups'),EHS_LOG_DIR:join(tmp,'logs'),EHS_BOOTSTRAP_PASSWORD:'PersonalTemp!2026',EHS_ENABLE_LEGAL_WATCH:'0',EHS_AUTO_BACKUP:'0',EHS_PERSONAL_PRIVATE:'1',EHS_TAILSCALE_IP:'100.88.77.66',EHS_PUBLIC_BASE_URL:'http://100.88.77.66:8787',EHS_ENFORCE_ORIGIN:'0',EHS_REQUIRE_CF_ACCESS:'0',EHS_ALLOWED_HOSTS:'',EHS_ALLOWED_ORIGINS:''},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=String(d));
  for(let i=0;i<160&&!out.includes('VIETCHEM EHS System CP7.3 NCC Text Input');i++)await new Promise(r=>setTimeout(r,50));
  assert.match(out,/CP7\.3 NCC Text Input/);t.after(async()=>{child.kill('SIGTERM');await rm(tmp,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${port}`;
  let r=await fetch(base+'/healthz'),j=await r.json();assert.equal(r.status,200);assert.equal(j.personal_private_mode,true);assert.equal(j.tailscale_ip,undefined);
  r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'PersonalTemp!2026'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
  r=await fetch(base+'/api/auth/change-password',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({old_password:'PersonalTemp!2026',new_password:'PersonalPrivate!2026'})});assert.equal(r.status,200);
  r=await fetch(base+'/api/system/health',{headers:{cookie}});j=await r.json();assert.equal(r.status,200);assert.equal(j.personal_private_mode,true);assert.equal(j.tailscale_ip,'100.88.77.66');assert.equal(j.remote_url,'http://100.88.77.66:8787');assert.equal(j.backup_check_interval_minutes,60);
});
