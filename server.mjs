import {CustomRulesLane,buildPlanCommands} from './icepack-custom-rules.mjs';
import {planGift} from './icepack-config-engine.mjs';
import {buildIcePackSpawnCommand} from './icepack-spawn-rcon.mjs';
import {GiftRconLane} from './icepack-gift-rcon.mjs';
import http from 'node:http';import {createHash,randomUUID} from 'node:crypto';import fs from 'node:fs';import {normalize,isFinal,action} from './engine.mjs';
const giftSource = process.env.ICEPACK_GIFT_SOURCE || 'streamerbot';
if (!['streamerbot', 'tikfinity'].includes(giftSource)) throw Error('ICEPACK_GIFT_SOURCE must be streamerbot or tikfinity');
const file='catalog.json';let catalog=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};let logs=[],seen=new Set();
let connection, retryConnection, waitingLogged = false;
let giftSourceStatus = giftSource === 'tikfinity' ? 'waiting' : 'ready';
let status = giftSource === 'tikfinity' ? 'Waiting for TikFinity Desktop' : 'Streamer.bot bridge ready';
let armed=false, pending=[], rewards=[], running=false;
let autoEnabled=false, active=null, lastBridge=0;
let liveSpawnBusy=false, lastLiveSpawn=0;
let testActionServer, testActionServerError, armedGiftTest, giftTestBusy = false;
let giftTest = { state: 'off', message: 'Arm a TikFinity test in Operations Center.' };
let hostedLiveToken, hostedLiveBusy = false;
let hostedLiveMessage = 'Hosted Live Rewards are off.';
function expire(){pending=pending.filter(x=>Date.now()-x.at<120000);if(active&&Date.now()-active.claimed>15000){log("Spawn delivery uncertain (ack timeout): "+active.source+"; not retried");active=null;autoEnabled=false;}}
function claim(mode){expire();if(active||!pending.length||mode==='auto'&&(!armed||!autoEnabled))return null;active={...pending.shift(),id:randomUUID(),claimed:Date.now(),mode};log("Spawn claimed ("+mode+"): "+active.source);return active;}
const dinos={Dodo:'Dodo',Raptor:'Raptor',Rex:'Rex',Carno:'Carno',Dilo:'Dilo'};
const items={Stone:'Stone',Wood:'Wood',Thatch:'Thatch',Fiber:'Fiber'};
const settingsFile='rules-v06.json';
let settings=fs.existsSync(settingsFile)?JSON.parse(fs.readFileSync(settingsFile,'utf8')):{playerId:'',rules:[{gift:'Rose',kind:'spawn',target:'Dodo',level:10,quantity:1,distance:500,cooldown:5}]};
const last=new Map();
function persist(){fs.writeFileSync(settingsFile+'.tmp',JSON.stringify(settings,null,2));fs.renameSync(settingsFile+'.tmp',settingsFile);}
function integer(v,min,max){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid numeric setting');return n;}
function validId(v){return /^\d{1,10}$/.test(v)&&Number(v)>0&&Number(v)<=4294967295;}
function validate(r){let gift=String(r.gift||'').trim();if(!gift||gift.length>100)throw Error('Enter gift name or ID');let kind=r.kind,target=r.target;if(kind==='spawn'&&!Object.hasOwn(dinos,target)||kind==='item'&&!Object.hasOwn(items,target)||!['spawn','item'].includes(kind))throw Error('Invalid action');return {gift,kind,target,level:integer(r.level??10,1,150),quantity:integer(r.quantity,1,kind==='spawn'?5:100),distance:integer(r.distance??500,200,2000),cooldown:integer(r.cooldown,0,300)};}
function spawn(r){return `cheat SpawnDino "Blueprint'/Game/PrimalEarth/Dinos/${dinos[r.target]}/${dinos[r.target]}_Character_BP.${dinos[r.target]}_Character_BP'" ${r.distance} 0 0 ${r.level}`;}
function item(r,id){return `GiveItemToPlayer ${id} "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_${items[r.target]}.PrimalItemResource_${items[r.target]}'" ${r.quantity} 0 0`;}
function queueRule(r,source,manual=false){if(!manual&&!armed)return;const key=r.gift.toLowerCase();if(!manual&&Date.now()-(last.get(key)||0)<r.cooldown*1000){log('Cooldown: '+source);return;}if(r.kind==='spawn'){if(pending.length+r.quantity>20){log('Spawn queue full');return;}for(let i=0;i<r.quantity;i++)pending.push({source,at:Date.now(),cmd:spawn(r)});log('Queued '+r.quantity+' '+r.target+' for F8: '+source);}else{if(!validId(settings.playerId)){log('Reward skipped: configure character ID');return;}if(rewards.length>=20){log('Reward queue full');return;}rewards.push({cmd:item(r,settings.playerId),source,at:Date.now()});log('Reward queued: '+source);void drain();}if(!manual)last.set(key,Date.now());}
async function drain(){if(running)return;running=true;try{while(rewards.length){const job=rewards.shift();if(Date.now()-job.at>120000)continue;try{await rcon(job.cmd);log('Reward sent: '+job.source+'; verify inventory');}catch(e){log('Reward failed: '+e.message);}}}finally{running=false;}}
function enqueueDodo(source){queueRule({gift:'Rose',kind:'spawn',target:'Dodo',level:10,quantity:1,distance:500,cooldown:0},source,true);}
const log=(message)=>{logs.unshift({time:new Date().toLocaleTimeString(),message});logs=logs.slice(0,100);};
function save(){fs.writeFileSync(file+'.tmp',JSON.stringify(catalog,null,2));fs.renameSync(file+'.tmp',file);}
function recordGift(gift) {
  catalog[gift.id] = { name: gift.name, coins: gift.coins ?? catalog[gift.id]?.coins ?? null };
  save();
}
function ingest(event, sim = false) {
  const gift = normalize(event, catalog);
  if (!gift.id) return log('Gift missing ID; ignored');
  if (!sim) recordGift(gift);
  if (isFinal(gift)) processGift(gift, sim);
}
function processGift(g, sim){log(`${sim?'TEST: ':''}${g.sender} → ${g.name} ×${g.count} → ${g.coins===null?'unknown cost':g.coins*g.count+' coins'} → ${action(g)} (coin-tier preview)`);if(!sim&&customRules.handle(g))return;if(!sim&&giftRcon.handle(g))return;if(!sim&&armed){const r=settings.rules.find(r=>r.gift.toLowerCase()===g.id.toLowerCase())||settings.rules.find(r=>r.gift.toLowerCase()===g.name.trim().toLowerCase()||(r.gift.toLowerCase()==='rose'&&g.name.toLowerCase()==='rosa'));if(r)queueRule(r,g.sender+' / '+g.name);}}

async function refresh(){log(`Catalog contains ${Object.keys(catalog).length} observed gifts. TikFinity adds new gifts as they arrive; no full catalog endpoint is used.`);}
function eventId(value) {
  if (typeof value === 'string' && /^[1-9]\d{0,23}$/.test(value)) return value;
  return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
}

function acceptTikFinityGift(data) {
  const gift = normalize(data, catalog);
  if (!/^\d{1,20}$/.test(gift.id) || typeof gift.name !== 'string' || !gift.name.trim() || gift.name.length > 120) {
    log('TikFinity gift ignored: invalid gift ID or name');
    return;
  }
  if (!isFinal(gift)) return;
  const messageId = eventId(data.common?.msgId) || eventId(data.msgId);
  const sender = data.user?.userId ?? data.userId ?? data.user?.uniqueId ?? data.uniqueId;
  const group = eventId(data.groupId);
  const groupKey = gift.type === 1 && group && (typeof sender === 'string' || Number.isSafeInteger(sender)) &&
    String(sender).length > 0 && String(sender).length <= 120 ? JSON.stringify([String(sender), gift.id, group]) : '';
  const keys = [groupKey && 'tikfinity:streak:' + groupKey, messageId && 'tikfinity:gift:' + messageId].filter(Boolean);
  if (!keys.length) { log('TikFinity gift ignored: missing stable event ID'); return; }
  const duplicate = keys.some(key => seen.has(key));
  for (const key of keys) seen.add(key);
  while (seen.size > 10000) seen.delete(seen.values().next().value);
  if (duplicate) return;
  status = 'TikFinity gift received';
  recordGift(gift);
  if (hostedLiveToken) {
    if (gift.id === '5655') void forwardHostedRose(keys[0]);
    return;
  }
  // The direct source handles event identity above. The shared pipeline plans and delivers the reward.
  processGift(gift, false);
}

function connectTikFinity() {
  if (giftSource !== 'tikfinity' || connection || retryConnection) return;
  giftSourceStatus = 'connecting';
  const socket = new WebSocket('ws://127.0.0.1:21213/');
  connection = socket;
  const timeout = setTimeout(retry, 5000);
  function retry() {
    if (connection !== socket) return;
    connection = undefined;
    clearTimeout(timeout);
    giftSourceStatus = 'waiting';
    status = 'Waiting for TikFinity Desktop';
    if (!waitingLogged) log('TikFinity Desktop unavailable. Retrying the local gift feed.');
    waitingLogged = true;
    socket.close();
    retryConnection = setTimeout(() => {
      retryConnection = undefined;
      connectTikFinity();
    }, 3000);
    retryConnection.unref();
  }
  socket.addEventListener('open', () => {
    if (connection !== socket) return;
    clearTimeout(timeout);
    waitingLogged = false;
    giftSourceStatus = 'connected';
    status = 'TikFinity connected';
    log('TikFinity Desktop gift feed connected.');
  });
  socket.addEventListener('message', event => {
    if (connection !== socket || giftSourceStatus !== 'connected' || typeof event.data !== 'string' || event.data.length > 262144) return;
    try {
      const packet = JSON.parse(event.data);
      if (packet?.event === 'gift' && packet.data && typeof packet.data === 'object' && !Array.isArray(packet.data)) acceptTikFinityGift(packet.data);
    } catch (error) { log('TikFinity event error: ' + error.message); }
  });
  socket.addEventListener('close', retry);
  socket.addEventListener('error', retry);
}

async function readTestJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16000) throw Error('Test request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function forwardHostedRose(eventKey) {
  if (hostedLiveBusy) {
    log('Live Rose skipped while the previous hosted reward is in progress.');
    return;
  }
  const token = hostedLiveToken;
  hostedLiveBusy = true;
  hostedLiveMessage = 'Sending a live Rose reward.';
  try {
    const response = await fetch('http://127.0.0.1:3212/hosted-rose-gift', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventHash: createHash('sha256').update(eventKey).digest('hex') }),
      signal: AbortSignal.timeout(35000), redirect: 'error',
    });
    const result = response.ok ? await response.json() : null;
    if (!['sent','blocked','stopped','unconfirmed'].includes(result?.state) || typeof result.message !== 'string') {
      throw Error('Hosted reward status unavailable.');
    }
    if (hostedLiveToken === token) {
      hostedLiveMessage = result.message.slice(0, 180);
      if (result.state === 'stopped') hostedLiveToken = undefined;
    }
    log(result.message.slice(0, 180));
  } catch {
    const message = 'Live Rose delivery is unconfirmed. Check ARK and the owner’s history.';
    if (hostedLiveToken === token) hostedLiveMessage = message;
    log(message);
  } finally { hostedLiveBusy = false; }
}

