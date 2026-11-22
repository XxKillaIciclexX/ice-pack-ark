import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CustomRulesLane,buildPlanCommands,loadSavedRules} from './icepack-custom-rules.mjs';
const base={schemaVersion:2,packs:[{id:'base-game',name:'Base Game',premium:false,enabledByDefault:true}],dinosaurs:[{id:'Dodo',name:'Dodo',contentPack:'base-game',enabled:true,verified:false,category:'Herbivores',tags:[]}],items:[{id:'Stone',name:'Stone',contentPack:'base-game',enabled:true,verified:false,category:'Resources',tags:[]}]};
const kit={schemaVersion:2,kits:[{id:'starter',name:'Starter',entries:[{type:'item',itemId:'Stone',quantity:100,announcement:false},{type:'dinosaur',creatureId:'Dodo',level:25,status:'wild',quantity:1,announcement:false}]}],rules:[{id:'rose',giftId:'5655',giftName:'Rose',enabled:true,cooldown:30,reward:{type:'kit',kitId:'starter',announcement:false}}]};
const saved={catalog:base,config:kit,enabledPacks:new Set(['base-game'])};
test('mixed kit compiles item then dinosaur command',()=>{const cmds=buildPlanCommands({actions:kit.kits[0].entries},base,saved.enabledPacks,'537815134');assert.equal(cmds.length,2);assert.match(cmds[0],/^GiveItemToPlayer 537815134/);assert.equal(cmds[1],'ScriptCommand IcePackSpawn,Dodo,25,537815134');});
test('unsupported tamed dinosaur is blocked without wild substitution',()=>assert.throws(()=>buildPlanCommands({actions:[{...kit.kits[0].entries[1],status:'tamed'}]},base,saved.enabledPacks,'537815134'),/Tamed/));
test('unsupported item is blocked',()=>assert.throws(()=>buildPlanCommands({actions:[{type:'item',itemId:'Wood',quantity:10,announcement:false}]},{...base,items:[...base.items,{id:'Wood',enabled:true,contentPack:'base-game'}]},saved.enabledPacks,'537815134'),/not approved/));
test('announcement requires mod support',()=>assert.throws(()=>buildPlanCommands({actions:[{...kit.kits[0].entries[1],announcement:true}]},base,saved.enabledPacks,'537815134'),/Announcements/));
test('no RCON in preview and gift ID match',()=>{let sent=0;const l=new CustomRulesLane({send:async()=>sent++});l.saved=saved;l.configure({playerId:'537815134'});l.setMode('preview');assert.equal(l.handle({id:'5655',name:'Wrong name'}),true);assert.equal(l.history[0].status,'preview');assert.equal(sent,0);assert.equal(l.handle({id:'other',name:'Rose'}),false);});
test('invalid player ID rejected',()=>assert.throws(()=>buildPlanCommands({actions:kit.kits[0].entries},base,saved.enabledPacks,'1,2'),/Implant ID/));
test('global cooldown prevents second accepted gift',async()=>{let n=0;let now=100000;const l=new CustomRulesLane({send:async()=>{n++},now:()=>now});l.saved=saved;l.configure({playerId:'537815134'});l.setMode('live','ENABLE LIVE CUSTOM RULES');l.handle({id:'5655',name:'Rose'});await new Promise(r=>setImmediate(r));assert.equal(n,2);now+=1000;l.handle({id:'5655',name:'Rose'});await new Promise(r=>setImmediate(r));assert.equal(n,2);});
test('stops after in-flight command, never starts second',async()=>{let release;const calls=[];const l=new CustomRulesLane({send:async cmd=>{calls.push(cmd);await new Promise(r=>{release=r;});}});l.saved=saved;l.configure({playerId:'537815134'});l.setMode('live','ENABLE LIVE CUSTOM RULES');l.handle({id:'5655',name:'Rose'});await new Promise(r=>setImmediate(r));l.stop();release();await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);assert.equal(l.mode,'off');});
test('no queue on unsupported kit action',()=>{const l=new CustomRulesLane({send:async()=>{throw Error('Should not send')}});l.saved={...saved,config:{...kit,kits:[{...kit.kits[0],entries:[{...kit.kits[0].entries[1],status:'tamed'}]}]}};l.configure({playerId:'537815134'});l.setMode('live','ENABLE LIVE CUSTOM RULES');assert.equal(l.handle({id:'5655',name:'Rose'}),true);assert.equal(l.queue.length,0);assert.equal(l.history[0].status,'blocked');});

