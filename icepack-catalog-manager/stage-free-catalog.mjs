import { lstat, open, readFile, unlink } from 'node:fs/promises';
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

export function mergeFreeCatalog(current, batch, { fillBlueprints = false } = {}) {
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
  const counts = {};
  for (const kind of ['dinosaurs', 'items']) {
    const currentById = new Map(catalog[kind].map(entry => [entry.id, entry]));
    const ids = new Set([...currentById.keys()].map(id => id.toLowerCase()));
    const paths = new Set(catalog[kind].map(entry => pathKey(entry.blueprint)).filter(Boolean));
    const result = { added: 0, existing: 0, excluded: 0, filledBlueprints: 0 };
    for (const [index, entry] of incoming[kind].entries()) {
      const { requiredPaidDlc = [] } = batch[kind][index];
      if (!Array.isArray(requiredPaidDlc) || requiredPaidDlc.some(pack => typeof pack !== 'string' || !pack.trim())) {
        throw new Error(`requiredPaidDlc must be an array of pack names or IDs for ${entry.id}.`);
      }
      if (entry.contentPack !== 'base-game' || requiredPaidDlc.length > 0) {
        result.excluded++;
        continue;
      }
      const id = entry.id.toLowerCase();
      const blueprint = pathKey(entry.blueprint);
      const existing = currentById.get(entry.id);
      if (fillBlueprints && blueprint && !paths.has(blueprint) &&
          existing?.contentPack === 'base-game' && existing.name === entry.name &&
          !existing.blueprint && !existing.verified) {
        existing.blueprint = entry.blueprint;
        paths.add(blueprint);
        result.filledBlueprints++;
        continue;
      }
      if (ids.has(id) || (blueprint && paths.has(blueprint))) {
        result.existing++;
        continue;
      }

      ids.add(id);
      if (blueprint) paths.add(blueprint);
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
    batch: { type: 'string' },
    'fill-blueprints': { type: 'boolean' },
    out: { type: 'string' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node stage-free-catalog.mjs --catalog <current.json> --batch <batch.json> [--fill-blueprints] [--out <new.json>]');
    return;
  }
  if (!values.catalog || !values.batch) throw new Error('Provide --catalog and --batch. Use --help for usage.');
  const [current, batch] = await Promise.all([readCatalog(values.catalog), readCatalog(values.batch)]);
  const { catalog, counts } = mergeFreeCatalog(current, batch, { fillBlueprints: values['fill-blueprints'] });
  for (const [kind, { added, existing, excluded, filledBlueprints }] of Object.entries(counts)) {
    console.log(`${kind}: ${added} added, ${existing} already present, ${excluded} outside Base Game + Free Expansions.`);
    if (values['fill-blueprints']) console.log(`${kind}: ${filledBlueprints} blank Blueprint paths filled.`);
  }
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
