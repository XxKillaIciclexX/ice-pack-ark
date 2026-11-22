import test from 'node:test';import assert from 'node:assert/strict';
import {buildIcePackSpawnCommand} from './icepack-spawn-rcon.mjs';
test('builds mod command without cheat prefix',()=>assert.equal(buildIcePackSpawnCommand({creature:'Dodo',level:25,playerId:'537815134'}),'ScriptCommand IcePackSpawn,Dodo,25,537815134'));
test('supports three currently deployed creatures',()=>{for(const creature of ['Dodo','Raptor','Rex'])assert.match(buildIcePackSpawnCommand({creature,level:150,playerId:'1'}),/ScriptCommand IcePackSpawn/)});
test('rejects unsupported creatures',()=>assert.throws(()=>buildIcePackSpawnCommand({creature:'Giga',level:25,playerId:'1'})));
test('rejects command injection in target',()=>assert.throws(()=>buildIcePackSpawnCommand({creature:'Dodo',level:25,playerId:'1|DestroyAll'})));
test('rejects invalid level',()=>assert.throws(()=>buildIcePackSpawnCommand({creature:'Dodo',level:151,playerId:'1'})));
test('rejects invalid id',()=>assert.throws(()=>buildIcePackSpawnCommand({creature:'Dodo',level:25,playerId:''})));