function hostedLiveStatus() {
  return { enabled: Boolean(hostedLiveToken), busy: hostedLiveBusy, message: hostedLiveMessage };
}

function assertGiftTestIdle() {
  expire();
  if (hostedLiveToken || hostedLiveBusy || giftTestBusy || customRules.mode !== 'off' || customRules.inflight || customRules.queue.length ||
      giftRcon.mode !== 'off' || giftRcon.inflight || giftRcon.queue.length || armed || autoEnabled ||
      active || pending.length || running || rewards.length) {
    throw Error('Stop Custom Rules and other reward lanes before running a TikFinity test.');
  }
}

function planGiftTest(input) {
  const key = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!key || key.length > 120) throw Error('Enter a configured gift name or ID.');
  const { saved, playerId } = customRules;
  const matches = saved.config.rules.filter(rule => rule.enabled &&
    (rule.giftId?.toLowerCase() === key || rule.giftName?.toLowerCase() === key));
  if (matches.length !== 1) throw Error('The gift name or ID must match one enabled rule.');
  const rule = matches[0];
  const plan = planGift(saved.config, saved.catalog, { id: rule.giftId, name: rule.giftName });
  const commands = buildPlanCommands(plan, saved.catalog, saved.enabledPacks, playerId);
  if (commands.length !== 1) throw Error('Choose a gift that prepares one reward command for this test.');
  return { name: rule.giftName ?? rule.giftId, command: commands[0] };
}

