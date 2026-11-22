// This first rollout deliberately supports only the classes proven in the v0.3 mod.
export const LIVE_CREATURES = Object.freeze(['Dodo', 'Raptor', 'Rex']);
export function buildIcePackSpawnCommand(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw Error('Invalid spawn request');
  const { creature, level, playerId } = request;
  if (typeof creature !== 'string' || !LIVE_CREATURES.includes(creature)) throw Error('Creature not supported by deployed mod');
  const lvl = Number(level);
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > 150) throw Error('Level must be an integer from 1 to 150');
  const id = String(playerId ?? '').trim();
  if (!/^\d{1,10}$/.test(id) || Number(id) <= 0 || Number(id) > 4294967295) throw Error('Enter a valid numeric Specimen Implant ID');
  return `ScriptCommand IcePackSpawn,${creature},${lvl},${id}`;
}
