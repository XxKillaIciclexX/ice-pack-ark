import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { WebSocketServer } from 'ws';

const origin = 'http://127.0.0.1:3210';
const state = async () => (await fetch(`${origin}/state`)).json();
const post = (endpoint, body) => fetch(`${origin}/${endpoint}`, {
  method: 'POST', headers: { Origin: origin, 'X-Ice-Pack': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const forward = () => fetch(`${origin}/bridge/gift`, {
  method: 'POST', headers: { 'X-Ice-Pack': '1' }, body: new URLSearchParams({ giftId: '5655', giftName: 'Rose', coins: '1' }),
});
const tikfinityHeaders = {
  'Content-Type': 'application/json', 'X-TikFinity-UID': 'fixture', 'X-TikFinity-Language': 'en',
};
const testAction = (origin = 'https://app.tikfinity.com') => fetch('http://127.0.0.1:8832/api/features/actions/exec', {
  method: 'POST', headers: { Origin: origin, ...tikfinityHeaders },
  body: JSON.stringify({ categoryId: 'icepack-test', actionId: 'armed-gift', context: { eventType: 'test' } }),
});
const arm = () => post('tikfinity-test-arm', { gift: 'Rose', confirmation: 'ARM TIKFINITY TEST' });

async function until(check) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { const result = await check(); if (result) return result; } catch { /* Wait for the child listener. */ }
    await wait(50);
  }
  throw Error('The engine did not report the expected gift state.');
}

test('one input at a time, single and completed streak rewards, and no duplicate on reconnect', { timeout: 20_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'icepack-tikfinity-'));
  const kit = join(root, 'kit');
  const log = join(root, 'rcon.ndjson');
  const stub = join(root, 'node_modules', 'rcon-client');
  let engine, server, occupiedPort;
  async function stopEngine() {
    if (!engine || engine.exitCode !== null || engine.signalCode !== null) return;
    const done = once(engine, 'exit');
    engine.kill();
    await done;
  }
  t.after(async () => {
    await stopEngine();
    if (server) {
      for (const socket of server.clients) socket.terminate();
      await new Promise(resolve => server.close(resolve));
    }
    if (occupiedPort?.listening) await new Promise(resolve => occupiedPort.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  for (const name of ['server.mjs', 'engine.mjs', 'icepack-custom-rules.mjs', 'icepack-config-engine.mjs', 'icepack-gift-rcon.mjs', 'icepack-spawn-rcon.mjs']) {
    await copyFile(new URL(name, import.meta.url), join(root, name));
  }
  await mkdir(kit);
  await mkdir(stub, { recursive: true });
  await writeFile(join(kit, 'ark-catalog-v2.json'), JSON.stringify({ schemaVersion: 2, items: [{ id: 'Stone', name: 'Stone' }], dinosaurs: [] }));
  await writeFile(join(kit, 'streamer-config-v2.json'), JSON.stringify({ schemaVersion: 2, kits: [], rules: [
    { id: 'rose', giftName: 'Rose', reward: { type: 'item', itemId: 'Stone', quantity: 5, announcement: false } },
  ] }));
  await writeFile(join(root, 'rules-v06.json'), JSON.stringify({ playerId: '1', rules: [] }));
  await writeFile(join(stub, 'package.json'), JSON.stringify({ type: 'module', exports: './index.js' }));
  await writeFile(join(stub, 'index.js'), `
    import { EventEmitter } from 'node:events';
    import { appendFile } from 'node:fs/promises';
    export class Rcon extends EventEmitter {
      async connect() {}
      async send(command) { await appendFile(process.env.GIFT_TEST_LOG, JSON.stringify(command) + '\\n'); return 'fixture'; }
      async end() {}
    }
  `);
  const clock = join(root, 'clock.mjs');
  await writeFile(clock, 'const now = Date.now; const start = now(); Date.now = () => start + 100 * (now() - start);');
  function start(source) {
    const env = { ICEPACK_KIT_DIR: kit, GIFT_TEST_LOG: log, RCON_HOST: '127.0.0.1', RCON_PORT: '12345', RCON_PASSWORD: 'fixture' };
    if (source) env.ICEPACK_GIFT_SOURCE = source;
    engine = spawn(process.execPath, ['--import', clock, join(root, 'server.mjs')], { cwd: root, env, stdio: 'ignore' });
  }
  function gift(socket, fields) {
    socket.send(JSON.stringify({ event: 'gift', data: { giftId: 5655, giftName: 'Rose', diamondCount: 1, uniqueId: 'fixture', ...fields } }));
  }
  start('tikfinity');
  await until(async () => (await state()).giftSourceStatus === 'waiting');
  assert.equal((await forward()).status, 409);
  server = new WebSocketServer({ host: '127.0.0.1', port: 21213 });
  const [first] = await once(server, 'connection');
  await until(async () => (await state()).giftSourceStatus === 'connected');
  for (const origin of ['https://app.tikfinity.com', 'https://tikfinity.zerody.one']) {
    const appInfo = await fetch('http://127.0.0.1:8832/api/app/info', { headers: { Origin: origin } });
    assert.equal(appInfo.status, 200);
    assert.equal(appInfo.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal((await appInfo.json()).data.name, 'Ice Pack Companion');
  }
  const appOrigin = 'https://tikfinity.com';
  const localActions = 'http://127.0.0.1:8832/api/features';
  const requestedHeaders = 'content-type,x-tikfinity-language,x-tikfinity-uid';
  for (const [path, method] of [['/categories', 'GET'], ['/actions?categoryId=icepack-test', 'GET'], ['/actions/exec', 'POST']]) {
    const preflight = await fetch(localActions + path, {
      method: 'OPTIONS', headers: {
        Origin: appOrigin, 'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': requestedHeaders, 'Access-Control-Request-Private-Network': 'true',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), appOrigin);
    assert.equal(preflight.headers.get('Access-Control-Allow-Private-Network'), 'true');
    const allowed = preflight.headers.get('Access-Control-Allow-Headers').toLowerCase().split(',').map(name => name.trim()).sort();
    assert.deepEqual(allowed, requestedHeaders.split(','));
  }
  const clientHeaders = { Origin: appOrigin, ...tikfinityHeaders };
  const categories = await fetch(localActions + '/categories', { headers: clientHeaders });
  assert.deepEqual((await categories.json()).data, [{ categoryId: 'icepack-test', categoryName: 'Ice Pack Companion' }]);
  const actions = await fetch(localActions + '/actions?categoryId=icepack-test', { headers: clientHeaders });
  assert.deepEqual((await actions.json()).data, [{ actionId: 'armed-gift', actionName: 'Send armed test gift' }]);
  assert.equal((await testAction()).status, 400);
  assert.equal((await post('custom-rules-reload', {})).status, 200);
  assert.equal((await post('custom-rules-mode', { mode: 'live', confirmation: 'ENABLE LIVE CUSTOM RULES' })).status, 200);
  assert.equal((await arm()).status, 400);
  gift(first, { giftType: 1, msgId: '100', groupId: '90', repeatCount: 1, repeatEnd: false });
  gift(first, { giftType: 1, msgId: '101', groupId: '90', repeatCount: 2, repeatEnd: false });
  await wait(100);
  await assert.rejects(readFile(log), { code: 'ENOENT' });

  gift(first, { giftType: 0, common: { msgId: '7000000000000000001' } });
  await until(async () => (await state()).customRules.deliveryHistory.length === 1);
  await wait(180); // Let the accelerated engine cooldown elapse before testing replay.
  gift(first, { giftType: 0, msgId: '7000000000000000001' });
  gift(first, { giftType: 1, msgId: '102', groupId: '90', repeatCount: 3, repeatEnd: true });
  await until(async () => (await state()).customRules.deliveryHistory.length === 2);
  assert.equal((await state()).logs.filter(log => log.message.includes('Custom gift queued')).length, 2);
  assert.ok((await state()).logs.some(log => log.message.includes('Rose ×3')));

  const reconnected = once(server, 'connection');
  first.terminate();
  const [second] = await reconnected;
  await until(async () => (await state()).giftSourceStatus === 'connected');
  gift(second, { giftType: 1, msgId: '103', groupId: '90', repeatCount: 3, repeatEnd: true });
  gift(second, { giftType: 0, common: { msgId: '7000000000000000001' } });
  await wait(200);
  const commands = (await readFile(log, 'utf8')).trim().split('\n').map(row => JSON.parse(row));
  assert.equal(commands.length, 2);
  for (const command of commands) assert.match(command, /^GiveItemToPlayer 1 .* 5 0 0$/);
  assert.equal((await forward()).status, 409);

  assert.equal((await post('custom-rules-mode', { mode: 'off' })).status, 200);
  assert.equal((await arm()).status, 200);
  assert.equal((await testAction('https://unrelated.example')).status, 403);
  const attempts = await Promise.all([testAction(), testAction()]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 400]);
  await until(async () => (await state()).giftTest.state === 'sent');
  const afterTest = (await readFile(log, 'utf8')).trim().split('\n').map(row => JSON.parse(row));
  assert.deepEqual(afterTest, [...commands, commands[0]]);
  assert.equal((await state()).customRules.mode, 'off');
  await stopEngine();

  occupiedPort = createServer().listen(8832, '127.0.0.1');
  await once(occupiedPort, 'listening');
  start('tikfinity');
  await until(async () => (await state()).giftTest.message.includes('Port 8832 is in use'));
  const unavailable = await arm();
  assert.equal(unavailable.status, 400);
  assert.match((await unavailable.json()).error, /Port 8832 is in use/);
  await stopEngine();
  await new Promise(resolve => occupiedPort.close(resolve));

  start();
  await until(async () => (await state()).giftSource === 'streamerbot');
  assert.equal((await forward()).status, 200);
});