function armGiftTest(input) {
  if (!testActionServer?.listening) throw Error(currentGiftTest().message);
  if (input?.confirmation !== 'ARM TIKFINITY TEST') throw Error('Confirm before arming the TikFinity test.');
  assertGiftTestIdle();
  disarmGiftTest();
  if (input.hostedToken !== undefined) {
    if (typeof input.hostedToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.hostedToken)) {
      throw Error('Arm a hosted test from Windows Operations Center.');
    }
    armedGiftTest = { name: 'Rose', hostedToken: input.hostedToken, expiresAt: Date.now() + 120000 };
    giftTest = { state: 'armed', message: 'Hosted Rose armed. Trigger the TikFinity action within two minutes.' };
    return giftTest;
  }
  customRules.reload();
  const plan = planGiftTest(input.gift);
  armedGiftTest = { ...plan, input: input.gift, expiresAt: Date.now() + 120000 };
  giftTest = { state: 'armed', message: `Armed for ${plan.name}. Trigger the TikFinity action within two minutes.` };
  return giftTest;
}

function currentGiftTest() {
  if (giftSource !== 'tikfinity') {
    return { state: 'off', message: 'Select direct TikFinity and restart Companion to use its simulator.' };
  }
  if (!testActionServer?.listening) {
    const message = testActionServerError === 'EADDRINUSE'
      ? 'Port 8832 is in use by another app. Close that app, then restart Companion.'
      : testActionServerError ? `The TikFinity test listener could not start on port 8832 (${testActionServerError}).`
        : 'Companion is starting the TikFinity test listener on port 8832.';
    return { state: 'unavailable', message };
  }
  if (armedGiftTest && armedGiftTest.expiresAt <= Date.now()) {
    armedGiftTest = undefined;
    giftTest = { state: 'off', message: 'The TikFinity test expired. Arm it again in Operations Center.' };
  }
  return giftTest;
}

