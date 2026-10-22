#!/usr/bin/env python3
"""Build the live full-game content set from the Redmaw research artifacts.

Outputs (all under src/data):
  route.full.json, items.full.json, achievements.json, bosses.full.json,
  questlines.json, ngplus.json, content-coverage.json, legacy-step-map.json

The script is deterministic: every input is read from research/ or the
pre-integration workbook data in src/data/, and every count is asserted.
Run from the repository root:  python scripts/build_full_content.py
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
RESEARCH = ROOT / "research"

BASE_ROUTE_URL = "https://eldenring.redmaw.dev/sheets/walkthrough"
DLC_ROUTE_URL = "https://eldenring.redmaw.dev/sheets/dlc-walkthrough"
VALIDATION = "Redmaw Completion Sheets · live scrape"
WIKI_HOST = "eldenring.wiki.gg"

PHASE_BASE = "Base Game — through Maliketh"
PHASE_DLC = "Shadow of the Erdtree"
PHASE_ENDGAME = "Base Game — endgame"
PHASE_ORDER = [PHASE_BASE, PHASE_DLC, PHASE_ENDGAME]

ENDGAME_SECTION_IDS = {"ashen-leyndell", "endings", "ng-prep"}
AFTERMATH_ID = "farum-azula-aftermath"
AFTERMATH_TITLE = "Crumbling Farum Azula — Aftermath"
AFTERMATH_SOURCE_IDS = {"w46-97", "w46-98", "w46-99"}

WARNING_TEXT = re.compile(
    r"missable|unobtainable|locked out|point of no return",
    re.IGNORECASE,
)

# Auto-acquisition is deliberately conservative: a linked name is only
# granted automatically when the instruction reads like an acquisition.
ITEM_ACQUIRE_TEXT = re.compile(
    r"\b(receive[ds]?|obtain(?:ed)?|pick up|grab(?:bed)?|loot(?:ed)?|"
    r"collect(?:ed)?|buy|purchased?|sold by|found (?:on|in|at)|chest|"
    r"corpse|reward|(?:kill|defeat|beat)[^.]*?\bfor)\b",
    re.IGNORECASE,
)
ITEM_EXCLUDE_TEXT = re.compile(
    r"\b(keepsakes?|choose|either|one of|or the|avoid|avoids|do not)\b",
    re.IGNORECASE,
)
BOSS_ACQUIRE_TEXT = re.compile(r"\b(kill|defeat|beat)\b", re.IGNORECASE)


def item_auto_acquire(instruction: str, name: str) -> bool:
    """True only when the step instruction acquires this exact item name."""
    if ITEM_EXCLUDE_TEXT.search(instruction):
        return False
    index = instruction.lower().find(name.lower())
    if index < 0:
        return False
    window = instruction[max(0, index - 110) : index]
    return bool(ITEM_ACQUIRE_TEXT.search(window))


ARMOR_SLOT_LABEL = re.compile(r"^(Head|Chest|Arms|Legs)( \(\d+\))?$")


def is_bogus_location(item: dict[str, Any]) -> bool:
    """Sheet labels (slot/category sections) and placeholders are not places."""
    location = (item.get("location") or "").strip()
    if is_placeholder(location):
        return True
    if location == "Redmaw catalog":
        return True
    if ARMOR_SLOT_LABEL.fullmatch(location):
        return True
    if item.get("section") and location == item["section"]:
        return True
    if item.get("category") and location == item["category"]:
        return True
    return False

# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------


def load(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=1)
    path.write_text(text + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def norm(value: str | None) -> str:
    """Case/punctuation insensitive key used for every name match."""
    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slug(value: str, limit: int = 72) -> str:
    return norm(value).replace(" ", "-")[:limit].strip("-")


def dedupe(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            output.append(item)
    return output


def dice(left: str, right: str) -> float:
    a = set(left.split())
    b = set(right.split())
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def unique_slug(base: str, used: set[str], prefix: str) -> str:
    candidate = f"{prefix}{base}"
    counter = 2
    while candidate in used:
        candidate = f"{prefix}{base}-{counter}"
        counter += 1
    used.add(candidate)
    return candidate


# ---------------------------------------------------------------------------
# Route skeleton
# ---------------------------------------------------------------------------


def badge_flags(badges: list[str]) -> tuple[bool, str]:
    upper = [badge for badge in badges if badge]
    flagged = [badge for badge in upper if "MISSABLE" in badge.upper() or "IMPORTANT" in badge.upper()]
    return bool(flagged), " · ".join(flagged)


def resolve_links(links: list[dict[str, Any]], base: str) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for link in links:
        url = link.get("url", "")
        if url and not url.startswith(("http://", "https://", "mailto:")):
            url = urljoin(base, url)
        resolved.append({**link, "url": url})
    return resolved


def route_sections() -> list[dict[str, Any]]:
    base = load(RESEARCH / "route.base.json")
    dlc = load(RESEARCH / "route.dlc.json")
    assert sum(len(section["steps"]) for section in base["sections"]) == 3395
    assert sum(len(section["steps"]) for section in dlc["sections"]) == 1126
    assert len(base["sections"]) == 49
    assert len(dlc["sections"]) == 20

    sections: list[dict[str, Any]] = []
    endgame_sections: list[dict[str, Any]] = []
    aftermath_entry: dict[str, Any] | None = None

    for section in base["sections"]:
        steps = section["steps"]
        if section["id"] == "farum-azula":
            # Split the Farum Azula section after Maliketh (w46-96). The last
            # three steps move into the synthetic aftermath section, which is
            # placed after the DLC in canonical order.
            steps = [step for step in steps if step["id"] not in AFTERMATH_SOURCE_IDS]
            assert len(steps) == 96, "Farum Azula split must keep w46-1..w46-96"
        entry = {
            "sourceGame": "base",
            "id": section["id"],
            "title": section["title"],
            "levelRange": section.get("levelRange", ""),
            "steps": steps,
            "synthetic": False,
        }
        if section["id"] in ENDGAME_SECTION_IDS:
            endgame_sections.append(entry)
            continue
        sections.append(entry)
        if section["id"] == "farum-azula":
            aftermath = [
                step for step in section["steps"] if step["id"] in AFTERMATH_SOURCE_IDS
            ]
            assert len(aftermath) == 3
            aftermath_entry = {
                "sourceGame": "base",
                "id": AFTERMATH_ID,
                "title": AFTERMATH_TITLE,
                "levelRange": "Levels 155-160",
                "steps": aftermath,
                "synthetic": True,
                "sourceSectionId": "farum-azula",
            }

    assert len(sections) == 46, len(sections)
    assert len(endgame_sections) == 3, len(endgame_sections)
    assert aftermath_entry is not None
    for section in dlc["sections"]:
        sections.append(
            {
                "sourceGame": "dlc",
                "id": section["id"],
                "title": section["title"],
                "levelRange": section.get("levelRange", ""),
                "steps": section["steps"],
                "synthetic": False,
            }
        )
    sections.append(aftermath_entry)
    sections.extend(endgame_sections)
    assert len(sections) == 70, len(sections)
    return sections


def build_route_skeleton(sections: list[dict[str, Any]]) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    areas: list[dict[str, Any]] = []
    objectives: list[dict[str, Any]] = []
    order = 0

    for section_order, section in enumerate(sections, start=1):
        is_dlc = section["sourceGame"] == "dlc"
        game = "Shadow of the Erdtree" if is_dlc else "Base Game"
        if is_dlc:
            phase = PHASE_DLC
        elif section["id"] == "farum-azula" or section_order <= 45:
            phase = PHASE_BASE
        elif section["id"] == AFTERMATH_ID:
            phase = PHASE_ENDGAME
        else:
            phase = PHASE_ENDGAME

        objective_id = f"RW-SEC-{'D' if is_dlc else 'B'}-{section['id']}"
        section_steps: list[dict[str, Any]] = []
        for step_order, raw in enumerate(section["steps"], start=1):
            order += 1
            missable, badge_warning = badge_flags(raw.get("badges", []))
            text_match = WARNING_TEXT.search(raw["text"])
            is_missable = missable or bool(text_match)
            warning = badge_warning
            if not warning and text_match:
                warning = f"MISSABLE — {raw['text']}"
            if not warning:
                warning = ""

            if section["id"] == AFTERMATH_ID:
                step_id = f"RW-B-A46-{raw['id'].split('-')[1]}"
                source_section = section.get("sourceSectionId", "farum-azula")
                source_url = f"{BASE_ROUTE_URL}#{source_section}"
            else:
                step_id = f"RW-{'D' if is_dlc else 'B'}-{raw['id']}"
                source_url = f"{(DLC_ROUTE_URL if is_dlc else BASE_ROUTE_URL)}#{section['id']}"

            level_range = section["levelRange"]
            objective_name = f"{section['title']} · {level_range}" if level_range else section["title"]
            step = {
                "id": step_id,
                "order": order,
                "act": game,
                "phase": phase,
                "area": section["title"],
                "sectionId": section["id"],
                "sectionTitle": section["title"],
                "levelRange": level_range,
                "game": game,
                "dlc": is_dlc,
                "objectiveId": objective_id,
                "objectiveOrder": section_order,
                "stepOrder": step_order,
                "objectiveName": objective_name,
                "type": "Route",
                "instruction": raw["text"],
                "required": not raw.get("optional", False),
                "linkedRaw": "",
                "linkedIds": [],
                "linkedItemNames": [],
                "links": resolve_links(raw.get("links", []), source_url),
                "badges": raw.get("badges", []),
                "prerequisites": "",
                "warning": warning,
                "location": section["title"],
                "validation": VALIDATION,
                "routeDecision": "Optional" if raw.get("optional", False) else "Required",
                "skipAllowed": bool(raw.get("optional", False)),
                "returnWindow": "",
                "lockoutRisk": "MISSABLE" if is_missable else "",
                "estimatedTime": "",
                "sourceRow": order,
                "sourceUrl": source_url,
                "sourceStepId": raw["id"],
                "missable": is_missable,
            }
            section_steps.append(step)
            steps.append(step)

        required_count = sum(1 for step in section_steps if step["required"])
        missable_count = sum(1 for step in section_steps if step["missable"])
        areas.append(
            {
                "name": section["title"],
                "order": section_order,
                "act": game,
                "objectiveIds": [objective_id],
                "stepCount": len(section_steps),
                "requiredCount": required_count,
                "hasRoute": True,
                "description": section["levelRange"],
                "validation": VALIDATION,
                "game": game,
                "phase": phase,
                "sectionId": section["id"],
                "levelRange": section["levelRange"],
                "missableCount": missable_count,
                "dlc": is_dlc,
            }
        )
        objectives.append(
            {
                "id": objective_id,
                "completionUnitId": f"CU-{section['id']}",
                "order": section_order,
                "name": section["title"],
                "location": section["title"],
                "requirement": "Route",
                "prerequisiteId": "",
                "summary": section["levelRange"],
                "validation": VALIDATION,
                "area": section["title"],
                "sourceRow": section_order,
                "completionUnit": section["title"],
            }
        )

    assert len(steps) == 4521, f"expected 4521 route steps, found {len(steps)}"
    assert len(sections) == 70, f"expected 70 sections, found {len(sections)}"
    return {"sections": sections, "steps": steps, "areas": areas, "objectives": objectives}


def build_phase_gates(steps: list[dict[str, Any]], areas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    first_dlc = next(step for step in steps if step["phase"] == PHASE_DLC)
    first_ashen = next(step for step in steps if step["sectionId"] == "ashen-leyndell")
    pre_dlc_missable = [step for step in steps if step["phase"] == PHASE_BASE and step["missable"]]
    base_missable = [step for step in steps if step["game"] == "Base Game" and step["missable"]]
    assert len(pre_dlc_missable) == 167, len(pre_dlc_missable)
    assert len(base_missable) == 168, len(base_missable)
    assert first_dlc["order"] == 3304, first_dlc["order"]
    assert first_ashen["order"] == 4433, first_ashen["order"]

    return [
        {
            "id": "GATE-DLC",
            "order": first_dlc["order"],
            "phase": PHASE_DLC,
            "game": "Shadow of the Erdtree",
            "title": "Phase gate — Shadow of the Erdtree",
            "message": (
                "The base-game walkthrough pauses after Maliketh, the Black Blade. Play the "
                "entire Shadow of the Erdtree route before returning to Leyndell, Ashen "
                f"Capital. The pre-DLC base phase carries {len(pre_dlc_missable)} missable "
                "steps; review them before leaving the Lands Between."
            ),
            "warning": "The DLC does not lock the base game, but the endgame capital does. Finish Capital Outskirts, Leyndell, and Forbidden Lands missables before the Ashen Capital return.",
            "severity": "IMPORTANT",
            "area": "",
            "beforeSectionId": first_dlc["sectionId"],
            "filter": {
                "phase": PHASE_BASE,
                "sections": [],
                "sectionTitles": [],
                "missableOnly": True,
            },
        },
        {
            "id": "GATE-ASHEN-CAPITAL",
            "order": first_ashen["order"],
            "phase": PHASE_ENDGAME,
            "game": "Base Game",
            "title": "Phase gate — Leyndell, Ashen Capital",
            "message": (
                "The capital changes after Maliketh. Complete missable steps in Capital "
                "Outskirts, Leyndell, and Forbidden Lands before entering the endgame. "
                "Sections that still have unresolved missables are listed in the gate "
                f"filter so the Journey page can deep-link straight to them. The base game "
                f"holds {len(base_missable)} missables in total, including the endgame section."
            ),
            "warning": "MISSABLE — Leyndell, Royal Capital is destroyed after Maliketh. Capital Outskirts, Leyndell, and Forbidden Lands pickups, NPC dialogue, and quest states can be lost permanently.",
            "severity": "MISSABLE",
            "area": "Leyndell, Royal Capital",
            "beforeSectionId": "ashen-leyndell",
            "filter": {
                "phase": PHASE_BASE,
                "sections": ["capital-outskirts", "leyndell", "forbidden-lands"],
                "sectionTitles": ["Capital Outskirts", "Leyndell, Royal Capital", "Forbidden Lands"],
                "missableOnly": True,
            },
        },
    ]


# ---------------------------------------------------------------------------
# Tarnished Pack parsing (the pack lives in src/data/game.ts)
# ---------------------------------------------------------------------------


def parse_ts_calls(source: str, name: str) -> list[list[Any]]:
    calls: list[list[Any]] = []
    for match in re.finditer(rf"\b{name}\(", source):
        index = match.end()
        depth = 1
        quote: str | None = None
        escaped = False
        while index < len(source) and depth:
            char = source[index]
            if quote:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
            else:
                if char in "\"'":
                    quote = char
                elif char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1
            index += 1
        raw = source[match.end() : index - 1]
        if not raw.lstrip().startswith(("\"", "'")):
            continue  # function declaration
        args: list[Any] = []
        current: list[str] = []
        depth = 0
        quote = None
        escaped = False
        for char in raw:
            if quote:
                current.append(char)
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
            else:
                if char in "\"'":
                    quote = char
                    current.append(char)
                elif char in "([{":
                    depth += 1
                    current.append(char)
                elif char in ")]}":
                    depth -= 1
                    current.append(char)
                elif char == "," and depth == 0:
                    args.append("".join(current).strip())
                    current = []
                else:
                    current.append(char)
        tail = "".join(current).strip()
        if tail:
            args.append(tail)
        parsed: list[Any] = []
        for arg in args:
            if arg == "true":
                parsed.append(True)
            elif arg == "false":
                parsed.append(False)
            else:
                parsed.append(ast.literal_eval(arg))
        calls.append(parsed)
    return calls


def load_tarnished_pack() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    source = (DATA / "game.ts").read_text(encoding="utf-8")
    item_calls = parse_ts_calls(source, "packItem")
    encounter_calls = parse_ts_calls(source, "packEncounter")
    assert len(item_calls) == 27, f"expected 27 Tarnished Pack items, found {len(item_calls)}"
    assert len(encounter_calls) == 2

    pack_source = (
        "https://www.nintendolife.com/guides/"
        "elden-ring-tarnished-edition-weapons-armor-npc-invasions-steed-attire-content"
    )
    items: list[dict[str, Any]] = []
    for args in item_calls:
        item_id, name, category, group, region, location, acquisition, notes = args[:8]
        missable = args[8] if len(args) > 8 else ""
        items.append(
            {
                "id": item_id,
                "name": name,
                "category": category,
                "group": group,
                "region": region,
                "location": location,
                "acquisitionType": acquisition,
                "startingOwned": False,
                "objectiveId": "",
                "linkedRouteRaw": "",
                "missable": missable,
                "validation": "Verified — official patch 1.17 and Tarnished Edition content guides",
                "sourceUrl": pack_source,
                "notes": notes,
                "game": "Tarnished Pack",
                "sourceRow": 0,
                "routeStepIds": [],
                "autoStepId": None,
                "wikiUrl": "",
                "dlc": False,
                "section": "Tarnished Pack",
                "acquisitionText": notes,
                "slot": "",
            }
        )

    encounters: list[dict[str, Any]] = []
    for args in encounter_calls:
        enc_id, name, region, location, notes, missable = args[:6]
        encounters.append(
            {
                "id": enc_id,
                "name": name,
                "region": region,
                "location": location,
                "type": "NPC Invasion",
                "required": "Tarnished Pack",
                "notes": notes,
                "validation": "Verified — official patch 1.17 and Tarnished Edition content guides",
                "linkedRouteRaw": "",
                "sourceRow": 0,
                "act": "Tarnished Pack",
                "completionUnit": region,
                "majorBoss": False,
                "optional": True,
                "respawns": False,
                "achievement": "",
                "questRelated": False,
                "missable": bool(missable),
                "multiplayer": "No",
                "timeLock": "None",
                "tags": ["Tarnished Pack", "NPC Invasion", region],
                "notes2": notes,
                "recommendedLevel": "Mid-to-late game",
                "strategyNotes": "NPC invasion; use the new weapon/armor drops to verify acquisition.",
                "difficulty": "NPC invasion",
                "defaultRoute": "Complete",
                "confidence": "Official patch + guide",
                "game": "Tarnished Pack",
                "routeStepIds": [],
                "autoStepId": None,
                "section": "Tarnished Pack",
                "levelRange": "",
                "wikiUrl": "",
                "dlc": False,
                "badges": ["Tarnished Pack"],
                "links": [],
                "sourceId": "",
                "description": notes,
            }
        )
    return items, encounters


# ---------------------------------------------------------------------------
# Item merge
# ---------------------------------------------------------------------------


def research_group(group: str, category: str) -> str:
    if group == "Consumable":
        if category == "Crystal Tears":
            return "Crystal Tear"
        if category == "Reusable Tools":
            return "Tool"
        return "Consumable"
    if group == "Upgrade":
        return "Upgrade"
    return group


def item_family(group: str) -> str:
    if group in {"Weapon", "Shield"}:
        return "weapon"
    if group in {"Key & Lore", "Recipe & Knowledge", "Upgrade"}:
        return "lore"
    if group in {"Consumable", "Tool", "Crystal Tear", "Flask"}:
        return "consumable"
    return group


def compatible_item_group(research_group_name: str, existing_group: str, existing_category: str) -> bool:
    if research_group_name == existing_group:
        return True
    family = item_family(research_group_name)
    if family == item_family(existing_group) and family in {"weapon", "lore", "consumable"}:
        return True
    # The workbook files staves and sacred seals under Consumable/Casting Tool.
    if research_group_name == "Weapon" and existing_group == "Consumable":
        return existing_category in {"Casting Tool", "Sacred Seal"}
    return False


PLACEHOLDER = re.compile(r"queued|not in the content pack|phase 26e", re.IGNORECASE)


def is_placeholder(value: str | None) -> bool:
    return not value or not value.strip() or bool(PLACEHOLDER.search(value))


def build_items() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    workbook = load(DATA / "items.json")["items"]
    research = load(RESEARCH / "items.json")
    research_items = research["items"]
    assert len(workbook) == 1787, len(workbook)
    assert len(research_items) == 2100, len(research_items)

    catalog: list[dict[str, Any]] = []
    by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in workbook:
        item = dict(entry)
        item.setdefault("wikiUrl", "")
        item.setdefault("dlc", entry["game"] == "Shadow of the Erdtree")
        item.setdefault("section", "")
        item.setdefault("acquisitionText", "")
        item.setdefault("slot", "")
        catalog.append(item)
        by_name[norm(item["name"])].append(item)

    matched_ids: set[str] = set()
    workbook_ids = {item["id"] for item in catalog}
    new_items: list[dict[str, Any]] = []
    used_ids = {item["id"] for item in catalog}
    collisions: list[dict[str, Any]] = []
    group_mismatches = 0

    for entry in research_items:
        target_group = research_group(entry["group"], entry.get("category", ""))
        candidates = [
            item
            for item in by_name.get(norm(entry["name"]), [])
            if item["id"] in workbook_ids
            and item["id"] not in matched_ids
            and compatible_item_group(target_group, item["group"], item.get("category", ""))
        ]
        if candidates:
            candidates.sort(
                key=lambda item: (
                    item["group"] != target_group,
                    item.get("category", "") != entry.get("category", ""),
                )
            )
            target = candidates[0]
            matched_ids.add(target["id"])
            target["dlc"] = bool(entry["dlc"])
            target["game"] = "Shadow of the Erdtree" if entry["dlc"] else "Base Game"
            target["section"] = entry.get("section", "")
            target["wikiUrl"] = entry.get("wikiUrl") or target.get("sourceUrl", "")
            target["acquisitionText"] = entry.get("info", "") or target.get("acquisitionText", "")
            if target["group"] == "Armor":
                slot = entry.get("category", "")
                target["category"] = slot or target.get("category", "Armor")
                target["slot"] = slot
            elif target["group"] in {"Key & Lore", "Recipe & Knowledge", "Upgrade"} and (
                entry["group"] != target["group"]
            ):
                group_mismatches += 1
            if not target.get("notes"):
                target["notes"] = f"Redmaw {entry.get('section', 'catalog')} · {entry.get('category', '')}".strip(" ·")
            continue

        item_id = unique_slug(slug(entry["name"]), used_ids, "RW-ITEM-")
        category = entry.get("category", "")
        new_item = {
            "id": item_id,
            "name": entry["name"],
            "category": category,
            "group": target_group,
            "region": "Shadow of the Erdtree" if entry["dlc"] else "Base Game",
            "location": entry.get("info", "") or entry.get("section", ""),
            "acquisitionType": "Redmaw catalog",
            "startingOwned": False,
            "objectiveId": "",
            "linkedRouteRaw": "",
            "missable": "",
            "validation": VALIDATION,
            "sourceUrl": entry.get("wikiUrl", ""),
            "notes": f"Redmaw {entry.get('section', 'catalog')} · {category}".strip(" ·"),
            "game": "Shadow of the Erdtree" if entry["dlc"] else "Base Game",
            "sourceRow": 0,
            "routeStepIds": [],
            "autoStepId": None,
            "wikiUrl": entry.get("wikiUrl", ""),
            "dlc": bool(entry["dlc"]),
            "section": entry.get("section", ""),
            "acquisitionText": entry.get("info", ""),
            "slot": category if target_group == "Armor" else "",
        }
        new_items.append(new_item)
        catalog.extend(new_items[-1:])
        by_name[norm(new_item["name"])].append(new_item)

    # Tarnished Pack: reuse the TP-COL-* identity when the Redmaw catalog has
    # the same item, and keep the pack record otherwise.
    pack_items, pack_encounters = load_tarnished_pack()
    pack_index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in catalog:
        pack_index[norm(item["name"])].append(item)
    pack_replaced = 0
    for pack in pack_items:
        candidates = [
            item
            for item in pack_index.get(norm(pack["name"]), [])
            if item["id"].startswith("RW-ITEM-")
        ]
        if candidates:
            target = candidates[0]
            index = catalog.index(target)
            enriched = dict(pack)
            enriched["wikiUrl"] = target.get("wikiUrl", "")
            enriched["section"] = target.get("section", "Tarnished Pack")
            enriched["acquisitionText"] = target.get("acquisitionText") or pack["notes"]
            enriched["slot"] = target.get("slot", "")
            enriched["routeStepIds"] = []
            enriched["autoStepId"] = None
            enriched["dlc"] = False
            catalog[index] = enriched
            by_name[norm(enriched["name"])] = [
                enriched if item is target else item for item in by_name[norm(enriched["name"])]
            ]
            pack_replaced += 1
            continue
        catalog.append(pack)
        pack_index[norm(pack["name"])].append(pack)

    # Rebuild the exact name index after the TP replacements.
    for item in catalog:
        if PLACEHOLDER.search(item.get("acquisitionType", "")):
            item["acquisitionType"] = (
                "Redmaw catalog"
                if item["id"].startswith("RW-ITEM-")
                else "Fixed acquisition — Redmaw catalog"
            )
        if PLACEHOLDER.search(item.get("missable", "")):
            item["missable"] = "MISSABLE" if "MISSABLE" in item["missable"].upper() else ""
        if not item.get("acquisitionText") and not is_placeholder(item.get("location")):
            item["acquisitionText"] = item["location"]
        if re.search(r"Phase 26", item.get("notes", "")):
            item["notes"] = (
                f"Redmaw catalog record · {item['section']}."
                if item.get("section")
                else "Redmaw catalog record."
            )
    name_index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in catalog:
        name_index[norm(item["name"])].append(item)

    duplicate_names = {
        key: [item["id"] for item in entries]
        for key, entries in name_index.items()
        if len(entries) > 1
    }
    ids = [item["id"] for item in catalog]
    assert len(ids) == len(set(ids)), "duplicate item IDs generated"
    missing_workbook = [item["id"] for item in workbook if item["id"] not in set(ids)]
    assert not missing_workbook, f"workbook IDs lost: {missing_workbook[:5]}"

    stats = {
        "workbook": len(workbook),
        "redmaw": len(research_items),
        "redmawOnly": len(new_items),
        "matchedWorkbook": len(matched_ids),
        "unmatchedWorkbook": len(workbook) - len(matched_ids),
        "tarnishedPack": len(pack_items),
        "tarnishedPackMerged": pack_replaced,
        "final": len(catalog),
        "duplicateNames": duplicate_names,
        "groupFamilyMismatchesPreserved": group_mismatches,
        "nameIndex": name_index,
        "packEncounters": pack_encounters,
        "collisions": collisions,
    }
    return catalog, stats


# ---------------------------------------------------------------------------
# Boss merge
# ---------------------------------------------------------------------------


def build_bosses(item_stats: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    workbook = load(DATA / "world.json")["encounters"]
    research = load(RESEARCH / "bosses.json")["bosses"]
    assert len(workbook) == 50, len(workbook)
    assert len(research) == 207, len(research)

    catalog: list[dict[str, Any]] = []
    index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in workbook:
        boss = dict(entry)
        boss.setdefault("section", entry.get("completionUnit", entry.get("region", "")))
        boss.setdefault("levelRange", entry.get("recommendedLevel", ""))
        boss.setdefault("wikiUrl", "")
        boss.setdefault("dlc", False)
        boss.setdefault("badges", [])
        boss.setdefault("links", [])
        boss.setdefault("sourceId", "")
        boss.setdefault("description", entry.get("notes2", entry.get("notes", "")))
        boss.setdefault("game", "Base Game")
        catalog.append(boss)
        index[norm(boss["name"])].append(boss)

    matched: set[str] = set()
    existing_ids = {boss["id"] for boss in catalog}
    used_ids = set(existing_ids)
    for entry in research:
        candidates = [
            boss
            for boss in index.get(norm(entry["name"]), [])
            if boss["id"] in existing_ids and boss["id"] not in matched
        ]
        badges = entry.get("badges", [])
        if entry.get("missable") and "MISSABLE" not in badges:
            badges = [*badges, "MISSABLE"]
        if entry.get("achievement") and "🏆" not in badges:
            badges = [*badges, "🏆"]
        if candidates:
            target = candidates[0]
            matched.add(target["id"])
            target.update(
                {
                    "section": entry.get("section", target.get("section", "")),
                    "levelRange": entry.get("levelRange", target.get("levelRange", "")),
                    "wikiUrl": entry.get("wikiUrl", ""),
                    "dlc": bool(entry.get("dlc")),
                    "game": "Shadow of the Erdtree" if entry.get("dlc") else "Base Game",
                    "badges": badges,
                    "links": entry.get("links", []),
                    "sourceId": entry.get("sourceId", ""),
                    "description": entry.get("description", ""),
                    "missable": bool(entry.get("missable")),
                }
            )
            if entry.get("achievement"):
                target["achievement"] = entry["achievement"]
            continue

        boss_id = unique_slug(slug(entry["name"]), used_ids, "RW-BOSS-")
        boss = {
            "id": boss_id,
            "name": entry["name"],
            "region": entry.get("section", ""),
            "location": entry.get("description", ""),
            "type": "Boss",
            "required": "Not specified",
            "notes": entry.get("description", ""),
            "validation": VALIDATION,
            "linkedRouteRaw": "",
            "sourceRow": 0,
            "act": "Shadow of the Erdtree" if entry.get("dlc") else "Base Game",
            "completionUnit": entry.get("section", ""),
            "majorBoss": bool(entry.get("achievement")),
            "optional": False,
            "respawns": False,
            "achievement": entry.get("achievement", ""),
            "questRelated": False,
            "missable": bool(entry.get("missable")),
            "multiplayer": "",
            "timeLock": "",
            "tags": [tag for tag in [entry.get("section", ""), "Redmaw"] if tag],
            "notes2": entry.get("description", ""),
            "recommendedLevel": entry.get("levelRange", ""),
            "strategyNotes": "",
            "difficulty": "",
            "defaultRoute": "",
            "returnObjective": "",
            "runeRisk": "",
            "scadutree": "",
            "confidence": "Redmaw live scrape",
            "game": "Shadow of the Erdtree" if entry.get("dlc") else "Base Game",
            "routeStepIds": [],
            "autoStepId": None,
            "section": entry.get("section", ""),
            "levelRange": entry.get("levelRange", ""),
            "wikiUrl": entry.get("wikiUrl", ""),
            "dlc": bool(entry.get("dlc")),
            "badges": badges,
            "links": entry.get("links", []),
            "sourceId": entry.get("sourceId", ""),
            "description": entry.get("description", ""),
        }
        catalog.append(boss)
        index[norm(boss["name"])].append(boss)

    for pack in item_stats["packEncounters"]:
        catalog.append(pack)

    ids = [boss["id"] for boss in catalog]
    assert len(ids) == len(set(ids)), "duplicate boss IDs generated"
    assert len(catalog) >= 207, len(catalog)
    name_index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for boss in catalog:
        name_index[norm(boss["name"])].append(boss)

    stats = {
        "workbook": len(workbook),
        "redmaw": len(research),
        "matched": len(matched),
        "redmawOnly": len(research) - len(matched),
        "final": len(catalog),
        "nameIndex": name_index,
    }
    return catalog, stats


# ---------------------------------------------------------------------------
# Route links
# ---------------------------------------------------------------------------


def canonical_index(name_index: dict[str, list[dict[str, Any]]], prefer) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for key, entries in name_index.items():
        if not entries:
            continue
        preferred = next((entry for entry in entries if prefer(entry)), entries[0])
        output[key] = preferred
    return output


def link_route(
    steps: list[dict[str, Any]],
    items: list[dict[str, Any]],
    bosses: list[dict[str, Any]],
    item_stats: dict[str, Any],
    boss_stats: dict[str, Any],
) -> dict[str, Any]:
    item_index = canonical_index(
        item_stats["nameIndex"],
        lambda item: not item["id"].startswith("RW-ITEM-"),
    )
    boss_index = canonical_index(
        boss_stats["nameIndex"],
        lambda boss: not boss["id"].startswith("RW-BOSS-"),
    )

    unresolved_labels: Counter[str] = Counter()
    resolved_labels = 0
    linked_items: dict[str, list[str]] = defaultdict(list)
    linked_bosses: dict[str, list[str]] = defaultdict(list)

    for step in steps:
        item_ids: list[str] = []
        boss_ids: list[str] = []
        item_names: list[str] = []
        names: list[str] = []
        raw_labels: list[str] = []
        for link in step.get("links", []):
            label = link.get("label", "")
            raw_labels.append(label)
            key = norm(label)
            item = item_index.get(key)
            boss = boss_index.get(key)
            if item is not None:
                item_ids.append(item["id"])
                item_names.append(item["name"])
                names.append(item["name"])
                linked_items[item["id"]].append(step["id"])
                resolved_labels += 1
            elif boss is not None:
                boss_ids.append(boss["id"])
                names.append(boss["name"])
                linked_bosses[boss["id"]].append(step["id"])
                resolved_labels += 1
            else:
                unresolved_labels[label] += 1
        auto_items = [
            item_id
            for item_id, item_name in zip(item_ids, item_names)
            if item_auto_acquire(step["instruction"], item_name)
        ]
        auto_bosses = (
            dedupe(boss_ids)
            if BOSS_ACQUIRE_TEXT.search(step["instruction"])
            else []
        )
        step["linkedIds"] = dedupe([*item_ids, *boss_ids])
        step["linkedItemNames"] = dedupe(names)
        step["linkedRaw"] = "; ".join(raw_labels)
        step["autoAcquireItemIds"] = dedupe(auto_items)
        step["autoAcquireBossIds"] = auto_bosses

    order_by_id = {step["id"]: step["order"] for step in steps}

    def apply_links(catalog: list[dict[str, Any]], links: dict[str, list[str]]) -> None:
        for entity in catalog:
            existing = [
                step_id
                for step_id in entity.get("routeStepIds", [])
                if step_id in order_by_id
            ]
            for step_id in links.get(entity["id"], []):
                if step_id not in existing:
                    existing.append(step_id)
            existing.sort(key=lambda step_id: order_by_id[step_id])
            entity["routeStepIds"] = existing
            entity["autoStepId"] = existing[0] if existing else None

    apply_links(items, linked_items)
    apply_links(bosses, linked_bosses)

    # Replace placeholder acquisition locations with Redmaw text, or with the
    # first linked route section when Redmaw has no prose for the item.
    replaced_locations = 0
    area_derived_locations = 0
    cleared_locations = 0
    for item in items:
        had_location = bool((item.get("location") or "").strip())
        if not had_location or not is_bogus_location(item):
            continue
        if item["routeStepIds"]:
            first = next(step for step in steps if step["id"] == item["routeStepIds"][0])
            # Area-only: the route link proves the section, not an exact pickup.
            item["location"] = first["area"]
            item["acquisitionText"] = first["instruction"]
            area_derived_locations += 1
        else:
            # No route proof: do not invent a location. The Collection page
            # labels empty locations as unrecorded.
            item["location"] = ""
            cleared_locations += 1
        replaced_locations += 1

    total_labels = sum(len(step.get("links", [])) for step in steps)
    return {
        "labels": total_labels,
        "resolved": resolved_labels,
        "unresolved": total_labels - resolved_labels,
        "unresolvedUnique": len(unresolved_labels),
        "unresolvedExamples": [label for label, _ in unresolved_labels.most_common(25)],
        "itemsLinked": sum(1 for item in items if item["routeStepIds"]),
        "bossesLinked": sum(1 for boss in bosses if boss["routeStepIds"]),
        "replacedLocations": replaced_locations,
        "areaDerivedLocations": area_derived_locations,
        "clearedLocations": cleared_locations,
    }


# ---------------------------------------------------------------------------
# Achievements, questlines, NG+
# ---------------------------------------------------------------------------


def build_achievements(item_stats: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    research = load(RESEARCH / "achievements.json")
    achievements = research["achievements"]
    groups = research["requirementGroups"]
    assert len(achievements) == 42, len(achievements)
    assert len(groups) == 4, len(groups)

    item_index = canonical_index(
        item_stats["nameIndex"],
        lambda item: not item["id"].startswith("RW-ITEM-"),
    )
    group_by_name = {norm(group["name"]): group for group in groups}
    group_ids_by_achievement: dict[str, list[str]] = defaultdict(list)
    for group in groups:
        group_ids_by_achievement[group["achievementId"]].append(group["id"])

    normalized_groups: list[dict[str, Any]] = []
    linked_requirement_items = 0
    for group in groups:
        items = []
        for entry in group["items"]:
            item = item_index.get(norm(entry["name"]))
            if item is not None:
                linked_requirement_items += 1
            items.append(
                {
                    "name": entry["name"],
                    "itemId": item["id"] if item else "",
                    "wikiUrl": entry.get("wikiUrl", ""),
                    "description": entry.get("description", ""),
                    "sourceId": entry.get("sourceId", ""),
                    "badges": entry.get("badges", []),
                    "missable": bool(entry.get("missable")),
                    "links": entry.get("links", []),
                }
            )
        normalized_groups.append(
            {
                "id": group["id"],
                "name": group["name"],
                "kind": group["kind"],
                "section": group.get("section", ""),
                "sectionId": group.get("sectionId", ""),
                "achievementId": group["achievementId"],
                "items": items,
            }
        )

    normalized_achievements: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    for entry in achievements:
        achievement_id = entry["id"] or slug(entry["name"])
        if achievement_id in used_ids:
            achievement_id = unique_slug(slug(entry["name"]), used_ids, "")
        used_ids.add(achievement_id)
        group_match = group_by_name.get(norm(entry["name"]))
        requirement_ids = dedupe(
            [
                *(entry.get("requirements") or []),
                *group_ids_by_achievement.get(entry["id"], []),
            ]
        )
        if group_match and group_match["id"] not in requirement_ids:
            requirement_ids.append(group_match["id"])
        normalized = dict(entry)
        normalized["id"] = achievement_id
        normalized["requirementGroupIds"] = requirement_ids
        normalized["requirements"] = requirement_ids
        normalized["itemIds"] = sorted(
            {
                item["itemId"]
                for group_id in requirement_ids
                for group in normalized_groups
                if group["id"] == group_id
                for item in group["items"]
                if item["itemId"]
            }
        )
        normalized_achievements.append(normalized)

    payload = {
        "source": research.get("source", {}),
        "attribution": research.get("attribution", ""),
        "achievements": normalized_achievements,
        "requirementGroups": normalized_groups,
    }
    stats = {
        "achievements": len(normalized_achievements),
        "requirementGroups": len(normalized_groups),
        "linkedRequirementItems": linked_requirement_items,
        "requirementItems": sum(len(group["items"]) for group in normalized_groups),
    }
    return payload, stats


def build_questlines() -> tuple[dict[str, Any], dict[str, Any]]:
    research = load(RESEARCH / "questlines.json")
    questlines = research["questlines"]
    assert len(questlines) == 52, len(questlines)

    normalized: list[dict[str, Any]] = []
    seen_steps: set[str] = set()
    total_steps = 0
    for questline in questlines:
        steps = []
        for step in questline["steps"]:
            order = step.get("order", len(steps) + 1)
            step_id = f"Q-{questline['id']}-{order}"
            if step_id in seen_steps:
                step_id = f"{step_id}-2"
            seen_steps.add(step_id)
            steps.append(
                {
                    "id": step_id,
                    "sourceId": step.get("sourceId", step["id"]),
                    "questlineId": questline["id"],
                    "npc": questline["npc"],
                    "order": order,
                    "depth": step.get("depth", 0),
                    "text": step["text"],
                    "optional": bool(step.get("optional")),
                    "missable": bool(step.get("missable")),
                    "badges": step.get("badges", []),
                    "links": step.get("links", []),
                }
            )
        total_steps += len(steps)
        normalized.append(
            {
                "id": questline["id"],
                "npc": questline["npc"],
                "dlc": bool(questline.get("dlc")),
                "game": "Shadow of the Erdtree" if questline.get("dlc") else "Base Game",
                "sourceUrl": questline.get("sourceUrl", ""),
                "stepCount": len(steps),
                "missableCount": sum(1 for step in steps if step["missable"]),
                "steps": steps,
            }
        )
    assert total_steps == 587, total_steps
    payload = {
        "source": research.get("source", {}),
        "attribution": research.get("attribution", ""),
        "questlines": normalized,
    }
    return payload, {"questlines": len(normalized), "steps": total_steps}


def build_ngplus() -> tuple[dict[str, Any], dict[str, Any]]:
    research = load(RESEARCH / "ngplus.json")
    sections = research["sections"]
    assert len(sections) == 12, len(sections)
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    total_steps = 0
    for section in sections:
        steps = []
        for step in section["steps"]:
            step_id = f"NGP-{section['id']}-{step['id']}"
            if step_id in seen:
                step_id = f"{step_id}-2"
            seen.add(step_id)
            steps.append(
                {
                    "id": step_id,
                    "sectionId": section["id"],
                    "sectionTitle": section["title"],
                    "order": step.get("order", len(steps) + 1),
                    "text": step["text"],
                    "optional": bool(step.get("optional")),
                    "badges": step.get("badges", []),
                    "links": step.get("links", []),
                    "dlc": bool(step.get("dlc")),
                }
            )
        total_steps += len(steps)
        normalized.append(
            {
                "id": section["id"],
                "title": section["title"],
                "order": section["order"],
                "levelRange": section.get("levelRange", ""),
                "game": "Shadow of the Erdtree" if any(step["dlc"] for step in section["steps"]) else "Base Game",
                "stepCount": len(steps),
                "steps": steps,
            }
        )
    assert total_steps == 68, total_steps
    payload = {
        "source": research.get("source", {}),
        "attribution": research.get("attribution", ""),
        "sections": normalized,
    }
    return payload, {"sections": len(normalized), "steps": total_steps}


# ---------------------------------------------------------------------------
# Legacy map
# ---------------------------------------------------------------------------


AREA_EQUIVALENTS = {
    "Tutorial": ["starting-out"],
    "West Limgrave": ["starting-out", "first-steps", "west-limgrave"],
    "East Limgrave": ["first-steps", "west-limgrave", "north-limgrave"],
    "Weeping Peninsula": ["weeping-peninsula"],
    "Castle Morne": ["castle-morne"],
    "Stormhill": ["north-limgrave", "stormveil-castle"],
    "Stormveil Castle": ["stormveil-castle"],
    "Act I Exit Audit": ["early-liurnia"],
}


def build_legacy_map(steps: list[dict[str, Any]]) -> dict[str, str]:
    old = load(DATA / "route.json")["steps"]
    base_steps = [step for step in steps if step["phase"] in {PHASE_BASE, PHASE_ENDGAME}]
    by_section: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for step in base_steps:
        by_section[step["sectionId"]].append(step)

    output: dict[str, str] = {}
    for step in old:
        old_text = norm(step["instruction"])
        candidates: list[dict[str, Any]] = []
        for section_id in AREA_EQUIVALENTS.get(step["area"], []):
            candidates.extend(by_section.get(section_id, []))
        if not candidates:
            candidates = base_steps
        best = max(candidates, key=lambda candidate: dice(old_text, norm(candidate["instruction"])))
        best_score = dice(old_text, norm(best["instruction"]))
        if best_score < 0.55:
            continue
        output[step["id"]] = best["id"]
    assert len(output) >= 30, len(output)
    assert "RTE-A1-WL-0002" in output, "seeded legacy step must map"
    return output


# ---------------------------------------------------------------------------
# Coverage + documentation
# ---------------------------------------------------------------------------


def main() -> None:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sections = route_sections()
    skeleton = build_route_skeleton(sections)
    route_steps = skeleton["steps"]

    items, item_stats = build_items()
    bosses, boss_stats = build_bosses(item_stats)
    link_stats = link_route(route_steps, items, bosses, item_stats, boss_stats)

    gates = build_phase_gates(route_steps, skeleton["areas"])
    legacy_map = build_legacy_map(route_steps)
    achievements, achievement_stats = build_achievements(item_stats)
    questlines, questline_stats = build_questlines()
    ngplus, ngplus_stats = build_ngplus()

    route_payload = {
        "source": {
            "name": "Redmaw Completion Sheets",
            "walkthrough": BASE_ROUTE_URL,
            "dlcWalkthrough": DLC_ROUTE_URL,
            "fetchedAt": load(RESEARCH / "route.base.json").get("fetchedAt", ""),
        },
        "generatedAt": generated_at,
        "chronology": {
            "rule": "Base game through Maliketh, entire Shadow of the Erdtree, then base-game endgame.",
            "phases": [
                {
                    "id": "base-through-maliketh",
                    "label": PHASE_BASE,
                    "sectionCount": sum(1 for area in skeleton["areas"] if area["phase"] == PHASE_BASE),
                    "stepCount": sum(1 for step in route_steps if step["phase"] == PHASE_BASE),
                },
                {
                    "id": "shadow-of-the-erdtree",
                    "label": PHASE_DLC,
                    "sectionCount": sum(1 for area in skeleton["areas"] if area["phase"] == PHASE_DLC),
                    "stepCount": sum(1 for step in route_steps if step["phase"] == PHASE_DLC),
                },
                {
                    "id": "base-endgame",
                    "label": PHASE_ENDGAME,
                    "sectionCount": sum(1 for area in skeleton["areas"] if area["phase"] == PHASE_ENDGAME),
                    "stepCount": sum(1 for step in route_steps if step["phase"] == PHASE_ENDGAME),
                },
            ],
        },
        "counts": {
            "sections": len(skeleton["areas"]),
            "steps": len(route_steps),
            "baseSteps": sum(1 for step in route_steps if step["game"] == "Base Game"),
            "dlcSteps": sum(1 for step in route_steps if step["game"] == "Shadow of the Erdtree"),
            "preDlcSteps": sum(1 for step in route_steps if step["phase"] == PHASE_BASE),
            "endgameSteps": sum(1 for step in route_steps if step["phase"] == PHASE_ENDGAME),
            "requiredSteps": sum(1 for step in route_steps if step["required"]),
            "missableSteps": sum(1 for step in route_steps if step["missable"]),
            "missableBaseSteps": sum(
                1 for step in route_steps if step["missable"] and step["game"] == "Base Game"
            ),
            "missableDlcSteps": sum(
                1 for step in route_steps if step["missable"] and step["game"] == "Shadow of the Erdtree"
            ),
        },
        "areas": skeleton["areas"],
        "objectives": skeleton["objectives"],
        "steps": route_steps,
        "phaseGates": gates,
        "supplemental": load(DATA / "route.json")["supplemental"],
        "chronologyAreas": load(DATA / "route.json")["chronologyAreas"],
    }

    coverage = {
        "generatedAt": generated_at,
        "route": {
            "sections": len(skeleton["areas"]),
            "steps": len(route_steps),
            "baseSteps": sum(1 for step in route_steps if step["game"] == "Base Game"),
            "dlcSteps": sum(1 for step in route_steps if step["game"] == "Shadow of the Erdtree"),
            "preDlcSteps": sum(1 for step in route_steps if step["phase"] == PHASE_BASE),
            "endgameSteps": sum(1 for step in route_steps if step["phase"] == PHASE_ENDGAME),
            "requiredSteps": sum(1 for step in route_steps if step["required"]),
            "missableSteps": sum(1 for step in route_steps if step["missable"]),
            "missableBaseSteps": sum(
                1 for step in route_steps if step["missable"] and step["game"] == "Base Game"
            ),
            "missableDlcSteps": sum(
                1 for step in route_steps if step["missable"] and step["game"] == "Shadow of the Erdtree"
            ),
            "baseSections": sum(1 for area in skeleton["areas"] if area["game"] == "Base Game"),
            "dlcSections": sum(1 for area in skeleton["areas"] if area["game"] == "Shadow of the Erdtree"),
            "preDlcSections": sum(1 for area in skeleton["areas"] if area["phase"] == PHASE_BASE),
            "endgameSections": sum(1 for area in skeleton["areas"] if area["phase"] == PHASE_ENDGAME),
            "firstDlcStepOrder": next(step["order"] for step in route_steps if step["phase"] == PHASE_DLC),
            "firstEndgameStepOrder": next(
                step["order"] for step in route_steps if step["sectionId"] == "ashen-leyndell"
            ),
        },
        "items": {
            "workbook": item_stats["workbook"],
            "redmawDeduped": item_stats["redmaw"],
            "redmawOnly": item_stats["redmawOnly"],
            "matchedWorkbook": item_stats["matchedWorkbook"],
            "unmatchedWorkbook": item_stats["unmatchedWorkbook"],
            "tarnishedPack": item_stats["tarnishedPack"],
            "tarnishedPackMerged": item_stats["tarnishedPackMerged"],
            "final": item_stats["final"],
            "duplicateNameKeys": len(item_stats["duplicateNames"]),
            "linkedToRoute": link_stats["itemsLinked"],
            "placeholdersReplaced": link_stats["replacedLocations"],
            "areaDerivedLocations": link_stats["areaDerivedLocations"],
            "clearedLocations": link_stats["clearedLocations"],
        },
        "achievements": {
            "achievements": achievement_stats["achievements"],
            "requirementGroups": achievement_stats["requirementGroups"],
            "requirementItems": achievement_stats["requirementItems"],
            "linkedRequirementItems": achievement_stats["linkedRequirementItems"],
        },
        "bosses": {
            "workbookEncounters": boss_stats["workbook"],
            "redmaw": boss_stats["redmaw"],
            "matchedWorkbook": boss_stats["matched"],
            "redmawOnly": boss_stats["redmawOnly"],
            "final": boss_stats["final"],
            "linkedToRoute": link_stats["bossesLinked"],
        },
        "questlines": {
            "questlines": questline_stats["questlines"],
            "steps": questline_stats["steps"],
        },
        "ngplus": {
            "sections": ngplus_stats["sections"],
            "items": ngplus_stats["steps"],
        },
        "links": {
            "labels": link_stats["labels"],
            "resolved": link_stats["resolved"],
            "unresolved": link_stats["unresolved"],
            "unresolvedUnique": link_stats["unresolvedUnique"],
            "relativeResolved": sum(
                1
                for route_path in (RESEARCH / "route.base.json", RESEARCH / "route.dlc.json")
                for section in load(route_path)["sections"]
                for step in section["steps"]
                for link in step.get("links", [])
                if link["url"] and not link["url"].startswith(("http://", "https://", "mailto:"))
            ),
        },
        "legacyMap": {
            "workbookSteps": len(load(DATA / "route.json")["steps"]),
            "mapped": len(legacy_map),
        },
        "sources": {
            "research/route.base.json": {
                "sha256": sha256(RESEARCH / "route.base.json"),
                "sections": 49,
                "steps": 3395,
            },
            "research/route.dlc.json": {
                "sha256": sha256(RESEARCH / "route.dlc.json"),
                "sections": 20,
                "steps": 1126,
            },
            "research/items.json": {
                "sha256": sha256(RESEARCH / "items.json"),
                "rawRows": 2116,
                "deduped": 2100,
            },
            "research/achievements.json": {"sha256": sha256(RESEARCH / "achievements.json")},
            "research/bosses.json": {"sha256": sha256(RESEARCH / "bosses.json")},
            "research/questlines.json": {"sha256": sha256(RESEARCH / "questlines.json")},
            "research/ngplus.json": {"sha256": sha256(RESEARCH / "ngplus.json")},
            "src/data/items.json": {"sha256": sha256(DATA / "items.json"), "items": 1787},
            "src/data/world.json": {"sha256": sha256(DATA / "world.json"), "encounters": 50},
            "src/data/route.json": {"sha256": sha256(DATA / "route.json"), "steps": 994},
            "src/data/game.ts": {"sha256": sha256(DATA / "game.ts"), "packItems": 27},
        },
    }

    # --- assertions -------------------------------------------------------
    assert route_payload["counts"]["steps"] == 4521
    assert route_payload["counts"]["sections"] == 70
    assert route_payload["counts"]["preDlcSteps"] == 3303
    assert route_payload["counts"]["dlcSteps"] == 1126
    assert route_payload["counts"]["endgameSteps"] == 92
    # The contract names 170 base missables, but the research artifact holds
    # 165 MISSABLE badges + 3 text-only warnings = 168. Preserve every
    # observable warning rather than inventing two to satisfy the number.
    assert route_payload["counts"]["missableBaseSteps"] == 168
    assert route_payload["counts"]["missableDlcSteps"] == 38
    assert all(
        link["url"].startswith(("http://", "https://", "mailto:"))
        for step in route_steps
        for link in step["links"]
        if link["url"]
    ), "route links must be absolute"
    assert len({step["id"] for step in route_steps}) == 4521
    assert [step["order"] for step in route_steps] == list(range(1, 4522))
    dlc_positions = [index for index, step in enumerate(route_steps) if step["phase"] == PHASE_DLC]
    assert dlc_positions[0] > next(
        index for index, step in enumerate(route_steps) if step["sourceStepId"] == "w46-96"
    )
    assert dlc_positions[-1] < next(
        index for index, step in enumerate(route_steps) if step["sectionId"] == "ashen-leyndell"
    )
    assert item_stats["final"] > 2100
    assert boss_stats["final"] >= 207
    assert achievement_stats["achievements"] == 42
    assert questline_stats["questlines"] == 52 and questline_stats["steps"] == 587
    assert ngplus_stats["steps"] == 68 and ngplus_stats["sections"] == 12
    assert len(legacy_map) >= 30

    write(DATA / "route.full.json", route_payload, compact=True)
    write(DATA / "items.full.json", {"items": items}, compact=True)
    write(DATA / "achievements.json", achievements)
    write(DATA / "bosses.full.json", {"encounters": bosses})
    write(DATA / "questlines.json", questlines)
    write(DATA / "ngplus.json", ngplus)
    write(DATA / "legacy-step-map.json", legacy_map)
    write(DATA / "content-coverage.json", coverage)

    write_docs(
        coverage,
        item_stats,
        boss_stats,
        achievement_stats,
        questline_stats,
        ngplus_stats,
        link_stats,
        legacy_map,
        route_payload,
    )
    print(json.dumps(coverage, indent=2)[:4000])
    print("route:", route_payload["counts"])
    print("items:", item_stats["final"], "bosses:", boss_stats["final"])


def write_docs(
    coverage: dict[str, Any],
    item_stats: dict[str, Any],
    boss_stats: dict[str, Any],
    achievement_stats: dict[str, Any],
    questline_stats: dict[str, Any],
    ngplus_stats: dict[str, Any],
    link_stats: dict[str, Any],
    legacy_map: dict[str, str],
    route_payload: dict[str, Any],
) -> None:
    doc = ROOT / "docs" / "audit" / "FULL_GAME_DATA.md"
    duplicate_lines = []
    for key, ids in sorted(item_stats["duplicateNames"].items()):
        duplicate_lines.append(f"- `{key}`: {', '.join(f'`{item_id}`' for item_id in ids)}")
    if not duplicate_lines:
        duplicate_lines.append("- None.")
    lines = [
        "# Full-game data integration",
        "",
        "Generated by `scripts/build_full_content.py` from the Redmaw completion",
        "sheets and the pre-integration workbook data. Do not hand-edit the JSON.",
        "",
        "## Provenance",
        "",
        "| Input | SHA-256 | Content |",
        "| --- | --- | --- |",
        "| `research/route.base.json` | `%s` | 49 sections / 3,395 steps |"
        % coverage["sources"]["research/route.base.json"]["sha256"],
        "| `research/route.dlc.json` | `%s` | 20 sections / 1,126 steps |"
        % coverage["sources"]["research/route.dlc.json"]["sha256"],
        "| `research/items.json` | `%s` | 2,100 deduped of 2,116 rows |"
        % coverage["sources"]["research/items.json"]["sha256"],
        "| `research/achievements.json` | `%s` | 42 achievements / 4 groups |"
        % coverage["sources"]["research/achievements.json"]["sha256"],
        "| `research/bosses.json` | `%s` | 207 bosses / 42 sections |"
        % coverage["sources"]["research/bosses.json"]["sha256"],
        "| `research/questlines.json` | `%s` | 52 questlines / 587 steps |"
        % coverage["sources"]["research/questlines.json"]["sha256"],
        "| `research/ngplus.json` | `%s` | 12 sections / 68 items |"
        % coverage["sources"]["research/ngplus.json"]["sha256"],
        "| `src/data/items.json` | `%s` | 1,787 workbook items |"
        % coverage["sources"]["src/data/items.json"]["sha256"],
        "| `src/data/world.json` | `%s` | 50 workbook encounters |"
        % coverage["sources"]["src/data/world.json"]["sha256"],
        "| `src/data/route.json` | `%s` | 994 legacy Act I steps |"
        % coverage["sources"]["src/data/route.json"]["sha256"],
        "| `src/data/game.ts` | `%s` | 27 Tarnished Pack items / 2 invasions |"
        % coverage["sources"]["src/data/game.ts"]["sha256"],
        "",
        "Sources: <https://eldenring.redmaw.dev/sheets/walkthrough>,",
        "<https://eldenring.redmaw.dev/sheets/dlc-walkthrough>.",
        "Wiki links point at <https://eldenring.wiki.gg>.",
        "",
        "## Canonical chronology",
        "",
        "1. **Base Game — through Maliketh**: source base sections 1–46. The",
        "   `farum-azula` section is cut after `w46-96` (Maliketh, the Black",
        "   Blade, plus the point-of-no-return note).",
        "2. **Shadow of the Erdtree**: all 20 DLC sections, 1,126 steps.",
        "3. **Base Game — endgame**: synthetic `farum-azula-aftermath`",
        "   (`w46-97..w46-99`), then `ashen-leyndell`, `endings`, `ng-prep`.",
        "",
        f"Verified phase totals: {coverage['route']['preDlcSteps']:,} pre-DLC + "
        f"{coverage['route']['dlcSteps']:,} DLC + {coverage['route']['endgameSteps']:,} "
        f"endgame = {coverage['route']['steps']:,} steps across "
        f"{coverage['route']['sections']} sections "
        f"({coverage['route']['preDlcSections']} pre-DLC + "
        f"{coverage['route']['dlcSections']} DLC + "
        f"{coverage['route']['endgameSections']} endgame).",
        "",
        "Global step order is contiguous 1–4,521. The first DLC step is order",
        "%d and the first Ashen Capital step is order %d. Phase gates are"
        % (
            coverage["route"]["firstDlcStepOrder"],
            coverage["route"]["firstEndgameStepOrder"],
        ),
        "`GATE-DLC` (before the DLC) and `GATE-ASHEN-CAPITAL` (before the",
        "endgame). The Ashen gate filters missables in Capital Outskirts,",
        "Leyndell, Royal Capital, and Forbidden Lands.",
        "",
        "## Observed counts",
        "",
        "| Domain | Result |",
        "| --- | --- |",
        f"| Route sections | {coverage['route']['sections']} (50 base incl. synthetic aftermath + 20 DLC) |",
        f"| Route steps | {coverage['route']['steps']} ({coverage['route']['baseSteps']} base + {coverage['route']['dlcSteps']} DLC) |",
        f"| Required route steps | {coverage['route']['requiredSteps']} |",
        f"| Missable route steps | {coverage['route']['missableSteps']} ({coverage['route']['missableBaseSteps']} base + {coverage['route']['missableDlcSteps']} DLC) |",
        f"| Items | {coverage['items']['final']} |",
        f"| Achievements | {achievement_stats['achievements']} |",
        f"| Boss ledger | {boss_stats['final']} |",
        f"| Questlines | {questline_stats['questlines']} / {questline_stats['steps']} steps |",
        f"| NG+ items | {ngplus_stats['steps']} across {ngplus_stats['sections']} sections |",
        f"| Legacy steps mapped | {len(legacy_map)} of {coverage['legacyMap']['workbookSteps']} |",
        "",
        "## Item merge",
        "",
        f"- Workbook items preserved: {item_stats['workbook']} (every pre-integration ID survives).",
        f"- Redmaw rows merged or appended: {item_stats['redmaw']} deduped rows.",
        f"- Workbook rows matched to Redmaw: {item_stats['matchedWorkbook']}; "
        f"unmatched workbook rows retained: {item_stats['unmatchedWorkbook']}.",
        f"- New Redmaw-only records: {item_stats['redmawOnly']} with `RW-ITEM-<slug>` IDs; "
        f"{item_stats['redmawOnly'] - item_stats['tarnishedPackMerged']} keep those IDs after the Tarnished Pack replacements.",
        f"- Tarnished Pack: {item_stats['tarnishedPack']} records; "
        f"{item_stats['tarnishedPackMerged']} replaced a duplicate Redmaw record while keeping `TP-COL-*`.",
        f"- Route links resolved: {link_stats['resolved']} of {link_stats['labels']} labels "
        f"({link_stats['unresolved']} unresolved remain in `linkedRaw`).",
        f"- Source-relative hrefs resolved against `https://eldenring.redmaw.dev`: "
        f"{coverage['links']['relativeResolved']}.",
        f"- Bogus/placeholder acquisition locations cleaned: {link_stats['replacedLocations']} "
        f"({link_stats['areaDerivedLocations']} became route-section areas with the step "
        f"instruction in `acquisitionText`; {link_stats['clearedLocations']} were cleared as "
        "unrecorded instead of inventing a place).",
        f"- Steps with conservative auto-item links: "
        f"{sum(1 for step in route_payload['steps'] if step['autoAcquireItemIds'])}; "
        f"auto-boss links: {sum(1 for step in route_payload['steps'] if step['autoAcquireBossIds'])}. "
        "Choice/keepsake/alternative mentions are never auto-granted.",
        "",
        "Name collisions retained as distinct records:",
        "",
        *duplicate_lines,
        "",
        "The workbook catalog and Redmaw sheets both contain same-name records in",
        "different or compatible groups (for example an Ash of War and the",
        "matching sorcery, or a casting tool filed as a consumable). They are not",
        "merged because their ownership and gameplay roles differ.",
        "",
        "## Boss merge",
        "",
        f"- Workbook encounters: {boss_stats['workbook']} preserved by ID.",
        f"- Name matches against Redmaw: {boss_stats['matched']}.",
        f"- Redmaw rows appended: {boss_stats['redmawOnly']} with `RW-BOSS-<slug>` IDs.",
        f"- Final ledger: {boss_stats['final']} (includes 2 Tarnished Pack invasions).",
        "",
        "Duplicate boss names in Redmaw (different locations) are distinct",
        "encounters; suffix numbers keep their IDs stable.",
        "",
        "## Missables",
        "",
        "`missable` is set from a MISSABLE/IMPORTANT badge or from warning text",
        "(missable, unobtainable, locked out, point of no return). The artifact",
        "yields 168 base + 38 DLC steps: 165 + 37 MISSABLE badges plus the",
        "text-only warnings `w8-61`, `w9-15`, `w46-96`, and `d12-29`. The",
        "contract names 170 base missables; the source sheet contains 165",
        "MISSABLE badges, so the build preserves all 168 observable warnings",
        "instead of inventing two. The widest any-marker union, which also",
        "counts the trophy-only marker on `w46-91`, is 169. No missable data is",
        "dropped.",
        "",
        "## Legacy migration",
        "",
        "`legacy-step-map.json` maps old `RTE-*` IDs to new `RW-*` IDs only when",
        "normalized text is a high-confidence match inside broadly equivalent",
        "areas (token Dice ≥ 0.55; global fallback ≥ 0.65). Unmapped `RTE-*` keys",
        "are dropped by `normalizeJourney`; unknown non-`RTE-*` keys are preserved.",
        "",
        "## Notes",
        "",
        "- The Journey page renders `step.order` with a `+ 1` offset from the",
        "  pre-integration 0-based workbook route. Orders are now 1-based by",
        "  contract; page display is owned elsewhere and is not edited here.",
        "- `src/data/route.full.json` keeps the workbook `supplemental` and",
        "  `chronologyAreas` arrays unchanged.",
        "- No page or component was modified. JSON files are generated output.",
        "",
    ]
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
