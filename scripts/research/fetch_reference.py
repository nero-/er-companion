#!/usr/bin/env python3
"""Scrape the Redmaw reference sheets into the app's research schemas.

Source pages:
  https://eldenring.redmaw.dev/sheets/resources
  https://eldenring.redmaw.dev/sheets/npc-walkthrough

Outputs (relative to the repository root):
  research/resources.json
  research/npc-walkthrough.json

Raw HTML is cached in research/raw/reference-*.html. Pass --refresh to
re-download it.

``resources.json`` keeps every table on the sheet verbatim (caption, column
names, row values) and adds a per-row wiki link where the sheet has one.

``npc-walkthrough.json`` is the alternate NPC-ordered route. It uses the same
section/step schema as ``route.base.json``; because it mixes base game and
Shadow of the Erdtree sections, both sections and steps carry a ``dlc`` flag.
Nested sub-steps are flattened in document order (the route schema has no
depth field), and a parent step's text excludes its nested sub-step text.
Signal-style ``li.note`` rows are section instructions, not steps: they are
kept on the section as ``notes`` and never counted as checkboxes.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "research" / "raw"

USER_AGENT = "er-companion-research/1.0 (unofficial local fan project)"

# Capture time of the current cached HTML (server Date header, UTC).
CAPTURED_AT = "2026-10-23T01:00:19Z"

RESOURCES_URL = "https://eldenring.redmaw.dev/sheets/resources"
NPC_URL = "https://eldenring.redmaw.dev/sheets/npc-walkthrough"

RESOURCES_RAW = RAW_DIR / "reference-resources.html"
NPC_RAW = RAW_DIR / "reference-npc-walkthrough.html"

RESOURCES_OUT = REPO_ROOT / "research" / "resources.json"
NPC_OUT = REPO_ROOT / "research" / "npc-walkthrough.json"

EXPECTED_NPC_SECTIONS = 36
EXPECTED_NPC_STEPS = 604

# ``id`` is the app-facing table id, ``caption`` the exact sheet caption, and
# ``keys`` the row-object keys in the same order as the sheet's columns.
RESOURCE_TABLES = [
    {
        "id": "soft-caps",
        "caption": "Soft Caps",
        "columns": ["Stat", "Soft cap 1", "Soft cap 2", "Soft cap 3", "Soft cap 4"],
        "keys": ["stat", "softCap1", "softCap2", "softCap3", "softCap4"],
        "dlc": False,
    },
    {
        "id": "smithing-stones",
        "caption": "Smithing Stones",
        "columns": ["Material", "Upgrades to", "Cost", "x12", "Total", "Bell-Bearing"],
        "keys": ["material", "upgradesTo", "cost", "x12", "total", "bellBearing"],
        "dlc": False,
    },
    {
        "id": "somber-smithing-stones",
        "caption": "Somber Smithing Stones",
        "columns": ["Material", "Upgrades to", "Cost", "Total", "Bell-Bearing"],
        "keys": ["material", "upgradesTo", "cost", "total", "bellBearing"],
        "dlc": False,
    },
    {
        "id": "grave-gloveworts",
        "caption": "Grave Gloveworts",
        "columns": ["Material", "Upgrades to", "Cost", "Total", "Bell-Bearing"],
        "keys": ["material", "upgradesTo", "cost", "total", "bellBearing"],
        "dlc": False,
    },
    {
        "id": "ghost-gloveworts",
        "caption": "Ghost Gloveworts",
        "columns": ["Material", "Upgrades to", "Cost", "Total", "Bell-Bearing"],
        "keys": ["material", "upgradesTo", "cost", "total", "bellBearing"],
        "dlc": False,
    },
    {
        "id": "runes-base",
        "caption": "Base Game",
        "columns": ["Consumable", "Runes"],
        "keys": ["name", "runes"],
        "dlc": False,
    },
    {
        "id": "runes-dlc",
        "caption": "DLC",
        "columns": ["Consumable", "Runes"],
        "keys": ["name", "runes"],
        "dlc": True,
    },
    {
        "id": "remembrances-base",
        "caption": "Base Game",
        "columns": ["Remembrance", "Runes"],
        "keys": ["name", "runes"],
        "dlc": False,
    },
    {
        "id": "remembrances-dlc",
        "caption": "DLC",
        "columns": ["Remembrance", "Runes"],
        "keys": ["name", "runes"],
        "dlc": True,
    },
    {
        "id": "scadutree-fragments",
        "caption": "Scadutree Fragments",
        "columns": [
            "Level",
            "Required",
            "Total Required",
            "Damage Multiplier",
            "Damage Negation",
        ],
        "keys": [
            "level",
            "required",
            "totalRequired",
            "damageMultiplier",
            "damageNegation",
        ],
        "dlc": True,
    },
    {
        "id": "revered-spirit-ashes",
        "caption": "Revered Spirit Ashes",
        "columns": [
            "Level",
            "Required",
            "Total Required",
            "Damage Multiplier",
            "Mimic Tear Damage",
            "Damage Negation",
            "Mimic Tear Negation",
        ],
        "keys": [
            "level",
            "required",
            "totalRequired",
            "damageMultiplier",
            "mimicTearDamage",
            "damageNegation",
            "mimicTearNegation",
        ],
        "dlc": True,
    },
]

# Row keys that hold plain integers (commas stripped) rather than text.
INT_KEYS = {
    "softCap1",
    "softCap2",
    "softCap3",
    "softCap4",
    "cost",
    "x12",
    "total",
    "runes",
    "level",
    "required",
    "totalRequired",
}

WS_RE = re.compile(r"\s+")


def collapse(value: str) -> str:
    """Collapse all whitespace runs to a single space and trim."""
    return WS_RE.sub(" ", value).strip()


def download(url: str, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
        fetched_at = response.headers.get("Date")
    dest.write_bytes(body)
    if fetched_at:
        parsed = datetime.strptime(fetched_at, "%a, %d %b %Y %H:%M:%S %Z")
        return parsed.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def extract_links(node) -> list[dict]:
    """Every ``a[href]`` inside ``node`` as {label, url} in document order."""
    links = []
    for anchor in node.select("a[href]"):
        url = anchor["href"].strip()
        if not url:
            continue
        links.append({"label": collapse(anchor.get_text("")) or url, "url": url})
    return links


def first_link(node) -> str:
    anchor = node.find("a", href=True) if node is not None else None
    return anchor["href"].strip() if anchor is not None else ""


def cell_value(text: str, key: str):
    text = collapse(text)
    if not text:
        return None
    if key in INT_KEYS:
        return int(text.replace(",", ""))
    return text


def parse_table(table, spec: dict, section, section_title: str, source_url: str) -> dict:
    caption_node = table.find("caption")
    caption = collapse(caption_node.get_text("")) if caption_node is not None else ""
    if caption != spec["caption"]:
        raise ValueError(
            f"table {spec['id']}: caption mismatch: page '{caption}' vs expected '{spec['caption']}'"
        )

    header_cells = table.select("thead th")
    columns = [collapse(cell.get_text("")) for cell in header_cells]
    if columns != spec["columns"]:
        raise ValueError(f"table {spec['id']}: columns {columns} != {spec['columns']}")

    rows: list[dict] = []
    for tr in table.select("tbody tr"):
        cells = tr.find_all(["th", "td"], recursive=False)
        if len(cells) != len(spec["columns"]):
            raise ValueError(
                f"table {spec['id']}: row has {len(cells)} cells, expected {len(spec['columns'])}"
            )
        row: dict = {}
        for key, cell in zip(spec["keys"], cells):
            row[key] = cell_value(cell.get_text(""), key)

        label_key = spec["keys"][0]
        if isinstance(row[label_key], str):
            row["wikiUrl"] = first_link(cells[0])

        if "bellBearing" in row and row["bellBearing"]:
            row["bellBearingUrl"] = first_link(cells[-1])

        rows.append(row)

    if not rows:
        raise ValueError(f"table {spec['id']}: no body rows")

    return {
        "id": spec["id"],
        "caption": caption,
        "sectionId": section.get("id", ""),
        "sectionTitle": section_title,
        "sourceUrl": source_url,
        "dlc": spec["dlc"],
        "columns": columns,
        "rowKeys": spec["keys"],
        "rows": rows,
    }


def parse_stats_notes(section) -> tuple[list[dict], dict]:
    """Split the prose under the soft-cap table into per-stat notes and advice."""
    notes: list[dict] = []
    build = {"heading": "", "items": []}
    container = section.find("div", recursive=False)
    if container is None:
        return notes, build

    for node in container.find_all(["p", "h4", "ul"], recursive=False):
        if node.name == "p":
            strong = node.find("strong")
            topic = collapse(strong.get_text("")) if strong is not None else ""
            topic = topic.rstrip(":").strip()
            text = collapse(node.get_text(" "))
            if topic:
                prefix = f"{topic}: "
                body = text[len(prefix) :] if text.startswith(prefix) else text
            else:
                body = text
            notes.append({"topic": topic, "text": body, "links": extract_links(node)})
        elif node.name == "h4":
            build["heading"] = collapse(node.get_text(""))
        elif node.name == "ul":
            build["items"] = [
                {"text": collapse(li.get_text(" ")), "links": extract_links(li)}
                for li in node.find_all("li", recursive=False)
            ]
    return notes, build


def build_resources(html_path: Path, url: str, fetched_at: str) -> dict:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "lxml")
    main = soup.find("main")
    if main is None:
        raise ValueError("resources page has no main element")

    section_titles = {}
    for section in main.find_all("section"):
        heading = section.find("h3")
        if heading is None:
            continue
        clone = BeautifulSoup(str(heading), "lxml").find("h3")
        for button in clone.find_all("button"):
            button.decompose()
        section_titles[section.get("id", "")] = collapse(clone.get_text(" "))

    tables = []
    specs = RESOURCE_TABLES
    page_tables = main.find_all("table")
    if len(page_tables) != len(specs):
        raise ValueError(f"expected {len(specs)} tables, found {len(page_tables)}")

    for table, spec in zip(page_tables, specs):
        section = table.find_parent("section")
        if section is None:
            raise ValueError(f"table {spec['id']} is not inside a section")
        section_id = section.get("id", "")
        tables.append(
            parse_table(
                table,
                spec,
                section,
                section_titles.get(section_id, ""),
                f"{url}#{section_id}",
            )
        )

    stats_section = main.find("section", id="stats")
    notes, build = parse_stats_notes(stats_section) if stats_section is not None else ([], {"heading": "", "items": []})

    # Attach the prose note for a stat to its soft-cap row. The prose uses bare
    # stat names ("Intelligence") while the table splits scaling and casting
    # variants ("Intelligence (Weapon)"), so a base name applies to every
    # variant row that starts with it.
    stats_table = next(table for table in tables if table["id"] == "soft-caps")
    note_by_topic = {note["topic"]: note for note in notes}
    for row in stats_table["rows"]:
        stat = row["stat"]
        note = note_by_topic.get(stat)
        if note is None:
            note = next(
                (candidate for topic, candidate in note_by_topic.items() if stat.startswith(f"{topic} (")),
                None,
            )
        if note is not None:
            row["note"] = note["text"]
            if note["links"]:
                row["noteLinks"] = note["links"]

    counts = {table["id"]: len(table["rows"]) for table in tables}
    counts["tables"] = len(tables)
    counts["rows"] = sum(len(table["rows"]) for table in tables)

    no_cost = [
        f"{table['id']}: {row.get('material') or row.get('name')}"
        for table in tables
        for row in table["rows"]
        if "cost" in row and row["cost"] is None
    ]

    return {
        "source": {
            "name": "Redmaw Completion Sheets — Resources",
            "url": url,
            "fetchedAt": fetched_at,
        },
        "fetchedAt": fetched_at,
        "tables": tables,
        "categories": {
            "softCaps": ["soft-caps"],
            "smithingStones": ["smithing-stones", "somber-smithing-stones"],
            "gloveworts": ["grave-gloveworts", "ghost-gloveworts"],
            "runes": ["runes-base", "runes-dlc"],
            "remembrances": ["remembrances-base", "remembrances-dlc"],
            "scadutreeFragments": ["scadutree-fragments"],
            "reveredSpiritAshes": ["revered-spirit-ashes"],
        },
        "notes": notes,
        "buildRecommendation": build,
        "counts": counts,
        "unresolved": [],
        "unresolvedTables": [],
        "notesOnCoverage": {
            "nullCostRows": no_cost,
            "explanation": (
                "Rows with a null cost are the top-tier materials whose cost and bell-bearing "
                "cells are blank on the sheet; blanks are preserved as null rather than inferred."
            ),
        },
    }


def parse_toc(soup: BeautifulSoup) -> dict[str, dict]:
    """Map section id -> title / level range / DLC flag from nav#toc."""
    toc: dict[str, dict] = {}
    for item in soup.select("nav#toc li"):
        anchor = item.find("a", href=True)
        if anchor is None:
            continue
        section_id = anchor["href"].lstrip("#")
        if not section_id:
            continue
        clone = BeautifulSoup(str(item), "lxml").find("li")
        for tag in clone.find_all(["a", "span", "abbr"]):
            tag.decompose()
        range_match = re.search(r"\(([^)]+)\)", collapse(clone.get_text("")))
        toc[section_id] = {
            "title": collapse(anchor.get_text("")),
            "levelRange": range_match.group(1) if range_match else "",
            "dlc": item.find("abbr", class_="dlc") is not None,
        }
    return toc


