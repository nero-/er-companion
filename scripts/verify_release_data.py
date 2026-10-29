#!/usr/bin/env python3
"""Validate the additive release data against the canonical catalogs.

Read-only. Exits non-zero on a contract violation so the release gate can fail
before a build. Counts are recomputed from the files, never trusted from prose.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"

errors: list[str] = []
warnings: list[str] = []


def load(name: str):
    path = DATA / name
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        errors.append(f"{name}: missing")
    except json.JSONDecodeError as exc:
        errors.append(f"{name}: invalid JSON ({exc})")
    return None


route = load("route.full.json")
items = load("items.full.json")
bosses = load("bosses.full.json")
questlines = load("questlines.json")
meta = load("meta.json")
merchants = load("merchants.full.json")
farms = load("farms.json")
materials = load("materials.full.json")
world = load("world.objects.json")
tiers = load("tiers.json")
branch = load("branch-plan.json")
descriptions = load("descriptions.json")
sweeps = load("area-sweeps.json")
lore_expanded = load("lore.expanded.json")
quest_map = load("questline-route-map.json")
remembrance = load("remembrance-plan.json")
lore = load("lore.json")

if errors:
    print("\n".join(errors))
    sys.exit(1)

route_steps = {row["id"] for row in route["steps"]}
route_areas = {row["name"] for row in route["areas"]}
item_ids = {row["id"] for row in items["items"]}
item_names = {row["name"] for row in items["items"]}
quest_steps = {step["id"] for line in questlines["questlines"] for step in line["steps"]}
remembrance_ids = {row["id"] for row in meta["remembrances"]}

# --- Descriptions ---------------------------------------------------------
counts = descriptions.get("counts", {})
for bucket in ("items", "bosses", "npcs", "areas"):
    entries = descriptions.get(bucket, {})
    if counts.get(bucket) != len(entries):
        errors.append(f"descriptions.{bucket}: count says {counts.get(bucket)}, file has {len(entries)}")
    for key, entry in entries.items():
        if not isinstance(entry, dict) or not entry.get("text", "").strip():
            errors.append(f"descriptions.{bucket}.{key}: empty text")
        elif not entry.get("sourceUrl"):
            warnings.append(f"descriptions.{bucket}.{key}: no sourceUrl")
item_desc = descriptions.get("items", {})
if len(item_desc) < len(item_ids) * 0.6:
    warnings.append(
        f"descriptions.items: only {len(item_desc)}/{len(item_ids)} items have text"
    )
for key, entry in item_desc.items():
    text = entry.get("text", "")
    if len(text) < 12:
        warnings.append(f"descriptions.items.{key}: suspiciously short text")
    lowered = text.lower()
    # Route instructions leaked into item lore by an early acquisition-text
    # fallback. Genuine item text can start with "Head covering…", so match
    # walkthrough verbs rather than bare nouns.
    if any(
        lowered.startswith(prefix)
        for prefix in (
            "pick up ",
            "go back ",
            "go to ",
            "head south",
            "head north",
            "head east",
            "head west",
            "return to ",
            "travel to ",
            "reload the area",
            "take the lift ",
            "drop down ",
        )
    ):
        errors.append(f"descriptions.items.{key}: route instruction leaked into item lore")
for key in descriptions.get("items", {}):
    if key not in item_ids:
        warnings.append(f"descriptions.items: unknown item id {key}")
for key in descriptions.get("bosses", {}):
    if key not in {row["id"] for row in bosses["encounters"]}:
        warnings.append(f"descriptions.bosses: unknown boss id {key}")

# --- Area sweeps ---------------------------------------------------------
sweep_areas = sweeps.get("areas", [])
seen_areas: set[str] = set()
totals = {"merchantItems": 0, "farmables": 0, "unlinkedItems": 0, "materials": 0}
for sweep in sweep_areas:
    area = sweep.get("area", "")
    if area in seen_areas:
        errors.append(f"area-sweeps: duplicate area {area}")
    seen_areas.add(area)
    if area not in route_areas:
        errors.append(f"area-sweeps: {area} is not a route area")
    merchant_items = [item for group in sweep.get("merchants", []) for item in group.get("items", [])]
    totals["merchantItems"] += len(merchant_items)
    totals["farmables"] += len(sweep.get("farmables", []))
    totals["unlinkedItems"] += len(sweep.get("unlinkedItems", []))
    totals["materials"] += len(sweep.get("materials", []))
    for item in merchant_items:
        if item.get("itemId") and item["itemId"] not in item_ids:
            errors.append(f"area-sweeps: {area} merchant item unknown id {item['itemId']}")
        if item.get("name") and item["name"] not in item_names:
            warnings.append(f"area-sweeps: {area} merchant item not in catalog: {item['name']}")
    for item in sweep.get("unlinkedItems", []):
        if item.get("itemId") not in item_ids:
            errors.append(f"area-sweeps: {area} unlinked item unknown id {item.get('itemId')}")
    for farm in sweep.get("farmables", []):
        if not farm.get("name"):
            errors.append(f"area-sweeps: {area} farmable without name")
missing_areas = sorted(route_areas - seen_areas)
if missing_areas:
    warnings.append(f"area-sweeps: {len(missing_areas)} route areas absent")
coverage = sweeps.get("coverage", {})
if coverage.get("routeAreas") != len(route_areas):
    errors.append(f"area-sweeps.coverage.routeAreas: {coverage.get('routeAreas')} != {len(route_areas)}")
expected_with_sweep = sum(
    1
    for sweep in sweep_areas
    if any(
        sweep.get("counts", {}).get(key, 0)
        for key in ("merchantItems", "farmables", "unlinkedItems", "materials")
    )
)
if coverage.get("areasWithSweep") != expected_with_sweep:
    errors.append(
        f"area-sweeps.coverage.areasWithSweep: {coverage.get('areasWithSweep')} != {expected_with_sweep}"
    )
for key, value in totals.items():
    if coverage.get(key) != value:
        errors.append(f"area-sweeps.coverage.{key}: {coverage.get(key)} != recomputed {value}")

# --- Questline route map -------------------------------------------------
links = quest_map.get("links", {})
confidence = {"high": 0, "medium": 0, "low": 0}
for key, link in links.items():
    if key not in quest_steps:
        errors.append(f"questline-route-map: unknown quest step {key}")
    if link.get("routeStepId") not in route_steps:
        errors.append(f"questline-route-map: {key} -> unknown route step {link.get('routeStepId')}")
    level = link.get("confidence")
    if level not in confidence:
        errors.append(f"questline-route-map: {key} has invalid confidence {level}")
    else:
        confidence[level] += 1
qm_coverage = quest_map.get("coverage", {})
if qm_coverage.get("steps") != len(quest_steps):
    errors.append(f"questline-route-map.coverage.steps: {qm_coverage.get('steps')} != {len(quest_steps)}")
if qm_coverage.get("linked") != len(links):
    errors.append(f"questline-route-map.coverage.linked: {qm_coverage.get('linked')} != {len(links)}")
for level, value in confidence.items():
    if qm_coverage.get(level) != value:
        errors.append(f"questline-route-map.coverage.{level}: {qm_coverage.get(level)} != {value}")

# --- Remembrance plan ----------------------------------------------------
plan = remembrance.get("entries", [])
plan_ids = [entry.get("remembranceId") for entry in plan]
if len(plan_ids) != len(set(plan_ids)):
    errors.append("remembrance-plan: duplicate remembrance ids")
for entry in plan:
    if entry.get("remembranceId") not in remembrance_ids:
        errors.append(f"remembrance-plan: unknown remembrance {entry.get('remembranceId')}")
    for step_id in entry.get("routeStepIds", []):
        if step_id not in route_steps:
            errors.append(f"remembrance-plan: {entry.get('remembranceId')} unknown route step {step_id}")
if len(plan) < 24:
    warnings.append(f"remembrance-plan: only {len(plan)} entries; expected the full ordered list")
orders = [entry.get("order") for entry in plan]
if orders != sorted(orders):
    warnings.append("remembrance-plan: entries are not sorted by order")

# --- Branch anchors ------------------------------------------------------
for decision in branch.get("decisions", []):
    for step_id in decision.get("routeStepIds", []):
        if step_id not in route_steps:
            errors.append(f"branch-plan: {decision.get('decisionId')} unknown route step {step_id}")

# --- Tier links ----------------------------------------------------------
tier_rows = tiers.get("entries", [])
for entry in tier_rows:
    url = entry.get("wikiUrl")
    if url:
        if not url.startswith("https://eldenring.wiki.gg/wiki/"):
            errors.append(f"tiers: {entry.get('name')} has unexpected wiki URL {url}")
    else:
        warnings.append(f"tiers: {entry.get('name')} has no wikiUrl")
required = {
    "Leontiel's Greatsword": "broken",
    "Reed Great Katana": "s",
    "Reverse Bladed Swords (Lightning)": "a",
    "Itinerant Sword": "a",
    "Hefty Scimitar": "b",
    "Golden Order Flail": "b",
}
by_name = {row["name"]: row for row in tier_rows if row.get("list") == "Weapons"}
for name, tier in required.items():
    row = by_name.get(name)
    if not row:
        errors.append(f"tiers: missing required 1.17 weapon {name}")
    elif str(row.get("tier", "")).lower().removesuffix("-tier") != tier:
        errors.append(f"tiers: {name} is {row.get('tier')}, expected {tier}")

# --- Expanded lore -------------------------------------------------------
expanded = lore_expanded.get("entries", {})
lore_ids = {entry["id"] for entry in lore["entries"]}
for key, entry in expanded.items():
    if key not in lore_ids:
        errors.append(f"lore.expanded: unknown lore id {key}")
    if len(entry.get("overview", "")) < 40:
        warnings.append(f"lore.expanded: {key} overview shorter than 40 chars")

# --- Summary -------------------------------------------------------------
print("release-data validation")
print(f"  descriptions: {counts}")
print(f"  area sweeps : {len(sweep_areas)} areas / {totals}")
print(f"  quest links : {len(links)} / {len(quest_steps)} steps ({confidence})")
print(f"  remembrance : {len(plan)} entries")
print(f"  expanded    : {len(expanded)} lore entries")
print(f"  tiers       : {len(tier_rows)} entries")
print(f"  warnings    : {len(warnings)}")
for warning in warnings[:25]:
    print(f"    ! {warning}")
if len(warnings) > 25:
    print(f"    ! ... {len(warnings) - 25} more warnings")
print(f"  errors      : {len(errors)}")
for error in errors[:40]:
    print(f"    x {error}")
if errors:
    sys.exit(1)
print("OK")
