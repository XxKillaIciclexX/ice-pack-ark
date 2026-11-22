import {migrateFile} from './kit-store.mjs';
if(process.argv.length!==3){console.error('Usage: node migrate-once.mjs ..\\rules-v06.json');process.exit(2);}
try{const migrated=migrateFile(process.argv[2]);console.log(`Migrated ${migrated.rules.length} legacy rules into new v2 configuration. Original file untouched.`);}catch(e){console.error(e.message);process.exitCode=1;}
