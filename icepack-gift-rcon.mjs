import {buildIcePackSpawnCommand} from './icepack-spawn-rcon.mjs';

// Isolated, opt-in gift-to-Dodo RCON lane. No F8 and no real RCON in preview mode.
export class GiftRconLane {
  constructor({send,log=()=>{},now=()=>Date.now()}={}) {
    if(typeof send!=='function') throw Error('Missing send function');
    this.send=send;this.log=log;this.now=now;
    this.mode='off';this.gift='Rose';this.playerId='';this.queue=[];
    this.inflight=false;this.lastAccepted=0;this.generation=0;this.history=[];
  }
  configure({gift,playerId}) {
    if(this.mode==='live'||this.inflight)throw Error('Stop the live gift lane before changing configuration');
    if(typeof gift!=='string'||!gift.trim()||gift.length>100)throw Error('Enter one exact gift name or ID');
    buildIcePackSpawnCommand({creature:'Dodo',level:25,playerId});
    this.gift=gift.trim();this.playerId=String(playerId).trim();
    return this.state();
  }
  setMode(mode,confirmation=''){
    if(!['off','preview','live'].includes(mode))throw Error('Invalid mode');
    if(mode==='live'){
      if(confirmation!=='ENABLE LIVE DODO GIFTS')throw Error('Live mode requires confirmation');
      buildIcePackSpawnCommand({creature:'Dodo',level:25,playerId:this.playerId});
    }
    if(mode==='off'){this.generation++;this.queue.length=0;}
    if(mode==='preview'){this.generation++;this.queue.length=0;}
    this.mode=mode;this.log('Gift RCON mode: '+mode);
    return this.state();
  }
  stop(){this.generation++;this.queue.length=0;this.mode='off';this.log('EMERGENCY STOP: gift RCON disabled; pending queued jobs discarded (in-flight command cannot be recalled)');return this.state();}
  state(){return {mode:this.mode,gift:this.gift,playerIdConfigured:!!this.playerId,queued:this.queue.length,inflight:this.inflight,history:this.history.slice(-8).reverse()};}
  matches(g){const s=this.gift.toLowerCase();return s===String(g.id??'').toLowerCase()||s===String(g.name??'').trim().toLowerCase();}
  handle(g){
    if(this.mode==='off'||!this.matches(g))return false;
    let cmd;
    try{cmd=buildIcePackSpawnCommand({creature:'Dodo',level:25,playerId:this.playerId});}
    catch(e){this.log('Gift RCON skipped: '+e.message);return true;}
    if(this.mode==='preview'){
      this.record('preview',g,cmd);this.log('GIFT PREVIEW (NO RCON): '+g.name+' -> '+cmd);return true;
    }
    const now=this.now();
    if(this.lastAccepted && now-this.lastAccepted<15000){this.log('Gift RCON cooldown: '+g.name);return true;}
    if(this.queue.length>=8){this.log('Gift RCON queue full: '+g.name);return true;}
    this.lastAccepted=now;
    this.queue.push({cmd,g,at:now,generation:this.generation});
    this.log('Gift RCON queued: '+g.name+' -> ONE level-25 Dodo (streak count ignored)');
    void this.drain();return true;
  }
  record(status,g,cmd){this.history.push({status,gift:g.name,command:cmd,at:this.now()});if(this.history.length>30)this.history.shift();}
  async drain(){
    if(this.inflight)return;
    this.inflight=true;
    try{
      while(this.mode==='live'&&this.queue.length){
        const job=this.queue.shift();
        if(job.generation!==this.generation||this.now()-job.at>30000)continue;
        // Once send starts, an emergency stop cannot cancel the network operation.
        try { await this.send(job.cmd);this.record('rcon-sent-unverified',job.g,job.cmd);this.log('Gift RCON sent (verify Dodo in ARK): '+job.g.name); }
        catch(e){this.record('rcon-error',job.g,job.cmd);this.log('Gift RCON error; not retried: '+e.message);this.stop();break;}
      }
    } finally {this.inflight=false;}
  }
  simulate(){const g={id:this.gift,name:this.gift,count:1};if(this.mode==='off')throw Error('Set Preview mode first');if(this.mode==='live')throw Error('Simulation is preview-only; switch mode to Preview');this.handle(g);return this.state();}
}