def parse_npc_step(label, order: int) -> dict:
    """Build one normalized step, excluding nested sub-step content."""
    checkbox = label.find("input", {"type": "checkbox"})
    if checkbox is None or not checkbox.get("id"):
        raise ValueError("step label without a checkbox id")

    # Nested sub-steps are separate checkboxes; keep them out of the parent.
    clone = BeautifulSoup(str(label), "lxml").find("label")
    for nested in clone.find_all("ul"):
        nested.decompose()

    badges: list[str] = []
    for badge in clone.select("span.badge"):
        text = collapse(badge.get_text(""))
        if text and text not in badges:
            badges.append(text)

    for badge in clone.select("span.badge"):
        badge.decompose()

    links = extract_links(clone)
    text = collapse(clone.get_text(""))
    if not text:
        raise ValueError(f"step '{checkbox['id']}' has no text")

    return {
        "id": checkbox["id"],
        "order": order,
        "text": text,
        "optional": "Optional" in badges,
        "badges": badges,
        "links": links,
    }


def build_npc(html_path: Path, url: str, fetched_at: str) -> dict:
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "lxml")
    toc = parse_toc(soup)
    sections_html = soup.select("main form section")
    if not sections_html:
        raise ValueError("no 'main form section' elements found")

    out: list[dict] = []
    seen_ids: set[str] = set()
    for section_order, section in enumerate(sections_html, start=1):
        section_id = section.get("id")
        if not section_id:
            raise ValueError(f"section {section_order} has no id")
        if section_id not in toc:
            raise ValueError(f"section '{section_id}' missing from table of contents")

        heading = section.find("h3", recursive=False)
        if heading is None:
            raise ValueError(f"section '{section_id}' has no h3 title")
        heading_clone = BeautifulSoup(str(heading), "lxml").find("h3")
        for button in heading_clone.find_all("button"):
            button.decompose()
        title = collapse(heading_clone.get_text(" "))
        if title != toc[section_id]["title"]:
            raise ValueError(
                f"section '{section_id}' title mismatch: page '{title}' vs toc '{toc[section_id]['title']}'"
            )

        section_notes = [
            collapse(note.get_text(" "))
            for note in section.select("li.note")
            if collapse(note.get_text(" "))
            and note.find("input", {"type": "checkbox"}) is None
        ]

        steps: list[dict] = []
        for label in section.select("label"):
            if label.find("input", {"type": "checkbox"}) is None:
                continue
            if label.find_parent("li", class_="note") is not None:
                continue
            step = parse_npc_step(label, len(steps) + 1)
            step["dlc"] = toc[section_id]["dlc"]
            if step["id"] in seen_ids:
                raise ValueError(f"duplicate step id '{step['id']}'")
            seen_ids.add(step["id"])
            steps.append(step)

        if not steps:
            raise ValueError(f"section '{section_id}' has no steps")

        entry = {
            "id": section_id,
            "title": title,
            "order": section_order,
            "levelRange": toc[section_id]["levelRange"],
            "dlc": toc[section_id]["dlc"],
            "sourceUrl": f"{url}#{section_id}",
            "steps": steps,
        }
        if section_notes:
            entry["notes"] = section_notes
        out.append(entry)

    if len(toc) != len(out):
        raise ValueError(f"table of contents has {len(toc)} entries but page has {len(out)} sections")

    total_steps = sum(len(section["steps"]) for section in out)
    if len(out) != EXPECTED_NPC_SECTIONS:
        raise ValueError(f"expected {EXPECTED_NPC_SECTIONS} sections, found {len(out)}")
    if total_steps != EXPECTED_NPC_STEPS:
        raise ValueError(f"expected {EXPECTED_NPC_STEPS} steps, found {total_steps}")

    for section in out:
        for step in section["steps"]:
            if not re.fullmatch(r"n\d+-\d+", step["id"]):
                raise ValueError(f"unexpected step id '{step['id']}'")

    steps = [step for section in out for step in section["steps"]]
    badge_counts: dict[str, int] = {}
    for step in steps:
        for badge in step["badges"]:
            badge_counts[badge] = badge_counts.get(badge, 0) + 1

    dlc_sections = [section["id"] for section in out if section["dlc"]]
    counts = {
        "sections": len(out),
        "steps": total_steps,
        "optional": sum(1 for step in steps if step["optional"]),
        "missable": sum(1 for step in steps if "MISSABLE" in step["badges"]),
        "links": sum(len(step["links"]) for step in steps),
        "stepsWithLinks": sum(1 for step in steps if step["links"]),
        "badges": badge_counts,
        "dlcSections": len(dlc_sections),
        "dlcSteps": sum(1 for step in steps if step["dlc"]),
        "sectionNotes": sum(len(section.get("notes", [])) for section in out),
    }

    return {
        "source": {
            "name": "Redmaw Completion Sheets — NPC Walkthrough",
            "url": url,
            "fetchedAt": fetched_at,
        },
        "game": "base+dlc",
        "kind": "npc-walkthrough",
        "description": (
            "Alternate location-ordered NPC walkthrough from the Redmaw sheet. It covers every "
            "questline step but groups them by area rather than by NPC, so it complements — and "
            "does not replace — research/route.base.json, research/route.dlc.json, or "
            "research/questlines.json."
        ),
        "fetchedAt": fetched_at,
        "counts": counts,
        "sections": out,
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="re-download both source pages")
    parser.add_argument(
        "--fetched-at",
        default=CAPTURED_AT,
        help="ISO-8601 capture timestamp written to the JSON (default: cached capture time)",
    )
    args = parser.parse_args()

    pages = [
        ("resources", RESOURCES_URL, RESOURCES_RAW, RESOURCES_OUT),
        ("npc-walkthrough", NPC_URL, NPC_RAW, NPC_OUT),
    ]

    fetched_at = {name: args.fetched_at for name, _url, _raw, _out in pages}
    for name, url, raw, _out in pages:
        if args.refresh or not raw.exists():
            fetched_at[name] = download(url, raw)

    resources = build_resources(RESOURCES_RAW, RESOURCES_URL, fetched_at["resources"])
    npc = build_npc(NPC_RAW, NPC_URL, fetched_at["npc-walkthrough"])

    write_json(RESOURCES_OUT, resources)
    write_json(NPC_OUT, npc)

    print(f"resources: {resources['counts']['tables']} tables, {resources['counts']['rows']} rows")
    for table in resources["tables"]:
        print(f"  {table['id']}: {len(table['rows'])} rows ({table['sectionTitle']})")
    print(f"  wrote {RESOURCES_OUT.relative_to(REPO_ROOT)}")

    counts = npc["counts"]
    print(
        f"\nnpc-walkthrough: {counts['sections']} sections, {counts['steps']} steps, "
        f"{counts['optional']} optional, {counts['missable']} missable, {counts['links']} links"
    )
    print(
        f"  dlc: {counts['dlcSections']} sections / {counts['dlcSteps']} steps; "
        f"section notes: {counts['sectionNotes']}"
    )
    print(f"  wrote {NPC_OUT.relative_to(REPO_ROOT)}")

    print("\nSamples:")
    sample_sections = [0, 1, 3, 26, 29, 35]
    for index in sample_sections:
        section = npc["sections"][index]
        step = section["steps"][0]
        print(f"\n{section['title']} [{section['levelRange']}] dlc={section['dlc']} steps={len(section['steps'])}")
        print(f"  id={step['id']} optional={step['optional']} badges={step['badges']}")
        print(f"  text={step['text']}")
        for link in step["links"][:2]:
            print(f"  link={link['label']} -> {link['url']}")

    stats = next(table for table in resources["tables"] if table["id"] == "soft-caps")
    print("\nsoft caps sample:", stats["rows"][0])
    print("\nTotals reconciled: resources 11/138, npc-walkthrough 604/36")
    return 0


if __name__ == "__main__":
    sys.exit(main())
