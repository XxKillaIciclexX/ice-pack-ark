# Ice Pack Companion Catalog Manager

## Import the expanded ASA catalog

Batch 05 contains 531 creature Blueprint records and 1,677 item and resource records. It includes 376 free creature records, 1,248 free item records, and 151 resources within those free items. The paid records carry their specific pack names and stay hidden until you enable the pack in Kit Editor. Creature counts include released variants. Live paid DLC delivery requires a separate engine update. [Beacon Ark Official index](https://usebeacon.app/Games/ArkSA/Mods/2399830) · [Studio Wildcard release notes](https://survivetheark.com/index.php?/forums/topic/708761-asa-pc-patch-notes-client-v989-updated-11192026/)

Export your current catalog from Kit Editor. In an updated `ice-pack-ark` development checkout, run:

```powershell
git switch development
git pull --ff-only origin development
$current = (Read-Host 'Full path to the catalog JSON you just exported').Trim().Trim('"')
$batch = '.\icepack-catalog-manager\catalog-imports\official-catalog-batch-05.json'
$merged = Join-Path $env:USERPROFILE ('Downloads\icepack-merged-catalog-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints --include-paid
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints --include-paid --out "$merged"
```

If Kit Editor runs from a separate folder, stop it with Ctrl+C and update its program files from the same checkout. Keep your working data files in that folder.

```powershell
$editor = (Read-Host 'Full path to the folder where you run kit-dashboard.mjs').Trim().Trim('"')
Copy-Item -LiteralPath '.\icepack-catalog-manager\kit-dashboard.mjs' -Destination (Join-Path $editor 'kit-dashboard.mjs')
Copy-Item -LiteralPath '.\icepack-catalog-manager\public\index.html' -Destination (Join-Path $editor 'public\index.html')
node (Join-Path $editor 'kit-dashboard.mjs')
```

Open [Kit Editor](http://127.0.0.1:3211), refresh with Ctrl+F5, and choose the merged file under **Import catalog JSON**. Select **Validate & Import Catalog**. The combined file uses the editor's 4 MB import limit. On the original Batch 04 catalog, this yields 535 creature and 1,677 item records, including earlier entries retained for saved Kits and rules. Search for **Palaeoctopus**, **Metal Pick**, and **Cementing Paste**. Then enable **Fantastic Tames** and confirm **Enigmasaur** appears under that pack. Use **Next page** to browse beyond the first 250 matches. Omit `--include-paid` for a free-only addition.

Batch 05 uses names and Blueprint paths from Beacon's November 2026 Ark Official download. The [batch generator](catalog-imports/build-official-catalog.py) uses confirmed pack families and release-specific exceptions. Palaeoctopus is a free Genesis creature despite its asset folder. Fantastic Tames includes Enigmasaur even where it appears on a free map. Five creature records and 400 item records still need classification or review. The generator also sets aside internal, temporary, or unavailable records. The new Blueprint entries are marked **Unverified** pending in-game testing. [Beacon snapshot API](https://api.usebeacon.app/v4/deltas/7) · [Free Palaeoctopus release](https://survivetheark.com/index.php?/forums/topic/773904-community-crunch-509-a-kraken-good-time/) · [Fantastic Tames Season 1](https://survivetheark.com/index.php?/forums/topic/774248-therizino-tlc-cerberax-and-gargantar-are-out-now/) · [Astraeos update](https://survivetheark.com/index.php?/forums/topic/774170-astraeos-heaven-abyss-update-is-now-live/)

The input snapshot fingerprint is `dfed97f2ac7988fb55e80367c83d01aa19de11d88d6d7571b13c9a97149ebc81`.

## Add free-expansion creatures and items

Batch 04 adds six creatures from Ragnarok and Valguero, ten common resources, and two crafting stations. Each entry includes a Blueprint path and its ASA reference page from Wikily. Entries are marked **Unverified** pending in-game testing. The original Batch 03 catalog grows to 129 creatures and 16 items. Your totals include any entries you already added. [Ragnarok Ascended release](https://survivetheark.com/index.php?/forums/topic/772489-ragnarok-ascended-and-lost-colony-expansion-pass-are-now-live/) · [Valguero Ascended release](https://survivetheark.com/index.php?/forums/topic/772919-valguero-ascended-and-fantastic-tames-elderclaw-are-now-live/) · [Wikily ASA references](https://wikily.gg/ark-survival-ascended)

In your running Kit Editor, select **Export catalog JSON**. From an `ice-pack-ark` development checkout, run:

```powershell
$current = (Read-Host 'Full path to the catalog JSON you just exported').Trim().Trim('"')
$batch = '.\icepack-catalog-manager\catalog-imports\free-catalog-batch-04.json'
$merged = Join-Path $env:USERPROFILE ('Downloads\icepack-merged-catalog-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints
node .\icepack-catalog-manager\stage-free-catalog.mjs --catalog "$current" --batch "$batch" --fill-blueprints --out "$merged"
```

The first command reports additions, matches, and filled paths. The second writes a new catalog. Use a fresh export so the merged copy includes your latest edits. The optional `--fill-blueprints` flag fills a blank path when the existing unverified entry matches the reviewed free entry by ID, name, and pack. Existing paths and other entry fields are preserved. If you imported the first Batch 04, expect up to six creature paths and twelve item paths filled, with your catalog totals staying the same.

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

Categories are **Dinosaur**: Herbivores, Carnivores, Other / Omnivores; **Item**: Resources, Consumables, Armor, Weapons & Tools, Saddles, Structures, Other. Subcategories are multiple freeform tags. Old catalogs without tags get an empty list, and old known creatures are assigned best-effort diet categories. Categories/tags are metadata; they do not affect spawning. All asset paths are still unverified and no commands are issued.

`ark-catalog-v2.json` in this patch repository is a **test fixture only**, not intended for copying onto the installation.
