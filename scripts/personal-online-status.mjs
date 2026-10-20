import { tailscaleIPv4 } from '../lib/private-network.mjs';
const ts=tailscaleIPv4(),port=String(process.env.PORT||8787);
console.log('VIETCHEM EHS CP7.0A - Private Online Status');console.log('===========================================');
if(!ts.ip){console.log('Tailscale: NOT CONNECTED / NOT DETECTED');process.exitCode=2;}
else{
  const url=`http://${ts.ip}:${port}`;console.log(`Tailscale: CONNECTED (${ts.ip})`);console.log(`Private URL: ${url}`);
  try{const r=await fetch(url+'/healthz',{signal:AbortSignal.timeout(2500)});const j=await r.json();console.log(`EHS Server: ${r.ok?'ONLINE':'DEGRADED'} · ${j.version||''}`);console.log(`Personal mode: ${j.personal_private_mode?'ON':'OFF'}`)}catch(e){console.log(`EHS Server: OFFLINE / chưa chạy (${e.name==='TimeoutError'?'timeout':e.message})`);process.exitCode=1}
}
