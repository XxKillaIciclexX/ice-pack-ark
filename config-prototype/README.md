# Ice Pack Companion — Config Foundation (dry-run prototype)

This is **not** a replacement for your running `server.mjs`, and it does **not** connect to TikFinity, RCON, or ARK. It demonstrates a backward-compatible configuration migration and a safe Kit/action preview.

## Install safely
1. Back up your current project, especially `rules-v06.json` and `.env`.
2. Copy these files into a new folder `config-prototype` inside your `ice-pack-ark` project. Do not overwrite any existing files.
3. From PowerShell in `ice-pack-ark/config-prototype`, run:
   ```powershell
   node --test .\config-engine.test.mjs
   node .\config-demo.mjs ..\rules-v06.json
   ```
4. The demonstration only reads `rules-v06.json`; it never changes it.

## What's included
- `config-engine.mjs`: validated schemas for dinosaurs, items, Kits, gift rules; `planGift` dry-run planner; migration from existing v0.6 rules.
- `ark-catalog-starter.json`: only the dinosaur/item names found in the existing engine; **not a complete ASA catalog**. Blueprint fields are placeholders, not verified paths.
- `config-demo.mjs`: migrates legacy rules **in memory** and previews a Kit with Wood and a level-50 tamed Raptor.
- `config-engine.test.mjs`: offline validation tests.

## Explicit limitations
- No data persistence for new Kits yet, no dashboard integration, no regional gift sync.
- The legacy `playerId` is intentionally not migrated into gift rules. Existing live settings remain untouched.
- `planGift` describes requested actions only; it never generates or sends ARK commands.
- Tamed dinosaurs and any additional creature/item types need corresponding server-mod support.
- Level 1–150 is the current policy inherited from the user's Blueprint; make configurable later if desired.
- Preexisting AHK/F8 console queue and the existing server must be migrated in a separate tested step.
