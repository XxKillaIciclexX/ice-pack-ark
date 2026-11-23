import { lstat, open, readFile, unlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validateArkCatalog } from './config-engine.mjs';

const maxSize = 4_000_000;

async function readCatalog(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > maxSize) {
    throw new Error('Choose a regular catalog JSON file of at most 4 MB.');
  }
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

const pathKey = value => value?.toLowerCase().replace(/_c$/, '');

export function mergeFreeCatalog(current, batch, { fillBlueprints = false, includePaid = false, verifyOnly = false } = {}) {
  if (current?.schemaVersion !== 2 || batch?.schemaVersion !== 2) {
    throw new Error('Both catalogs must use schemaVersion 2.');
  }

  const catalog = validateArkCatalog(current);
  const incoming = validateArkCatalog(batch);
  for (const source of [catalog, incoming]) {
    if (source.packs.find(pack => pack.id === 'base-game').premium) {
      throw new Error('The base-game pack must be marked non-premium.');
    }
  }
  const packById = new Map(incoming.packs.map(pack => [pack.id, pack]));
  const currentPacks = new Map(catalog.packs.map(pack => [pack.id, pack]));
  const counts = {};
  for (const kind of ['dinosaurs', 'items']) {
    const currentById = new Map(catalog[kind].map(entry => [entry.id, entry]));
    const ids = new Set([...currentById.keys()].map(id => id.toLowerCase()));
    const entriesByPath = new Map();
    for (const entry of catalog[kind]) {
      const key = pathKey(entry.blueprint);
      if (!key) continue;
      const matches = entriesByPath.get(key);
      if (matches) matches.push(entry);
      else entriesByPath.set(key, [entry]);
    }
    const result = { added: 0, existing: 0, excluded: 0, filledBlueprints: 0, verifiedBlueprints: 0 };
    for (const [index, entry] of incoming[kind].entries()) {
      const { requiredPaidDlc = [] } = batch[kind][index];
      if (!Array.isArray(requiredPaidDlc) || requiredPaidDlc.some(pack => typeof pack !== 'string' || !pack.trim())) {
        throw new Error(`requiredPaidDlc must be an array of pack names or IDs for ${entry.id}.`);
      }
      const pack = packById.get(entry.contentPack);
      const currentPack = currentPacks.get(pack.id);
      const free = pack.id === 'base-game' && requiredPaidDlc.length === 0;
      const paid = pack.premium && currentPack?.premium !== false && requiredPaidDlc.every(requirement => {
        const label = requirement.trim().toLowerCase();
        return label === pack.id || label === pack.name.toLowerCase();
      });
      if (!free && !(includePaid && paid)) {
        result.excluded++;
        continue;
      }
      const id = entry.id.toLowerCase();
      const blueprint = pathKey(entry.blueprint);
      const matches = entriesByPath.get(blueprint);
      if (entry.verified && matches) {
        for (const match of matches) {
          if (match.contentPack !== pack.id || match.verified) continue;
          match.verified = true;
          result.verifiedBlueprints++;
        }
      }
      if (verifyOnly) continue;

      const existing = currentById.get(entry.id);
      if (fillBlueprints && blueprint && !matches &&
          existing?.contentPack === pack.id && existing.name === entry.name &&
          !existing.blueprint && !existing.verified) {
        existing.blueprint = entry.blueprint;
        existing.verified = entry.verified;
        entriesByPath.set(blueprint, [existing]);
        result.filledBlueprints++;
        continue;
      }
      if (ids.has(id) || matches) {
        result.existing++;
        continue;
      }

      ids.add(id);
      if (blueprint) entriesByPath.set(blueprint, [entry]);
      if (!currentPack) {
        const addedPack = { ...pack, enabledByDefault: false };
        catalog.packs.push(addedPack);
        currentPacks.set(pack.id, addedPack);
      }
      catalog[kind].push(entry);
      result.added++;
    }
    counts[kind] = result;
  }

  return { catalog: validateArkCatalog(catalog), counts };
}

async function writeNewCatalog(file, catalog) {
  const json = JSON.stringify(catalog, null, 2) + '\n';
  if (Buffer.byteLength(json) > maxSize) throw new Error('Merged catalog exceeds the 4 MB import limit.');
  const output = await open(file, 'wx', 0o600);
  try {
    try {
      await output.writeFile(json, 'utf8');
    } finally {
      await output.close();
    }
  } catch (error) {
    await unlink(file);
    throw error;
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    catalog: { type: 'string' },
    batch: { type: 'string', multiple: true },
    'fill-blueprints': { type: 'boolean' },
    'include-paid': { type: 'boolean' },
    'verify-only': { type: 'boolean' },
    out: { type: 'string' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node stage-free-catalog.mjs --catalog <current.json> --batch <batch.json> [--batch <another.json>] [--fill-blueprints | --verify-only] [--include-paid] [--out <new.json>]');
    return;
  }
  if (!values.catalog || !values.batch) throw new Error('Provide --catalog and --batch. Use --help for usage.');
  const options = {
    fillBlueprints: values['fill-blueprints'], includePaid: values['include-paid'], verifyOnly: values['verify-only'],
  };
  if (options.fillBlueprints && options.verifyOnly) {
    throw new Error('Use either --fill-blueprints or --verify-only.');
  }
  const [current, ...batches] = await Promise.all([values.catalog, ...values.batch].map(readCatalog));
  const scope = options.includePaid ? 'outside the selected catalog scope' : 'outside Base Game + Free Expansions';
  let catalog = current;
  let verifiedPaths = 0;
  for (const [index, batch] of batches.entries()) {
    const result = mergeFreeCatalog(catalog, batch, options);
    catalog = result.catalog;
    if (!options.verifyOnly && batches.length > 1) console.log(basename(values.batch[index]));
    for (const [kind, counts] of Object.entries(result.counts)) {
      verifiedPaths += counts.verifiedBlueprints;
      if (options.verifyOnly) continue;
      console.log(`${kind}: ${counts.added} added, ${counts.existing} already present, ${counts.excluded} ${scope}.`);
      if (options.fillBlueprints) console.log(`${kind}: ${counts.filledBlueprints} blank Blueprint paths filled.`);
    }
  }
  console.log(`${verifiedPaths} existing Blueprint paths marked verified.`);
  if (!values.out) {
    console.log('Preview complete. Use --out with a new path to save the merged catalog.');
    return;
  }
  await writeNewCatalog(values.out, catalog);
  console.log('PASS Merged catalog saved to a new file. Import it from Kit Editor when ready.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`FAIL ${error.message.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')}`);
    process.exitCode = 1;
  });
}
