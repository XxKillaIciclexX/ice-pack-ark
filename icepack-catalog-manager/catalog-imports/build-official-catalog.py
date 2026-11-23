"""Build a reviewable Ice Pack batch from a Beacon v7 Complete.beacondata snapshot."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import tarfile

OFFICIAL_ID = "b32a3d73-9406-56f2-bd8f-936ee0275249"
SOURCE = "Beacon Ark Official v7"

# Scope applies to released map assets. Shared ASA folders require a family decision.
FREE_ROOTS = (
    "/game/primalearth/", "/game/scorchedearth/", "/game/aberration/",
    "/game/extinction/", "/game/genesis/", "/game/endgame/", "/game/valguero/",
    "/game/mods/thecenter/", "/game/mods/ragnarok/", "/game/mods/valguero/",
)
FREE_ASA = set("""
    acrocanthosaurus archelon bison cat ceratosaurus chalkgolem concavenator
    cryolophosaurus deinosuchus deinotherium dreadnoughtus fasolasuchus
    gigantoraptor helicoprion icegolem iceworm icewyvern lavagolem megaraptor
    shastasaurus xiphactinus yiling
""".split())
PAID_ROOTS = {
    "/game/packs/tidesoffortune/": "tides-of-fortune",
    "/game/water/vessels/galleon/": "tides-of-fortune",
    "/game/water/vessels/trireme/": "astraeos",
    "/game/dragontopia/": "dragontopia",
    "/game/lostcolony/": "lost-colony",
    "/game/mods/astraeos/": "astraeos",
    "/game/packs/frontier/": "bobs-tall-tales",
    "/game/packs/steampunk/": "bobs-tall-tales",
    "/game/packs/wasteland/": "bobs-tall-tales",
}
PAID_ASA = {
    "boaratos": "astraeos", "grandtortugar": "astraeos",
    "shoulderdragon": "lost-colony", "spiritbear": "lost-colony",
    "cerberus": "fantastic-tames", "chameleon": "fantastic-tames",
    "darkpegasus": "fantastic-tames", "firelion": "fantastic-tames", "jackalope": "fantastic-tames",
}
SKIP_TAGS = {"temporary", "mission", "minion", "hunt", "retrieve", "race", "sport", "event", "deprecated", "generic", "cheat"}
COSMETIC_TAGS = {"skin", "pet"}
INCIDENTAL = re.compile(r"\b(?:outpost|pirate|ghost|debug|placeholder|dummy)\b|do not spawn", re.I)
ANIMATED_SERIES = {
    "id": "animated-series", "name": "ARK Animated Series 109-Costumes Pack",
    "premium": True, "enabledByDefault": False,
}
FREE_STRUCTURES = {
    "PrimalItemStructure_AmmoContainer_C", "PrimalItemStructure_EggIncubator_C",
    "PrimalItemStructure_CropPlot_Tek_C",
}
FREE_EVENT_SKINS = {
    "PrimalItemSkin_BunnyHat_C": "Eggcellent Adventure",
    "PrimalItemSkin_DinoBunnyHat_C": "Eggcellent Adventure",
    "PrimalItemSkin_BoneHelmet_C": "Fear Ascended",
    "PrimalItemSkin_ClownMask_C": "Fear Ascended",
    "PrimalItemSkin_DinoWitchHat_C": "Fear Ascended",
    "PrimalItemSkin_VampireEyes_C": "Fear Ascended",
    "PrimalItemSkin_WerewolfHat_C": "Fear Ascended",
    "PrimalItemSkin_WitchHat_C": "Fear Ascended",
    "PrimalItemSkin_SantaHat_C": "Winter Wonderland",
    "PrimalItemSkin_TorchSparkler_C": "ARK Anniversary",
}


def path_key(path):
    return (path or "").lower().removesuffix("_c")


def name_key(label):
    return re.sub(r"[^a-z0-9]", "", label.lower())


def content_pack(row):
    path = path_key(row["path"])
    # Studio Wildcard identifies Palaeoctopus as a free Genesis addition.
    if path.startswith("/game/packs/tidesoffortune/dinos/paleoctopus/"):
        return "base-game"
    if "/skins/astraeos/" in path or row["classString"] == "PrimalItemSkin_AstraeosBossHelmet_C":
        return "astraeos"
    for prefix, pack in PAID_ROOTS.items():
        if path.startswith(prefix):
            return pack
    if path.startswith("/game/asa/dinos/"):
        family = path.split("/")[4]
        if family in FREE_ASA:
            return "base-game"
        return PAID_ASA.get(family)
    if path.startswith(FREE_ROOTS):
        tags = set(row["tags"])
        if tags & COSMETIC_TAGS or re.search(r"\b(?:costume|skin)\b", row["label"], re.I) or "/skins/" in path or "/skin/" in path:
            return None
        return "base-game"
    return None


def item_category(row):
    cls = row["classString"].lower()
    path = row["path"].lower()
    if "saddle" in cls:
        return "Saddles"
    if cls.startswith("primalitemarmor_"):
        return "Armor"
    if cls.startswith(("primalitem_weapon", "primalitemweapon", "primalitemammo")) or "/weapons/" in path:
        return "Weapons & Tools"
    if cls.startswith(("primalitemstructure", "primalitemship")) or "/structures/" in path:
        return "Structures"
    if cls.startswith("primalitemconsumable"):
        return "Consumables"
    if cls.startswith("primalitemresource") or "resource" in row["tags"]:
        return "Resources"
    return "Other"


def eligible(row):
    if row["contentPackId"] != OFFICIAL_ID or not row["availability"]:
        return False
    if set(row["tags"]) & SKIP_TAGS or INCIDENTAL.search(row["label"]):
        return False
    return bool(re.fullmatch(r"/Game/[\w/]+\.[\w]+", row["path"]))


def accepted_rows(rows):
    keep = []
    counts = Counter()
    seen = set()
    for row in rows:
        available = eligible(row)
        pack = content_pack(row) if available else None
        key = path_key(row["path"])
        if key in seen:
            counts["duplicate-path"] += 1
        elif pack:
            keep.append((row, pack))
            seen.add(key)
            counts[pack] += 1
        else:
            counts["review"] += available
            counts["internal-or-unavailable"] += not available
    return keep, counts


def reviewed_entry(row):
    path = path_key(row["path"])
    asset = row["classString"]
    if path.startswith("/game/packs/aaa/skins/"):
        return ANIMATED_SERIES["id"], ["Cosmetic"], [ANIMATED_SERIES["id"]]
    if "/armor/skin/dearjane/" in path:
        return "base-game", ["Cosmetic", "Dear Jane event"], []
    if "/chibidinos/" in path and asset.startswith("PrimalItemSkin_ChibiDino_"):
        return "base-game", ["Chibi", "Cosmetic"], []
    if path.startswith("/game/asa/dinos/maelizard/"):
        return "base-game", ["Astraeos debut"], []
    if path.startswith("/game/fjordur/dinos/desmodus/"):
        return "lost-colony", ["Lost Colony debut"], []
    if asset == "PrimalItemArmor_Saddle_FireLion_C":
        return "fantastic-tames", [], ["fantastic-tames"]
    if asset.startswith("PrimalItemSkin_DesertGhillie_") or asset == "PrimalItemSkin_ManticoreShield_C":
        return "base-game", ["Cosmetic", "Scorched Earth"], []
    if asset in FREE_EVENT_SKINS:
        return "base-game", ["Cosmetic", FREE_EVENT_SKINS[asset]], []
    if asset in FREE_STRUCTURES or asset == "PrimalItemResource_ApexDrop_Sarco_C":
        return "base-game", [], []
    return None


def reviewed_rows(rows):
    selected = []
    metadata = {}
    for row in rows:
        if not eligible(row) or content_pack(row):
            continue
        classification = reviewed_entry(row)
        if classification is None:
            continue
        pack, tags, requirements = classification
        selected.append((row, pack))
        metadata[row["path"]] = {"tags": tags, "requiredPaidDlc": requirements}
    return selected, metadata


def make_entries(selected, kind, prior):
    existing = {path_key(row["blueprint"]): row for row in prior if row["blueprint"]}
    names = {name_key(row["name"]): row for row in prior}
    name_counts = Counter(name_key(row["label"]) for row, _ in selected)
    reserved = {row["id"].lower() for row in prior}
    used = set()
    result = []
    # Give exact existing paths first claim on the existing IDs.
    for row, pack in sorted(selected, key=lambda entry: (path_key(entry[0]["path"]) not in existing, entry[0]["path"])):
        label = row["label"].strip()
        path = row["path"]
        old = existing.get(path_key(path))
        if not old and name_counts[name_key(label)] == 1:
            old = names.get(name_key(label))
        entry_id = old["id"] if old and old["id"].lower() not in used else None
        if not entry_id:
            entry_id = re.sub(r"[^a-zA-Z0-9]+", "", label)
            if entry_id.lower() in (reserved | used) or not entry_id:
                cls = row["classString"].removesuffix("_C")
                entry_id = f"{cls}-{hashlib.sha256(path.encode()).hexdigest()[:8]}"
        used.add(entry_id.lower())
        if kind == "items":
            category = item_category(row)
        else:
            category = old["category"] if old else "Other / Omnivores"
        result.append(dict(
            id=entry_id, name=label, blueprint=path, contentPack=pack, category=category,
            verified=True, source=SOURCE, requiredPaidDlc=[] if pack == "base-game" else [pack],
        ))
    return sorted(result, key=lambda entry: (entry["contentPack"], entry["name"].lower(), entry["id"]))


def read_official(archive):
    with tarfile.open(archive, "r:gz") as source:
        member = source.getmember(f"{OFFICIAL_ID}.json")
        if not member.isfile() or member.size > 25_000_000:
            raise ValueError("Invalid Ark Official member.")
        data = json.load(source.extractfile(member))
    return next(payload for payload in data["payloads"] if payload["gameId"] == "ArkSA")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--batch", choices=(5, 6), default=5, type=int)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = read_official(args.archive)
    here = Path(__file__).resolve().parent
    current = json.loads((here.parent / "ark-catalog-v2.json").read_text(encoding="utf-8"))
    batch04 = json.loads((here / "free-catalog-batch-04.json").read_text(encoding="utf-8"))
    result = {"schemaVersion": 2, "packs": current["packs"]}
    batch05 = None
    if args.batch == 6:
        batch05 = json.loads((here / "official-catalog-batch-05.json").read_text(encoding="utf-8"))
        result["packs"] = [*batch05["packs"], ANIMATED_SERIES]
    for kind, source_key in (("dinosaurs", "creatures"), ("items", "engrams")):
        prior = current[kind] + batch04[kind]
        if batch05 is None:
            selected, counts = accepted_rows(source[source_key])
            result[kind] = make_entries(selected, kind, prior)
        else:
            selected, metadata = reviewed_rows(source[source_key])
            counts = Counter(pack for _, pack in selected)
            result[kind] = make_entries(selected, kind, prior + batch05[kind])
            for entry in result[kind]:
                entry.update(metadata[entry["blueprint"]])
        print(kind, len(result[kind]), dict(sorted(counts.items())))

    # Keep each entry on one line to make future catalog diffs readable.
    with args.out.open("x", encoding="utf-8", newline="\n") as output:
        output.write('{\n  "schemaVersion": 2,\n')
        for index, key in enumerate(("packs", "dinosaurs", "items")):
            if index:
                output.write(",\n")
            output.write(f'  "{key}": [\n')
            output.write(",\n".join("    " + json.dumps(row, ensure_ascii=False) for row in result[key]))
            output.write("\n  ]")
        output.write("\n}\n")


if __name__ == "__main__":
    main()
