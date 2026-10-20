export const CORE_TABLES=['sites','employees','ppe_items','ppe_transactions','obligations','documents','payments','equipment','tasks'];
function tableExists(db,name){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)}
export function snapshotCounts(db){
  const out={};
  for(const t of CORE_TABLES){out[t]=tableExists(db,t)?Number(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c):0}
  return out;
}
export function compareCounts(before,after){
  const drops=[];
  for(const k of Object.keys(before||{})){if(Number(after?.[k]||0)<Number(before[k]||0))drops.push({table:k,before:before[k],after:after?.[k]||0})}
  return {ok:drops.length===0,drops};
}
