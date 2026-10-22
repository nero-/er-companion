#!/usr/bin/env python3
"""Extract the certified companion workbook into the app's canonical JSON model.

The original workbook is never modified. The script writes deterministic,
typed-ish JSON into src/data/ and a data-integrity report into docs/audit/.

Design rule: the workbook is a source, not the app schema. Fields are renamed,
normalised, and grouped for the product. Provenance (workbook sheet + row) is
retained in the audit inventory, not in every UI payload.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx"
OUT_DIR = ROOT / "src" / "data"
AUDIT_DIR = ROOT / "docs" / "audit"
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE


# ---------------------------------------------------------------------------
# Cell / row helpers
# ---------------------------------------------------------------------------

def clean(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).replace("\u00a0", " ").strip()
    return re.sub(r"[ \t]+", " ", text)


def num(value, default=None):
    v = clean(value)
    if v == "" or v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return default


def intval(value, default=0):
    n = num(value, default)
    return int(n) if n is not None else default


def yes(value):
    return str(clean(value)).lower().startswith("yes")


def split_multi(value):
    text = clean(value)
    if not text:
        return []
    return [part.strip() for part in re.split(r"[;,]", text) if part.strip()]


def extract_url(text):
    text = clean(text)
    match = re.search(r"https?://\S+", text)
    return match.group(0).rstrip(").,;") if match else ""


def compact(text, limit=None):
    text = clean(text)
    if limit and len(text) > limit:
        return text[:limit].rstrip() + "…"
    return text


# ---------------------------------------------------------------------------
# Workbook loading
# ---------------------------------------------------------------------------

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


print(f"Reading {SOURCE.name} …", flush=True)
WORKBOOK = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
SHEETS: dict[str, list[list]] = {}
for sheet in WORKBOOK.worksheets:
    rows = []
    for row in sheet.iter_rows(values_only=True):
        row = list(row)
        while row and row[-1] is None:
            row.pop()
        if row and any(value is not None and str(value).strip() for value in row):
            rows.append(row)
    SHEETS[sheet.title] = rows

SHEET_STATES = {
    sheet.title: sheet.sheet_state for sheet in WORKBOOK.worksheets
}


def sheet(name: str) -> list[list]:
    if name not in SHEETS:
        raise KeyError(f"Workbook sheet not found: {name}")
    return SHEETS[name]


def rowdicts(name: str, header_index: int):
    rows = sheet(name)
    header = rows[header_index]
    for offset, row in enumerate(rows[header_index + 1:], start=header_index + 2):
        padded = list(row) + [None] * max(0, len(header) - len(row))
        yield offset, header, padded


def cell(row, index, default=""):
    return row[index] if index < len(row) else default


# ---------------------------------------------------------------------------
# Canonical ordering indexes
# ---------------------------------------------------------------------------

ROUTE_ROWS = []
route_header = sheet("Route Data")[0]
for offset, row in enumerate(sheet("Route Data")[1:], start=2):
    if not clean(cell(row, 0)):
        continue
    ROUTE_ROWS.append((offset, row))

ROUTE_ORDER = {clean(row[0]): index for index, (_, row) in enumerate(ROUTE_ROWS)}


def is_id(value, prefixes=None):
    text = clean(value)
    if not text or " " in text:
        return False
    if prefixes:
        return any(text.startswith(prefix) for prefix in prefixes)
    return bool(re.match(r"^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+$", text))


# ---------------------------------------------------------------------------
# Route, areas, objectives, supplemental chronology
# ---------------------------------------------------------------------------

ROUTE_STEPS = []
area_first_order: OrderedDict[str, int] = OrderedDict()
for order, (source_row, row) in enumerate(ROUTE_ROWS):
    area = clean(cell(row, 2))
    area_first_order.setdefault(area, order)
    linked_raw = clean(cell(row, 10))
    ROUTE_STEPS.append({
        "id": clean(cell(row, 0)),
        "order": order,
        "act": clean(cell(row, 1)),
        "area": area,
        "objectiveId": clean(cell(row, 3)),
        "objectiveOrder": num(cell(row, 4)),
        "stepOrder": num(cell(row, 5)),
        "type": clean(cell(row, 6)),
        "instruction": clean(cell(row, 7)),
        "required": yes(cell(row, 8)),
        "linkedRaw": linked_raw,
        "prerequisites": clean(cell(row, 11)),
        "warning": clean(cell(row, 12)),
        "location": clean(cell(row, 13)),
        "validation": clean(cell(row, 14)),
        "routeDecision": clean(cell(row, 17)),
        "skipAllowed": yes(cell(row, 18)),
        "returnWindow": clean(cell(row, 19)),
        "lockoutRisk": clean(cell(row, 20)),
        "estimatedTime": clean(cell(row, 21)),
        "sourceRow": source_row,
    })

AREA_ORDER = {
    "Tutorial": 0,
    "West Limgrave": 1,
    "East Limgrave": 2,
    "Weeping Peninsula": 3,
    "Castle Morne": 4,
    "Stormhill": 5,
    "Stormveil Castle": 6,
    "Act I Exit Audit": 7,
}
for area in area_first_order:
    AREA_ORDER.setdefault(area, len(AREA_ORDER))

OBJECTIVES = []
objective_area: dict[str, str] = {}
for step in ROUTE_STEPS:
    objective_area.setdefault(step["objectiveId"], step["area"])
for source_row, header, row in rowdicts("Objectives Data", 0):
    oid = clean(cell(row, 0))
    if not is_id(oid, ["OBJ-"]):
        continue
    objectives = {
        "id": oid,
        "completionUnitId": clean(cell(row, 1)),
        "order": num(cell(row, 2)),
        "name": clean(cell(row, 3)),
        "location": clean(cell(row, 4)),
        "requirement": clean(cell(row, 5)),
        "prerequisiteId": clean(cell(row, 7)),
        "summary": clean(cell(row, 8)),
        "validation": clean(cell(row, 9)),
        "area": objective_area.get(oid, ""),
        "sourceRow": source_row,
    }
    OBJECTIVES.append(objectives)

MICRO_OBJECTIVES = []
for source_row, header, row in rowdicts("Micro-Objectives", 0):
    mid = clean(cell(row, 0))
    if not is_id(mid, ["MIC-"]):
        continue
    MICRO_OBJECTIVES.append({
        "id": mid,
        "objectiveId": clean(cell(row, 1)),
        "order": num(cell(row, 2)),
        "name": clean(cell(row, 3)),
        "location": clean(cell(row, 4)),
        "type": clean(cell(row, 5)),
        "required": yes(cell(row, 6)),
        "prerequisiteId": clean(cell(row, 8)),
        "routeRange": clean(cell(row, 9)),
        "completionRule": clean(cell(row, 15)),
        "sourceUrl": clean(cell(row, 16)),
        "notes": clean(cell(row, 17)),
        "sourceRow": source_row,
    })

COMPLETION_UNITS = []
unit_by_id = {}
for source_row, header, row in rowdicts("Completion Units", 1):
    uid = clean(cell(row, 0))
    if not is_id(uid, ["CU-"]):
        continue
    unit = {
        "id": uid,
        "act": clean(cell(row, 1)),
        "name": clean(cell(row, 2)),
        "order": num(cell(row, 3)),
        "validation": clean(cell(row, 4)),
        "description": clean(cell(row, 5)),
        "objectiveTotal": intval(cell(row, 8)),
        "sourceRow": source_row,
    }
    COMPLETION_UNITS.append(unit)
    unit_by_id[uid] = unit

for objective in OBJECTIVES:
    unit = unit_by_id.get(objective["completionUnitId"])
    if unit:
        objective["completionUnit"] = unit["name"]

SUPPLEMENTAL = []
for source_row, header, row in rowdicts("Supplemental Content", 1):
    sid = clean(cell(row, 0))
    if not sid or not clean(cell(row, 2)):
        continue
    SUPPLEMENTAL.append({
        "kind": "certification" if sid.startswith("CERT-") else ("ending" if sid.startswith("END-") else "supplement"),
        "id": sid,
        "journey": clean(cell(row, 1)),
        "area": clean(cell(row, 2)),
        "areaOrder": num(cell(row, 3), 999),
        "category": clean(cell(row, 4)),
        "action": clean(cell(row, 5)),
        "trigger": clean(cell(row, 6)),
        "missable": yes(cell(row, 7)),
        "sourceUrl": clean(cell(row, 9)),
        "coverageNote": clean(cell(row, 10)),
        "futureJourney": clean(cell(row, 11)),
        "notes": clean(cell(row, 12)),
        "researchStatus": clean(cell(row, 13)),
        "sourceRow": source_row,
    })

# Areas with route steps, plus tutorial (supplemental only).
areas = []
for area, first in area_first_order.items():
    steps = [step for step in ROUTE_STEPS if step["area"] == area]
    objectives = sorted({step["objectiveId"] for step in steps}, key=lambda oid: next(
        (step["order"] for step in steps if step["objectiveId"] == oid), 0))
    unit = next((u for u in COMPLETION_UNITS if u["name"] == area), None)
    areas.append({
        "name": area,
        "order": AREA_ORDER.get(area, len(areas)),
        "act": "Act I",
        "objectiveIds": objectives,
        "stepCount": len(steps),
        "requiredCount": sum(1 for step in steps if step["required"]),
        "hasRoute": True,
        "description": unit["description"] if unit else "",
        "validation": unit["validation"] if unit else "",
    })
areas.append({
    "name": "Tutorial",
    "order": 0,
    "act": "Act I",
    "objectiveIds": [],
    "stepCount": 0,
    "requiredCount": 0,
    "hasRoute": False,
    "description": "Opening beats covered by the Companion chronology before the first Limgrave route section.",
    "validation": "Supplemental chronology",
})
areas.sort(key=lambda item: item["order"])

# Supplemental-only chronologies (whole game, critical companion actions).
chronology_areas = []
for area in sorted({row["area"] for row in SUPPLEMENTAL}, key=lambda name: min(
        row["areaOrder"] for row in SUPPLEMENTAL if row["area"] == name)):
    rows = [row for row in SUPPLEMENTAL if row["area"] == area]
    chronology_areas.append({
        "name": area,
        "order": min(row["areaOrder"] for row in rows),
        "count": len(rows),
    })


# ---------------------------------------------------------------------------
# Items: Master Collectibles + Permanent Collection
# ---------------------------------------------------------------------------

MASTER_ITEMS = {}
for source_row, header, row in rowdicts("Master Collectibles", 1):
    iid = clean(cell(row, 0))
    if not is_id(iid, ["COL-", "GKI-PERM-"]):
        continue
    MASTER_ITEMS[iid] = {
        "id": iid,
        "name": clean(cell(row, 2)),
        "category": clean(cell(row, 1)),
        "region": clean(cell(row, 3)),
        "location": clean(cell(row, 4)),
        "acquisitionType": clean(cell(row, 5)),
        "startingOwned": clean(cell(row, 6)) == "Acquired",
        "linkedRouteRaw": clean(cell(row, 7)),
        "validation": clean(cell(row, 8)),
        "sourceNotes": clean(cell(row, 9)),
        "sourceRow": source_row,
    }

PERMANENT_ITEMS = {}
for source_row, header, row in rowdicts("Permanent Collection", 0):
    iid = clean(cell(row, 0))
    if not is_id(iid, ["COL-", "GKI-PERM-"]):
        continue
    PERMANENT_ITEMS[iid] = {
        "id": iid,
        "name": clean(cell(row, 2)),
        "category": clean(cell(row, 1)),
        "region": clean(cell(row, 3)),
        "location": clean(cell(row, 4)),
        "acquisitionType": clean(cell(row, 5)),
        "startingOwned": clean(cell(row, 6)) == "Acquired",
        "objectiveId": clean(cell(row, 7)),
        "linkedRouteRaw": clean(cell(row, 8)),
        "missable": clean(cell(row, 9)),
        "validation": clean(cell(row, 10)),
        "sourceUrl": clean(cell(row, 11)),
        "notes": clean(cell(row, 12)),
        "sourceRow": source_row,
    }


def item_group(category: str) -> str:
    c = category.lower()
    if c in {"armor"}:
        return "Armor"
    if c in {"shield", "greatshield"}:
        return "Shield"
    if c in {"weapon", "remembrance weapon", "straight sword", "halberd", "axe",
             "dagger", "hammer", "thrusting sword", "curved sword", "spear",
             "fist weapon", "torch", "ballista", "bow", "crossbow", "greatbow",
             "legendary armament"}:
        return "Weapon"
    if c in {"talisman", "multiplayer talisman", "talisman stock", "consumable talisman"}:
        return "Talisman"
    if c in {"incantation", "sorcery"}:
        return "Spell"
    if c == "ash of war":
        return "Ash of War"
    if c == "spirit ash":
        return "Spirit Ash"
    if c in {"cookbook / recipe", "cookbook", "prayerbook", "scroll"}:
        return "Recipe & Knowledge"
    if c in {"upgrade material", "somber upgrade material", "spirit upgrade material",
             "special spirit upgrade material", "upgrade material set", "upgrade",
             "golden seed", "sacred tear"}:
        return "Upgrade"
    if c in {"crafting material", "rare crafting material"}:
        return "Material"
    if c in {"key item", "key / unique collectible", "key consumption", "key consumable",
             "quest item", "container", "great rune", "whetblade", "bell bearing",
             "memory stone", "painting", "map"}:
        return "Key & Lore"
    if c == "crystal tear":
        return "Crystal Tear"
    if c == "gesture":
        return "Gesture"
    if c in {"tool", "reusable tool", "tool / unique collectible"}:
        return "Tool"
    if c == "note":
        return "Note"
    if c in {"flask"}:
        return "Flask"
    return "Consumable"


ITEMS = []
for iid, master in MASTER_ITEMS.items():
    permanent = PERMANENT_ITEMS.get(iid, {})
    category = permanent.get("category") or master["category"]
    source_url = permanent.get("sourceUrl") or extract_url(master.get("sourceNotes"))
    notes = permanent.get("notes") or master.get("sourceNotes")
    item = {
        "id": iid,
        "name": master["name"] or permanent.get("name", ""),
        "category": category,
        "group": item_group(category),
        "region": master["region"] or permanent.get("region", ""),
        "location": master["location"] or permanent.get("location", ""),
        "acquisitionType": master["acquisitionType"] or permanent.get("acquisitionType", ""),
        "startingOwned": bool(master["startingOwned"] or permanent.get("startingOwned")),
        "objectiveId": permanent.get("objectiveId", ""),
        "linkedRouteRaw": permanent.get("linkedRouteRaw") or master["linkedRouteRaw"],
        "missable": permanent.get("missable", ""),
        "validation": master["validation"] or permanent.get("validation", ""),
        "sourceUrl": source_url,
        "notes": notes,
        "game": "Shadow of the Erdtree" if str(master["region"]).startswith("Shadow of the Erdtree") else "Base Game",
        "sourceRow": master["sourceRow"],
    }
    ITEMS.append(item)

ITEMS.sort(key=lambda item: (item["group"], item["category"], item["name"].lower()))


# ---------------------------------------------------------------------------
# World state: encounters, NPCs, dialogue, world, traversal, lockouts, deps
# ---------------------------------------------------------------------------

ENCOUNTERS = {}
for source_row, header, row in rowdicts("Bosses & Encounters", 0):
    eid = clean(cell(row, 0))
    if not is_id(eid, ["ENC-"]):
        continue
    ENCOUNTERS[eid] = {
        "id": eid,
        "name": clean(cell(row, 1)),
        "region": clean(cell(row, 2)),
        "location": clean(cell(row, 3)),
        "type": clean(cell(row, 4)),
        "required": clean(cell(row, 5)),
        "notes": clean(cell(row, 9)),
        "validation": clean(cell(row, 8)),
        "linkedRouteRaw": clean(cell(row, 7)),
        "sourceRow": source_row,
    }

for source_row, header, row in rowdicts("Encounter Metadata", 1):
    eid = clean(cell(row, 0))
    if eid not in ENCOUNTERS:
        continue
    ENCOUNTERS[eid].update({
        "act": clean(cell(row, 2)),
        "completionUnit": clean(cell(row, 3)),
        "majorBoss": yes(cell(row, 7)),
        "optional": yes(cell(row, 8)),
        "respawns": yes(cell(row, 9)),
        "achievement": clean(cell(row, 10)),
        "questRelated": yes(cell(row, 11)),
        "missable": yes(cell(row, 12)),
        "multiplayer": clean(cell(row, 13)),
        "timeLock": clean(cell(row, 14)),
        "tags": split_multi(cell(row, 16)),
        "notes2": clean(cell(row, 18)),
    })

for source_row, header, row in rowdicts("Encounter Recommendations", 1):
    eid = clean(cell(row, 1))
    if eid not in ENCOUNTERS:
        continue
    ENCOUNTERS[eid].update({
        "recommendedLevel": clean(cell(row, 3)),
        "standardWeapon": clean(cell(row, 4)),
        "somberWeapon": clean(cell(row, 5)),
        "flaskCharges": clean(cell(row, 6)),
        "flaskDistribution": clean(cell(row, 7)),
        "spiritAsh": clean(cell(row, 8)),
        "npcSummon": clean(cell(row, 9)),
        "consumables": clean(cell(row, 10)),
        "strategyNotes": clean(cell(row, 11)),
        "difficulty": clean(cell(row, 12)),
        "defaultRoute": clean(cell(row, 13)),
        "returnObjective": clean(cell(row, 14)),
        "runeRisk": clean(cell(row, 15)),
        "scadutree": clean(cell(row, 16)),
        "confidence": clean(cell(row, 17)),
    })

ENCOUNTERS = list(ENCOUNTERS.values())


def simple_records(name, header_index, prefix, fields):
    records = []
    for source_row, header, row in rowdicts(name, header_index):
        record_id = clean(cell(row, 0))
        if not is_id(record_id, [prefix]):
            continue
        record = {"id": record_id, "sourceRow": source_row}
        for field, index in fields.items():
            value = cell(row, index)
            record[field] = clean(value)
        records.append(record)
    return records


NPC_STATES = simple_records("NPC States", 0, "NPC-", {
    "npc": 1, "region": 2, "milestone": 3, "linkedRouteRaw": 5,
    "validation": 6, "warning": 7,
})
DIALOGUE_EVENTS = simple_records("Dialogue Events", 0, "DIA-", {
    "npc": 1, "location": 2, "trigger": 3, "linkedRouteRaw": 5,
    "warning": 6, "validation": 7, "notes": 8,
})
WORLD_STATES = simple_records("World States", 0, "WS-", {
    "name": 1, "region": 2, "trigger": 3, "targetState": 4,
    "linkedRouteRaw": 6, "validation": 7, "notes": 8,
})
TRAVERSAL = simple_records("Traversal", 0, "TRV-", {
    "name": 1, "region": 2, "location": 3, "state": 4,
    "linkedRouteRaw": 6, "prerequisite": 7, "validation": 8, "notes": 9,
})
LOCKOUTS = simple_records("Lockout Database", 1, "LCK-", {
    "act": 1, "area": 2, "trigger": 3, "triggerType": 4, "changes": 5,
    "severity": 6, "reversible": 7, "safeWindow": 8, "preChecks": 9,
    "objectiveId": 10, "linkedRouteRaw": 11, "status": 12,
    "validation": 13, "notes": 14,
})
DEPENDENCIES = simple_records("Dependency Matrix", 1, "DEP-", {
    "act": 1, "area": 2, "event": 3, "dependsOn": 4, "unlocks": 5,
    "changes": 6, "lockoutRisk": 7, "timing": 8, "objectiveId": 9,
    "linkedRouteRaw": 10, "rationale": 11,
})
KNOWLEDGE = simple_records("Knowledge Database", 0, "KN-", {
    "category": 1, "title": 2, "region": 3, "location": 4, "unlockTiming": 5,
    "objectiveId": 6, "linkedRouteRaw": 7, "spoilerLevel": 8,
    "validation": 10, "sourceUrl": 11, "guidance": 12,
})


# ---------------------------------------------------------------------------
# Lore
# ---------------------------------------------------------------------------

LORE = []
for source_row, header, row in rowdicts("Lore Companion", 2):
    lid = clean(cell(row, 0))
    if not is_id(lid, ["LOR-"]):
        continue
    LORE.append({
        "id": lid,
        "journey": clean(cell(row, 1)),
        "area": clean(cell(row, 2)),
        "unlockCondition": clean(cell(row, 3)),
        "areaOrder": num(cell(row, 11), 999),
        "rawSummary": clean(cell(row, 12)),
        "rawCharacters": clean(cell(row, 13)),
        "rawEvidence": clean(cell(row, 14)),
        "rawQuestions": clean(cell(row, 15)),
        "rawLater": clean(cell(row, 16)),
        "rawChronicle": clean(cell(row, 17)),
        "sourceContract": clean(cell(row, 18)),
        "primaryRouteUrl": clean(cell(row, 19)),
        "sourceRow": source_row,
    })


# ---------------------------------------------------------------------------
# Decisions, endings, journeys, remembrances, completion gates
# ---------------------------------------------------------------------------

DECISIONS = []
for source_row, header, row in rowdicts("Choices & Consequences", 6):
    cid = clean(cell(row, 0))
    if not is_id(cid, ["BASE-", "DLC-", "END-"]):
        continue
    DECISIONS.append({
        "id": cid,
        "game": clean(cell(row, 1)),
        "category": clean(cell(row, 2)),
        "title": clean(cell(row, 3)),
        "decisionPoint": clean(cell(row, 4)),
        "deadline": clean(cell(row, 5)),
        "outcomes": clean(cell(row, 6)),
        "journey1": clean(cell(row, 7)),
        "journey1Result": clean(cell(row, 8)),
        "futureOutcome": clean(cell(row, 9)),
        "futureJourney": clean(cell(row, 10)),
        "completionRequirement": clean(cell(row, 11)),
        "sourceRow": source_row,
    })

ENDINGS = []
certifications = []
for source_row, header, row in rowdicts("Endings & Achievements", 4):
    order = num(cell(row, 0))
    ending = clean(cell(row, 1))
    if order is None or not ending or order > 6 or ending == "Ending" or source_row >= 12:
        continue
    ENDINGS.append({
        "id": re.sub(r"[^a-z0-9]+", "-", ending.lower()).strip("-"),
        "order": int(order),
        "name": ending,
        "achievement": clean(cell(row, 3)),
        "recoveryState": clean(cell(row, 5)),
        "permanent": clean(cell(row, 6)),
        "afterCompletion": clean(cell(row, 8)),
        "sourceRow": source_row,
    })

for source_row, header, row in rowdicts("Endings & Achievements", 12):
    cid = clean(cell(row, 3))
    if not is_id(cid, ["CERT-"]):
        continue
    certifications.append({
        "id": cid,
        "order": num(cell(row, 0)),
        "name": clean(cell(row, 1)),
        "timing": clean(cell(row, 4)),
        "purpose": clean(cell(row, 5)),
        "mandatory": yes(cell(row, 7)),
        "notes": clean(cell(row, 8)),
        "sourceRow": source_row,
    })

JOURNEYS = []
for source_row, header, row in rowdicts("Journey Planner", 1):
    if source_row not in (3, 4, 5, 6):
        continue
    name = clean(cell(row, 0))
    JOURNEYS.append({
        "name": name,
        "purpose": clean(cell(row, 1)),
        "routeScope": clean(cell(row, 2)),
        "endingTarget": clean(cell(row, 3)),
        "alternateChoices": clean(cell(row, 4)),
        "remembrancePlan": clean(cell(row, 5)),
        "duplicatePlan": clean(cell(row, 6)),
        "cleanup": clean(cell(row, 7)),
        "entryRequirements": clean(cell(row, 8)),
        "status": clean(cell(row, 9)),
        "notes": clean(cell(row, 11)),
        "sourceRow": source_row,
    })

SIX_FUTURES = []
for source_row, header, row in rowdicts("Six Futures", 2):
    order = num(cell(row, 0))
    if order is None:
        continue
    SIX_FUTURES.append({
        "order": int(order),
        "recoveryState": clean(cell(row, 1)),
        "ending": clean(cell(row, 2)),
        "afterCompletion": clean(cell(row, 3)),
        "permanent": clean(cell(row, 4)),
        "sourceRow": source_row,
    })

REMEMBRANCES = []
for source_row, header, row in rowdicts("Remembrance Planner", 2):
    name = clean(cell(row, 0))
    if not name or not name.startswith("Remembrance") or name == "Remembrance" or clean(cell(row, 1)) == "Boss":
        continue
    REMEMBRANCES.append({
        "id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
        "name": name,
        "boss": clean(cell(row, 1)),
        "game": clean(cell(row, 2)),
        "rewards": [value for value in (clean(cell(row, 3)), clean(cell(row, 4)), clean(cell(row, 5))) if value],
        "journey1Selection": clean(cell(row, 6)),
        "journey1Duplication": clean(cell(row, 7)),
        "journey2Selection": clean(cell(row, 8)),
        "journey2Duplication": clean(cell(row, 9)),
        "ngPlusNeed": clean(cell(row, 10)),
        "duplicateTarget": clean(cell(row, 11)),
        "consumedForRunes": clean(cell(row, 12)),
        "location": clean(cell(row, 14)),
        "duplicationClass": clean(cell(row, 15)),
        "priority": clean(cell(row, 16)),
        "sourceUrl": clean(cell(row, 17)),
        "notes": clean(cell(row, 18)),
        "sourceRow": source_row,
    })

TROPHY_CUES = []
TRANSITION_GATES = []
MERCHANT_CLOSEOUT = []
CATEGORY_DENOMINATORS = []
for source_row, header, row in rowdicts("Master Completion", 0):
    first = clean(cell(row, 0))
    if re.match(r"^\d+$", first) and "TROPHY" in clean(cell(row, 4)):
        TROPHY_CUES.append({
            "order": int(first),
            "area": clean(cell(row, 1)),
            "cue": clean(cell(row, 2)),
            "flags": split_multi(cell(row, 4)),
            "sourceStepId": clean(cell(row, 5)),
            "boundary": clean(cell(row, 6)),
            "sourceRow": source_row,
        })
    if first.startswith("LCK-P22C-"):
        TRANSITION_GATES.append({
            "id": first,
            "trigger": clean(cell(row, 1)),
            "game": clean(cell(row, 2)),
            "area": clean(cell(row, 3)),
            "severity": clean(cell(row, 4)),
            "safeWindow": clean(cell(row, 5)),
            "preCheck": clean(cell(row, 6)),
            "sourceStatus": clean(cell(row, 7)),
            "notes": clean(cell(row, 9)),
            "sourceRow": source_row,
        })
    if first.startswith("MCO-P22F-"):
        MERCHANT_CLOSEOUT.append({
            "id": first,
            "merchant": clean(cell(row, 1)),
            "scope": clean(cell(row, 2)),
            "obligation": clean(cell(row, 3)),
            "deadline": clean(cell(row, 4)),
            "authority": clean(cell(row, 5)),
            "coverage": clean(cell(row, 6)),
            "validation": clean(cell(row, 8)),
            "notes": clean(cell(row, 9)),
            "sourceRow": source_row,
        })
    if first and first[0].isupper() and first not in {"Category", "CURRENT COMPLETION SNAPSHOT"}:
        if clean(cell(row, 1)) and num(cell(row, 1)) is not None and clean(cell(row, 2)) and num(cell(row, 2)) is not None and clean(cell(row, 8)).startswith(("TRUE", "COVERAGE", "KNOWN")):
            CATEGORY_DENOMINATORS.append({
                "category": first,
                "total": intval(cell(row, 1)),
                "baseGame": intval(cell(row, 5)),
                "dlc": intval(cell(row, 6)),
                "state": clean(cell(row, 7)),
                "rule": clean(cell(row, 8)),
                "sourceRow": source_row,
            })


# ---------------------------------------------------------------------------
# Farms, resources, merchants, scarabs
# ---------------------------------------------------------------------------

FARMABLES = []
for source_row, header, row in rowdicts("Farmable Collection", 4):
    fid = clean(cell(row, 0))
    if not is_id(fid, ["FRM-"]):
        continue
    FARMABLES.append({
        "id": fid,
        "game": clean(cell(row, 1)),
        "item": clean(cell(row, 2)),
        "category": clean(cell(row, 3)),
        "slot": clean(cell(row, 4)),
        "source": clean(cell(row, 5)),
        "location": clean(cell(row, 6)),
        "grace": clean(cell(row, 7)),
        "dropRate": clean(cell(row, 8)),
        "dropType": clean(cell(row, 9)),
        "targetQuantity": num(cell(row, 10), 1),
        "timing": clean(cell(row, 13)),
        "validation": clean(cell(row, 14)),
        "sourceUrl": clean(cell(row, 15)),
        "coverage": clean(cell(row, 16)),
        "notes": clean(cell(row, 17)),
        "sourceRow": source_row,
    })

MATERIALS = []
for source_row, header, row in rowdicts("Crafting Material Farms", 4):
    mid = clean(cell(row, 0))
    if not is_id(mid, ["MAT-"]):
        continue
    MATERIALS.append({
        "id": mid,
        "game": clean(cell(row, 1)),
        "name": clean(cell(row, 2)),
        "category": clean(cell(row, 3)),
        "renewability": clean(cell(row, 4)),
        "earlySource": clean(cell(row, 5)),
        "lateSource": clean(cell(row, 6)),
        "grace": clean(cell(row, 7)),
        "method": clean(cell(row, 8)),
        "purchasable": clean(cell(row, 9)),
        "merchant": clean(cell(row, 10)),
        "finiteBeforeUnlock": clean(cell(row, 11)),
        "priority": clean(cell(row, 12)),
        "use": clean(cell(row, 13)),
        "verification": clean(cell(row, 14)),
        "sourceUrl": clean(cell(row, 15)),
        "notes": clean(cell(row, 16)),
        "sourceRow": source_row,
    })

FINITE_RESOURCES = simple_records("Finite Resources", 0, "RES-", {
    "type": 1, "name": 2, "tier": 3, "quantity": 4, "region": 5,
    "location": 6, "acquisitionType": 7, "objectiveId": 9,
    "linkedRouteRaw": 10, "eventuallyPurchasable": 11, "validation": 12,
    "sourceUrl": 13, "notes": 14,
})
for record in FINITE_RESOURCES:
    record["quantity"] = num(record.get("quantity"), 1)

MERCHANTS = simple_records("Merchants", 0, "MER-", {
    "merchant": 1, "item": 2, "category": 3, "cost": 4, "stock": 5,
    "priority": 6, "objectiveId": 7, "linkedRouteRaw": 8, "missable": 9,
    "validation": 11, "sourceUrl": 12, "notes": 13,
})

SCARABS = simple_records("Scarab Audit", 4, "SCB-", {
    "game": 1, "region": 2, "section": 3, "sectionOrder": 4,
    "behavior": 5, "location": 6, "reward": 7, "rewardType": 8,
    "quantity": 9, "collectionId": 10, "routeRef": 11,
})

EXTERNAL_RESOURCES = []
for source_row, header, row in rowdicts("External Resources", 1):
    priority = num(cell(row, 0))
    name = clean(cell(row, 1))
    if priority is None or not name:
        continue
    EXTERNAL_RESOURCES.append({
        "priority": priority,
        "name": name,
        "role": clean(cell(row, 2)),
        "whenToUse": clean(cell(row, 3)),
        "coverage": clean(cell(row, 4)),
        "required": clean(cell(row, 5)),
        "url": clean(cell(row, 6)),
        "audit": clean(cell(row, 7)),
        "notes": clean(cell(row, 8)),
        "sourceRow": source_row,
    })


# ---------------------------------------------------------------------------
# Builds
# ---------------------------------------------------------------------------

BUILD_ARCHETYPES = []
for source_row, header, row in rowdicts("Build Catalog", 1):
    aid = clean(cell(row, 0))
    if not is_id(aid, ["ARC-"]):
        continue
    BUILD_ARCHETYPES.append({
        "id": aid,
        "name": clean(cell(row, 1)),
        "priorityStats": clean(cell(row, 2)),
        "fantasy": clean(cell(row, 3)),
        "researchStatus": clean(cell(row, 6)),
        "notes": clean(cell(row, 7)),
        "sharedClass": clean(cell(row, 8)),
        "recommendedClass": clean(cell(row, 9)),
        "classStatus": clean(cell(row, 10)),
        "familyRole": clean(cell(row, 11)),
        "parentId": clean(cell(row, 12)),
        "family": clean(cell(row, 13)),
        "variant": clean(cell(row, 14)),
        "disposition": clean(cell(row, 15)),
        "selectionPolicy": clean(cell(row, 16)),
        "sourceRow": source_row,
    })

BUILD_PROFILES = []
for source_row, header, row in rowdicts("Build Profiles", 1):
    bid = clean(cell(row, 0))
    if not bid or not clean(cell(row, 1)).startswith("ARC-"):
        continue
    BUILD_PROFILES.append({
        "id": bid,
        "archetypeId": clean(cell(row, 1)),
        "archetype": clean(cell(row, 2)),
        "level": num(cell(row, 3)),
        "startingClass": clean(cell(row, 4)),
        "stats": {
            "vig": num(cell(row, 5), 0), "mnd": num(cell(row, 6), 0),
            "end": num(cell(row, 7), 0), "str": num(cell(row, 8), 0),
            "dex": num(cell(row, 9), 0), "int": num(cell(row, 10), 0),
            "fai": num(cell(row, 11), 0), "arc": num(cell(row, 12), 0),
        },
        "calculatedLevel": num(cell(row, 13)),
        "primaryStat": clean(cell(row, 14)),
        "secondaryStat": clean(cell(row, 15)),
        "role": clean(cell(row, 16)),
        "packageId": clean(cell(row, 17)),
        "regulation": clean(cell(row, 18)),
        "status": clean(cell(row, 19)),
        "sourceUrl": clean(cell(row, 20)),
        "notes": clean(cell(row, 21)),
        "sourceRow": source_row,
    })

BUILD_LOADOUTS = []
for source_row, header, row in rowdicts("Build Loadouts", 1):
    lid = clean(cell(row, 0))
    if not is_id(lid):
        continue
    BUILD_LOADOUTS.append({
        "id": lid,
        "buildId": clean(cell(row, 1)),
        "archetype": clean(cell(row, 2)),
        "level": num(cell(row, 3)),
        "type": clean(cell(row, 4)),
        "mainWeapon": clean(cell(row, 5)),
        "mainSkill": clean(cell(row, 6)),
        "secondaryWeapon": clean(cell(row, 7)),
        "secondarySkill": clean(cell(row, 8)),
        "offhand": clean(cell(row, 9)),
        "shield": clean(cell(row, 10)),
        "armor": [clean(cell(row, i)) for i in (11, 12, 13, 14)],
        "talismans": [clean(cell(row, i)) for i in (15, 16, 17, 18)],
        "packageId": clean(cell(row, 19)),
        "physick": [clean(cell(row, i)) for i in (20, 21)],
        "sourceRow": source_row,
    })

TECH_NODES = []
TECH_EDGES = []
for source_row, header, row in rowdicts("Build Tech Tree", 3):
    node_id = clean(cell(row, 0))
    if is_id(node_id, ["TT-"]):
        TECH_NODES.append({
            "id": node_id,
            "name": clean(cell(row, 1)),
            "type": clean(cell(row, 2)),
            "stage": clean(cell(row, 3)),
            "levelMin": num(cell(row, 4)),
            "levelTarget": num(cell(row, 5)),
            "levelMax": num(cell(row, 6)),
            "exactLevel": clean(cell(row, 7)) == "Yes",
            "journeyScope": clean(cell(row, 8)),
            "regionStage": clean(cell(row, 9)),
            "originPolicy": clean(cell(row, 10)),
            "stats": {
                "vig": num(cell(row, 11), 0), "mnd": num(cell(row, 12), 0),
                "end": num(cell(row, 13), 0), "str": num(cell(row, 14), 0),
                "dex": num(cell(row, 15), 0), "int": num(cell(row, 16), 0),
                "fai": num(cell(row, 17), 0), "arc": num(cell(row, 18), 0),
            },
            "primaryIdentity": clean(cell(row, 19)),
            "secondaryIdentity": clean(cell(row, 20)),
            "loadoutId": clean(cell(row, 21)),
            "requirementSetId": clean(cell(row, 22)),
            "respecPolicy": clean(cell(row, 23)),
            "gateNotes": clean(cell(row, 24)),
            "dlcStatus": clean(cell(row, 25)),
            "ngPlusStatus": clean(cell(row, 26)),
            "sourceClass": clean(cell(row, 27)),
            "destinationIds": clean(cell(row, 28)),
            "preferredMode": clean(cell(row, 29)),
            "status": clean(cell(row, 31)),
            "sourceRow": source_row,
        })
    edge_id = clean(cell(row, 35))
    if is_id(edge_id, ["TT-EDGE-"]):
        TECH_EDGES.append({
            "id": edge_id,
            "from": clean(cell(row, 36)),
            "to": clean(cell(row, 37)),
            "type": clean(cell(row, 38)),
            "levelWindow": clean(cell(row, 39)),
            "statChange": clean(cell(row, 40)),
            "equipmentTransition": clean(cell(row, 41)),
            "weaponTransition": clean(cell(row, 42)),
            "acquisitionTrigger": clean(cell(row, 43)),
            "requirementSetId": clean(cell(row, 44)),
            "respecClass": clean(cell(row, 45)),
            "larvalTearCost": clean(cell(row, 46)),
            "destinationsLost": clean(cell(row, 47)),
            "destinationsGained": clean(cell(row, 48)),
            "journeyBoundary": clean(cell(row, 49)),
            "dlcBoundary": clean(cell(row, 50)),
            "status": clean(cell(row, 51)),
            "notes": clean(cell(row, 52)),
            "sourceRow": source_row,
        })

PROGRESSION_LOADOUTS = []
for source_row, header, row in rowdicts("Build Progression Loadouts", 3):
    lid = clean(cell(row, 0))
    if not is_id(lid, ["PLOAD-"]):
        continue
    PROGRESSION_LOADOUTS.append({
        "id": lid,
        "nodeId": clean(cell(row, 1)),
        "stage": clean(cell(row, 2)),
        "level": num(cell(row, 3)),
        "role": clean(cell(row, 4)),
        "primaryWeapon": clean(cell(row, 5)),
        "primaryConfigId": clean(cell(row, 6)),
        "secondaryWeapon": clean(cell(row, 7)),
        "secondaryConfigId": clean(cell(row, 8)),
        "catalyst": clean(cell(row, 9)),
        "armor": [clean(cell(row, i)) for i in (10, 11, 12, 13)],
        "talismans": [clean(cell(row, i)) for i in (14, 15, 16, 17)],
        "spells": [clean(cell(row, i)) for i in (18, 19, 20, 21, 22, 23, 24, 25)],
        "physick": [clean(cell(row, i)) for i in (26, 27)],
        "flask": clean(cell(row, 28)),
        "notes": clean(cell(row, 29)),
        "sourceRow": source_row,
    })

WEAPON_CONFIGS = []
for source_row, header, row in rowdicts("Build Weapon Configurations", 3):
    cid = clean(cell(row, 0))
    if not is_id(cid, ["CFG-"]):
        continue
    WEAPON_CONFIGS.append({
        "id": cid,
        "weapon": clean(cell(row, 1)),
        "itemClass": clean(cell(row, 2)),
        "buildContextId": clean(cell(row, 3)),
        "contextType": clean(cell(row, 4)),
        "stage": clean(cell(row, 5)),
        "role": clean(cell(row, 6)),
        "recommendationClass": clean(cell(row, 7)),
        "skillType": clean(cell(row, 8)),
        "skill": clean(cell(row, 9)),
        "ashTier": clean(cell(row, 10)),
        "affinity": clean(cell(row, 11)),
        "alternateAffinity": clean(cell(row, 12)),
        "buffable": clean(cell(row, 13)),
        "statFit": clean(cell(row, 14)),
        "weaponTier": clean(cell(row, 15)),
        "globalRank": num(cell(row, 16)),
        "ashRank": num(cell(row, 17)),
        "sourceRow": source_row,
    })

UPGRADE_PLANS = []
for source_row, header, row in rowdicts("Build Upgrade Planner", 3):
    uid = clean(cell(row, 0))
    if not uid or not clean(cell(row, 3)):
        continue
    UPGRADE_PLANS.append({
        "id": uid,
        "nodeId": clean(cell(row, 1)),
        "configId": clean(cell(row, 2)),
        "weapon": clean(cell(row, 3)),
        "track": clean(cell(row, 4)),
        "ownedState": clean(cell(row, 5)),
        "combatReady": clean(cell(row, 6)),
        "currentUpgrade": clean(cell(row, 7)),
        "minimumUpgrade": clean(cell(row, 8)),
        "recommendedUpgrade": clean(cell(row, 9)),
        "stopAt": clean(cell(row, 10)),
        "stopReason": clean(cell(row, 11)),
        "nextReview": clean(cell(row, 12)),
        "replacement": clean(cell(row, 13)),
        "survivalClass": clean(cell(row, 14)),
        "capstone": clean(cell(row, 15)),
        "resource": clean(cell(row, 16)),
        "archetypeId": clean(cell(row, 17)),
        "sourceRow": source_row,
    })

ENCOUNTER_PRESETS = []
for source_row, header, row in rowdicts("Build Encounter Presets", 2):
    pid = clean(cell(row, 0))
    if not is_id(pid):
        continue
    ENCOUNTER_PRESETS.append({
        "id": pid,
        "buildId": clean(cell(row, 1)),
        "archetype": clean(cell(row, 2)),
        "level": num(cell(row, 3)),
        "encounterType": clean(cell(row, 4)),
        "target": clean(cell(row, 5)),
        "loadout": clean(cell(row, 6)),
        "priority": num(cell(row, 7)),
        "mainWeapon": clean(cell(row, 8)),
        "mainSkill": clean(cell(row, 9)),
        "secondaryWeapon": clean(cell(row, 10)),
        "secondarySkill": clean(cell(row, 11)),
        "offhand": clean(cell(row, 12)),
        "shield": clean(cell(row, 13)),
        "armor": clean(cell(row, 14)),
        "talismans": clean(cell(row, 15)),
        "packageId": clean(cell(row, 16)),
        "physick": [clean(cell(row, 17)), clean(cell(row, 18))],
        "greatRune": clean(cell(row, 19)),
        "flask": clean(cell(row, 20)),
        "consumables": clean(cell(row, 21)),
        "sourceRow": source_row,
    })

BOSS_STRATEGIES = []
for source_row, header, row in rowdicts("Build Boss Strategies", 2):
    sid = clean(cell(row, 0))
    if not sid or not clean(cell(row, 5)) or sid == "Strategy ID":
        continue
    BOSS_STRATEGIES.append({
        "id": sid,
        "presetId": clean(cell(row, 1)),
        "buildId": clean(cell(row, 2)),
        "level": num(cell(row, 3)),
        "routeOrder": num(cell(row, 4)),
        "boss": clean(cell(row, 5)),
        "location": clean(cell(row, 6)),
        "loadout": clean(cell(row, 7)),
        "mainWeapon": clean(cell(row, 8)),
        "skill": clean(cell(row, 9)),
        "talismans": clean(cell(row, 10)),
        "packageId": clean(cell(row, 11)),
        "physick": clean(cell(row, 12)),
        "flask": clean(cell(row, 13)),
        "buffs": clean(cell(row, 14)),
        "opening": clean(cell(row, 15)),
        "phase1": clean(cell(row, 16)),
        "phase2": clean(cell(row, 17)),
        "safeClear": clean(cell(row, 18)),
        "maxDamage": clean(cell(row, 19)),
        "tool": clean(cell(row, 20)),
        "avoid": clean(cell(row, 21)),
        "sourceRow": source_row,
    })

SPELL_PACKAGES = []
for source_row, header, row in rowdicts("Build Spell Packages", 2):
    pid = clean(cell(row, 0))
    if not pid or not clean(cell(row, 4)) or not clean(cell(row, 1)):
        continue
    SPELL_PACKAGES.append({
        "id": pid,
        "buildId": clean(cell(row, 1)),
        "archetype": clean(cell(row, 2)),
        "level": num(cell(row, 3)),
        "name": clean(cell(row, 4)),
        "role": clean(cell(row, 5)),
        "modes": clean(cell(row, 6)),
        "slots": [clean(cell(row, i)) for i in range(12, 22)],
        "totalSlots": num(cell(row, 7)),
        "primaryTool": clean(cell(row, 8)),
        "supportTool": clean(cell(row, 9)),
        "preFight": clean(cell(row, 10)),
        "hardSwap": clean(cell(row, 11)),
        "sourceRow": source_row,
    })

RESOURCE_PRESETS = []
for source_row, header, row in rowdicts("Build Resource Presets", 2):
    rid = clean(cell(row, 0))
    if not rid or not clean(cell(row, 1)) or not clean(cell(row, 2)):
        continue
    RESOURCE_PRESETS.append({
        "id": rid,
        "presetId": clean(cell(row, 1)),
        "buildId": clean(cell(row, 2)),
        "level": num(cell(row, 3)),
        "target": clean(cell(row, 4)),
        "crimson": num(cell(row, 5)),
        "cerulean": num(cell(row, 6)),
        "totalFlasks": num(cell(row, 7)),
        "maxFp": num(cell(row, 8)),
        "fpPerFlask": num(cell(row, 9)),
        "fullBars": num(cell(row, 10)),
        "fpReserve": num(cell(row, 11)),
        "aura": clean(cell(row, 12)),
        "body": clean(cell(row, 13)),
        "regen": clean(cell(row, 14)),
        "weaponBuff": clean(cell(row, 15)),
        "variant": clean(cell(row, 16)),
        "fieldEffect": clean(cell(row, 17)),
        "consumables": clean(cell(row, 18)),
        "useOrder": clean(cell(row, 19)),
        "conflict": clean(cell(row, 20)),
        "risk": clean(cell(row, 21)),
        "sourceRow": source_row,
    })

BUFFS = []
for source_row, header, row in rowdicts("Build Buff Matrix", 2):
    bid = clean(cell(row, 0))
    if not is_id(bid, ["BUFF-"]):
        continue
    BUFFS.append({
        "id": bid,
        "source": clean(cell(row, 1)),
        "sourceType": clean(cell(row, 2)),
        "category": clean(cell(row, 3)),
        "effect": clean(cell(row, 4)),
        "duration": clean(cell(row, 5)),
        "recommendation": clean(cell(row, 6)),
        "conflicts": clean(cell(row, 7)),
        "stacksWith": clean(cell(row, 8)),
        "resourcePolicy": clean(cell(row, 9)),
        "sourceUrl": clean(cell(row, 10)),
        "sourceRow": source_row,
    })


# ---------------------------------------------------------------------------
# Tier lists
# ---------------------------------------------------------------------------

def parse_tier_section(title, header_index, start, end, name_key, extra_keys):
    rows = sheet("Tier Lists")
    header = rows[header_index]
    entries = []
    for row in rows[start:end]:
        rank = num(cell(row, 0))
        if rank is None:
            continue
        entry = {
            "list": title,
            "rank": int(rank),
            "tier": clean(cell(row, 1)),
            "name": clean(cell(row, 2)),
        }
        for key, index in extra_keys.items():
            entry[key] = clean(cell(row, index))
        entries.append(entry)
    return entries


TIER_LISTS = []
TIER_LISTS += parse_tier_section("Weapons", 15, 16, 410, "item", {
    "className": 3, "poolType": 4, "notes": 7,
})
TIER_LISTS += parse_tier_section("Incantations", 411, 412, 540, "item", {
    "className": 3, "poolType": 4, "notes": 7,
})
TIER_LISTS += parse_tier_section("Sorceries", 541, 542, 626, "item", {
    "className": 3, "poolType": 4, "notes": 7,
})
TIER_LISTS += parse_tier_section("Ashes of War", 627, 628, 744, "item", {
    "className": 3, "poolType": 4, "notes": 7,
})
TIER_LISTS += parse_tier_section("Crystal Tears", 745, 746, 783, "item", {
    "className": 3, "effect": 4, "duration": 5, "role": 6, "ceiling": 7, "limitation": 8,
})
TIER_LISTS += parse_tier_section("Talismans", 785, 786, 893, "item", {
    "className": 3, "poolType": 4, "notes": 7,
})

# ---------------------------------------------------------------------------
# Cross-linking: expanded linked IDs and auto-acquisition target
# ---------------------------------------------------------------------------

DOMAIN_INDEXES = {}
for name, records in {
    "COL": ITEMS,
    "ENC": ENCOUNTERS,
    "NPC": NPC_STATES,
    "DIA": DIALOGUE_EVENTS,
    "WS": WORLD_STATES,
    "TRV": TRAVERSAL,
    "RES": FINITE_RESOURCES,
    "FRM": FARMABLES,
    "MIC": MICRO_OBJECTIVES,
    "RTE": ROUTE_STEPS,
    "SUP": SUPPLEMENTAL,
    "OBJ": OBJECTIVES,
}.items():
    DOMAIN_INDEXES[name] = {record["id"]: index for index, record in enumerate(records)}


def domain_for(record_id: str):
    prefix = record_id.split("-", 1)[0]
    return prefix if prefix in DOMAIN_INDEXES else None


def expand_token(token: str):
    token = token.strip()
    if not token:
        return []
    if ":" not in token:
        return [token]
    parts = [part.strip() for part in token.split(":") if part.strip()]
    if len(parts) < 2:
        return parts
    domain = domain_for(parts[0])
    index = DOMAIN_INDEXES.get(domain, {})
    if not domain or parts[0] not in index or parts[-1] not in index:
        return parts
    start, end = index[parts[0]], index[parts[-1]]
    if start > end:
        start, end = end, start
    ordered = list(index.keys())
    return ordered[start:end + 1]


def expand_linked(raw: str):
    result = []
    for token in split_multi(raw):
        result.extend(expand_token(token))
    # Preserve order, remove duplicates.
    seen = set()
    output = []
    for record_id in result:
        if record_id not in seen:
            seen.add(record_id)
            output.append(record_id)
    return output


for step in ROUTE_STEPS:
    step["linkedIds"] = expand_linked(step["linkedRaw"])

for item in ITEMS:
    item["routeStepIds"] = [rid for rid in expand_linked(item["linkedRouteRaw"]) if rid in ROUTE_ORDER]
    item["routeStepIds"].sort(key=lambda rid: ROUTE_ORDER.get(rid, 10**9))
    item["autoStepId"] = item["routeStepIds"][-1] if item["routeStepIds"] else None
    if item["objectiveId"] and not is_id(item["objectiveId"], ["OBJ-"]):
        item["objectiveId"] = ""

for record in ENCOUNTERS:
    record["routeStepIds"] = [rid for rid in expand_linked(record.get("linkedRouteRaw", "")) if rid in ROUTE_ORDER]
    record["autoStepId"] = record["routeStepIds"][-1] if record["routeStepIds"] else None

for group in (NPC_STATES, DIALOGUE_EVENTS, WORLD_STATES, TRAVERSAL, LOCKOUTS, DEPENDENCIES):
    for record in group:
        record["routeStepIds"] = [rid for rid in expand_linked(record.get("linkedRouteRaw", "")) if rid in ROUTE_ORDER]
        record["autoStepId"] = record["routeStepIds"][-1] if record["routeStepIds"] else None

for record in FINITE_RESOURCES:
    record["routeStepIds"] = [rid for rid in expand_linked(record.get("linkedRouteRaw", "")) if rid in ROUTE_ORDER]
    record["autoStepId"] = record["routeStepIds"][-1] if record["routeStepIds"] else None

for record in MERCHANTS + SCARABS:
    record["routeStepIds"] = [rid for rid in expand_linked(record.get("linkedRouteRaw", "")) if rid in ROUTE_ORDER]
    record["autoStepId"] = record["routeStepIds"][-1] if record["routeStepIds"] else None

# Link objective/micro titles to route steps for display.
objective_by_id = {objective["id"]: objective for objective in OBJECTIVES}
for step in ROUTE_STEPS:
    objective = objective_by_id.get(step["objectiveId"])
    step["objectiveName"] = objective["name"] if objective else ""

# ---------------------------------------------------------------------------
# Integrity checks
# ---------------------------------------------------------------------------

errors = []
warnings = []


def unique_ids(records, label):
    ids = [record["id"] for record in records]
    duplicates = [key for key, count in Counter(ids).items() if count > 1]
    if duplicates:
        errors.append(f"{label}: duplicate IDs {duplicates[:10]}")
    return set(ids)


route_ids = unique_ids(ROUTE_STEPS, "route")
item_ids = unique_ids(ITEMS, "items")
enc_ids = unique_ids(ENCOUNTERS, "encounters")
npc_ids = unique_ids(NPC_STATES, "npcs")
dialogue_ids = unique_ids(DIALOGUE_EVENTS, "dialogue")
world_ids = unique_ids(WORLD_STATES, "world")
traversal_ids = unique_ids(TRAVERSAL, "traversal")
finite_ids = unique_ids(FINITE_RESOURCES, "finite")
farm_ids = unique_ids(FARMABLES, "farmables")
micro_ids = unique_ids(MICRO_OBJECTIVES, "micro")
sup_ids = unique_ids(SUPPLEMENTAL, "supplemental")
objective_ids = unique_ids(OBJECTIVES, "objectives")

unresolved = Counter()
for step in ROUTE_STEPS:
    for linked_id in step["linkedIds"]:
        if linked_id in route_ids | item_ids | enc_ids | npc_ids | dialogue_ids | world_ids | traversal_ids | finite_ids | farm_ids | micro_ids | sup_ids | objective_ids:
            continue
        unresolved[domain_for(linked_id) or linked_id.split("-", 1)[0]] += 1

if unresolved:
    warnings.append(f"Unresolved linked record IDs by domain: {dict(unresolved)}")

# Every route step must belong to an objective and appear once.
for step in ROUTE_STEPS:
    if step["objectiveId"] not in objective_ids:
        errors.append(f"route step {step['id']} references missing objective {step['objectiveId']}")

# Every item link must resolve to a route step.
for item in ITEMS:
    if item["linkedRouteRaw"] and not item["routeStepIds"]:
        warnings.append(f"item {item['id']} has a route link that did not resolve: {item['linkedRouteRaw']}")

# Micro/objective consistency.
for micro in MICRO_OBJECTIVES:
    if micro["objectiveId"] not in objective_ids:
        errors.append(f"micro {micro['id']} references missing objective {micro['objectiveId']}")

# Build links.
build_ids = {profile["id"] for profile in BUILD_PROFILES}
loadout_ids = {loadout["id"] for loadout in BUILD_LOADOUTS}
node_ids = {node["id"] for node in TECH_NODES}
for loadout in BUILD_LOADOUTS:
    if loadout["buildId"] not in build_ids:
        errors.append(f"loadout {loadout['id']} references missing build {loadout['buildId']}")
for loadout in PROGRESSION_LOADOUTS:
    if loadout["nodeId"] not in node_ids:
        errors.append(f"progression loadout {loadout['id']} references missing node {loadout['nodeId']}")
for edge in TECH_EDGES:
    if edge["from"] not in node_ids or edge["to"] not in node_ids:
        errors.append(f"edge {edge['id']} references missing node")
for strategy in BOSS_STRATEGIES:
    if strategy["buildId"] not in build_ids:
        warnings.append(f"boss strategy {strategy['id']} references missing build {strategy['buildId']}")

# Duplicate content within tier lists.
for tier in TIER_LISTS:
    if not tier["name"]:
        warnings.append(f"tier list row missing name: {tier['list']} rank {tier['rank']}")

# Counts.
route_area_counts = Counter(step["area"] for step in ROUTE_STEPS)
item_group_counts = Counter(item["group"] for item in ITEMS)
item_region_counts = Counter(item["region"] for item in ITEMS)
encounter_count = len(ENCOUNTERS)
boss_names = {strategy["boss"] for strategy in BOSS_STRATEGIES}

inventory = []
for name, rows in SHEETS.items():
    inventory.append({
        "sheet": name,
        "state": SHEET_STATES.get(name, "visible"),
        "nonEmptyRows": len(rows),
    })

integrity = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "source": {
        "file": SOURCE.name,
        "sha256": sha256(SOURCE),
        "sizeBytes": SOURCE.stat().st_size,
        "sheets": len(SHEETS),
        "visibleSheets": sum(1 for state in SHEET_STATES.values() if state == "visible"),
        "hiddenSheets": sum(1 for state in SHEET_STATES.values() if state != "visible"),
    },
    "counts": {
        "routeSteps": len(ROUTE_STEPS),
        "routeAreas": len(area_first_order),
        "objectives": len(OBJECTIVES),
        "microObjectives": len(MICRO_OBJECTIVES),
        "supplementalActions": len(SUPPLEMENTAL),
        "items": len(ITEMS),
        "itemGroups": dict(item_group_counts),
        "itemRegions": dict(item_region_counts),
        "encounters": encounter_count,
        "bossStrategyTargets": len(boss_names),
        "npcStates": len(NPC_STATES),
        "dialogueEvents": len(DIALOGUE_EVENTS),
        "worldStates": len(WORLD_STATES),
        "traversal": len(TRAVERSAL),
        "lockouts": len(LOCKOUTS),
        "dependencies": len(DEPENDENCIES),
        "knowledge": len(KNOWLEDGE),
        "lore": len(LORE),
        "decisions": len(DECISIONS),
        "endings": len(ENDINGS),
        "certifications": len(certifications),
        "journeyPlans": len(JOURNEYS),
        "remembrances": len(REMEMBRANCES),
        "trophyCues": len(TROPHY_CUES),
        "transitionGates": len(TRANSITION_GATES),
        "merchantCloseout": len(MERCHANT_CLOSEOUT),
        "farmables": len(FARMABLES),
        "materials": len(MATERIALS),
        "finiteResources": len(FINITE_RESOURCES),
        "merchants": len(MERCHANTS),
        "scarabs": len(SCARABS),
        "tierEntries": len(TIER_LISTS),
        "buildArchetypes": len(BUILD_ARCHETYPES),
        "buildProfiles": len(BUILD_PROFILES),
        "buildLoadouts": len(BUILD_LOADOUTS),
        "techNodes": len(TECH_NODES),
        "techEdges": len(TECH_EDGES),
        "progressionLoadouts": len(PROGRESSION_LOADOUTS),
        "weaponConfigs": len(WEAPON_CONFIGS),
        "upgradePlans": len(UPGRADE_PLANS),
        "encounterPresets": len(ENCOUNTER_PRESETS),
        "bossStrategies": len(BOSS_STRATEGIES),
        "spellPackages": len(SPELL_PACKAGES),
        "resourcePresets": len(RESOURCE_PRESETS),
        "buffs": len(BUFFS),
    },
    "routeAreaCounts": dict(route_area_counts),
    "errors": errors,
    "warnings": warnings[:200],
    "coverageNotes": [
        "Route Data contains 994 Act I steps. The workbook's completion ledger claims 4,477 certified route steps; the remaining route sections are not present in this export.",
        "Supplemental Content covers 116 whole-game companion actions across 47 chronology areas, including DLC and endings.",
        "Master Collectibles contains 2,105 item records; Permanent Collection contains 1,787 of those with acquisition detail. The workbook's own whole-game denominators total 1,960 persistent items across 13 categories.",
        "Build data is the certified 14-parent library plus 4 historical redirects; 28 Level-150/200 profiles and 108 loadouts.",
        "The workbook does not independently track platform achievement unlocks; ending achievements are tracked as companion execution state.",
    ],
}

# ---------------------------------------------------------------------------
# Write outputs
# ---------------------------------------------------------------------------

OUT_DIR.mkdir(parents=True, exist_ok=True)
AUDIT_DIR.mkdir(parents=True, exist_ok=True)


def write_json(name, payload):
    path = OUT_DIR / name
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    print(f"  {name:20} {path.stat().st_size / 1024:9.1f} KB", flush=True)


meta = {
    "source": integrity["source"],
    "generatedAt": integrity["generatedAt"],
    "counts": integrity["counts"],
    "coverageNotes": integrity["coverageNotes"],
    "completionUnits": COMPLETION_UNITS,
    "journeys": JOURNEYS,
    "sixFutures": SIX_FUTURES,
    "decisions": DECISIONS,
    "endings": ENDINGS,
    "certifications": certifications,
    "trophyCues": TROPHY_CUES,
    "transitionGates": TRANSITION_GATES,
    "merchantCloseout": MERCHANT_CLOSEOUT,
    "categoryDenominators": CATEGORY_DENOMINATORS,
    "remembrances": REMEMBRANCES,
    "externalResources": EXTERNAL_RESOURCES,
    "routeAreas": areas,
    "chronologyAreas": chronology_areas,
}

write_json("meta.json", meta)
write_json("route.json", {
    "areas": areas,
    "objectives": OBJECTIVES,
    "microObjectives": MICRO_OBJECTIVES,
    "steps": ROUTE_STEPS,
    "supplemental": SUPPLEMENTAL,
    "chronologyAreas": chronology_areas,
})
write_json("items.json", {"items": ITEMS})
write_json("world.json", {
    "encounters": ENCOUNTERS,
    "npcStates": NPC_STATES,
    "dialogueEvents": DIALOGUE_EVENTS,
    "worldStates": WORLD_STATES,
    "traversal": TRAVERSAL,
    "lockouts": LOCKOUTS,
    "dependencies": DEPENDENCIES,
    "knowledge": KNOWLEDGE,
})
write_json("builds.json", {
    "archetypes": BUILD_ARCHETYPES,
    "profiles": BUILD_PROFILES,
    "loadouts": BUILD_LOADOUTS,
    "techNodes": TECH_NODES,
    "techEdges": TECH_EDGES,
    "progressionLoadouts": PROGRESSION_LOADOUTS,
    "weaponConfigs": WEAPON_CONFIGS,
    "upgradePlans": UPGRADE_PLANS,
    "encounterPresets": ENCOUNTER_PRESETS,
    "bossStrategies": BOSS_STRATEGIES,
    "spellPackages": SPELL_PACKAGES,
    "resourcePresets": RESOURCE_PRESETS,
    "buffs": BUFFS,
})
write_json("farms.json", {
    "farmables": FARMABLES,
    "materials": MATERIALS,
    "finiteResources": FINITE_RESOURCES,
    "merchants": MERCHANTS,
    "scarabs": SCARABS,
})
write_json("lore.json", {"entries": LORE})
write_json("tiers.json", {"entries": TIER_LISTS})

with (AUDIT_DIR / "WORKBOOK_INVENTORY.csv").open("w", newline="", encoding="utf-8") as handle:
    writer = csv.DictWriter(handle, fieldnames=["sheet", "state", "nonEmptyRows"])
    writer.writeheader()
    writer.writerows(inventory)

with (AUDIT_DIR / "DATA_INTEGRITY.json").open("w", encoding="utf-8") as handle:
    json.dump(integrity, handle, ensure_ascii=False, indent=2)

print("\nIntegrity:")
print(json.dumps(integrity["counts"], ensure_ascii=False, indent=2))
print(f"Errors: {len(errors)} | Warnings: {len(warnings)}")
for message in errors[:20]:
    print("  ERROR", message)
for message in warnings[:20]:
    print("  WARN ", message)
print(f"\nWrote {OUT_DIR} and {AUDIT_DIR}")
