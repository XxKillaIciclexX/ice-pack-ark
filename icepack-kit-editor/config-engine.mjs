// Ice Pack Companion: configuration and dry-run planner only.
// Intentionally has no RCON, filesystem, HTTP, or spawn-command execution.
const MAX_RULES = 500;
const MAX_KITS = 200;
const MAX_ENTRIES = 50;
const MAX_ACTIONS = 100;
const MAX_ITEM_QUANTITY = 10000;
const MAX_DINO_QUANTITY = 20;
const MAX_LEVEL = 150;
const MAX_COOLDOWN = 86400;

function fail(message) { throw new Error(message); }
function obj(v, label) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${label} must be an object`); return v; }
function arr(v, label, max) { if (!Array.isArray(v) || v.length > max) fail(`${label} must be an array with at most ${max} entries`); return v; }
function str(v, label, max = 120) { if (typeof v !== 'string' || !v.trim() || v.trim().length > max) fail(`${label} is required (max ${max} characters)`); return v.trim(); }
function integer(v, label, min, max) { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(`${label} must be an integer from ${min} to ${max}`); return v; }
function bool(v, label) { if (typeof v !== 'boolean') fail(`${label} must be true or false`); return v; }
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
function safeId(v, label) { let s=str(v,label,120); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(s) || reserved.has(s)) fail(`${label} contains invalid characters`); return s; }

function catalogEntry(v, group) {
 obj(v, `${group} entry`);
 const id=safeId(v.id,`${group} ID`);
 const name=str(v.name,`${group} name`);
 const blueprint= v.blueprint == null ? null : str(v.blueprint,`${group} Blueprint`,512);
 // Blueprint paths are data, never interpolated into arbitrary console commands.
 return {id,name,blueprint,enabled:v.enabled === undefined ? true : bool(v.enabled,`${group} enabled`),source:v.source == null ? 'manual' : str(v.source,`${group} source`,120)};
}
export function validateArkCatalog(input) {
 const c=obj(input,'ARK catalog');
 const dinosaurs=arr(c.dinosaurs,'Dinosaurs',10000).map(v=>catalogEntry(v,'Dinosaur'));
 const items=arr(c.items,'Items',25000).map(v=>catalogEntry(v,'Item'));
 for (const [name, entries] of [['dinosaurs',dinosaurs],['items',items]]) {
   if (new Set(entries.map(x=>x.id)).size !== entries.length) fail(`Duplicate ${name} catalog ID`);
 }
 return {schemaVersion:1,dinosaurs,items};
}
function validateAction(v, catalogMaps, label) {
 obj(v,label);
 const type=str(v.type,`${label} type`,20);
 if (type === 'dinosaur') {
   const creatureId=safeId(v.creatureId,`${label} creatureId`);
   if (!catalogMaps.dinosaurs.has(creatureId)) fail(`${label} references unknown dinosaur ${creatureId}`);
   const status=str(v.status,`${label} status`,10).toLowerCase();
   if (!['wild','tamed'].includes(status)) fail(`${label} status must be wild or tamed`);
   return {type,creatureId,level:integer(v.level,`${label} level`,1,MAX_LEVEL),status,quantity:integer(v.quantity,`${label} quantity`,1,MAX_DINO_QUANTITY),announcement:bool(v.announcement,`${label} announcement`)};
 }
 if (type === 'item') {
   const itemId=safeId(v.itemId,`${label} itemId`);
   if (!catalogMaps.items.has(itemId)) fail(`${label} references unknown item ${itemId}`);
   return {type,itemId,quantity:integer(v.quantity,`${label} quantity`,1,MAX_ITEM_QUANTITY),announcement:bool(v.announcement,`${label} announcement`)};
 }
 if (type === 'kit') return {type,kitId:safeId(v.kitId,`${label} kitId`),announcement:bool(v.announcement,`${label} announcement`)};
 fail(`${label} has unsupported type ${type}`);
}
export function validateConfiguration(input, arkCatalog) {
 const c=obj(input,'Configuration');
 if (c.schemaVersion !== 2) fail('Configuration must have schemaVersion 2');
 const catalog=validateArkCatalog(arkCatalog);
 const maps={dinosaurs:new Map(catalog.dinosaurs.map(x=>[x.id,x])),items:new Map(catalog.items.map(x=>[x.id,x]))};
 const kits=arr(c.kits,'Kits',MAX_KITS).map((kit,i)=>{
   obj(kit,`Kit ${i}`);
   const id=safeId(kit.id,`Kit ${i} ID`);
   const entries=arr(kit.entries,`Kit ${id} entries`,MAX_ENTRIES).map((v,j)=>validateAction(v,maps,`Kit ${id} entry ${j}`));
   if (entries.some(x=>x.type==='kit')) fail(`Kit ${id} cannot contain another Kit`);
   return {id,name:str(kit.name,`Kit ${id} name`),entries};
 });
 if (new Set(kits.map(x=>x.id)).size!==kits.length) fail('Duplicate Kit ID');
 const kitsById=new Map(kits.map(x=>[x.id,x]));
 const rules=arr(c.rules,'Rules',MAX_RULES).map((rule,i)=>{
   obj(rule,`Rule ${i}`);
   const id=safeId(rule.id,`Rule ${i} ID`);
   const giftId=rule.giftId == null ? null : str(rule.giftId,`Rule ${id} giftId`);
   const giftName=rule.giftName == null ? null : str(rule.giftName,`Rule ${id} giftName`);
   if (!giftId && !giftName) fail(`Rule ${id} must specify a gift ID or name`);
   const reward=validateAction(rule.reward,maps,`Rule ${id} reward`);
   if (reward.type==='kit'&&!kitsById.has(reward.kitId)) fail(`Rule ${id} references unknown Kit ${reward.kitId}`);
   return {id,giftId,giftName,enabled:rule.enabled===undefined?true:bool(rule.enabled,`Rule ${id} enabled`),cooldown:integer(rule.cooldown??0,`Rule ${id} cooldown`,0,MAX_COOLDOWN),reward};
 });
 if(new Set(rules.map(x=>x.id)).size!==rules.length)fail('Duplicate Rule ID');
 // Gift-ID-based rules can coexist with legacy name rules. Duplicate IDs/names are rejected.
 const keys=new Set();
 for(const r of rules){for(const key of [r.giftId && `id:${r.giftId.toLowerCase()}`,r.giftName && `name:${r.giftName.toLowerCase()}`].filter(Boolean)){if(keys.has(key))fail(`Duplicate gift mapping ${key}`);keys.add(key);}}
 return {schemaVersion:2,kits,rules};
}
export function planGift(configInput, arkCatalog, gift) {
 const config=validateConfiguration(configInput,arkCatalog);
 obj(gift,'Gift');
 const giftId=gift.id == null ? null : String(gift.id);
 const giftName=gift.name == null ? null : String(gift.name).trim().toLowerCase();
 // ID is canonical; if the gift carries an ID but no matching ID rule, use a name-only legacy rule.
 const rule=config.rules.find(r=>r.enabled && r.giftId != null && giftId != null && r.giftId===giftId)
   ?? config.rules.find(r=>r.enabled && !r.giftId && r.giftName?.toLowerCase()===giftName);
 if(!rule)return {matched:false,reason:'No configured rule',actions:[]};
 const kitMap=new Map(config.kits.map(k=>[k.id,k]));
 const expanded=rule.reward.type==='kit'?kitMap.get(rule.reward.kitId).entries: [rule.reward];
 if(expanded.length>MAX_ACTIONS)fail(`Gift ${giftName||giftId} exceeds dry-run action-entry limit (${MAX_ACTIONS})`);
 // No ARK commands generated. This is only a safe, inspectable action plan.
 return {matched:true,ruleId:rule.id,cooldown:rule.cooldown,actions:expanded.map(a=>({...a}))};
}

// Read existing v0.6 JSON into v2, without modifying the source file.
export function migrateLegacyRules(legacy, arkCatalog) {
 obj(legacy,'Legacy settings');
 const catalog=validateArkCatalog(arkCatalog);
 const dinos=new Set(catalog.dinosaurs.map(x=>x.id));
 const items=new Set(catalog.items.map(x=>x.id));
 const rules=arr(legacy.rules,'Legacy rules',MAX_RULES).map((r,i)=>{
   obj(r,`Legacy rule ${i}`);
   const gift=str(r.gift,`Legacy rule ${i} gift`);
   const kind=r.kind;
   const reward=kind==='spawn'
     ? {type:'dinosaur',creatureId:str(r.target,'Legacy dinosaur'),level:Number(r.level),status:'wild',quantity:Number(r.quantity),announcement:false}
     : kind==='item'
     ? {type:'item',itemId:str(r.target,'Legacy item'),quantity:Number(r.quantity),announcement:false}
     : fail(`Legacy rule ${i} has unknown kind`);
   if(reward.type==='dinosaur'&&!dinos.has(reward.creatureId))fail(`Legacy dinosaur missing from catalog: ${reward.creatureId}`);
   if(reward.type==='item'&&!items.has(reward.itemId))fail(`Legacy item missing from catalog: ${reward.itemId}`);
   return {id:`legacy-${i+1}`,giftName:gift,enabled:true,cooldown:Number(r.cooldown??0),reward};
 });
 return validateConfiguration({schemaVersion:2,kits:[],rules},catalog);
}
