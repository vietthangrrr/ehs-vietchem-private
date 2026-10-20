import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';

export function runtimePaths(rootDir){
  const defaultHome=join(homedir(),'VIETCHEM_EHS');
  const explicitData=process.env.EHS_DATA_DIR?resolve(process.env.EHS_DATA_DIR):null;
  const home=resolve(process.env.EHS_HOME_DIR || (explicitData?dirname(explicitData):defaultHome));
  const dataDir=explicitData || resolve(join(home,'Data'));
  const uploadDir=resolve(process.env.EHS_UPLOAD_DIR || join(dataDir,'uploads'));
  const backupDir=resolve(process.env.EHS_BACKUP_DIR || join(home,'Backups'));
  const logDir=resolve(process.env.EHS_LOG_DIR || join(home,'Logs'));
  return {rootDir,home,dataDir,uploadDir,backupDir,logDir,dbPath:join(dataDir,'ehs.sqlite')};
}

export async function ensureRuntimeDirs(paths){
  await Promise.all([paths.home,paths.dataDir,paths.uploadDir,paths.backupDir,paths.logDir].map(p=>mkdir(p,{recursive:true})));
  return paths;
}