const dinosaur = kit.kits[0].entries[1];
const gift = { id: '5655', name: 'Rose' };
const multiple = {
  ...saved,
  config: {
    ...kit,
    kits: [{ ...kit.kits[0], entries: [{ ...dinosaur, quantity: 2 }, kit.kits[0].entries[0], dinosaur] }],
  },
};

test('expands dinosaur quantities and separate Kit entries within the eight-command limit', () => {
  const commands = buildPlanCommands({ actions: multiple.config.kits[0].entries }, base, saved.enabledPacks, '1');
  assert.equal(commands.length, 4);
  assert.equal(commands.filter(command => command.startsWith('ScriptCommand IcePackSpawn,')).length, 3);
  assert.equal(buildPlanCommands({ actions: [{ ...dinosaur, quantity: 8 }] }, base, saved.enabledPacks, '1').length, 8);
  assert.throws(() => buildPlanCommands({ actions: [{ ...dinosaur, quantity: 8 }, dinosaur] }, base, saved.enabledPacks, '1'), /limit of 8/);
});

test('spaces spawns while preserving the order of Kit actions', async () => {
  const calls = [];
  let now = 100_000;
  const lane = new CustomRulesLane({
    send: async command => { calls.push({ command, at: now }); },
    now: () => now,
    wait: async elapsed => { now += elapsed; },
  });
  lane.saved = multiple;
  lane.configure({ playerId: '1' });
  lane.setMode('live', 'ENABLE LIVE CUSTOM RULES');
  lane.handle(gift);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call.at), [100_000, 106_000, 106_000, 112_000]);
  assert.match(calls[2].command, /^GiveItemToPlayer/);
  assert.equal(lane.history[0].status, 'sent-unverified');
  assert.equal(lane.state().activeDelivery, null);
  assert.deepEqual(lane.state().lastDelivery, {
    ruleId: 'rose', gift: 'Rose', sent: 4, total: 4, outcome: 'sent-unverified',
  });
});

test('Stop cancels a pending spawn during the cooldown wait', async () => {
  const calls = [];
  const lane = new CustomRulesLane({ send: async command => { calls.push(command); } });
  lane.saved = multiple;
  lane.configure({ playerId: '1' });
  lane.setMode('live', 'ENABLE LIVE CUSTOM RULES');
  lane.handle(gift);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(lane.inflight, true);
  const delivery = lane.state().activeDelivery;
  assert.equal(delivery.sent, 1);
  assert.equal(delivery.total, 4);
  assert.equal(delivery.phase, 'cooldown');
  assert.ok(delivery.cooldownMs > 0 && delivery.cooldownMs <= 6000);
  lane.stop();
  assert.equal(lane.state().activeDelivery.phase, 'stopping');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(lane.inflight, false);
  assert.deepEqual(lane.history, []);
  assert.equal(lane.state().activeDelivery, null);
  assert.deepEqual(lane.state().lastDelivery, {
    ruleId: 'rose', gift: 'Rose', sent: 1, total: 4, outcome: 'stopped',
  });
});

test('Preview lists all dinosaur commands without sending or waiting', () => {
  const unexpected = () => assert.fail('Preview must not send or wait');
  const lane = new CustomRulesLane({ send: unexpected, wait: unexpected });
  lane.saved = multiple;
  lane.configure({ playerId: '1' });
  lane.setMode('preview');
  lane.handle(gift);
  assert.equal(lane.history[0].status, 'preview');
  assert.equal(lane.history[0].commands.length, 4);
});

test('a failed send reports partial progress and cancels the remaining commands', async () => {
  let attempts = 0;
  let now = 100_000;
  const lane = new CustomRulesLane({
    send: async () => { if (++attempts === 2) throw Error('Connection lost'); },
    now: () => now,
    wait: async elapsed => { now += elapsed; },
  });
  lane.saved = multiple;
  lane.configure({ playerId: '1' });
  lane.setMode('live', 'ENABLE LIVE CUSTOM RULES');
  lane.handle(gift);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(lane.state().mode, 'off');
  assert.equal(lane.state().activeDelivery, null);
  assert.deepEqual(lane.state().lastDelivery, {
    ruleId: 'rose', gift: 'Rose', sent: 1, total: 4, outcome: 'rcon-error',
  });
});

