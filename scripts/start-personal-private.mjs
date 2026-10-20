import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tailscaleIPv4 } from '../lib/private-network.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const ts=tailscaleIPv4();
if(!ts.ip){
  console.error('\n[BLOCKED] Không tìm thấy Tailscale đang kết nối.');
  console.error('1) Cài Tailscale trên máy host');
  console.error('2) Đăng nhập và bảo đảm trạng thái Connected');
  console.error('3) Chạy lại START_PRIVATE_ONLINE.bat\n');
  process.exit(2);
}
const port=String(process.env.PORT||8787),url=`http://${ts.ip}:${port}`;
const env={...process.env,
  HOST:ts.ip,EHS_HOST:ts.ip,
  EHS_PERSONAL_PRIVATE:'1',EHS_TAILSCALE_IP:ts.ip,EHS_PUBLIC_BASE_URL:url,
  EHS_ENABLE_LEGAL_WATCH:process.env.EHS_ENABLE_LEGAL_WATCH??'1',
  EHS_LEGAL_WATCH_INTERVAL_MIN:process.env.EHS_LEGAL_WATCH_INTERVAL_MIN??'1440',
  EHS_AUTO_BACKUP:process.env.EHS_AUTO_BACKUP??'1',
  EHS_BACKUP_RETENTION_DAYS:process.env.EHS_BACKUP_RETENTION_DAYS??'30',
  EHS_BACKUP_CHECK_INTERVAL_MIN:process.env.EHS_BACKUP_CHECK_INTERVAL_MIN??'60',
  EHS_ENFORCE_ORIGIN:process.env.EHS_ENFORCE_ORIGIN??'1',
  EHS_ALLOWED_HOSTS:process.env.EHS_ALLOWED_HOSTS??ts.ip,
  EHS_REQUIRE_CF_ACCESS:'0',EHS_SECURE_COOKIE:'0'
};
console.log('\n========================================================');
console.log(' VIETCHEM EHS CP7.0A - PERSONAL PRIVATE ONLINE');
console.log(` Tailscale IP : ${ts.ip}`);console.log(` Private URL  : ${url}`);
console.log(' Legal Watch  : ON (daily by default)');console.log(' Auto Backup  : ON (max ~1 backup / 24h)');
console.log(' Internet     : app is NOT bound to LAN/public interfaces');
console.log('========================================================\n');
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:'inherit',windowsHide:false});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{try{child.kill(sig)}catch{}});
child.on('exit',code=>process.exit(code??0));
