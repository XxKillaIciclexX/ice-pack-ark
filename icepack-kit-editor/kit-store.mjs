import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateConfiguration,validateArkCatalog,migrateLegacyRules,planGift} from './config-engine.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
export const catalog=validateArkCatalog(JSON.parse(fs.readFileSync(path.join(base,'ark-catalog-starter.json'),'utf8')));
export const configPath=path.join(base,'streamer-config-v2.json');
export const blank=()=>({schemaVersion:2,kits:[],rules:[]});
export function load(){return validateConfiguration(fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8')):blank(),catalog);}
export function save(config){
 const checked=validateConfiguration(config,catalog);
 // Reject empty kits to avoid silent no-op rewards.
 for(const kit of checked.kits)if(kit.entries.length===0)throw Error(`Kit ${kit.name} must have at least one entry`);
 const tmp=configPath+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(checked,null,2)+'\n',{flag:'w',mode:0o600});
 try{fs.renameSync(tmp,configPath);}catch(e){try{fs.unlinkSync(tmp);}catch{}throw e;}
 return checked;
}
export function upsertKit(config,kit){
 const next=structuredClone(config);
 if(!kit || typeof kit.id!=='string')throw Error('Kit ID required');
 const at=next.kits.findIndex(k=>k.id===kit.id);
 if(at<0)next.kits.push(kit);else next.kits[at]=kit;
 return save(next);
}
export function deleteKit(config,id){
 if(config.rules.some(r=>r.reward.type==='kit'&&r.reward.kitId===id))throw Error('Kit is used by a gift rule. Unassign that rule first.');
 const next=structuredClone(config);next.kits=next.kits.filter(k=>k.id!==id);
 if(next.kits.length===config.kits.length)throw Error('Kit not found');
 return save(next);
}
export function migrateFile(legacyPath){
 if(fs.existsSync(configPath))throw Error('Streamer v2 configuration already exists: migration refused to protect saved data');
 const legacy=JSON.parse(fs.readFileSync(legacyPath,'utf8'));
 return save(migrateLegacyRules(legacy,catalog));
}
export function preview(config,gift){return planGift(config,catalog,gift);}
