import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateArkCatalog, validateConfiguration } from './config-engine.mjs';
import { mergeFreeCatalog } from './stage-free-catalog.mjs';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('./stage-free-catalog.mjs', import.meta.url));
const load = url => readFile(new URL(url, import.meta.url), 'utf8').then(JSON.parse);
const current = await load('./ark-catalog-v2.json');
const batch = await load('./catalog-imports/free-catalog-batch-04.json');

test('adds the free catalogue batch and preserves existing entries, packs, Kits and gift rules', async () => {
  const { catalog, counts } = mergeFreeCatalog(current, batch);
  assert.equal(counts.dinosaurs.added, 6);
  assert.equal(counts.items.added, 12);
  const before = validateArkCatalog(current);
  assert.deepEqual(catalog.packs, before.packs);
  for (const kind of ['dinosaurs', 'items']) {
    assert.deepEqual(catalog[kind].slice(0, before[kind].length), before[kind]);
    for (const entry of catalog[kind].slice(before[kind].length)) {
      assert.match(entry.blueprint, /^\/Game\/[^'\s]+\.[^'\s]+$/);
      assert.match(entry.source, /^https:\/\/wikily\.gg\/ark-survival-ascended\//);
      assert.equal(entry.verified, false);
    }
  }
  const config = await load('./streamer-config-v2.json');
  assert.deepEqual(validateConfiguration(config, catalog), validateConfiguration(config, before));
  const repeat = mergeFreeCatalog(catalog, batch);
  assert.deepEqual(repeat.catalog, catalog);
  assert.equal(repeat.counts.dinosaurs.existing, 6);
  assert.equal(repeat.counts.items.existing, 12);
});

test('does not overwrite a custom entry or duplicate its Blueprint under a new ID', () => {
  const custom = structuredClone(current);
  const entry = {
    id: 'MyStone', name: 'Custom Stone', category: 'Resources',
    blueprint: '/Game/Test/CustomStone.CustomStone_C', tags: ['Custom'],
  };
  custom.items.push(entry);
  const mixed = {
    schemaVersion: 2,
    packs: custom.packs,
    dinosaurs: [{ id: 'PaidTest', name: 'Paid Test', contentPack: 'fantastic-tames' }],
    items: [
      { id: 'mystone', name: 'Name from batch' },
      { id: 'AliasOfMyStone', name: 'Alias', blueprint: '/Game/Test/CustomStone.CustomStone' },
      { id: 'ModTest', name: 'Mod Test', contentPack: 'modded' },
    ],
  };
  const { catalog, counts } = mergeFreeCatalog(custom, mixed);
  assert.deepEqual(catalog, validateArkCatalog(custom));
  assert.deepEqual(counts, {
    dinosaurs: { added: 0, existing: 0, excluded: 1, filledBlueprints: 0 },
    items: { added: 0, existing: 2, excluded: 1, filledBlueprints: 0 },
  });
});

function catalogWithBlankPaths() {
  const originalBatch = structuredClone(batch);
  for (const entry of [...originalBatch.dinosaurs, ...originalBatch.items]) {
    entry.blueprint = null;
    entry.source = 'Earlier Batch 04';
  }
  return mergeFreeCatalog(current, originalBatch).catalog;
}

test('fills existing Batch 04 paths only when requested and retains the original metadata', () => {
  const older = catalogWithBlankPaths();
  const flint = older.items.find(entry => entry.id === 'Flint');
  flint.tags = ['Local edit'];
  flint.enabled = false;
  assert.deepEqual(mergeFreeCatalog(older, batch).catalog, older);

  const { catalog, counts } = mergeFreeCatalog(older, batch, { fillBlueprints: true });
  assert.equal(counts.dinosaurs.filledBlueprints, 6);
  assert.equal(counts.items.filledBlueprints, 12);
  assert.equal(counts.items.added, 0);
  const expected = { ...flint, blueprint: batch.items.find(entry => entry.id === 'Flint').blueprint };
  assert.deepEqual(catalog.items.find(entry => entry.id === 'Flint'), expected);
  assert.equal(flint.blueprint, null);
  assert.deepEqual(mergeFreeCatalog(catalog, batch, { fillBlueprints: true }).catalog, catalog);
});

test('preserves existing, verified, renamed, and paid entries and skips duplicate paths during fill', () => {
  const older = catalogWithBlankPaths();
  const find = id => older.items.find(entry => entry.id === id);
  find('Metal').blueprint = '/Game/Custom/Metal.Metal';
  find('Crystal').verified = true;
  find('Hide').name = 'Custom Hide';
  find('Chitin').contentPack = 'fantastic-tames';
  older.items.push({
    ...find('Keratin'), id: 'CustomKeratin', name: 'Custom Keratin',
    blueprint: batch.items.find(entry => entry.id === 'Keratin').blueprint + '_C',
  });
  const before = validateArkCatalog(older);
  const { catalog, counts } = mergeFreeCatalog(before, batch, { fillBlueprints: true });
  assert.equal(counts.items.filledBlueprints, 7);
  for (const id of ['Metal', 'Crystal', 'Hide', 'Chitin', 'Keratin']) {
    assert.deepEqual(catalog.items.find(entry => entry.id === id), before.items.find(entry => entry.id === id));
  }
});

test('requires a v2 source and rejects a premium label on base-game', () => {
  assert.throws(() => mergeFreeCatalog(current, { ...batch, schemaVersion: 1 }), /schemaVersion 2/);
  const premium = structuredClone(current);
  premium.packs.find(pack => pack.id === 'base-game').premium = true;
  assert.throws(() => mergeFreeCatalog(current, premium), /base-game pack must be marked non-premium/);
});

test('CLI previews without writing, saves a new file, and refuses overwrites', async t => {
  const root = await mkdtemp(join(tmpdir(), 'icepack-free-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseline = join(root, 'my catalog.json');
  const incoming = join(root, 'batch.json');
  const output = join(root, 'merged.json');
  const original = '\uFEFF' + JSON.stringify(current);
  await writeFile(baseline, original);
  await writeFile(incoming, JSON.stringify(batch));
  const run = (...args) => exec(process.execPath, [script, '--catalog', baseline, '--batch', incoming, ...args]);
  assert.match((await run()).stdout, /Preview complete/);
  assert.deepEqual((await readdir(root)).sort(), ['batch.json', 'my catalog.json']);
  assert.match((await run('--out', output)).stdout, /PASS Merged catalog saved/);
  assert.equal(await readFile(baseline, 'utf8'), original);
  const saved = await readFile(output, 'utf8');
  assert.deepEqual(JSON.parse(saved), mergeFreeCatalog(current, batch).catalog);
  await assert.rejects(run('--out', output), { stderr: /EEXIST/ });
  await assert.rejects(run('--out', baseline), { stderr: /EEXIST/ });
  assert.equal(await readFile(output, 'utf8'), saved);
  assert.equal(await readFile(baseline, 'utf8'), original);
  await writeFile(baseline, JSON.stringify(catalogWithBlankPaths()));
  assert.match((await run('--fill-blueprints')).stdout, /items: 12 blank Blueprint paths filled/);
});