function disarmGiftTest() {
  if (!armedGiftTest) return;
  armedGiftTest = undefined;
  giftTest = { state: 'off', message: 'The TikFinity test was disarmed.' };
}

function claimGiftTest() {
  currentGiftTest();
  if (!armedGiftTest) throw Error('Arm one test in Windows Operations Center first.');
  assertGiftTestIdle();
  const plan = armedGiftTest;
  disarmGiftTest();
  if (!plan.hostedToken) {
    try {
      customRules.reload();
      if (planGiftTest(plan.input).command !== plan.command) throw Error('The rule changed. Arm the test again.');
    } catch (error) {
      giftTest = { state: 'failed', message: error.message };
      throw Error(giftTest.message);
    }
  }
  giftTestBusy = true;
  return plan;
}

async function sendGiftTest({ name, command, hostedToken }) {
  giftTest = { state: 'sending', message: `Sending the ${name} test reward.` };
  try {
    if (hostedToken) {
      const response = await fetch('http://127.0.0.1:3212/hosted-rose-test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + hostedToken },
        signal: AbortSignal.timeout(30000), redirect: 'error',
      });
      const result = response.ok ? await response.json() : null;
      if (!['sent', 'blocked', 'unconfirmed'].includes(result?.state) || typeof result.message !== 'string') {
        throw Error('Hosted test status unavailable.');
      }
      giftTest = { state: result.state, message: result.message.slice(0, 180) };
    } else {
      await rcon(command);
      giftTest = { state: 'sent', message: `${name} test reward sent. Verify it in ARK.` };
    }
    log(giftTest.message);
  } catch (error) {
    if (hostedToken) giftTest = { state: 'unconfirmed', message: 'Hosted Rose delivery is unconfirmed. Check ARK and the owner’s delivery history.' };
    else {
      giftTest = { state: 'failed', message: `The ${name} test failed. Check the engine Event log.` };
      log(`TikFinity test error: ${error.message}`);
    }
  } finally { giftTestBusy = false; }
}

