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
const officialBatch = await load('./catalog-imports/official-catalog-batch-05.json');
const reviewedBatch = await load('./catalog-imports/official-catalog-batch-06.json');

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
      assert.equal(entry.verified, true);
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
    dinosaurs: { added: 0, existing: 0, excluded: 1, filledBlueprints: 0, verifiedBlueprints: 0 },
    items: { added: 0, existing: 2, excluded: 1, filledBlueprints: 0, verifiedBlueprints: 0 },
  });
});

function catalogWithBlankPaths() {
  const originalBatch = structuredClone(batch);
  for (const entry of [...originalBatch.dinosaurs, ...originalBatch.items]) {
    entry.blueprint = null;
    entry.verified = false;
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
  const expected = { ...flint, blueprint: batch.items.find(entry => entry.id === 'Flint').blueprint, verified: true };
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

test('excludes each declared paid entitlement even on a free map or with a base-game label', () => {
  const packIds = ['tides-of-fortune', 'dragontopia', 'lost-colony', 'astraeos', 'bobs-tall-tales', 'fantastic-tames'];
  const incoming = {
    schemaVersion: 2,
    dinosaurs: packIds.map((pack, index) => ({
      id: `Fixture-${index}`, name: `Fixture ${index}`, contentPack: 'base-game',
      tags: ['Ragnarok'], requiredPaidDlc: [pack],
    })),
    items: [{ id: 'FreeFixture', name: 'Free resource', requiredPaidDlc: [] }],
  };
  const { catalog, counts } = mergeFreeCatalog(current, incoming);
  assert.deepEqual(catalog.dinosaurs, validateArkCatalog(current).dinosaurs);
  assert.equal(counts.dinosaurs.excluded, 6);
  assert.equal(counts.items.added, 1);
});

test('rejects invalid requirement metadata and skips paid entries during Blueprint fill', () => {
  const older = catalogWithBlankPaths();
  const flint = batch.items.find(entry => entry.id === 'Flint');
  const incoming = { schemaVersion: 2, dinosaurs: [], items: [{ ...flint, requiredPaidDlc: ['Tides of Fortune'] }] };
  const { catalog, counts } = mergeFreeCatalog(older, incoming, { fillBlueprints: true });
  assert.equal(catalog.items.find(entry => entry.id === 'Flint').blueprint, null);
  assert.equal(counts.items.excluded, 1);
  incoming.items[0].requiredPaidDlc = null;
  assert.throws(() => mergeFreeCatalog(older, incoming), /requiredPaidDlc must be an array/);
});

test('Batch 05 retains free content and assigns official paid examples to their DLC', async () => {
  const baseline = mergeFreeCatalog(current, batch).catalog;
  const free = mergeFreeCatalog(baseline, officialBatch).catalog;
  assert.ok([...free.dinosaurs, ...free.items].every(entry => entry.contentPack === 'base-game'));
  assert.ok(free.dinosaurs.some(entry => entry.name === 'Palaeoctopus'));
  assert.ok(free.items.some(entry => entry.name === 'Cementing Paste' && entry.category === 'Resources'));
  assert.ok(free.items.some(entry => entry.name === 'Metal Pick' && entry.category === 'Weapons & Tools'));

  const full = mergeFreeCatalog(baseline, officialBatch, { includePaid: true }).catalog;
  for (const [name, pack] of [
    ['Tidepup', 'tides-of-fortune'], ['Gargantar', 'dragontopia'], ['Elderclaw', 'lost-colony'],
    ['Boaratos', 'astraeos'], ['Cosmo', 'bobs-tall-tales'], ['Enigmasaur', 'fantastic-tames'],
  ]) {
    assert.equal(full.dinosaurs.find(entry => entry.name === name)?.contentPack, pack, name);
    assert.equal(full.packs.find(entry => entry.id === pack)?.enabledByDefault, false, pack);
  }
  assert.equal(full.items.find(entry => entry.name === 'Astraeos Boss Helmet')?.contentPack, 'astraeos');
  for (const kind of ['dinosaurs', 'items']) {
    assert.ok(full[kind].slice(baseline[kind].length).every(entry => entry.verified));
  }
  const config = await load('./streamer-config-v2.json');
  assert.deepEqual(validateConfiguration(config, full), validateConfiguration(config, baseline));
  assert.deepEqual(mergeFreeCatalog(full, officialBatch, { includePaid: true }).catalog, full);
});

test('Batch 06 layers onto Batch 05 and separates Dear Jane rewards from paid costumes', async () => {
  const baseline = mergeFreeCatalog(current, batch).catalog;
  const previous = mergeFreeCatalog(baseline, officialBatch, { includePaid: true }).catalog;
  const { catalog, counts } = mergeFreeCatalog(previous, reviewedBatch, { includePaid: true });
  assert.equal(counts.dinosaurs.added, 2);
  assert.equal(counts.items.added, 277);
  for (const kind of ['dinosaurs', 'items']) {
    assert.deepEqual(catalog[kind].slice(0, previous[kind].length), previous[kind]);
    assert.ok(catalog[kind].slice(previous[kind].length).every(entry => entry.verified));
  }

  const rexCostumes = catalog.items.filter(entry => entry.name.startsWith("Rex 'ARK: The Animated Series'"));
  assert.equal(rexCostumes.length, 2);
  assert.ok(rexCostumes.some(entry => entry.contentPack === 'base-game' && entry.tags.includes('Dear Jane event')));
  assert.ok(rexCostumes.some(entry => entry.contentPack === 'animated-series'));
  assert.notEqual(rexCostumes[0].blueprint, rexCostumes[1].blueprint);
  assert.equal(catalog.packs.find(pack => pack.id === 'animated-series')?.enabledByDefault, false);

  const free = mergeFreeCatalog(previous, reviewedBatch).catalog;
  assert.equal(free.dinosaurs.find(entry => entry.name === 'Maeguana')?.contentPack, 'base-game');
  assert.equal(free.items.find(entry => entry.name === 'Sarcosuchus Skin')?.category, 'Resources');
  assert.equal(free.dinosaurs.find(entry => entry.name === 'Desmodus'), undefined);
  assert.equal(free.packs.find(pack => pack.id === 'animated-series'), undefined);

  const config = await load('./streamer-config-v2.json');
  assert.deepEqual(validateConfiguration(config, catalog), validateConfiguration(config, previous));
  assert.deepEqual(mergeFreeCatalog(catalog, reviewedBatch, { includePaid: true }).catalog, catalog);
});

test('paid import adds missing DLC definitions disabled and rejects contradictory pack markings', () => {
  const baseline = { schemaVersion: 2, dinosaurs: [], items: [] };
  const pack = { id: 'astraeos', name: 'Astraeos', premium: true, enabledByDefault: true };
  const incoming = {
    ...baseline,
    packs: [...validateArkCatalog(baseline).packs, pack],
    dinosaurs: [
      { id: 'PaidFixture', name: 'Paid Fixture', contentPack: pack.id, requiredPaidDlc: ['Astraeos'] },
      { id: 'WrongFixture', name: 'Wrong Fixture', contentPack: pack.id, requiredPaidDlc: ['lost-colony'] },
      { id: 'FreeFixture', name: 'Free Fixture', requiredPaidDlc: ['Astraeos'] },
    ],
  };
  const { catalog, counts } = mergeFreeCatalog(baseline, incoming, { includePaid: true });
  assert.equal(counts.dinosaurs.added, 1);
  assert.equal(counts.dinosaurs.excluded, 2);
  assert.deepEqual(catalog.dinosaurs.map(entry => entry.id), ['PaidFixture']);
  assert.deepEqual(catalog.packs.find(entry => entry.id === pack.id), { ...pack, enabledByDefault: false });
});

test('verify-only upgrades matching paths across batches and preserves other catalog data', async t => {
  const root = await mkdtemp(join(tmpdir(), 'icepack-verify-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const flint = batch.items.find(entry => entry.id === 'Flint');
  const obsidian = batch.items.find(entry => entry.id === 'Obsidian');
  const maeguana = reviewedBatch.dinosaurs.find(entry => entry.id === 'Maeguana');
  const desmodus = reviewedBatch.dinosaurs.find(entry => entry.id === 'Desmodus');
  const previous = validateArkCatalog({
    ...current,
    dinosaurs: [{ ...maeguana, verified: false }, { ...desmodus, verified: false }],
    items: [
      { ...flint, id: 'LocalFlint', blueprint: flint.blueprint + '_C', tags: ['Keep this'], verified: false },
      { ...obsidian, contentPack: 'lost-colony', verified: false },
      { ...batch.items.find(entry => entry.id === 'Metal'), blueprint: '/Game/Custom/Metal.Metal', verified: false },
      { ...batch.items.find(entry => entry.id === 'Crystal'), blueprint: null, verified: false },
    ],
  });
  const expected = structuredClone(previous);
  for (const entry of [...expected.dinosaurs, expected.items[0]]) entry.verified = true;
  const input = join(root, 'current.json');
  const output = join(root, 'verified.json');
  const original = JSON.stringify(previous);
  await writeFile(input, original);
  const run = (...args) => exec(process.execPath, [script, '--catalog', input,
    '--batch', fileURLToPath(new URL('./catalog-imports/free-catalog-batch-04.json', import.meta.url)),
    '--batch', fileURLToPath(new URL('./catalog-imports/official-catalog-batch-06.json', import.meta.url)),
    '--verify-only', ...args,
  ]);
  assert.match((await run()).stdout, /2 existing Blueprint paths marked verified/);
  assert.match((await run('--include-paid', '--out', output)).stdout, /3 existing Blueprint paths marked verified/);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), expected);
  assert.equal(await readFile(input, 'utf8'), original);
  assert.equal(mergeFreeCatalog(expected, reviewedBatch, { verifyOnly: true, includePaid: true }).counts.dinosaurs.verifiedBlueprints, 0);
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
