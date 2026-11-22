import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateArkCatalog,validateConfiguration} from './config-engine.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./ark-catalog-v2.json',import.meta.url)));
test('base game is enabled by default; paid packs are disabled',()=>{
 const result=validateArkCatalog(fixture);
 assert.equal(result.packs.find(p=>p.id==='base-game').enabledByDefault,true);
 for (const id of ['tides-of-fortune','dragontopia','lost-colony','astraeos','bobs-tall-tales','fantastic-tames']) {
  const pack=result.packs.find(p=>p.id===id);
  assert.equal(pack?.premium,true,id);
  assert.equal(pack.enabledByDefault,false,id);
 }
});
test('catalog contains blueprint paths and conservatively unverified entries',()=>{
 const result=validateArkCatalog(fixture);
 assert.ok(result.dinosaurs.find(x=>x.id==='Rex').blueprint.endsWith('Rex_Character_BP_C'));
 assert.equal(result.dinosaurs.find(x=>x.id==='Rex').verified,false);
 assert.ok(result.items.find(x=>x.id==='Stone').blueprint.endsWith('PrimalItemResource_Stone_C'));
});
test('unknown content pack is rejected',()=>{
 const c=structuredClone(fixture);c.dinosaurs[0].contentPack='unlisted';
 assert.throws(()=>validateArkCatalog(c),/unknown content pack/);
});
test('saved Kit survives catalog enrichment without changing ID',()=>{
 const conf={schemaVersion:2,rules:[],kits:[{id:'starter',name:'Starter',entries:[{type:'item',itemId:'Wood',quantity:100,announcement:false},{type:'dinosaur',creatureId:'Raptor',level:50,status:'tamed',quantity:1,announcement:true}]}]};
 const prior=validateConfiguration(conf,fixture);
 const next=structuredClone(fixture);next.items.push({id:'FlakArmor',name:'Flak Armor',contentPack:'base-game',blueprint:null,verified:false});
 assert.deepEqual(validateConfiguration(prior,next),prior);
 const removed=structuredClone(fixture);removed.items=removed.items.filter(x=>x.id!=='Wood');
 assert.throws(()=>validateConfiguration(prior,removed),/unknown item/);
});
test('arbitrary command text is rejected from Blueprint path',()=>{
 const c=structuredClone(fixture);c.items[0].blueprint='/Game/Resource.Resource_C;cheat DestroyAll';
 assert.throws(()=>validateArkCatalog(c),/invalid Blueprint path/);
});
