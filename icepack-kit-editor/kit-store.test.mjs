import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfiguration} from './config-engine.mjs';
import {catalog,blank} from './kit-store.mjs';
test('empty config validates',()=>assert.deepEqual(validateConfiguration(blank(),catalog),blank()));
test('accepts a Kit mixing resources and a tamed dinosaur',()=>{
 const cfg={...blank(),kits:[{id:'starter',name:'Starter',entries:[{type:'item',itemId:'Wood',quantity:100,announcement:false},{type:'dinosaur',creatureId:'Raptor',level:50,status:'tamed',quantity:1,announcement:true}]}]};
 assert.equal(validateConfiguration(cfg,catalog).kits[0].entries[1].status,'tamed');
});
test('rejects an unknown item in a Kit',()=>{
 const cfg={...blank(),kits:[{id:'a',name:'A',entries:[{type:'item',itemId:'NotARealItem',quantity:1,announcement:false}]}]};
 assert.throws(()=>validateConfiguration(cfg,catalog),/unknown item/);
});
test('rejects a Kit reference to a non-existing Kit',()=>{
 const cfg={...blank(),rules:[{id:'a',giftName:'Rose',reward:{type:'kit',kitId:'missing',announcement:true}}]};
 assert.throws(()=>validateConfiguration(cfg,catalog),/unknown Kit/);
});
