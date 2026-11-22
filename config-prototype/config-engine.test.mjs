import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateLegacyRules,validateConfiguration,planGift} from './config-engine.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./ark-catalog-starter.json',import.meta.url)));
const legacy={rules:[{gift:'Rose',kind:'spawn',target:'Raptor',level:20,quantity:2,cooldown:5},{gift:'Heart Me',kind:'item',target:'Wood',quantity:25,cooldown:2}]};
test('migrates legacy rules without writing a file',()=>{
 const migrated=migrateLegacyRules(legacy,catalog);
 assert.equal(migrated.rules.length,2);
 assert.equal(migrated.rules[0].reward.status,'wild');
 assert.deepEqual(planGift(migrated,catalog,{name:'Rose'}).actions[0].quantity,2);
});
test('supports a mixed kit containing tamed dinosaurs and resources',()=>{
 const c=validateConfiguration({schemaVersion:2,kits:[{id:'starter',name:'Starter',entries:[{type:'dinosaur',creatureId:'Raptor',level:50,status:'tamed',quantity:1,announcement:true},{type:'item',itemId:'Wood',quantity:50,announcement:false}]}],rules:[{id:'gift-1',giftId:'5655',giftName:'Rose',enabled:true,cooldown:5,reward:{type:'kit',kitId:'starter',announcement:true}}]},catalog);
 const plan=planGift(c,catalog,{id:'5655',name:'Rose'});
 assert.equal(plan.actions.length,2);
 assert.equal(plan.actions[0].status,'tamed');
});
test('gift ID wins over gift name and avoids accidental name match',()=>{
 const c=validateConfiguration({schemaVersion:2,kits:[],rules:[{id:'gift-1',giftId:'5655',giftName:'Rose',enabled:true,cooldown:5,reward:{type:'item',itemId:'Wood',quantity:1,announcement:false}}]},catalog);
 assert.equal(planGift(c,catalog,{id:'different',name:'Rose'}).matched,false);
 assert.equal(planGift(c,catalog,{id:'5655',name:'Rose'}).matched,true);
});
test('rejects nested kits',()=>{
 assert.throws(()=>validateConfiguration({schemaVersion:2,kits:[{id:'nested',name:'Nested',entries:[{type:'kit',kitId:'nested',announcement:true}]}],rules:[]},catalog),/cannot contain/);
});
test('rejects unknown creatures',()=>{
 assert.throws(()=>validateConfiguration({schemaVersion:2,kits:[],rules:[{id:'x',giftName:'X',reward:{type:'dinosaur',creatureId:'Unknown',level:20,status:'wild',quantity:1,announcement:false}}]},catalog),/unknown dinosaur/);
});
test('rejects too many creatures in one rule',()=>{
 assert.throws(()=>validateConfiguration({schemaVersion:2,kits:[],rules:[{id:'x',giftName:'X',reward:{type:'dinosaur',creatureId:'Raptor',level:20,status:'wild',quantity:999,announcement:false}}]},catalog),/quantity/);
});