test('records a queued gift that expires without sending any commands for it', async () => {
  let now = 100_000;
  let complete;
  let sends = 0;
  const lane = new CustomRulesLane({
    now: () => now,
    send: async () => { if (++sends === 1) await new Promise(resolve => { complete = resolve; }); },
  });
  lane.saved = saved;
  lane.configure({ playerId: '1' });
  lane.setMode('live', 'ENABLE LIVE CUSTOM RULES');
  lane.handle(gift);
  now += 31_000;
  lane.handle(gift);
  assert.equal(lane.state().queued, 1);
  now += 31_000;
  complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sends, 2);
  assert.deepEqual(lane.state().deliveryHistory.map(({ outcome, sent }) => [outcome, sent]), [
    ['expired-in-queue', 0], ['sent-unverified', 2],
  ]);
  assert.equal(lane.state().lastDelivery.outcome, 'sent-unverified');
});

test('Stop records the discarded queued gift and partial active delivery separately', async () => {
  let now = 100_000;
  let complete;
  const lane = new CustomRulesLane({
    now: () => now,
    send: () => new Promise(resolve => { complete = resolve; }),
  });
  lane.saved = saved;
  lane.configure({ playerId: '1' });
  lane.setMode('live', 'ENABLE LIVE CUSTOM RULES');
  lane.handle(gift);
  now += 31_000;
  lane.handle(gift);
  lane.stop();
  assert.equal(lane.state().deliveryHistory[0].outcome, 'canceled-in-queue');
  complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(lane.state().deliveryHistory.map(({ outcome, sent }) => [outcome, sent]), [
    ['stopped', 1], ['canceled-in-queue', 0],
  ]);
});

test('retains only 20 outcomes and excludes Preview from delivery history', async () => {
  let now = 100_000;
  const lane = new CustomRulesLane({ now: () => now, send: async () => {} });
  lane.saved = saved;
  lane.configure({ playerId: '1' });
  lane.setMode('live', 'ENABLE LIVE CUSTOM RULES');
  for (let i = 0; i < 21; i++) {
    lane.handle({ ...gift, name: `Rose ${i}` });
    await new Promise(resolve => setImmediate(resolve));
    now += 31_000;
  }
  lane.setMode('preview');
  lane.handle(gift);
  const history = lane.state().deliveryHistory;
  assert.equal(history.length, 20);
  assert.equal(history[0].gift, 'Rose 20');
  assert.equal(history.at(-1).gift, 'Rose 1');
  assert.ok(history.every(row => row.outcome === 'sent-unverified' && !('commands' in row)));
});

test('loaded fingerprints stay tied to the bytes actually parsed until a successful reload', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'icepack-fingerprints-test-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const rulesPath = join(dir, 'streamer-config-v2.json');
  const catalogPath = join(dir, 'ark-catalog-v2.json');
  const sha = value => createHash('sha256').update(value).digest('hex');
  const rules = JSON.stringify(kit);
  const catalog = JSON.stringify(base);
  await writeFile(rulesPath, rules);
  await writeFile(catalogPath, catalog);
  const lane = new CustomRulesLane({ sourceDir: dir, send: async () => {} });
  assert.equal(lane.state().loadedFingerprints, null);
  const loaded = lane.reload();
  assert.deepEqual(loaded.loadedFingerprints, {rules:sha(rules), catalog:sha(catalog), contentPrefs:null});
  const revised = structuredClone(kit);
  revised.rules[0].cooldown = 60;
  await writeFile(rulesPath, JSON.stringify(revised));
  assert.deepEqual(lane.state().loadedFingerprints, loaded.loadedFingerprints);
  await writeFile(rulesPath, '{');
  assert.throws(() => lane.reload());
  assert.deepEqual(lane.state().loadedFingerprints, loaded.loadedFingerprints);
  await writeFile(rulesPath, JSON.stringify(revised));
  const prefs = JSON.stringify({enabledPacks:['base-game']});
  await writeFile(join(dir, 'content-prefs.json'), prefs);
  const reloaded = lane.reload();
  assert.equal(reloaded.ruleCount, loaded.ruleCount);
  assert.equal(reloaded.kitCount, loaded.kitCount);
  assert.equal(reloaded.loadedFingerprints.rules, sha(JSON.stringify(revised)));
  assert.equal(reloaded.loadedFingerprints.contentPrefs, sha(prefs));
});
