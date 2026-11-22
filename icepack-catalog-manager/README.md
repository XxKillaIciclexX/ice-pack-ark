# Ice Pack Companion: taxonomy update

This is a **patch** for the existing `icepack-catalog-manager` folder. **Do not replace** `ark-catalog-v2.json`, `streamer-config-v2.json`, or `content-prefs.json` from your working installation.

1. Stop the editor with Ctrl+C.
2. Back up your current editor folder and export your catalog.
3. Extract `config-engine.mjs` and `public/index.html` into your existing `icepack-catalog-manager` folder, overwriting these two files only.
4. Restart: `node .\kit-dashboard.mjs` then Ctrl+F5 in browser.
5. Try the Category and Role/Subcategory filters, and verify saved Kits still appear.
6. Export catalog; import `icepack-base-game-creatures-batch-02-categorized.json` with Choose File. **The import replaces the complete catalog**, so do not use unmodified if you've added custom entries; merge first.

Categories are **Dinosaur**: Herbivores, Carnivores, Other / Omnivores; **Item**: Resources, Consumables, Armor, Weapons & Tools, Saddles, Structures, Other. Subcategories are multiple freeform tags. Old catalogs without tags get an empty list, and old known creatures are assigned best-effort diet categories. Categories/tags are metadata; they do not affect spawning. All asset paths are still unverified and no commands are issued.

`ark-catalog-v2.json` in this patch repository is a **test fixture only**, not intended for copying onto the installation.
