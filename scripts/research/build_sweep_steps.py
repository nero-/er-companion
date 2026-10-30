#!/usr/bin/env python3
"""Build the sweep-step ledger.

Every catalogue item must belong to a step the player can tick, but the main
route only hands out items it explicitly names. This script closes the gap by
emitting checkable sweep steps:

* ``merchants``  — one step per area listing everything sold in that area.
* ``farmables``  — one step per area listing random drops available there.
* ``pickups``    — one step per area listing loose, non-merchant acquisitions.
* ``cleanup``    — one step per phase for records whose source pack records no
                   location at all. The step says so; no place is invented.

Merchant and farmable rows come straight from ``area-sweeps.json``. Loose
pickups are the catalogue items whose recorded location matches a route area but
which no route step or sweep row already covers. Anything left over is honest
"location not recorded" data and lands in a cleanup step.

Matching is deliberately conservative: exact route-area name, or an exact
merchant/area prefix the sweep builder already established. Rows that do not
match stay in cleanup with their reason visible instead of being guessed into a
place.

Usage:
    python3 scripts/research/build_sweep_steps.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "src" / "data"

KIND_MERCHANTS = "merchants"
KIND_FARMABLES = "farmables"
KIND_PICKUPS = "pickups"
KIND_CLEANUP = "cleanup"
KIND_MATERIALS = "materials"

KIND_TITLES = {
    KIND_MERCHANTS: "Purchases in {area}",
    KIND_FARMABLES: "Farms in {area}",
    KIND_PICKUPS: "Loose pickups in {area}",
    KIND_CLEANUP: "Collection cleanup — {area}",
    KIND_MATERIALS: "Crafting stock in {area}",
}

KIND_INSTRUCTIONS = {
    KIND_MERCHANTS: (
        "Buy every listed item available in this area. Tick a row once it is in your "
        "inventory; ticks are character-wide, so buying it once clears the row here and "
        "in every other area that sells it."
    ),
    KIND_FARMABLES: (
        "Farm the listed drops from the named enemies in this area. The drop chance is the "
        "per-kill rate recorded by the source pack. Tick a row once collected; one tick "
        "satisfies every area that drops the same item."
    ),
    KIND_PICKUPS: (
        "Collect the listed loose pickups in this area. These are records the route text "
        "does not name individually; tick each one as you pick it up."
    ),
    KIND_CLEANUP: (
        "Catalogue records whose source pack records no location. They are grouped here so "
        "every item has a step; check them off from the Collection page as you confirm each "
        "one in game. No location is invented for these rows."
    ),
    KIND_MATERIALS: (
        "Gather the crafting materials whose recorded source grace is in this area. Tick a "
        "material once you hold a working stock; the Materials ledger and this step share the "
        "same state."
    ),
}

PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*%")
RANGE_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*[–-]\s*(\d+(?:\.\d+)?)\s*%")


def load(name: str) -> Any:
    with (DATA / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def write(name: str, payload: Any) -> None:
    path = DATA / name
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"  wrote {name} ({path.stat().st_size / 1024:.0f} KiB)")


def normalise(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def material_area_map(
    materials: list[dict[str, Any]],
    world: list[dict[str, Any]],
    route: dict[str, Any],
) -> dict[str, str]:
    """Map each material id to a route area, without inventing a place.

    Preference order: the material's own grace matched against a route area
    name, then the route step of that grace, then the subregion/region the grace
    belongs to when that region maps onto exactly one route area.
    """
    step_area = {step["id"]: step["area"] for step in route["steps"]}
    source_area = {step["sourceStepId"]: step["area"] for step in route["steps"]}
    area_names = {normalise(area["name"]): area["name"] for area in route["areas"]}
    grace_area: dict[str, str] = {}
    region_areas: dict[str, set[str]] = defaultdict(set)
    for entry in world:
        if entry.get("category") != "grace":
            continue
        step_id = entry.get("routeStepId") or ""
        area = step_area.get(step_id) or source_area.get(step_id)
        if not area:
            continue
        grace_area[normalise(entry["name"])] = area
        for key in {normalise(entry.get("region")), normalise(entry.get("subregion"))}:
            if key:
                region_areas[key].add(area)

    output: dict[str, str] = {}
    for material in materials:
        grace = normalise(material.get("grace"))
        area = grace_area.get(grace) or area_names.get(grace) or ""
        if not area:
            candidates = region_areas.get(grace) or set()
            if len(candidates) == 1:
                area = next(iter(candidates))
        if area:
            output[material["id"]] = area
    return output


def drop_chance(raw: str | None) -> float | None:
    """Numeric low end of a free-text drop rate, or None when not stated."""
    if not raw:
        return None
    ranged = RANGE_PERCENT.search(raw)
    if ranged:
        return float(ranged.group(1))
    single = PERCENT.search(raw)
    if single:
        return float(single.group(1))
    return None


def phase_last_area_guess(route: dict[str, Any]) -> str:
    last = route["areas"][-1]["name"]
    for area in route["areas"]:
        if not area.get("dlc"):
            last = area["name"]
    return last


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main() -> int:
    route = load("route.full.json")
    sweeps = load("area-sweeps.json")
    items = {item["id"]: item for item in load("items.full.json")["items"]}
    farms = load("farms.json")
    materials = load("materials.full.json")["entries"]
    merchants = load("merchants.full.json")["merchants"]
    world_objects = load("world.objects.json")["entries"]
    material_area = material_area_map(materials, world_objects, route)

    # ---- 1. Existing coverage: route steps + sweep rows -------------------
    route_covered: set[str] = set()
    for step in route["steps"]:
        route_covered.update(step.get("autoAcquireItemIds") or [])

    farmable_by_name: dict[str, dict[str, Any]] = {}
    for row in farms["farmables"]:
        farmable_by_name.setdefault(normalise(row["item"]), row)

    merchant_by_item: dict[str, dict[str, Any]] = {}
    for merchant in merchants:
        for row in merchant["items"]:
            merchant_by_item.setdefault(normalise(row["name"]), row)

    material_by_name = {normalise(row["name"]): row for row in materials}

    areas = [area["name"] for area in route["areas"]]
    area_set = set(areas)
    last_step_by_area: dict[str, str] = {}
    first_step_by_area: dict[str, str] = {}
    phase_by_area: dict[str, str] = {}
    game_by_area: dict[str, str] = {}
    dlc_by_area: dict[str, bool] = {}
    section_by_area: dict[str, str] = {}
    area_order: dict[str, int] = {}
    for step in route["steps"]:
        last_step_by_area[step["area"]] = step["id"]
        first_step_by_area.setdefault(step["area"], step["id"])
        phase_by_area[step["area"]] = step["phase"]
        game_by_area[step["area"]] = step["game"]
        dlc_by_area[step["area"]] = bool(step["dlc"])
        section_by_area[step["area"]] = step["sectionId"]
    for area in route["areas"]:
        area_order[area["name"]] = area["order"]

    sweep_by_area = {row["area"]: row for row in sweeps["areas"]}

    # Sweep rows already published by the area sweep builder.
    swept_items: set[str] = set()
    for row in sweeps["areas"]:
        for merchant in row["merchants"]:
            for item in merchant["items"]:
                if item.get("itemId"):
                    swept_items.add(item["itemId"])
        for item in row["farmables"]:
            if item.get("itemId"):
                swept_items.add(item["itemId"])
        for item in row["unlinkedItems"]:
            if item.get("itemId"):
                swept_items.add(item["itemId"])

    steps: list[dict[str, Any]] = []
    order = 0

    def push(area: str, kind: str, entries: list[dict[str, Any]], extra: str = "") -> None:
        nonlocal order
        if not entries:
            return
        order += 1
        title = KIND_TITLES[kind].format(area=area)
        anchor = first_step_by_area[area] if kind == KIND_CLEANUP else last_step_by_area[area]
        steps.append(
            {
                "id": f"SWEEP-{slug(area)}-{kind}",
                "afterStepId": anchor,
                "order": order,
                "area": area,
                "sectionId": section_by_area[area],
                "phase": phase_by_area[area],
                "game": game_by_area[area],
                "dlc": dlc_by_area[area],
                "kind": kind,
                "title": title,
                "instruction": KIND_INSTRUCTIONS[kind] + extra,
                "entries": entries,
                "sourceUrl": "https://eldenring.redmaw.dev/sheets/",
            }
        )

    # ---- 2. Area steps from the published sweeps --------------------------
    for area in areas:
        row = sweep_by_area.get(area)
        if not row:
            continue
        merchant_entries: list[dict[str, Any]] = []
        seen_merchant: set[str] = set()
        for merchant in row["merchants"]:
            for item in merchant["items"]:
                key = item.get("itemId") or f"{merchant['merchant']}|{item['itemName']}"
                if key in seen_merchant:
                    continue
                seen_merchant.add(key)
                merchant_entries.append(
                    {
                        "itemId": item.get("itemId") or "",
                        "purchaseId": item["id"],
                        "name": item["itemName"],
                        "source": merchant["merchant"],
                        "dropRate": "",
                        "quantity": 1,
                        "stock": item.get("stock") or "",
                        "price": item.get("price") or 0,
                    }
                )
        push(area, KIND_MERCHANTS, merchant_entries)

        farm_entries: list[dict[str, Any]] = []
        seen_farm: set[str] = set()
        for farm in row["farmables"]:
            key = farm.get("itemId") or farm["name"]
            if key in seen_farm:
                continue
            seen_farm.add(key)
            record = farmable_by_name.get(normalise(farm["name"]), {})
            farm_entries.append(
                {
                    "itemId": farm.get("itemId") or "",
                    "farmId": farm["id"],
                    "name": farm["name"],
                    "source": farm.get("source") or "",
                    "dropRate": record.get("dropRate") or "",
                    "quantity": max(1, int(farm.get("targetQuantity") or 1)),
                    "stock": "",
                    "price": 0,
                }
            )
        push(area, KIND_FARMABLES, farm_entries)

        pickup_entries: list[dict[str, Any]] = []
        seen_pickup: set[str] = set()
        for picked in row["unlinkedItems"]:
            key = picked.get("itemId") or picked["name"]
            if key in seen_pickup:
                continue
            seen_pickup.add(key)
            pickup_entries.append(
                {
                    "itemId": picked.get("itemId") or "",
                    "name": picked["name"],
                    "source": picked.get("location") or picked.get("acquisitionType") or "",
                    "dropRate": "",
                    "quantity": 1,
                    "stock": "",
                    "price": 0,
                }
            )

        # Catalogue items whose recorded location names this area but which no
        # route step or published sweep row covers yet.
        for item_id, item in items.items():
            if item_id in route_covered or item_id in swept_items or item_id in seen_pickup:
                continue
            location = item.get("location") or ""
            if not location:
                continue
            if normalise(location) != normalise(area):
                continue
            seen_pickup.add(item_id)
            pickup_entries.append(
                {
                    "itemId": item_id,
                    "name": item["name"],
                    "source": item.get("acquisitionType") or location,
                    "dropRate": "",
                    "quantity": 1,
                    "stock": "",
                    "price": 0,
                }
            )
        push(area, KIND_PICKUPS, pickup_entries)

        material_entries: list[dict[str, Any]] = []
        for material in materials:
            if material.get("obtainable") is False:
                continue
            if material_area.get(material["id"]) != area:
                continue
            material_entries.append(
                {
                    "itemId": "",
                    "materialId": material["id"],
                    "name": material["name"],
                    "source": material.get("earlySource") or material.get("grace") or "",
                    "dropRate": "",
                    "quantity": 1,
                    "stock": "",
                    "price": 0,
                }
            )
        if material_entries:
            material_entries.sort(key=lambda row: normalise(row["name"]))
            order += 1
            steps.append(
                {
                    "id": f"SWEEP-{slug(area)}-materials",
                    "afterStepId": last_step_by_area[area],
                    "order": order,
                    "area": area,
                    "sectionId": section_by_area[area],
                    "phase": phase_by_area[area],
                    "game": game_by_area[area],
                    "dlc": dlc_by_area[area],
                    "kind": KIND_MATERIALS,
                    "title": f"Crafting stock in {area}",
                    "instruction": KIND_INSTRUCTIONS[KIND_MATERIALS],
                    "entries": material_entries,
                    "sourceUrl": "https://eldenring.wiki.gg/wiki/Crafting_Materials",
                }
            )

    # Renewable materials whose source grace is not inside a route area (vendor
    # stock, respawning nodes in optional side ruins). They still get a step so
    # nothing is untracked, and each row states that it is renewable.
    placed_material_ids = {
        entry["materialId"]
        for step in steps
        for entry in step["entries"]
        if entry.get("materialId")
    }
    renewable = [
        material
        for material in materials
        if material.get("obtainable") is not False and material["id"] not in placed_material_ids
    ]
    if renewable:
        order += 1
        # Vendors and the Roundtable open early, so the renewable list sits with
        # the first playable area rather than the end of the route.
        anchor_area = "Roundtable Hold" if "Roundtable Hold" in area_set else areas[0]
        entries = [
            {
                "itemId": "",
                "materialId": material["id"],
                "name": material["name"],
                "source": material.get("earlySource")
                or material.get("merchant")
                or material.get("grace")
                or "",
                "dropRate": "",
                "quantity": 1,
                "stock": "",
                "price": 0,
                "renewable": material.get("renewability") or "",
            }
            for material in sorted(renewable, key=lambda row: normalise(row["name"]))
        ]
        steps.append(
            {
                "id": "SWEEP-renewable-materials",
                "afterStepId": last_step_by_area.get(anchor_area) or last_step_by_area[areas[-1]],
                "order": order,
                "area": anchor_area,
                "sectionId": section_by_area.get(anchor_area) or "",
                "phase": phase_by_area.get(anchor_area) or "Base Game \u2014 through Maliketh",
                "game": game_by_area.get(anchor_area) or "Base Game",
                "dlc": dlc_by_area.get(anchor_area) or False,
                "kind": KIND_MATERIALS,
                "title": "Crafting stock \u2014 vendors and renewable sources",
                "instruction": (
                    "These materials have no single fixed pickup: they come from unlimited vendor "
                    "stock or respawning nodes outside the ordered route. Stock them whenever a "
                    "vendor or node is convenient; the Materials ledger shares this state."
                ),
                "entries": entries,
                "sourceUrl": "https://eldenring.wiki.gg/wiki/Crafting_Materials",
            }
        )

    # ---- 3. Cleanup steps for records without a location -----------------
    assigned: set[str] = set()
    for step in steps:
        for entry in step["entries"]:
            if entry["itemId"]:
                assigned.add(entry["itemId"])

    unplaced: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item_id, item in items.items():
        if item_id in route_covered or item_id in assigned:
            continue
        phase = "Base Game — through Maliketh" if not item.get("game") == "Shadow of the Erdtree" else "Shadow of the Erdtree"
        # Prefer the item's own phase when its region names one.
        region = item.get("region") or ""
        if region in area_set:
            phase = phase_by_area[region]
        elif region == "Shadow of the Erdtree":
            phase = "Shadow of the Erdtree"
        elif region == "Base Game":
            phase = "Base Game — through Maliketh"
        elif region == "Tarnished Pack":
            phase = "Base Game — endgame"
        farm = farmable_by_name.get(normalise(item["name"]))
        merchant = merchant_by_item.get(normalise(item["name"]))
        source = ""
        drop = ""
        if merchant:
            source = f"Sold by {merchant.get('merchant', '')}".strip()
        elif farm:
            source = farm.get("source") or ""
            drop = farm.get("dropRate") or ""
        elif normalise(item["name"]) in material_by_name:
            material = material_by_name[normalise(item["name"])]
            source = material.get("earlySource") or material.get("grace") or ""
        unplaced[phase].append(
            {
                "itemId": item_id,
                "name": item["name"],
                "source": source or (item.get("acquisitionType") or "Location not recorded"),
                "dropRate": drop,
                "quantity": 1,
                "stock": "",
                "price": 0,
            }
        )

    cleanup_area_by_phase = {
        "Base Game — through Maliketh": "Starting Out",
        "Shadow of the Erdtree": "Shadow of the Erdtree — Enir-Ilim",
        "Base Game — endgame": "Crumbling Farum Azula",
    }
    # Anchor cleanup at the last route area of each phase so it never precedes
    # content the player has not reached yet.
    phase_last_area: dict[str, str] = {}
    for area in route["areas"]:
        phase_last_area[area["phase"]] = area["name"]

    # Cleanup lists are split by acquisition mode so a step stays a usable
    # checklist instead of one 600-row wall.
    CLEANUP_CHUNK = 140
    CLEANUP_GROUPS = (
        ("merchant", "purchases"),
        ("drop", "farms"),
        ("pickup", "pickups"),
    )

    def cleanup_group(entry: dict[str, Any]) -> str:
        source = entry["source"].lower()
        if source.startswith("sold by"):
            return "merchant"
        if entry["dropRate"]:
            return "drop"
        return "pickup"

    for phase, entries in unplaced.items():
        anchor_area = phase_last_area.get(phase) or cleanup_area_by_phase.get(phase) or "Starting Out"
        for group_key, group_label in CLEANUP_GROUPS:
            grouped = [entry for entry in entries if cleanup_group(entry) == group_key]
            grouped.sort(key=lambda row: normalise(row["name"]))
            for index in range(0, len(grouped), CLEANUP_CHUNK):
                chunk = grouped[index : index + CLEANUP_CHUNK]
                order += 1
                part = index // CLEANUP_CHUNK + 1
                total_parts = (len(grouped) + CLEANUP_CHUNK - 1) // CLEANUP_CHUNK
                suffix = f" {part}/{total_parts}" if total_parts > 1 else ""
                steps.append(
                    {
                        "id": f"SWEEP-cleanup-{slug(phase)}-{group_key}-{part}",
                        "afterStepId": last_step_by_area[anchor_area],
                        "order": order,
                        "area": anchor_area,
                        "sectionId": section_by_area[anchor_area],
                        "phase": phase,
                        "game": "Shadow of the Erdtree" if phase == "Shadow of the Erdtree" else "Base Game",
                        "dlc": phase == "Shadow of the Erdtree",
                        "kind": KIND_CLEANUP,
                        "title": f"Collection cleanup — {phase} {group_label}{suffix}",
                        "instruction": KIND_INSTRUCTIONS[KIND_CLEANUP],
                        "entries": chunk,
                        "sourceUrl": "https://eldenring.redmaw.dev/sheets/",
                    }
                )

    # ---- 4. Coverage accounting -----------------------------------------
    covered: set[str] = set(route_covered)
    for step in steps:
        for entry in step["entries"]:
            if entry["itemId"]:
                covered.add(entry["itemId"])

    uncovered = sorted(set(items) - covered)
    assert not uncovered, f"{len(uncovered)} catalogue items have no step, e.g. {uncovered[:5]}"

    placed_materials = {
        entry["materialId"]
        for step in steps
        for entry in step["entries"]
        if entry.get("materialId")
    }
    farm_only_materials = sorted(
        material["id"]
        for material in materials
        if material.get("obtainable") is not False and material["id"] not in placed_materials
    )

    counts: dict[str, Any] = {
        "steps": len(steps),
        "entries": sum(len(step["entries"]) for step in steps),
        "byKind": dict(
            sorted(
                {
                    kind: sum(1 for step in steps if step["kind"] == kind)
                    for kind in (KIND_MERCHANTS, KIND_FARMABLES, KIND_PICKUPS, KIND_MATERIALS, KIND_CLEANUP)
                }.items()
            )
        ),
        "entriesByKind": dict(
            sorted(
                {
                    kind: sum(len(step["entries"]) for step in steps if step["kind"] == kind)
                    for kind in (KIND_MERCHANTS, KIND_FARMABLES, KIND_PICKUPS, KIND_MATERIALS, KIND_CLEANUP)
                }.items()
            )
        ),
        "catalogue": len(items),
        "routeLinked": len(route_covered),
        "sweepLinked": len(covered - route_covered),
        "uncovered": 0,
        "materials": len(materials),
        "materialsPlaced": len(placed_materials),
        "materialsFarmOnly": len(farm_only_materials),
        "withDropChance": sum(
            1
            for step in steps
            for entry in step["entries"]
            if drop_chance(entry["dropRate"]) is not None
        ),
    }

    write(
        "sweep-steps.json",
        {
            "source": "area-sweeps.json + items.full.json + farms.json",
            "method": (
                "Area sweep rows become checkable steps; catalogue items whose recorded "
                "location names a route area become loose pickups; every remaining record "
                "lands in a phase cleanup step and keeps its 'location not recorded' status."
            ),
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "counts": counts,
            "steps": steps,
        },
    )

    print(
        f"  {counts['steps']} sweep steps / {counts['entries']} entries "
        f"covering {counts['catalogue']} catalogue items"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
