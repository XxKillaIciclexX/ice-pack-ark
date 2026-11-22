import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {validateConfiguration, validateArkCatalog, planGift} from './icepack-config-engine.mjs';
import {buildIcePackSpawnCommand} from './icepack-spawn-rcon.mjs';

// The mod currently supports only these creature names; this is NOT a dynamic Blueprint loader.
const SUPPORTED_DINOS = new Set(['Dodo','Raptor','Rex']);
// Item RCON paths are a temporary, independently validated allowlist.
const SUPPORTED_ITEMS = new Map([
 ['Stone','PrimalItemResource_Stone'],
]);
const MAX_JOB_COMMANDS=8, MAX_QUEUE=8, GLOBAL_COOLDOWN_MS=15000;
const MAX_DELIVERY_HISTORY=20;
// Leave a margin for the ASA mod's five-second spawn cooldown.
const SPAWN_INTERVAL_MS=6000;
const isSpawnCommand=command=>command.startsWith('ScriptCommand IcePackSpawn,');
const validPlayerId = id => /^\d{1,10}$/.test(String(id ?? '')) && Number(id)>0 && Number(id)<=4294967295;

export function loadSavedRules(dir) {
  const folder=path.resolve(dir);
  const catalog=validateArkCatalog(JSON.parse(fs.readFileSync(path.join(folder,'ark-catalog-v2.json'),'utf8')));
  const config=validateConfiguration(JSON.parse(fs.readFileSync(path.join(folder,'streamer-config-v2.json'),'utf8')),catalog);
  const prefsPath=path.join(folder,'content-prefs.json');
  const prefs=fs.existsSync(prefsPath)?JSON.parse(fs.readFileSync(prefsPath,'utf8')):null;
  const enabledPacks=new Set(['base-game',...(prefs?.enabledPacks??catalog.packs.filter(x=>x.enabledByDefault).map(x=>x.id))]);
  if(![...enabledPacks].every(x=>catalog.packs.some(p=>p.id===x))) throw Error('Unknown enabled content pack');
  return {catalog,config,enabledPacks};
}
export function buildPlanCommands(plan,catalog,enabledPacks,playerId) {
  if(!validPlayerId(playerId)) throw Error('Valid Specimen Implant ID required');
  const cmds=[];
  for(const a of plan.actions) {
    const lookup=a.type==='dinosaur'?catalog.dinosaurs:catalog.items;
    const ref=lookup.find(x=>x.id===(a.type==='dinosaur'?a.creatureId:a.itemId));
    if(!ref || !ref.enabled || !enabledPacks.has(ref.contentPack)) throw Error(`Catalog entry unavailable: ${a.creatureId??a.itemId}`);
    if(ref.contentPack!=='base-game') throw Error('Paid/modded pack execution not enabled in this release');
    if(a.announcement) throw Error('Announcements need a newer mod version; disable announcement to test live');
    if(a.type==='dinosaur') {
      if(a.status!=='wild')throw Error('Tamed dinosaurs require a newer mod version; no substitution to wild');
      if(!SUPPORTED_DINOS.has(a.creatureId))throw Error(`Creature ${a.creatureId} not implemented in deployed mod`);
      if(!Number.isSafeInteger(a.quantity)||a.quantity<1)throw Error('Dinosaur quantity must be a positive integer');
      if(cmds.length+a.quantity>MAX_JOB_COMMANDS)throw Error('Gift exceeds the limit of 8 commands, including Kit entries');
      for(let i=0;i<a.quantity;i++)cmds.push(buildIcePackSpawnCommand({creature:a.creatureId,level:a.level,playerId}));
    } else if(a.type==='item') {
      const itemClass=SUPPORTED_ITEMS.get(a.itemId);
      if(!itemClass)throw Error(`Item ${a.itemId} not approved for live RCON delivery`);
      if(a.quantity>1000)throw Error('Maximum 1000 item units per gift during test');
      cmds.push(`GiveItemToPlayer ${playerId} "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/${itemClass}.${itemClass}'" ${a.quantity} 0 0`);
    } else throw Error('Unsupported action');
    if(cmds.length>MAX_JOB_COMMANDS)throw Error('Gift exceeds the limit of 8 commands, including Kit entries');
  }
  if(!cmds.length)throw Error('Rule produces no commands');
  return cmds;
}
export class CustomRulesLane {
  constructor({send,log=()=>{},now=()=>Date.now(),sourceDir,wait=delay}={}){
    if(typeof send!=='function')throw Error('Missing RCON sender');
    this.send=send;this.log=log;this.now=now;this.sourceDir=sourceDir;
    this.mode='off';this.playerId='';this.saved=null;this.queue=[];this.inflight=false;this.generation=0;this.lastGlobal=0;this.lastRules=new Map();this.history=[];
    this.wait=wait;
    this.nextSpawnAt=0;
    this.spawnWait=new AbortController();
    this.activeDelivery=null;
    this.lastDelivery=null;
    this.deliveryHistory=[];
  }
  reload(){if(this.mode==='live'||this.inflight)throw Error('Disable live rules before reloading');const saved=loadSavedRules(this.sourceDir);this.saved=saved;this.log(`Custom rules loaded: ${saved.config.rules.length} rules, ${saved.config.kits.length} Kits`);return this.state();}
  configure({playerId}){if(this.mode==='live'||this.inflight)throw Error('Stop live rules before changing player');if(!validPlayerId(playerId))throw Error('Invalid Specimen Implant ID');this.playerId=String(playerId).trim();return this.state();}
  setMode(mode,confirmation=''){
    if(!['off','preview','live'].includes(mode))throw Error('Invalid mode');
    if(mode==='live'){
      if(confirmation!=='ENABLE LIVE CUSTOM RULES')throw Error('Live mode requires explicit confirmation');
      if(!this.saved)throw Error('Load Kit Editor configuration first');
      if(!validPlayerId(this.playerId))throw Error('Configure Specimen Implant ID');
    }
    if(mode!=='live'||this.mode!=='live')this.clearQueue();
    this.mode=mode;this.log('Custom rules mode: '+mode);return this.state();
  }
  clearQueue(){
    this.generation++;
    for(const job of this.queue)this.recordDelivery(job,0,'canceled-in-queue');
    this.queue.length=0;
    if(this.activeDelivery)this.activeDelivery.phase='stopping';
    this.spawnWait.abort();
    this.spawnWait=new AbortController();
  }
  stop(){this.clearQueue();this.mode='off';this.log('CUSTOM RULES STOP: queued work cleared; in-flight RCON cannot be recalled');return this.state();}
  state(){
    const delivery=this.activeDelivery;
    const activeDelivery=delivery && {
      ...delivery,
      cooldownMs:delivery.phase==='cooldown' ? Math.max(0,this.nextSpawnAt-this.now()) : 0,
    };
    return {
      mode:this.mode,loaded:!!this.saved,ruleCount:this.saved?.config.rules.length??0,
      kitCount:this.saved?.config.kits.length??0,playerIdConfigured:!!this.playerId,
      queued:this.queue.length,inflight:this.inflight,history:this.history.slice(-8).reverse(),
      activeDelivery,lastDelivery:this.lastDelivery && {...this.lastDelivery},
      deliveryHistory:this.deliveryHistory.map(row=>({...row})).reverse(),
    };
  }
  handle(g){
    if(this.mode==='off'||!this.saved)return false;
    const plan=planGift(this.saved.config,this.saved.catalog,g);
    if(!plan.matched)return false;
    let commands;
    try{commands=buildPlanCommands(plan,this.saved.catalog,this.saved.enabledPacks,this.playerId);}
    catch(e){this.log('CUSTOM RULE BLOCKED '+plan.ruleId+': '+e.message);this.record('blocked',g,plan.ruleId,[]);return true;}
    if(this.mode==='preview'){this.log(`CUSTOM PREVIEW ${plan.ruleId}: ${commands.join(' ; ')}`);this.record('preview',g,plan.ruleId,commands);return true;}
    const t=this.now(),last=this.lastRules.get(plan.ruleId);
    if(this.lastGlobal && t-this.lastGlobal<GLOBAL_COOLDOWN_MS){this.log('Custom rule global cooldown: '+plan.ruleId);return true;}
    if(last!==undefined&&t-last<plan.cooldown*1000){this.log('Custom rule cooldown: '+plan.ruleId);return true;}
    if(this.queue.length>=MAX_QUEUE){this.log('Custom rule queue full');return true;}
    this.lastRules.set(plan.ruleId,t);this.lastGlobal=t;
    this.queue.push({g,ruleId:plan.ruleId,commands,at:t,generation:this.generation});
    this.log(`Custom gift queued: ${plan.ruleId} (${commands.length} commands)`);
    void this.drain();return true;
  }
  record(status,g,ruleId,commands){this.history.push({status,gift:g.name,ruleId,commands,at:this.now()});if(this.history.length>30)this.history.shift();}
  recordDelivery(job,sent,outcome){
    const delivery={ruleId:job.ruleId,gift:job.g.name||job.ruleId,sent,total:job.commands.length,outcome};
    this.deliveryHistory.push({...delivery,at:this.now()});
    if(this.deliveryHistory.length>MAX_DELIVERY_HISTORY)this.deliveryHistory.shift();
    return delivery;
  }
  async drain(){
    if(this.inflight)return;this.inflight=true;
    try{while(this.mode==='live'&&this.queue.length){
      const job=this.queue.shift();
      if(job.generation!==this.generation)continue;
      if(this.now()-job.at>30000){
        this.recordDelivery(job,0,'expired-in-queue');
        continue;
      }
      const delivery={ruleId:job.ruleId,gift:job.g.name||job.ruleId,sent:0,total:job.commands.length,phase:'sending'};
      this.activeDelivery=delivery;
      let outcome='stopped';
      try{
        for(const cmd of job.commands){
          if(this.mode!=='live'||job.generation!==this.generation)break;
          const spawn=isSpawnCommand(cmd);
          const remaining=this.nextSpawnAt-this.now();
          if(spawn&&remaining>0){
            delivery.phase='cooldown';
            await this.wait(remaining,undefined,{signal:this.spawnWait.signal});
            if(this.mode!=='live'||job.generation!==this.generation)break;
          }
          delivery.phase='sending';
          try{
            await this.send(cmd);
            delivery.sent++;
          }finally{
            if(spawn)this.nextSpawnAt=this.now()+SPAWN_INTERVAL_MS;
          }
          this.log('Custom RCON sent (not gameplay-confirmed): '+job.ruleId+' -> '+cmd);
        }
        if(delivery.sent===delivery.total){
          outcome='sent-unverified';
          if(job.generation===this.generation)this.record(outcome,job.g,job.ruleId,job.commands);
        }
      }catch(e){
        if(e.name==='AbortError'&&job.generation!==this.generation)continue;
        outcome='rcon-error';
        this.record(outcome,job.g,job.ruleId,job.commands);
        this.log('Custom RCON error, no retry: '+e.message);
        this.stop();
        break;
      }finally{
        this.lastDelivery=this.recordDelivery(job,delivery.sent,outcome);
        this.activeDelivery=null;
      }
    }}finally{this.inflight=false;}
  }
  simulate(gift){if(this.mode!=='preview')throw Error('Enable Preview first');if(!this.saved)throw Error('Load Kit Editor configuration first');this.handle(gift);return this.state();}
}