function startTikFinityTestServer() {
  const origins = new Set(['https://app.tikfinity.com', 'https://tikfinity.zerody.one', 'https://tikfinity.com', 'https://www.tikfinity.com']);
  const categoryId = 'icepack-test', actionId = 'armed-gift';
  testActionServer = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
    };
    if (!['127.0.0.1:8832', 'localhost:8832'].includes(req.headers.host) || (origin && !origins.has(origin))) {
      return send(403, { message: 'This action is available locally to TikFinity.' });
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TikFinity-UID, X-TikFinity-Language');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = URL.parse(req.url, 'http://127.0.0.1:8832');
    if (!url) return send(400, { message: 'Invalid TikFinity action URL.' });
    if (req.method === 'GET' && url.pathname === '/api/app/info') return send(200, { data: { name: 'Ice Pack Companion', version: '1.0', author: 'Northpath' } });
    if (req.method === 'GET' && url.pathname === '/api/features/categories') return send(200, { data: [{ categoryId, categoryName: 'Ice Pack Companion' }] });
    if (req.method === 'GET' && url.pathname === '/api/features/actions') {
      return send(200, { data: url.searchParams.get('categoryId') === categoryId ? [{ actionId, actionName: 'Send armed test gift' }] : [] });
    }
    if (req.method === 'POST' && url.pathname === '/api/features/actions/exec') {
      try {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw Error('Expected a TikFinity JSON action.');
        const action = await readTestJson(req);
        if (action?.categoryId !== categoryId || action.actionId !== actionId) throw Error('Unknown Ice Pack test action.');
        void sendGiftTest(claimGiftTest());
        return send(200, { data: [] });
      } catch (error) { return send(400, { message: error.message }); }
    }
    return send(404, { message: 'Unknown TikFinity action endpoint.' });
  });
  testActionServer.on('error', error => {
    testActionServerError = error.code ?? 'unknown error';
    log(`TikFinity test server unavailable: ${testActionServerError}`);
  });
  testActionServer.listen(8832, '127.0.0.1');
}
async function rcon(command="ListPlayers"){
  const host=process.env.RCON_HOST,port=Number(process.env.RCON_PORT),password=process.env.RCON_PASSWORD;
  if(!host||!Number.isInteger(port)||port<1||port>65535||!password)throw Error('Set RCON_HOST, RCON_PORT and RCON_PASSWORD in .env');
  const {Rcon}=await import('rcon-client');
  const c=new Rcon({host,port,password,timeout:5000});
  let rejectFailure,timer,stage='connecting/authenticating';
  const failure=new Promise((_,reject)=>{rejectFailure=reject;});
  // Register BEFORE connecting: EventEmitter errors otherwise terminate Node.
  c.on('error',err=>rejectFailure(err));
  c.on('end',()=>rejectFailure(new Error('RCON connection closed')));
  try{
    timer=setTimeout(()=>rejectFailure(new Error('RCON timed out')),10000);
    await Promise.race([failure,c.connect()]);
    stage='running '+command;
    const result=await Promise.race([failure,c.send(command)]);
    log('RCON '+command+': '+(result||'(empty response; verify in game)'));
  }catch(e){throw Error(`RCON ${stage}: ${e.code??''} ${e.message}. Check RCON port, admin password and server status.`);}
  finally{clearTimeout(timer);try{await Promise.race([Promise.resolve(c.end()),new Promise(resolve=>{const t=setTimeout(resolve,1000);t.unref();})]);}catch{}}
}
async function bridge(req){
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw Error('Gift payload too large');chunks.push(chunk);}
 const p=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
 const name=(p.get('giftName')||'').trim(), coins=Number(p.get('coins')), count=Number(p.get('repeatCount')||1);
 if(!name||!Number.isSafeInteger(coins)||coins<1||!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(coins*count))throw Error('Invalid gift name, coins or repeat count');
 const id=(p.get('giftId')||'').trim()||'bridge:'+name.toLowerCase();
 status='Streamer.bot gift received';
 ingest({giftId:id,giftName:name,diamondCount:coins,repeatCount:count,uniqueId:p.get('username')||'Viewer'},false);
}
const giftRcon=new GiftRconLane({send:rcon,log});
const customRules=new CustomRulesLane({send:rcon,log,sourceDir:process.env.ICEPACK_KIT_DIR||'./icepack-catalog-manager'});
// Restore the saved target on every engine start. This never enables Live mode.
if (validId(String(settings.playerId ?? ''))) {
  try {
    customRules.configure({playerId: String(settings.playerId)});
    log('Custom rules target restored from saved engine settings');
  } catch (error) {
    log('Custom rules target restore failed: ' + error.message);
  }
} else {
  log('Custom rules target not configured; set Specimen Implant ID before reward previews');
}

