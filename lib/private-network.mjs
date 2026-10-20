import { networkInterfaces } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function isTailscaleIPv4(ip){
  const m=String(ip||'').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(!m)return false;
  const o=m.slice(1).map(Number);if(o.some(x=>x<0||x>255))return false;
  return o[0]===100 && o[1]>=64 && o[1]<=127;
}

export function detectTailscaleIPv4FromInterfaces(ifaces=networkInterfaces()){
  for(const rows of Object.values(ifaces||{}))for(const x of rows||[]){
    if(x.family==='IPv4' && !x.internal && isTailscaleIPv4(x.address))return x.address;
  }
  return null;
}

function cliCandidates(env=process.env){
  const out=['tailscale'];
  if(env.ProgramFiles)out.push(join(env.ProgramFiles,'Tailscale','tailscale.exe'));
  if(env['ProgramFiles(x86)'])out.push(join(env['ProgramFiles(x86)'],'Tailscale','tailscale.exe'));
  return [...new Set(out)];
}

export function tailscaleIPv4({env=process.env}={}){
  for(const cmd of cliCandidates(env)){
    try{
      const r=spawnSync(cmd,['ip','-4'],{encoding:'utf8',windowsHide:true,env});
      if(r.status===0){
        const ip=String(r.stdout||'').trim().split(/\s+/).find(isTailscaleIPv4);
        if(ip)return {ip,source:'tailscale-cli',command:cmd};
      }
    }catch{}
  }
  const ip=detectTailscaleIPv4FromInterfaces();
  return ip?{ip,source:'network-interface',command:null}:{ip:null,source:null,command:null};
}
