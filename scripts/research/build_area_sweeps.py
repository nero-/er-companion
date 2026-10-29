#!/usr/bin/env python3
"""Build area sweep ledgers from the canonical catalogs.

Produces `src/data/area-sweeps.json` in the `AreaSweepFile` shape consumed by
`src/lib/data.ts`.

Rules:
- Every route area appears exactly once, even when empty.
- Merchant stock is assigned from the merchant's Redmaw inventory step id, which
  encodes the route area band (`m1`..`m20` = base/DLC merchant chapters). The
  mapping is explicit below; unmatched merchants are reported in `gaps`.
- Farmables, unlinked items and materials are assigned only when a route area
  name appears in their own location/grace/section text.
- Coverage totals are recomputed from the emitted arrays.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "src" / "data"

# Redmaw merchant chapter bands -> route area. The merchant sheet groups its
# stock by the same walkthrough chapter numbers used in `mN-x` step ids.
MERCHANT_CHAPTER_AREA = {
    "m1": "Starting Out",
    "m2": "First steps in Limgrave",
    "m3": "West Limgrave",
    "m4": "North Limgrave",
    "m5": "Weeping Peninsula",
    "m6": "Castle Morne",
    "m7": "South Liurnia",
    "m8": "East Liurnia",
    "m9": "Academy of Raya Lucaria",
    "m10": "Central Altus",
    "m11": "Leyndell",
    "m12": "West Mountaintops",
    "m13": "Consecrated Snowfield",
    "m14": "Gravesite Plain",
    "m15": "Scadu Altus",
    "m16": "Cerulean Coast",
    "m17": "Ancient Ruins of Rauh",
    "m18": "Abyssal Woods",
    "m19": "Enir-Ilim",
    "m20": "Shadow Keep",
    "m35": "Leyndell, Royal Capital",
    "m36": "Subterranean Shunning-Grounds",
    "m37": "Abyssal Woods",
    "m38": "Shadow Keep",
    "m39": "Scaduview",
    "m40": "Starting Out",
}

# Explicit overrides where the inventory chapter differs from the area the
# merchant is met in. These are documented rather than silently guessed.
MERCHANT_OVERRIDES = {
    "Twin Maiden Husks": "Roundtable Hold",

    "Finger Reader Enia (Equipment)": "Roundtable Hold",
    "Finger Reader Enia (Remembrances)": "Roundtable Hold",
    "Gatekeeper Gostoc": "Stormveil Castle",
    "Sorceress Sellen": "Academy of Raya Lucaria",
    "Sorcerer Rogier": "Roundtable Hold",
    "D, Hunter of the Dead": "Roundtable Hold",
    "Brother Corhyn": "Roundtable Hold",
    "Smithing Master Iji": "West Limgrave",
    "Preceptor Seluvis": "Caria Manor",
    "Pidia, Carian Servant": "Caria Manor",
    "Miriel, Pastor of Vows": "South Liurnia",
    "Sage Gowry": "Caelid",
    "Dragon Communion": "Caelid",
    "Sorcerer Thops": "Academy of Raya Lucaria",
    "Blackguard Big Boggart": "South Liurnia",
    "Nomadic Merchant (West Limgrave)": "West Limgrave",
    "Nomadic Merchant (East Limgrave)": "First steps in Limgrave",
    "Nomadic Merchant (North Limgrave)": "North Limgrave",
    "Nomadic Merchant (Weeping Peninsula)": "Weeping Peninsula",
    "Isolated Merchant (Weeping Peninsula)": "Weeping Peninsula",
    "Nomadic Merchant (South Liurnia)": "South Liurnia",
    "Nomadic Merchant (North Liurnia)": "East Liurnia",
    "Isolated Merchant (Raya Lucaria)": "Academy of Raya Lucaria",
    "Nomadic Merchant (North Caelid)": "Caelid",
    "Nomadic Merchant (South Caelid)": "Caelid",
    "Isolated Merchant (Dragonbarrow)": "Greyoll's Dragonbarrow",
    "Nomadic Merchant (Altus Plateau)": "Central Altus",
    "Nomadic Merchant (Mt. Gelmir)": "Mt. Gelmir",
    "Nomadic Merchant (Leyndell)": "Leyndell",
    "Nomadic Merchant (Mountaintops)": "West Mountaintops",
    "Hermit Merchant (Mountaintops of the Giants)": "West Mountaintops",
    "Nomadic Merchant (Consecrated Snowfield)": "Consecrated Snowfield",
    "Nomadic Merchant (Gravesite Plain)": "West Gravesite Plain",
    "Nomadic Merchant (Scadu Altus)": "West Scadu Altus",
    "Nomadic Merchant (Cerulean Coast)": "Cerulean Coast",
    "Nomadic Merchant (Rauh)": "Rauh Base",
    "Nomadic Merchant (Shadow Keep)": "Shadow Keep",
    "Hermit Merchant (Capital Outskirts)": "Capital Outskirts",
    "Hermit Merchant (Ainsel River)": "Ainsel River",
    "Abandoned Merchant": "Leyndell",
    "Imprisoned Merchant": "Leyndell",
}


def load(name: str):
    return json.loads((DATA / name).read_text())


def norm(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


route = load("route.full.json")
items = load("items.full.json")["items"]
farms = load("farms.json")
merchants = load("merchants.full.json")["merchants"]
materials = load("materials.full.json")["entries"]

areas = sorted(route["areas"], key=lambda row: row["order"])
area_names = {row["name"] for row in areas}
norm_area = {norm(row["name"]): row["name"] for row in areas}

item_by_id = {row["id"]: row for row in items}
item_ids = set(item_by_id)

sweeps = {
    row["name"]: {
        "area": row["name"],
        "sectionId": row["sectionId"],
        "phase": row["phase"],
        "game": row["game"],
        "merchants": [],
        "farmables": [],
        "unlinkedItems": [],
        "materials": [],
        "counts": {
            "merchants": 0,
            "merchantItems": 0,
            "farmables": 0,
            "unlinkedItems": 0,
            "materials": 0,
        },
        "confidence": "high",
        "notes": [],
    }
    for row in areas
}

gaps: list[str] = []
unplaced: list[str] = []

for inventory in merchants:
    name = inventory["name"]
    target = MERCHANT_OVERRIDES.get(name)
    if target not in area_names:
        chapter = ""
        for item in inventory["items"]:
            step = item.get("stepId") or ""
            match = re.match(r"(m\d+)", step)
            if match:
                chapter = match.group(1)
                break
        target = MERCHANT_CHAPTER_AREA.get(chapter)
    if target not in area_names:
        # Fall back to the route area that actually contains the merchant chapter.
        unplaced.append(name)
        gaps.append(f"Merchant not assigned to a route area: {name} ({len(inventory['items'])} items)")
        continue
    sweep = sweeps[target]
    rows = []
    for item in inventory["items"]:
        catalog = next((row for row in items if norm(row["name"]) == norm(item["name"])), None)
        rows.append(
            {
                "id": item["id"],
                "merchantId": inventory["id"],
                "merchant": name,
                "itemName": item["name"],
                "itemId": catalog["id"] if catalog else "",
                "price": item.get("price"),
                "stock": item.get("stock", ""),
                "wikiUrl": item.get("wikiUrl", ""),
            }
        )
    sweep["merchants"].append(
        {"merchantId": inventory["id"], "merchant": name, "items": rows}
    )

# Farmables: area name inside location/grace/section text.
for farm in farms["farmables"]:
    haystack = norm(" ".join(str(farm.get(key, "")) for key in ("location", "grace", "notes", "source")))
    best = ""
    for key, name in norm_area.items():
        if key and key in haystack and len(key) > len(best):
            best = key
    if not best:
        continue
    area = norm_area[best]
    item = next((row for row in items if norm(row["name"]) == norm(farm["item"])), None)
    sweeps[area]["farmables"].append(
        {
            "id": farm["id"],
            "name": farm["item"],
            "itemId": item["id"] if item else "",
            "source": farm.get("source", ""),
            "location": farm.get("location", ""),
            "targetQuantity": int(farm.get("targetQuantity") or 1),
            "dropType": farm.get("dropType", ""),
            "category": farm.get("category", ""),
        }
    )

# Loose catalog items with no route step: assign from location/region/section.
for item in items:
    if item.get("routeStepIds") or item.get("autoStepId"):
        continue
    haystack = norm(" ".join(str(item.get(key, "")) for key in ("location", "region", "section")))
    best = ""
    for key, name in norm_area.items():
        if key and key in haystack and len(key) > len(best):
            best = key
    if not best:
        continue
    area = norm_area[best]
    sweeps[area]["unlinkedItems"].append(
        {
            "id": f"unlinked-{item['id']}",
            "itemId": item["id"],
            "name": item["name"],
            "location": item.get("location", ""),
            "acquisitionType": item.get("acquisitionType", ""),
            "group": item.get("group", ""),
        }
    )

# Crafting materials: assign from grace/earlySource.
for material in materials:
    haystack = norm(" ".join(str(material.get(key, "")) for key in ("grace", "earlySource", "lateSource")))
    best = ""
    for key, name in norm_area.items():
        if key and key in haystack and len(key) > len(best):
            best = key
    if not best:
        continue
    area = norm_area[best]
    sweeps[area]["materials"].append(
        {
            "id": material["id"],
            "name": material["name"],
            "grace": material.get("grace", ""),
            "earlySource": material.get("earlySource", ""),
            "method": material.get("method", ""),
            "sourceUrl": material.get("sourceUrl", ""),
        }
    )

# Dedupe each collection by canonical id; keep first occurrence.
for sweep in sweeps.values():
    seen = set()
    sweep["farmables"] = [row for row in sweep["farmables"] if not (row["id"] in seen or seen.add(row["id"]))]
    seen = set()
    sweep["unlinkedItems"] = [
        row for row in sweep["unlinkedItems"] if not (row["id"] in seen or seen.add(row["id"]))
    ]
    seen = set()
    sweep["materials"] = [row for row in sweep["materials"] if not (row["id"] in seen or seen.add(row["id"]))]
    seen = set()
    sweep["merchants"] = [
        row for row in sweep["merchants"] if not (row["merchantId"] in seen or seen.add(row["merchantId"]))
    ]
    counts = {
        "merchants": len(sweep["merchants"]),
        "merchantItems": sum(len(row["items"]) for row in sweep["merchants"]),
        "farmables": len(sweep["farmables"]),
        "unlinkedItems": len(sweep["unlinkedItems"]),
        "materials": len(sweep["materials"]),
    }
    sweep["counts"] = counts
    if not any(counts[key] for key in ("merchantItems", "farmables", "unlinkedItems", "materials")):
        sweep["confidence"] = "low"
        sweep["notes"].append("No sweep rows resolved from the canonical catalogs for this area.")
    elif not counts["merchants"]:
        sweep["confidence"] = "medium"
        sweep["notes"].append("No merchant stock is assigned to this area.")

ordered = [sweeps[row["name"]] for row in areas]
coverage = {
    "routeAreas": len(areas),
    "areasWithSweep": sum(
        1
        for sweep in ordered
        if any(sweep["counts"][key] for key in ("merchantItems", "farmables", "unlinkedItems", "materials"))
    ),
    "merchantItems": sum(sweep["counts"]["merchantItems"] for sweep in ordered),
    "farmables": sum(sweep["counts"]["farmables"] for sweep in ordered),
    "unlinkedItems": sum(sweep["counts"]["unlinkedItems"] for sweep in ordered),
    "materials": sum(sweep["counts"]["materials"] for sweep in ordered),
}

if unplaced:
    gaps.append(f"{len(unplaced)} merchants could not be mapped to a route area.")

payload = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "source": "src/data/merchants.full.json, farms.json, items.full.json, materials.full.json, route.full.json",
    "method": "Merchant chapter bands + explicit overrides; text matching for farmables/loose items/materials.",
    "areas": ordered,
    "coverage": coverage,
    "gaps": gaps,
}

(DATA / "area-sweeps.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(coverage, indent=2))
print("gaps:", len(gaps))
for gap in gaps[:10]:
    print(" -", gap)