const port=3210;http.createServer(async(req,res)=>{const json=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};try{if(req.headers.host!==`localhost:${port}`&&req.headers.host!==`127.0.0.1:${port}`)return json(403,{error:'Local only'});if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync('public/index.html'));}if(req.method==='GET'&&req.url==='/state'){expire();return json(200,{status,giftSource,giftSourceStatus,hostedGiftTest:true,hostedLive:hostedLiveStatus(),giftTest:currentGiftTest(),catalog,logs,armed,pending:pending.length,autoEnabled,active:active?{source:active.source,mode:active.mode}:null,bridgeOnline:Date.now()-lastBridge<5000,rewardPending:rewards.length,settings,giftRcon:giftRcon.state(),customRules:customRules.state()});}if(req.method==='POST'&&req.url==='/bridge/gift'&&req.headers['x-ice-pack']==='1'&&!req.headers.origin){if(giftSource!=='streamerbot')return json(409,{error:'TikFinity direct is the active gift source'});await bridge(req);return json(200,{ok:true});}if(req.method==='POST'&&req.url==='/bridge/auto-off'&&req.headers['x-ice-pack']==='1'&&!req.headers.origin){autoEnabled=false;log('Automatic console mode stopped by bridge');return json(200,{ok:true});}if(req.method==='POST'&&req.url==='/bridge/claim'&&req.headers['x-ice-pack']==='1'&&!req.headers.origin){lastBridge=Date.now();const mode=req.headers['x-mode']==='auto'?'auto':'manual';const job=claim(mode);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','X-Job-Id':job?.id||'','X-Auto-Enabled':armed&&autoEnabled?'1':'0'});return res.end(job?.cmd||'');}if(req.method==='POST'&&req.url==='/bridge/check'&&req.headers['x-ice-pack']==='1'&&!req.headers.origin){expire();return json(active?.id===req.headers['x-job-id']&&armed&&autoEnabled?200:409,{ok:active?.id===req.headers['x-job-id']&&armed&&autoEnabled});}if(req.method==='POST'&&req.url==='/bridge/ack'&&req.headers['x-ice-pack']==='1'&&!req.headers.origin){expire();const id=req.headers['x-job-id'], outcome=req.headers['x-outcome'];if(!active||active.id!==id||!['submitted','typed','failed','cancelled'].includes(outcome))return json(409,{error:'Unknown or expired claim'});log('Spawn '+outcome+': '+active.source+(outcome==='submitted'?' (verify creature in game)':outcome==='typed'?' (manual Enter required)':''));if(outcome==='failed'||outcome==='cancelled')autoEnabled=false;active=null;return json(200,{ok:true});}if(req.method==='POST'&&req.url==='/bridge/next'&&req.headers['x-ice-pack']==='1'&&!req.headers.origin){if(autoEnabled||active)return json(409,{error:'Use v0.7 console bridge'});pending=pending.filter(x=>Date.now()-x.at<120000);const job=pending.shift();res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});if(job)log('Spawn command handed to local bridge: '+job.source+' (verify spawn in game)');return res.end(job?job.cmd:'');}if(req.method!=='POST'||req.headers['x-ice-pack']!=='1'||!['http://localhost:3210','http://127.0.0.1:3210'].includes(req.headers.origin))return json(403,{error:'Local dashboard only'});if(req.url==='/hosted-live-start'){
  if (giftSource !== 'tikfinity' || giftSourceStatus !== 'connected') throw Error('Connect TikFinity Desktop first.');
  const { token } = await readTestJson(req);
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Error('Start hosted Live Rewards in Operations Center.');
  assertGiftTestIdle();
  disarmGiftTest();
  hostedLiveToken = token;
  hostedLiveMessage = 'Hosted Live Rewards are on. Listening for Rose gifts.';
  return json(200, { ok: true, hostedLive: hostedLiveStatus() });
}else if(req.url==='/hosted-live-stop'){
  hostedLiveToken = undefined;
  hostedLiveMessage = 'Hosted Live Rewards are off.';
  return json(200, { ok: true, hostedLive: hostedLiveStatus() });
}else if(req.url==='/tikfinity-test-arm'){
  return json(200,{ok:true,giftTest:armGiftTest(await readTestJson(req))});
}else if(req.url==='/custom-rules-reload'){
  return json(200,{ok:true,customRules:customRules.reload()});
}else if(req.url==='/custom-rules-config'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('Payload too large');}
  const requested=JSON.parse(raw);
   // Configure the active lane first; never persist a rejected/invalid ID.
   const state=customRules.configure(requested);
   const playerId=String(requested.playerId).trim();
   const previous=settings.playerId;
   settings.playerId=playerId;
   try { persist(); }
   catch(error) {
     settings.playerId=previous;
     if(validId(String(previous ?? ''))) customRules.configure({playerId: String(previous)});
     else customRules.playerId=''; // Return to the previously unconfigured state.
     throw error;
   }
   log('Custom rules target ID saved for future engine restarts');
   return json(200,{ok:true,customRules:state});
}else if(req.url==='/custom-rules-mode'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('Payload too large');}
  const v=JSON.parse(raw);
  if(v.mode==='live'&&(hostedLiveToken||hostedLiveBusy||giftTestBusy))throw Error('Stop hosted rewards and wait for active deliveries first.');
  if(v.mode==='live'&&(armed||giftRcon.mode!=='off'))throw Error('Disarm legacy and turn off experimental Dodo lane first');
  if(v.mode==='live')disarmGiftTest();
  return json(200,{ok:true,customRules:customRules.setMode(v.mode,v.confirmation)});
}else if(req.url==='/custom-rules-simulate'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Payload too large');}
  const v=JSON.parse(raw);
  if(typeof v.id!=='string'||v.id.length>120||typeof v.name!=='string'||v.name.length>120)throw Error('Invalid simulation gift');
  return json(200,{ok:true,customRules:customRules.simulate({id:v.id,name:v.name})});
}else if(req.url==='/gift-rcon-config'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('Payload too large');}
  const v=JSON.parse(raw);return json(200,{ok:true,giftRcon:giftRcon.configure(v)});
}else if(req.url==='/gift-rcon-mode'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('Payload too large');}
  const v=JSON.parse(raw);
  if(v.mode==='live'&&(hostedLiveToken||hostedLiveBusy||giftTestBusy))throw Error('Stop hosted rewards and wait for active deliveries first.');
  if(v.mode==='live'&&(armed||customRules.mode!=='off'))throw Error('Disarm legacy and turn off custom rules before enabling Dodo RCON');
  if(v.mode==='live')disarmGiftTest();
  return json(200,{ok:true,giftRcon:giftRcon.setMode(v.mode,v.confirmation)});
}else if(req.url==='/gift-rcon-emergency-stop'){
  disarmGiftTest();giftRcon.stop();customRules.stop();armed=false;autoEnabled=false;pending=[];rewards=[];
  return json(200,{ok:true,giftRcon:giftRcon.state()});
}else if(req.url==='/gift-rcon-simulate'){
  return json(200,{ok:true,giftRcon:giftRcon.simulate()});
}else if(req.url==='/connect')throw Error('Choose the gift source in Operations Center and restart Companion.');else if(req.url==='/refresh')await refresh();else if(req.url==='/rcon')await rcon();else if(req.url==='/broadcast-test')await rcon('Broadcast Ice Pack ARK connection test');else if(req.url==='/arm'){if(hostedLiveToken||hostedLiveBusy||giftTestBusy)throw Error('Stop hosted rewards and wait for active deliveries first.');disarmGiftTest();if(giftRcon.mode==='live'||customRules.mode==='live')throw Error('Disable all live gift RCON before arming legacy rules');armed=true;log('Gift rules armed: one action per received gift event');}else if(req.url==='/auto-enable'){if(!armed)throw Error('Arm gift rules first');autoEnabled=true;log('Automatic console mode permitted; enable F9 in ARK');}else if(req.url==='/auto-disable'){autoEnabled=false;log('Automatic console mode disabled');}else if(req.url==='/disarm'){armed=false;autoEnabled=false;pending=[];rewards=[];log('Disarmed; pending commands cleared; in-flight command cannot be recalled');}else if(req.url==='/dodo-test')enqueueDodo('Manual test');else if(req.url==='/icepack-spawn-test'){
  // Separate manual-only feature; does not arm or consume gift rules.
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('Spawn payload too large');}
  const input=JSON.parse(raw);const cmd=buildIcePackSpawnCommand(input);
  if(input.mode==='preview'){
    log('Spawn preview (no RCON): '+cmd);
    return json(200,{ok:true,mode:'preview',command:cmd,sent:false});
  }
  if(input.mode!=='live'||input.confirm!=='SPAWN ONE DODO')throw Error('Live spawn requires explicit confirmation');
  if(input.creature!=='Dodo'||Number(input.level)!==25)throw Error('Initial live test is restricted to one level-25 Dodo');
  if(liveSpawnBusy)throw Error('Another direct RCON test is still running');
  if(Date.now()-lastLiveSpawn<10000)throw Error('Wait ten seconds between manual tests');
  liveSpawnBusy=true;lastLiveSpawn=Date.now();
  try{await rcon(cmd);log('Direct spawn command sent; verify Dodo in game: '+cmd);}
  finally{liveSpawnBusy=false;}
  return json(200,{ok:true,mode:'live',command:cmd,sent:true,verified:false});
}else if(req.url==='/stone-test'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024)throw Error('Payload too large');chunks.push(chunk);}const id=new URLSearchParams(Buffer.concat(chunks).toString()).get('playerId')||'';if(!/^\d{1,10}$/.test(id)||Number(id)<1||Number(id)>4294967295)throw Error('Enter your numeric character implant ID');await rcon(`GiveItemToPlayer ${id} "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_Stone.PrimalItemResource_Stone'" 1 0 0`);}else if(req.url==='/settings'){let data='';for await(const chunk of req){data+=chunk;if(data.length>65536)throw Error('Settings too large');}const v=JSON.parse(data);if(v.playerId&&!validId(v.playerId))throw Error('Invalid character ID');if(!Array.isArray(v.rules)||v.rules.length>100)throw Error('Invalid rules');const rules=v.rules.map(validate);if(new Set(rules.map(r=>r.gift.toLowerCase())).size!==rules.length)throw Error('Duplicate gift rule');// Legacy settings updates may omit playerId; do not wipe the active custom-rules target.
const idInput=v.playerId==null||v.playerId===''?String(settings.playerId??''):String(v.playerId);
if(idInput && !validId(idInput))throw Error('Invalid character ID');
if(customRules.mode==='live'||customRules.inflight)throw Error('Stop live custom rules before changing legacy settings');
const previousSettings=settings;
if(idInput && idInput!==customRules.playerId)customRules.configure({playerId:idInput});
settings={playerId:idInput,rules};
try{persist();}catch(error){settings=previousSettings;throw error;}
log('Rules saved; target player ID preserved');}else if(req.url==='/rule-test'){let data='';for await(const chunk of req){data+=chunk;if(data.length>4096)throw Error('Payload too large');}queueRule(validate(JSON.parse(data)),'Manual rule test',true);}else if(req.url==='/simulate')ingest({giftId:999999,giftName:'Demo gift',diamondCount:50,repeatCount:2,uniqueId:'Test viewer'},true);else return json(404,{error:'Not found'});json(200,{ok:true});}catch(e){log('Error: '+e.message);json(400,{error:e.message});}}).listen(port,'127.0.0.1',()=>{console.log('Ice Pack dashboard: http://localhost:3210');if(giftSource==='tikfinity'){connectTikFinity();startTikFinityTestServer();}});
