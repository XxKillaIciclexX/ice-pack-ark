import fs from 'node:fs';
import {migrateLegacyRules,validateConfiguration,planGift} from './config-engine.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./ark-catalog-starter.json',import.meta.url)));
const legacyFile=process.argv[2];
if(!legacyFile){console.error('Usage: node config-demo.mjs path/to/rules-v06.json');process.exitCode=1;}
else {
 const legacy=JSON.parse(fs.readFileSync(legacyFile,'utf8'));
 const migrated=migrateLegacyRules(legacy,catalog);
 const config=validateConfiguration({...migrated,kits:[{id:'starter-kit',name:'Starter Kit',entries:[
   {type:'item',itemId:'Wood',quantity:100,announcement:false},
   {type:'dinosaur',creatureId:'Raptor',level:50,status:'tamed',quantity:1,announcement:true}
 ]}],rules:[...migrated.rules,{id:'example-kit-rule',giftId:'demo-kit-gift',giftName:'Demo Kit Gift',enabled:true,cooldown:30,reward:{type:'kit',kitId:'starter-kit',announcement:true}}]},catalog);
 console.log('Legacy rules migrated in memory:',migrated.rules.length);
 console.log('Demo Kit preview (NO COMMANDS SENT):');
 console.log(JSON.stringify(planGift(config,catalog,{id:'demo-kit-gift',name:'Demo Kit Gift'}),null,2));
}
