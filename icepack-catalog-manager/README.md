# Ice Pack Companion Catalog Manager

## Verify paths in an existing catalog

The checked Blueprint paths in Batch 04 are verified against Wikily. Batches 05 and 06 are verified against the Beacon Ark Official snapshot. **Verified** records a trusted catalog reference. In-game delivery is a separate test of the server and gift integration. [Wikily ASA references](https://wikily.gg/ark-survival-ascended) · [Beacon Ark Official index](https://usebeacon.app/Games/ArkSA/Mods/2399830)

If you already imported one or more of these batches, choose **Export catalog JSON** in Kit Editor. From the `ice-pack-ark` development checkout, run the following in PowerShell.

```powershell
git switch development
if ($LASTEXITCODE -ne 0) { throw 'Could not switch to development.' }
git pull --ff-only origin development
if ($LASTEXITCODE -ne 0) { throw 'Could not update development.' }

$current = (Read-Host 'Full path to the catalog JSON you just exported').Trim().Trim('"')
$batches = '.\icepack-catalog-manager\catalog-imports'
$verified = Join-Path (Split-Path -LiteralPath $current) ('icepack-verified-catalog-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
node .\icepack-catalog-manager\stage-free-catalog.mjs `
    --catalog "$current" `
    --batch "$batches\free-catalog-batch-04.json" `
    --batch "$batches\official-catalog-batch-05.json" `
    --batch "$batches\official-catalog-batch-06.json" `
    --verify-only --include-paid --out "$verified"
if ($LASTEXITCODE -ne 0) { throw 'Catalog verification failed.' }
Write-Host "Import this file in Kit Editor: $verified"
```

The command reports how many existing entries now have verified paths. Choose the new file under **Import catalog JSON**, select **Validate & Import Catalog**, then use **Verified paths only** to check the result. `--verify-only` updates the flag on matching Blueprint paths within the same pack. A regular merge marks new entries and any paths added with `--fill-blueprints` using the batch's verification flags.

## Import the reviewed ASA catalog additions

Batch 06 adds 2 creature and 277 item and resource records to Batch 05. The combined catalog has 537 creatures and 1,954 items on the standard Batch 05 baseline. It shows 381 creatures and 1,414 items with only Base Game + Free Expansions enabled.

- **Base Game + Free Expansions** includes Maeguana and its eggs and saddle, the Egg Incubator, Ammo Box, Tek Crop Plot, Sarcosuchus Skin, and additional cosmetics. Maeguana debuted on the paid Astraeos map and the creature can be used without a separate DLC entitlement. The `Astraeos debut` tag records its origin. Seasonal cosmetic availability depends on the applicable event or server. [Astraeos launch](https://survivetheark.com/index.php?/forums/topic/771425-astraeos-and-love-ascended-are-live/) · [Creature entitlement notes](https://ark.wiki.gg/wiki/Cryolophosaurus) · [ASA patch notes](https://survivetheark.com/index.php?/forums/topic/708761-asa-pc-patch-notes-client-v989-updated-11192026/) · [Tek Crop Plot](https://ark.wiki.gg/wiki/Tek_Crop_Plot) · [Scorched Earth](https://ark.wiki.gg/wiki/Scorched_Earth) · [Eggcellent Adventure](https://survivetheark.com/index.php?/forums/topic/773766-community-crunch-500-springing-into-eggcellent-adventures/) · [Fear Ascended](https://survivetheark.com/index.php?/forums/topic/774298-community-crunch-529-ghouls-just-wanna-have-fun/) · [Winter Wonderland](https://survivetheark.com/index.php?/forums/topic/773455-community-crunch-489-naughty-nice-or-eaten-raptor-claus-returns/) · [Love Ascended](https://survivetheark.com/index.php?/forums/topic/773648-community-crunch-493-its-mate-boosting-season/)
- **Lost Colony** identifies where Desmodus, its saddle, and Sanguine Elixir debuted in Ascended. The label is the release origin. Desmodus is also available on Astraeos. **Fantastic Tames** includes the Pyromane's Flaming Fur. [Lost Colony launch](https://survivetheark.com/index.php?/forums/topic/773450-ark-lost-colony-is-now-live/) · [Desmodus availability](https://usebeacon.app/Games/ArkSA/Mods/2399830/Desmodus_Character_BP_C) · [Flaming Fur](https://wikily.gg/ark-survival-ascended/items/flaming-fur)
- **ARK Animated Series 109-Costumes Pack** is a separate paid pack with 108 Blueprint records in this snapshot. The free Dear Jane event versions are searchable under Base Game + Free Expansions with their `Dear Jane event` tag. [Paid pack listing](https://store.steampowered.com/app/3571730/) · [Dear Jane event](https://survivetheark.com/index.php?/forums/topic/726881-ark-the-animated-series-is-live/)

The review set aside the Brigantine and Sloop vehicle actors because their usable ship items are already in Batch 05. Dinopithecus awaits the Lost Island Ascended release. Of the 123 item rows left out, 87 are decorative bone attachment assets and 36 need player-availability checks. Both batches use the Beacon snapshot fingerprint listed below. Generate Batch 06 from that archive with `--batch 6`. [Tides of Fortune launch](https://survivetheark.com/index.php?/forums/topic/773981-ark-tides-of-fortune-dragontopia-and-genesis-part-1-are-out-now/) · [Lost Island roadmap](https://ark.fusey.gg/ark-survival-ascended/news/roadmap) · [Bone attachment notes](https://hypernatrema.com/ark/items)

### Merge Batch 06 on Windows

Open your current Kit Editor and select **Export catalog JSON**. Open a second PowerShell window in your `ice-pack-ark` Git checkout and run:

```powershell
git switch development
if ($LASTEXITCODE -ne 0) { throw 'Could not switch to development.' }
git pull --ff-only origin development
if ($LASTEXITCODE -ne 0) { throw 'Could not update development.' }

$current = (Read-Host 'Full path to the catalog JSON you just exported').Trim().Trim('"')
$batch = '.\icepack-catalog-manager\catalog-imports\official-catalog-batch-06.json'
$merged = Join-Path (Split-Path -LiteralPath $current) ('icepack-batch-06-merged-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --include-paid --out "$merged"
if ($LASTEXITCODE -ne 0) { throw 'Catalog staging failed.' }
Write-Host "Import this file in Kit Editor: $merged"
```

Expect **2 dinosaurs added**, **277 items added**, and a `PASS Merged catalog saved` message on the standard Batch 05 baseline. Choose the printed file under **Import catalog JSON**, then click **Validate & Import Catalog**. Search for **Maeguana**, **Egg Incubator**, and **Sarcosuchus Skin**. Enable **Lost Colony** to check Desmodus and enable **ARK Animated Series 109-Costumes Pack** to check the paid Achatina costume. Search for `Dear Jane` to see the separate event versions. Open a familiar saved Kit and Gift Rule.

### Check sample Blueprint paths in ARK

For an optional server check, use ARK: Survival Ascended single-player or a throwaway test world with admin access and enable **Console Access** in settings. Run one command at a time and check the result in the world or your inventory. Record each result with the game build and map. [ARK console commands](https://ark.wiki.gg/wiki/Console_commands)

```text
cheat SpawnDino "Blueprint'/Game/ASA/Dinos/Maelizard/Maelizard_Character_BP.Maelizard_Character_BP'" 500 0 0 25
cheat GiveItem "Blueprint'/Game/PrimalEarth/CoreBlueprints/Resources/PrimalItemResource_ApexDrop_Sarco.PrimalItemResource_ApexDrop_Sarco'" 1 0 0
cheat GiveItem "Blueprint'/Game/Genesis2/Structures/EggIncubator/PrimalItemStructure_EggIncubator.PrimalItemStructure_EggIncubator'" 1 0 0
```

Expect a **wild level 25 Maeguana** ahead of you, **one Sarcosuchus Skin** in your inventory, and **one Egg Incubator** in your inventory. If you have access to a Lost Colony test world, you can also check the Desmodus path there.

```text
cheat SpawnDino "Blueprint'/Game/Fjordur/Dinos/Desmodus/Desmodus_Character_BP.Desmodus_Character_BP'" 500 0 0 25
```

## Import the expanded ASA catalog

Batch 05 contains 531 creature Blueprint records and 1,677 item and resource records. It includes 376 free creature records, 1,248 free item records, and 151 resources within those free items. The paid records carry their specific pack names and stay hidden until you enable the pack in Kit Editor. Creature counts include released variants. Live paid DLC delivery requires a separate engine update. [Beacon Ark Official index](https://usebeacon.app/Games/ArkSA/Mods/2399830) · [Studio Wildcard release notes](https://survivetheark.com/index.php?/forums/topic/708761-asa-pc-patch-notes-client-v989-updated-11192026/)

### Update a standalone Kit Editor

Run the four program files from the same checkout. Mixing a new `kit-dashboard.mjs` with an older `kit-store.mjs` causes the `loadPrefs` startup error. This also applies if the working folder is named `icepack-kit-editor`.

Stop Kit Editor with Ctrl+C. From the root of your `ice-pack-ark` development checkout, run the following. Use the working editor folder that holds your saved Kits. Keep the program backup path in case you need to restore those files.

```powershell
$source = (Resolve-Path -LiteralPath '.\icepack-catalog-manager' -ErrorAction Stop).Path
$editor = (Read-Host 'Full path to your working Kit Editor folder').Trim().Trim('"')
$editor = (Resolve-Path -LiteralPath $editor -ErrorAction Stop).Path
$programFiles = 'config-engine.mjs', 'kit-store.mjs', 'kit-dashboard.mjs', 'public/index.html'

if ($source -ne $editor) {
    foreach ($file in $programFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf) -or
            -not (Test-Path -LiteralPath (Join-Path $editor $file) -PathType Leaf)) {
            throw "Missing program file $file. Check the source and Kit Editor folders."
        }
    }

    $catalog = Join-Path $editor 'ark-catalog-v2.json'
    $starter = Join-Path $editor 'ark-catalog-starter.json'
    if (-not (Test-Path -LiteralPath $catalog -PathType Leaf) -and
        -not (Test-Path -LiteralPath $starter -PathType Leaf)) {
        throw "No existing catalog was found in $editor. Check the working Kit Editor folder."
    }

    $backup = Join-Path $editor ('program-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    New-Item -ItemType Directory -Path (Join-Path $backup 'public') -ErrorAction Stop | Out-Null
    foreach ($file in $programFiles) {
        Copy-Item -LiteralPath (Join-Path $editor $file) -Destination (Join-Path $backup $file) -ErrorAction Stop
    }
    Write-Host "Program backup: $backup"

    if (-not (Test-Path -LiteralPath $catalog)) {
        Copy-Item -LiteralPath $starter -Destination $catalog -ErrorAction Stop
    }
    foreach ($file in $programFiles) {
        Copy-Item -LiteralPath (Join-Path $source $file) -Destination (Join-Path $editor $file) -ErrorAction Stop
    }
}

node (Join-Path $editor 'kit-dashboard.mjs')
```

The original editor used `ark-catalog-starter.json`. When that is the only catalog present, the update copies it to the filename the new editor expects. The new editor exports catalog data in schema v2. Existing catalog and configuration files are preserved.

Open the address printed by Node, usually `http://127.0.0.1:3211`. Refresh with Ctrl+F5 and confirm your saved Kits are visible.

### Merge and import the batch

Select **Export catalog JSON** in Kit Editor. In another PowerShell window at the root of your `ice-pack-ark` development checkout, run the commands below.

```powershell
git switch development
git pull --ff-only origin development
$current = (Read-Host 'Full path to the catalog JSON you just exported').Trim().Trim('"')
$batch = '.\icepack-catalog-manager\catalog-imports\official-catalog-batch-05.json'
$merged = Join-Path $env:USERPROFILE ('Downloads\icepack-merged-catalog-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints --include-paid
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints --include-paid --out "$merged"
```

Choose the merged file under **Import catalog JSON** in Kit Editor. Select **Validate & Import Catalog**. The combined file uses the editor's 4 MB import limit. On the original Batch 04 catalog, this yields 535 creature and 1,677 item records, including earlier entries retained for saved Kits and rules. Search for **Palaeoctopus**, **Metal Pick**, and **Cementing Paste**. Then enable **Fantastic Tames** and confirm **Enigmasaur** appears under that pack. Use **Next page** to browse beyond the first 250 matches. Omit `--include-paid` for a free-only addition.

Batch 05 uses names and Blueprint paths from Beacon's November 2026 Ark Official download. The [batch generator](catalog-imports/build-official-catalog.py) uses confirmed pack families and release-specific exceptions. Palaeoctopus is a free Genesis creature despite its asset folder. Fantastic Tames includes Enigmasaur even where it appears on a free map. Batch 05 set aside five creature records and 400 item records for the Batch 06 review. The generator also sets aside internal, temporary, or unavailable records. [Beacon snapshot API](https://api.usebeacon.app/v4/deltas/7) · [Free Palaeoctopus release](https://survivetheark.com/index.php?/forums/topic/773904-community-crunch-509-a-kraken-good-time/) · [Fantastic Tames Season 1](https://survivetheark.com/index.php?/forums/topic/774248-therizino-tlc-cerberax-and-gargantar-are-out-now/) · [Astraeos update](https://survivetheark.com/index.php?/forums/topic/774170-astraeos-heaven-abyss-update-is-now-live/)

The input snapshot fingerprint is `dfed97f2ac7988fb55e80367c83d01aa19de11d88d6d7571b13c9a97149ebc81`.

## Add free-expansion creatures and items

Batch 04 adds six creatures from Ragnarok and Valguero, ten common resources, and two crafting stations. Each entry includes a Blueprint path and its ASA reference page from Wikily. The original Batch 03 catalog grows to 129 creatures and 16 items. Your totals include any entries you already added. [Ragnarok Ascended release](https://survivetheark.com/index.php?/forums/topic/772489-ragnarok-ascended-and-lost-colony-expansion-pass-are-now-live/) · [Valguero Ascended release](https://survivetheark.com/index.php?/forums/topic/772919-valguero-ascended-and-fantastic-tames-elderclaw-are-now-live/) · [Wikily ASA references](https://wikily.gg/ark-survival-ascended)

In your running Kit Editor, select **Export catalog JSON**. From an `ice-pack-ark` development checkout, run:

```powershell
$current = (Read-Host 'Full path to the catalog JSON you just exported').Trim().Trim('"')
$batch = '.\icepack-catalog-manager\catalog-imports\free-catalog-batch-04.json'
$merged = Join-Path $env:USERPROFILE ('Downloads\icepack-merged-catalog-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints --out "$merged"
```

The first command reports additions, matches, and filled paths. The second writes a new catalog. Use a fresh export so the merged copy includes your latest edits. The optional `--fill-blueprints` flag fills a blank path when the existing unverified entry matches the reviewed free entry by ID, name, and pack. Filled paths take their verification flag from the batch. If you imported the first Batch 04, expect up to six creature paths and twelve item paths filled, with your catalog totals staying the same.

In Kit Editor, choose the merged file under **Import catalog JSON**, then select **Validate & Import Catalog**. Save the original export as your backup. The editor validates saved Kits and Gift Rules against the merged file. Search for **Megaraptor** and **Flint**, check their Blueprint path fields, and open a familiar Kit. The updated editor accepts catalog files up to 4 MB.

### Classify paid DLC

Treat a creature as paid when it requires Tides of Fortune, Dragontopia, Lost Colony, Astraeos, Bob's Tall Tales, or Fantastic Tames. Check the requirement per creature, including creatures that spawn on free maps. Apply the same check to items and resources. [Studio Wildcard release notes](https://survivetheark.com/index.php?/forums/topic/773981-ark-tides-of-fortune-dragontopia-and-genesis-part-1-are-out-now/) · [Fantastic Tames announcement](https://survivetheark.com/index.php?/forums/topic/735257-ark-fantastic-tames-and-the-center-ascended-are-live/)

When reviewing a batch, use `requiredPaidDlc` on the source entry to record any known paid requirements. It accepts pack names or IDs, for example `["lost-colony"]`. The free staging command excludes entries with a paid requirement even when their source labels them `base-game`. Review unknown entitlements before labeling an entry free.

## Earlier taxonomy update

This is a **patch** for the existing `icepack-catalog-manager` folder. **Do not replace** `ark-catalog-v2.json`, `streamer-config-v2.json`, or `content-prefs.json` from your working installation.

1. Stop the editor with Ctrl+C.
2. Back up your current editor folder and export your catalog.
3. Extract `config-engine.mjs` and `public/index.html` into your existing `icepack-catalog-manager` folder, overwriting these two files only.
4. Restart: `node .\kit-dashboard.mjs` then Ctrl+F5 in browser.
5. Try the Category and Role/Subcategory filters, and verify saved Kits still appear.
6. Export catalog; import `icepack-base-game-creatures-batch-02-categorized.json` with Choose File. **The import replaces the complete catalog**, so do not use unmodified if you've added custom entries; merge first.

Categories are **Dinosaur**: Herbivores, Carnivores, Other / Omnivores; **Item**: Resources, Consumables, Armor, Weapons & Tools, Saddles, Structures, Other. Subcategories are multiple freeform tags. Old catalogs without tags get an empty list, and old known creatures are assigned best-effort diet categories. Categories and tags describe entries for catalog browsing.

`ark-catalog-v2.json` in this patch repository is a **test fixture only**, not intended for copying onto the installation.
