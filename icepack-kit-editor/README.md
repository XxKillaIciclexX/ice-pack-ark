# Ice Pack Companion — Persistent Kit Editor (Local Prototype)

This is a **separate** Node.js web dashboard. It **never connects to TikTok, Streamer.bot, RCON, Nitrado, or ARK**. Existing `server.mjs`, `engine.mjs`, `rules-v06.json`, and the current stream remain untouched.

## Install (Windows PowerShell)
1. Extract the `icepack-kit-editor` folder into `C:\IcePackARK\ice-pack-ark\` next to `server.mjs`, not over the existing files.
2. Open a **new** PowerShell window:
   ```powershell
   cd C:\IcePackARK\ice-pack-ark\icepack-kit-editor
   node --test .\config-engine.test.mjs .\kit-store.test.mjs
   ```
3. **Optional, recommended before first save:** import your existing five rules into the new separate config file:
   ```powershell
   node .\migrate-once.mjs ..\rules-v06.json
   ```
   This reads the old file and creates `streamer-config-v2.json`. It **refuses to overwrite an existing v2 config**. It does NOT change your live rules.
4. Start the editor:
   ```powershell
   node .\kit-dashboard.mjs
   ```
5. Visit **http://localhost:3211** in the browser. Create, edit, duplicate, and delete Kits. Use **Ctrl+C** to stop the editor.

**Important:** If you already saved Kits before migrating, do not run migration. Migration intentionally refuses to replace existing v2 data.

## Data and constraints
- Saved Kits live in `streamer-config-v2.json` inside the editor folder. Make backups of this file as it grows.
- Kits can combine resources/items and dinosaurs; dinosaur fields are Creature, Level 1–150, Wild/Tamed, Quantity 1–20, and Announcement.
- Kits cannot be nested. A Kit used by an existing rule cannot be deleted until unassigned.
- Full game catalog, item qualities, effects, regional TikTok gifts, rule-editing UI, and mod integration are **not implemented yet**.
- `ark-catalog-starter.json` is only the limited **5-creature/4-item starter list** from the existing Node engine. Blueprint references are intentionally not populated. `Tamed` is a configuration request, **not a working server-side tame spawn** yet.
- A built-in gift-rule preview can show migrated rules, but this version does not yet let you assign gifts to Kits in the dashboard.
- This editor is bound to localhost and includes basic local origin checks. It is **not** intended for LAN/internet exposure or untrusted browsers.
