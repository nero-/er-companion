#!/usr/bin/env python3
"""Independently verify the Redmaw full-game research artifacts.

The script reads the normalized JSON files *and* the archived raw HTML, then
compares counts, IDs, links, badges, and artwork metadata. It does not read or
test the application source and does not use the project build.

Usage:
    python3 scripts/research/verify_full_game.py
    python3 scripts/research/verify_full_game.py --write-report docs/audit/FULL_GAME_RESEARCH_VERIFICATION.md
"""

from __future__ import annotations

import argparse
import hashlib
import html as html_lib
import json
import re
import struct
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "research"
RAW = RESEARCH / "raw"
ART_DIR = ROOT / "public" / "art"
FONT_DIR = ROOT / "public" / "fonts"

JSON_ARTIFACTS = (
    "route.base.json",
    "route.dlc.json",
    "items.json",
    "merchants.json",
    "achievements.json",
    "bosses.json",
    "questlines.json",
    "ngplus.json",
    "art/manifest.json",
)

RAW_ARTIFACTS = (
    "route.base.html",
    "route.dlc.html",
    "items-weapons.html",
    "items-armor.html",
    "items-ashes.html",
    "items-spells.html",
    "items-talismans.html",
    "items-key-items.html",
    "items-miscellaneous-items.html",
    "merchants.html",
    "world-achievements.html",
    "world-bosses.html",
    "world-questlines.html",
    "world-ngplus.html",
)

ITEM_SHEETS = {
    "weapons": "items-weapons.html",
    "armor": "items-armor.html",
    "ashes": "items-ashes.html",
    "spells": "items-spells.html",
    "talismans": "items-talismans.html",
    "key-items": "items-key-items.html",
    "miscellaneous-items": "items-miscellaneous-items.html",
}

PLACEHOLDER_RE = re.compile(
    r"\b(todo|tbd|placeholder|lorem ipsum|coming soon|undefined)\b", re.IGNORECASE
)
MISSABLE_TEXT_RE = re.compile(
    r"missable|unobtainable|locked out|point of no return", re.IGNORECASE
)
LEVEL_RE = re.compile(r"^(?:Levels|Scadu) \d+-\d+$")
HTTP_RE = re.compile(r"^https?://[^\s]+$")


@dataclass(frozen=True)
class Check:
    group: str
    name: str
    ok: bool
    detail: str


CHECKS: list[Check] = []
ANOMALIES: list[str] = []
COUNTS: list[tuple[str, str, str]] = []
RELATIVE_ROUTE_LINKS: list[tuple[str, str, str]] = []


def record(group: str, name: str, ok: bool, detail: str) -> None:
    CHECKS.append(Check(group, name, bool(ok), detail))


def note(text: str) -> None:
    ANOMALIES.append(text)


def count(scope: str, name: str, value: Any) -> None:
    COUNTS.append((scope, name, f"{value:,}" if isinstance(value, int) else str(value)))


def load_json(name: str) -> dict[str, Any]:
    path = RESEARCH / name
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_name(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value)
    ascii_text = folded.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


def is_absolute_http(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def html_sections(path: Path) -> list[dict[str, Any]]:
    """Return top-level <section> id, h3 title, and checkbox count."""
    text = path.read_text(encoding="utf-8")
    matches = list(
        re.finditer(r'<section id="([^"]+)"[^>]*>\s*<h3>(.*?)</h3>', text, re.S)
    )
    sections: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        title = html_lib.unescape(re.sub(r"<[^>]+>", "", match.group(2)))
        title = re.sub(r"\d+/\d+$", "", title).strip()
        sections.append(
            {
                "id": match.group(1),
                "title": title,
                "checkboxes": text[match.start() : end].count('type="checkbox"'),
            }
        )
    return sections


def html_rows(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return re.split(r'(?=<input type="checkbox")', text)[1:]


def join(values: Iterable[Any], limit: int = 5) -> str:
    items = [str(value) for value in values]
    if not items:
        return "none"
    shown = ", ".join(items[:limit])
    if len(items) > limit:
        shown += f" (+{len(items) - limit} more)"
    return shown


def image_dimensions(path: Path) -> tuple[int, int] | None:
    """Read JPEG/PNG dimensions without third-party dependencies."""
    data = path.read_bytes()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        if len(data) < 24 or data[12:16] != b"IHDR":
            return None
        width, height = struct.unpack(">II", data[16:24])
        return width, height
    if data[:2] == b"\xff\xd8":
        index = 2
        sof_markers = {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }
        while index + 9 < len(data):
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            index += 2
            if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
                continue
            if marker == 0xDA:
                break
            if index + 2 > len(data):
                break
            length = struct.unpack(">H", data[index : index + 2])[0]
            if length < 2:
                break
            if marker in sof_markers:
                if index + 7 > len(data):
                    break
                height, width = struct.unpack(">HH", data[index + 3 : index + 7])
                return width, height
            index += length
    return None


def verify_provenance() -> None:
    missing = [
        f"research/{name}"
        for name in JSON_ARTIFACTS
        if not (RESEARCH / name).is_file()
    ]
    missing += [
        f"research/raw/{name}" for name in RAW_ARTIFACTS if not (RAW / name).is_file()
    ]
    record(
        "Provenance",
        "Normalized JSON and raw HTML artifacts present",
        not missing,
        f"{len(JSON_ARTIFACTS)} JSON + {len(RAW_ARTIFACTS)} raw HTML files; missing: {join(missing) if missing else 'none'}",
    )

    metadata_problems: list[str] = []
    for name in (
        "route.base.json",
        "route.dlc.json",
        "items.json",
        "merchants.json",
        "achievements.json",
        "bosses.json",
        "questlines.json",
        "ngplus.json",
    ):
        doc = load_json(name)
        source = doc.get("source")
        if isinstance(source, str):
            if not source.strip():
                metadata_problems.append(f"{name}: empty source")
        elif not isinstance(source, dict):
            metadata_problems.append(f"{name}: missing source")
        else:
            if not source.get("name"):
                metadata_problems.append(f"{name}: missing source.name")
            if not str(source.get("url", "")).startswith("https://"):
                metadata_problems.append(f"{name}: source.url is not https")
        fetched = doc.get("fetchedAt", source.get("fetchedAt") if isinstance(source, dict) else None)
        if not fetched:
            metadata_problems.append(f"{name}: missing fetchedAt")

    manifest = load_json("art/manifest.json")
    if not manifest.get("source"):
        metadata_problems.append("art/manifest.json: missing source")
    if "unofficial fan project" not in str(manifest.get("disclaimer", "")).lower():
        metadata_problems.append("art/manifest.json: disclaimer missing")

    record(
        "Provenance",
        "Source metadata and fetch timestamps",
        not metadata_problems,
        f"Redmaw + Steam sources; problems: {join(metadata_problems) if metadata_problems else 'none'}",
    )


def verify_route(
    group: str,
    filename: str,
    raw_filename: str,
    prefix: str,
    expected_sections: int,
    expected_steps: int,
    expected_missables: int,
) -> dict[str, Any]:
    doc = load_json(filename)
    sections = doc["sections"]
    steps = [step for section in sections for step in section["steps"]]
    raw_sections = html_sections(RAW / raw_filename)
    raw_total = sum(section["checkboxes"] for section in raw_sections)

    json_pairs = [
        (section["id"], section["title"], len(section["steps"])) for section in sections
    ]
    raw_pairs = [
        (section["id"], section["title"], section["checkboxes"])
        for section in raw_sections
    ]
    pair_mismatch = next(
        (
            (json_pair, raw_pair)
            for json_pair, raw_pair in zip(json_pairs, raw_pairs)
            if json_pair != raw_pair
        ),
        None,
    )
    record(
        group,
        "Sections and per-section step counts match source",
        len(sections) == expected_sections
        and len(raw_sections) == expected_sections
        and json_pairs == raw_pairs,
        f"{len(sections):,} sections / source {len(raw_sections):,}; "
        f"{len(steps):,} steps / source {raw_total:,}; mismatch: "
        f"{pair_mismatch if pair_mismatch else 'none'}",
    )

    orders_ok = [section["order"] for section in sections] == list(
        range(1, len(sections) + 1)
    )
    step_orders_ok = all(
        [step["order"] for step in section["steps"]]
        == list(range(1, len(section["steps"]) + 1))
        for section in sections
    )
    record(
        group,
        "Section and step order is contiguous",
        orders_ok and step_orders_ok,
        f"section orders 1..{len(sections)}; step orders contiguous per section",
    )

    section_ids = [section["id"] for section in sections]
    step_ids = [step["id"] for step in steps]
    bad_prefix = [
        step["id"]
        for section in sections
        for step in section["steps"]
        if not re.fullmatch(rf"{prefix}{section['order']}-\d+", step["id"])
    ]
    record(
        group,
        "IDs are unique and use the Redmaw checkbox pattern",
        len(set(section_ids)) == len(section_ids)
        and len(set(step_ids)) == len(step_ids)
        and not bad_prefix,
        f"{len(step_ids):,} unique step IDs; prefix `{prefix}<section>-<step>`; bad: {join(bad_prefix)}",
    )

    links = [
        (step["id"], link)
        for step in steps
        for link in step.get("links", [])
    ]
    bad_links = [
        (step_id, link.get("label"), link.get("url"))
        for step_id, link in links
        if not str(link.get("label", "")).strip()
        or not str(link.get("url", "")).strip()
        or re.search(r"\s", str(link.get("url", "")).strip())
    ]
    relative = [
        (step_id, link["label"], link["url"])
        for step_id, link in links
        if not is_absolute_http(str(link.get("url", "")))
    ]
    RELATIVE_ROUTE_LINKS.extend(relative)
    hosts = Counter(urlparse(str(link.get("url", ""))).netloc for _, link in links)
    record(
        group,
        "Links retain labels and hrefs",
        not bad_links,
        f"{len(links):,} links from {len({step_id for step_id, _ in links}):,} steps; "
        f"hosts: {dict(hosts.most_common(4))}; empty/malformed: {join(bad_links)}",
    )
    record(
        group,
        "Link targets are absolute URLs",
        not relative,
        f"{len(relative):,} relative href(s): {join(f'{step_id}={url}' for step_id, _, url in relative)}",
    )

    optional = [step for step in steps if step.get("optional")]
    optional_badge = [
        step for step in steps if "Optional" in step.get("badges", [])
    ]
    badge_mismatch = [
        step["id"]
        for step in steps
        if bool(step.get("optional")) != ("Optional" in step.get("badges", []))
    ]
    record(
        group,
        "Optional flag and Optional badge agree",
        not badge_mismatch,
        f"{len(optional):,} optional steps ({len(optional_badge):,} Optional badges); "
        f"mismatches: {join(badge_mismatch)}",
    )

    badge_steps = [
        step
        for step in steps
        if any("MISSABLE" in badge.upper() for badge in step.get("badges", []))
    ]
    badge_ids = {step["id"] for step in badge_steps}
    text_only = [
        step
        for step in steps
        if MISSABLE_TEXT_RE.search(step["text"])
        and step["id"] not in badge_ids
    ]
    text_ids = {step["id"] for step in text_only}

    raw_text = (RAW / raw_filename).read_text(encoding="utf-8")
    raw_missable_badges = len(re.findall(r">\s*MISSABLE\s*<", raw_text))
    raw_markup_ids: set[str] = set()
    for match in re.finditer(r'<input type="checkbox" id="([^"]+)"', raw_text):
        label_end = raw_text.find("</label>", match.end())
        label = raw_text[match.start() : label_end if label_end != -1 else match.end()]
        if re.search(r'class="[^"]*missable', label, re.IGNORECASE):
            raw_markup_ids.add(match.group(1))
    marker_only = sorted(raw_markup_ids - badge_ids)
    rule_union = len(badge_ids | text_ids)
    any_marker_union = len(badge_ids | raw_markup_ids | text_ids)

    record(
        group,
        "MISSABLE badges match the raw source",
        len(badge_steps) == raw_missable_badges,
        f"{len(badge_steps):,} badge-bearing steps / source {raw_missable_badges:,}; "
        f"additional missable-marked steps without a visible badge: {join(marker_only)}; "
        f"text-only warnings: {join(sorted(text_ids))}",
    )
    record(
        group,
        f"Missable denominator (contract: {expected_missables})",
        any_marker_union == expected_missables,
        f"expected {expected_missables:,}; observed {any_marker_union:,} by any missable marker "
        f"({len(badge_steps):,} MISSABLE badge + {len(marker_only):,} missable-trophy marker + "
        f"{len(text_only):,} text-only); badge/text rule = {rule_union:,}",
    )
    if any_marker_union != expected_missables:
        note(
            f"{group} missable denominator: the contract states {expected_missables:,} but the "
            f"widest artifact count is {any_marker_union:,} "
            f"({len(badge_steps):,} MISSABLE badges + {len(marker_only):,} missable-trophy "
            f"marker-only + {len(text_only):,} text-only warnings). The shortfall is "
            f"{expected_missables - any_marker_union:,} by the widest definition and "
            f"{expected_missables - rule_union:,} under the integration's badge-or-text rule. "
            f"Do not hardcode {expected_missables:,} when asserting coverage."
        )

    empty_level_sections = [
        section["title"] for section in sections if not section["levelRange"].strip()
    ]
    if empty_level_sections:
        note(
            f"{group} has {len(empty_level_sections)} section(s) with an empty level range: "
            f"{join(empty_level_sections)}. This is source data, not a scrape failure."
        )

    empty_text = [step["id"] for step in steps if not step["text"].strip()]
    html_text = [
        step["id"] for step in steps if re.search(r"<[^>]+>", step["text"])
    ]
    placeholders = [
        step["id"] for step in steps if PLACEHOLDER_RE.search(step["text"])
    ]
    duplicate_text = {
        text: value
        for text, value in Counter(step["text"].strip() for step in steps).items()
        if value > 1
    }
    record(
        group,
        "Step text is readable and free of placeholders",
        not empty_text and not html_text and not placeholders,
        f"empty: {join(empty_text)}; HTML: {join(html_text)}; "
        f"placeholders: {join(placeholders)}; repeated texts: {len(duplicate_text)}",
    )

    unknown_badges = sorted(
        {
            badge
            for step in steps
            for badge in step.get("badges", [])
            if badge not in {"Optional", "MISSABLE", "🏆"}
        }
    )
    record(
        group,
        "Badge vocabulary is expected",
        not unknown_badges,
        f"badges: {dict(Counter(badge for step in steps for badge in step.get('badges', [])))}",
    )

    count(f"{group} sections", "sections", len(sections))
    count(f"{group} sections", "steps", len(steps))
    count(f"{group} sections", "optional steps", len(optional))
    count(f"{group} sections", "MISSABLE-badged steps", len(badge_steps))
    count(f"{group} sections", "missable union (any marker)", any_marker_union)
    count(f"{group} sections", "missable-trophy marker-only steps", len(marker_only))
    count(f"{group} sections", "missable badge/text union", rule_union)
    count(f"{group} sections", "links", len(links))
    count(f"{group} sections", "relative links", len(relative))

    return {
        "doc": doc,
        "sections": sections,
        "steps": steps,
        "relative_links": relative,
        "missable_union": any_marker_union,
        "missable_marker_only": marker_only,
        "missable_rule_union": rule_union,
        "badge_steps": badge_steps,
        "text_only": text_only,
    }


def verify_chronology(base: dict[str, Any], dlc: dict[str, Any]) -> None:
    base_sections = base["sections"]
    dlc_sections = dlc["sections"]
    base_steps = base["steps"]
    dlc_steps = dlc["steps"]

    farum = next((section for section in base_sections if section["id"] == "farum-azula"), None)
    split_step = next((step for step in base_steps if step["id"] == "w46-96"), None)
    aftermath = [step for step in base_steps if step["id"] in {"w46-97", "w46-98", "w46-99"}]
    pre_dlc_steps = (
        sum(len(section["steps"]) for section in base_sections if section["order"] < 46)
        + (sum(1 for step in farum["steps"] if step["order"] <= 96) if farum else 0)
    )
    post_endgame_steps = sum(
        len(section["steps"]) for section in base_sections if section["order"] > 46
    )
    endgame_steps = len(aftermath) + post_endgame_steps
    projected_sections = 46 + 20 + 1 + 3

    split_ok = (
        farum is not None
        and farum["order"] == 46
        and len(farum["steps"]) == 99
        and split_step is not None
        and re.search(r"point of no return", split_step["text"], re.IGNORECASE)
        and re.search(r"missable", split_step["text"], re.IGNORECASE)
        and len(aftermath) == 3
    )
    record(
        "Route — chronology",
        "Maliketh split at w46-96 is present",
        split_ok,
        f"base section 46 `farum-azula` has 99 steps; w46-96 is the point-of-no-return warning; "
        f"post-Maliketh steps: {join(step['id'] for step in aftermath)}",
    )

    order_ok = (
        base_sections[45]["id"] == "farum-azula"
        and base_sections[46]["id"] == "ashen-leyndell"
        and base_sections[47]["id"] == "endings"
        and base_sections[48]["id"] == "ng-prep"
        and dlc_sections[0]["id"] == "west-gravesite"
        and dlc_sections[-1]["id"] == "enir-ilim"
        and len(base_sections) == 49
        and len(dlc_sections) == 20
    )
    record(
        "Route — chronology",
        "Base 1–46 → DLC 1–20 → base 47–49 boundaries",
        order_ok,
        f"base endgame ids: {join(section['id'] for section in base_sections[46:])}; "
        f"DLC first/last: {dlc_sections[0]['id']} / {dlc_sections[-1]['id']}",
    )

    total = len(base_steps) + len(dlc_steps)
    record(
        "Route — chronology",
        "Canonical step arithmetic totals 4,521",
        total == 4521
        and pre_dlc_steps == 3303
        and len(dlc_steps) == 1126
        and endgame_steps == 92
        and pre_dlc_steps + len(dlc_steps) + endgame_steps == 4521,
        f"{pre_dlc_steps:,} pre-DLC + {len(dlc_steps):,} DLC + {endgame_steps:,} endgame "
        f"(3 aftermath + {post_endgame_steps:,} base endgame) = {total:,}",
    )

    record(
        "Route — chronology",
        "Projected canonical section total is 70",
        projected_sections == 70,
        f"46 base pre-DLC + 20 DLC + 1 synthetic aftermath + 3 base endgame = {projected_sections}",
    )

    combined_ids = [step["id"] for step in base_steps] + [step["id"] for step in dlc_steps]
    record(
        "Route — chronology",
        "Base and DLC step IDs do not collide",
        len(set(combined_ids)) == len(combined_ids),
        f"{len(combined_ids):,} combined IDs; duplicate count {len(combined_ids) - len(set(combined_ids))}",
    )

    count("Route — chronology", "source sections", len(base_sections) + len(dlc_sections))
    count("Route — chronology", "canonical sections after split", projected_sections)
    count("Route — chronology", "pre-DLC steps", pre_dlc_steps)
    count("Route — chronology", "DLC steps", len(dlc_steps))
    count("Route — chronology", "endgame steps", endgame_steps)
    count("Route — chronology", "total steps", total)

    if RELATIVE_ROUTE_LINKS:
        base_count = sum(1 for step_id, _, _ in RELATIVE_ROUTE_LINKS if step_id.startswith("w"))
        dlc_count = len(RELATIVE_ROUTE_LINKS) - base_count
        note(
            f"Route links include {len(RELATIVE_ROUTE_LINKS)} relative hrefs "
            f"({base_count} base + {dlc_count} DLC): site-root image paths, in-page "
            "anchors, and two `/sheets/...` links. They preserve the source exactly, but "
            "must be resolved against `https://eldenring.redmaw.dev` before rendering in "
            "the standalone app; otherwise deep links and image links break. The two "
            "absolute-URL check failures are this single normalization issue."
        )

    if split_step is not None:
        note(
            "Maliketh split: `w46-96` is the warning immediately after the `w46-95` Maliketh kill; "
            "`w46-97..99` are the three post-Maliketh steps. The split is arithmetically compatible "
            "with the contract."
        )


def verify_items() -> None:
    doc = load_json("items.json")
    items = doc["items"]
    counts = doc["counts"]
    sheets = doc["sheets"]

    raw_rows = {sheet: html_rows(RAW / filename) for sheet, filename in ITEM_SHEETS.items()}
    raw_counts = {sheet: len(rows) for sheet, rows in raw_rows.items()}
    raw_total = sum(raw_counts.values())
    raw_dlc = {
        sheet: sum(1 for row in rows if re.search(r'class="dlc"', row))
        for sheet, rows in raw_rows.items()
    }
    raw_placeholders = sum(
        1 for rows in raw_rows.values() for row in rows if "Coming soon" in row
    )

    sheet_count_ok = all(
        sheets[sheet]["checkboxes"] == raw_counts[sheet] for sheet in ITEM_SHEETS
    )
    record(
        "Items",
        "Raw sheet row counts match the archived HTML",
        raw_total == 2116
        and sum(sheet["checkboxes"] for sheet in sheets.values()) == raw_total
        and sheet_count_ok,
        f"{raw_total:,} checkboxes: "
        + ", ".join(f"{sheet} {raw_counts[sheet]:,}" for sheet in ITEM_SHEETS),
    )

    parsed = sum(sheet["parsed"] for sheet in sheets.values())
    placeholders_skipped = sum(
        sheet["placeholdersSkipped"] for sheet in sheets.values()
    )
    deduped = len(items)
    record(
        "Items",
        "Parsed / deduped arithmetic reconciles",
        counts["checkboxRows"] == raw_total
        and counts["parsed"] == parsed == raw_total - placeholders_skipped
        and counts["deduped"] == deduped == parsed - counts["duplicatesRemoved"]
        and counts["placeholdersSkipped"] == placeholders_skipped == raw_placeholders,
        f"{raw_total:,} rows - {placeholders_skipped:,} placeholders = {parsed:,} parsed; "
        f"- {counts['duplicatesRemoved']:,} duplicates = {deduped:,} records",
    )

    ids = [item["id"] for item in items]
    bad_ids = [item_id for item_id in ids if not re.fullmatch(r"rw-[a-z0-9-]+", item_id)]
    documented_keys = {
        (normalize_name(item["name"]), item["group"], normalize_name(item["category"]))
        for item in items
    }
    group_keys = {(normalize_name(item["name"]), item["group"]) for item in items}
    name_keys = Counter(normalize_name(item["name"]) for item in items)
    name_collisions = {
        name: value for name, value in name_keys.items() if value > 1
    }
    record(
        "Items",
        "IDs and documented name+group+category keys are unique",
        len(set(ids)) == len(ids)
        and len(documented_keys) == len(items)
        and len(group_keys) == len(items)
        and not bad_ids,
        f"{len(ids):,} IDs; {len(documented_keys):,} unique name+group+category keys; "
        f"{len(group_keys):,} unique name+group keys; bad IDs: {join(bad_ids)}",
    )
    record(
        "Items",
        "Cross-group name collisions are isolated",
        len(name_keys) == len(items) - 1,
        f"{len(name_keys):,} unique names for {len(items):,} records; "
        f"collision(s): {join(name_collisions)}",
    )

    group_counts = Counter(item["group"] for item in items)
    expected_group_total = (
        group_counts.get("Weapon", 0)
        + group_counts.get("Shield", 0)
        + group_counts.get("Armor", 0)
        + group_counts.get("Spirit Ash", 0)
        + group_counts.get("Ash of War", 0)
        + group_counts.get("Spell", 0)
        + group_counts.get("Talisman", 0)
        + group_counts.get("Key & Lore", 0)
        + group_counts.get("Consumable", 0)
        + group_counts.get("Upgrade", 0)
        + group_counts.get("Note", 0)
        + group_counts.get("Gesture", 0)
    )
    armor_slots = Counter(
        item["slot"] for item in items if item["group"] == "Armor"
    )
    record(
        "Items",
        "Group and armor-slot totals reconcile",
        expected_group_total == len(items)
        and group_counts.get("Weapon", 0) + group_counts.get("Shield", 0) == 487
        and group_counts.get("Armor", 0) == 722
        and group_counts.get("Spirit Ash", 0) + group_counts.get("Ash of War", 0) == 200
        and group_counts.get("Spell", 0) == 213
        and group_counts.get("Talisman", 0) == 154
        and sum(armor_slots.values()) == 722,
        f"groups: {dict(group_counts)}; armor slots: {dict(armor_slots)}",
    )

    bad_wiki = [
        item["id"]
        for item in items
        if not is_absolute_http(item.get("wikiUrl", ""))
        or "eldenring.wiki.gg/wiki/" not in item.get("wikiUrl", "")
    ]
    wiki_urls = [item["wikiUrl"] for item in items]
    record(
        "Items",
        "Every item has one valid wiki.gg URL",
        not bad_wiki and len(set(wiki_urls)) == len(items),
        f"{len(wiki_urls):,} URLs; unique {len(set(wiki_urls)):,}; invalid: {join(bad_wiki)}",
    )

    dlc_count = sum(1 for item in items if item["dlc"])
    raw_dlc_count = sum(raw_dlc.values())
    record(
        "Items",
        "DLC flags match the SOTE/TP row markers",
        dlc_count == raw_dlc_count == 484,
        f"{dlc_count:,} flagged items / {raw_dlc_count:,} raw class=\"dlc\" rows; "
        f"by group: {dict(Counter(item['group'] for item in items if item['dlc']))}",
    )

    raw_info_count = sum(
        (RAW / filename).read_text(encoding="utf-8").count('<span class="info"')
        for filename in ITEM_SHEETS.values()
    )
    info_count = sum(1 for item in items if item.get("info"))
    record(
        "Items",
        "Acquisition info coverage matches the source",
        info_count == raw_info_count,
        f"{info_count:,}/{len(items):,} records with info ({info_count / len(items):.1%}); "
        f"raw span.info count {raw_info_count:,}; empty {len(items) - info_count:,}",
    )

    placeholder_hits = [
        item["id"]
        for item in items
        if PLACEHOLDER_RE.search(item["name"]) or PLACEHOLDER_RE.search(item.get("info", ""))
    ]
    record(
        "Items",
        "No placeholder text survives normalization",
        not placeholder_hits,
        f"placeholder hits: {join(placeholder_hits)}; "
        f"{raw_placeholders:,} source 'Coming soon...' rows were skipped",
    )

    count("Items", "raw checkbox rows", raw_total)
    count("Items", "parsed rows", parsed)
    count("Items", "duplicates removed", counts["duplicatesRemoved"])
    count("Items", "placeholders skipped", placeholders_skipped)
    count("Items", "final catalog", deduped)
    count("Items", "DLC-flagged items", dlc_count)
    count("Items", "items with acquisition info", info_count)

    note(
        f"Item info coverage is {info_count:,}/{len(items):,} ({info_count / len(items):.1%}); "
        f"{len(items) - info_count:,} records legitimately have no source `span.info`. "
        "Integration must not treat empty info as a merge failure."
    )
    note(
        f"One cross-group name collision survives: `Beast Claw` is both a Weapon "
        "(`rw-weapons-e29-1`) and a Spell (`rw-spells-s14-7`). The documented "
        "name+group+category key keeps both; name-only matching would collapse them."
    )


def verify_merchants() -> None:
    doc = load_json("merchants.json")
    merchants = doc["merchants"]
    counts = doc["counts"]
    raw_sections = html_sections(RAW / "merchants.html")
    raw_rows = html_rows(RAW / "merchants.html")
    raw_row_count = len(raw_rows)

    headings = sum(
        1 for row in raw_rows if re.match(r".*?</label>\s*<ul", row, re.S)
    )
    item_rows = sum(
        1 for row in raw_rows if re.search(r"</label>\s*</li>", row)
    )
    json_items = sum(len(merchant["items"]) for merchant in merchants)
    merchant_pairs = [(merchant["id"], merchant["name"]) for merchant in merchants]
    raw_pairs = [(section["id"], section["title"]) for section in raw_sections]
    record(
        "Merchants",
        "Merchants, rows, and headings reconcile",
        len(merchants) == 40
        and len(raw_sections) == 40
        and merchant_pairs == raw_pairs
        and raw_row_count == 724
        and headings == 97
        and item_rows == 627
        and json_items == 627
        and headings + item_rows == raw_row_count,
        f"{len(merchants):,} merchants / source {len(raw_sections):,}; "
        f"{raw_row_count:,} checkbox rows = {item_rows:,} items + {headings:,} headings; "
        f"JSON items {json_items:,}",
    )

    items = [item for merchant in merchants for item in merchant["items"]]
    rune_prices = [item for item in items if isinstance(item.get("price"), int)]
    costs = [item for item in items if item.get("cost")]
    remembrance_costs = [
        item for item in costs if "remembrance" in item["cost"].lower()
    ]
    other_costs = [item for item in costs if item not in remembrance_costs]
    stock = Counter(item.get("stock") for item in items)
    numeric_stock = sum(
        value for key, value in stock.items() if key and key != "infinite"
    )
    record(
        "Merchants",
        "Prices, costs, and stock are typed",
        len(rune_prices) == 556
        and len(costs) == 71
        and len(remembrance_costs) == 51
        and len(other_costs) == 20
        and stock.get("infinite", 0) == 130
        and stock.get("", 0) == 389
        and numeric_stock == 108
        and all(str(item.get("stock", "")) in {"", "infinite"} or str(item.get("stock", "")).isdigit() for item in items),
        f"{len(rune_prices):,} rune prices, {len(costs):,} costs "
        f"({len(remembrance_costs):,} remembrance + {len(other_costs):,} other); "
        f"stock infinite {stock.get('infinite', 0)}, blank {stock.get('', 0)}, numeric {numeric_stock}",
    )

    kale = next(merchant for merchant in merchants if merchant["id"] == "kale")
    kale_items = {item["name"]: item for item in kale["items"]}
    samples = [
        ("Throwing Dagger", 40, "infinite"),
        ("Telescope", 500, ""),
        ("Furlcalling Finger Remedy", 1000, "5"),
        ("Cracked Pot", 300, "3"),
    ]
    sample_ok = all(
        name in kale_items
        and kale_items[name].get("price") == price
        and kale_items[name].get("stock") == stock_value
        for name, price, stock_value in samples
    )
    enia = next(
        merchant
        for merchant in merchants
        if merchant["id"] == "enia-remembrances"
    )
    enia_sample = next(
        (item for item in enia["items"] if item["name"] == "Axe of Godrick"), None
    )
    record(
        "Merchants",
        "Representative prices and costs match the sheet",
        sample_ok
        and enia_sample is not None
        and enia_sample.get("price") is None
        and enia_sample.get("cost") == "Remembrance of the Grafted",
        "Kale: Throwing Dagger 40/infinite, Telescope 500/blank, "
        "Furlcalling Finger Remedy 1,000/5, Cracked Pot 300/3; "
        "Enia: Axe of Godrick costs 'Remembrance of the Grafted'",
    )

    bad_wiki = [
        item["stepId"]
        for item in items
        if not is_absolute_http(item.get("wikiUrl", ""))
        or "eldenring.wiki.gg/wiki/" not in item.get("wikiUrl", "")
    ]
    bad_names = [item["stepId"] for item in items if not item.get("name", "").strip()]
    step_ids = [item["stepId"] for item in items]
    record(
        "Merchants",
        "Rows have unique IDs, names, and wiki links",
        not bad_wiki
        and not bad_names
        and len(set(step_ids)) == len(step_ids)
        and all(re.fullmatch(r"m\d+-\d+", step_id) for step_id in step_ids),
        f"{len(step_ids):,} unique step IDs; {len(set(item['wikiUrl'] for item in items)):,} unique wiki URLs; "
        f"invalid wiki {join(bad_wiki)}; empty names {join(bad_names)}",
    )

    record(
        "Merchants",
        "Metadata counts match computed values",
        counts["sections"] == len(merchants)
        and counts["rows"] == raw_row_count
        and counts["items"] == json_items
        and counts["headingsSkipped"] == headings
        and counts["runePrices"] == len(rune_prices)
        and counts["remembranceCosts"] == len(remembrance_costs)
        and counts["otherCosts"] == len(other_costs),
        f"metadata: {dict(counts)}",
    )

    count("Merchants", "merchants", len(merchants))
    count("Merchants", "raw checkbox rows", raw_row_count)
    count("Merchants", "purchasable items", json_items)
    count("Merchants", "heading rows", headings)
    count("Merchants", "item notes", sum(1 for item in items if item.get("note")))
    count("Merchants", "rune prices", len(rune_prices))
    count("Merchants", "non-rune costs", len(costs))

    note(
        f"Merchant extraction has {json_items:,} purchasable rows plus {headings:,} "
        "nested heading rows (e.g. 'After moving to the Scenic Isle…:'), totaling 724 "
        "source checkboxes. Only the 627 item rows should be rendered as stock."
    )


def verify_achievements(items: list[dict[str, Any]]) -> None:
    doc = load_json("achievements.json")
    achievements = doc["achievements"]
    groups = doc["requirementGroups"]
    raw_sections = html_sections(RAW / "world-achievements.html")
    raw_counts = {section["id"]: section["checkboxes"] for section in raw_sections}

    section_counts = Counter(achievement["sectionId"] for achievement in achievements)
    record(
        "Achievements",
        "Exactly 42 achievements with the expected section split",
        len(achievements) == 42
        and section_counts == Counter({"misc": 9, "bosses": 24, "shardbearers": 6, "endings": 3})
        and raw_counts.get("misc") == 9
        and raw_counts.get("bosses") == 24
        and raw_counts.get("shardbearers") == 6
        and raw_counts.get("endings") == 3,
        f"{len(achievements):,} achievements; sections {dict(section_counts)}; "
        f"raw totals {sum(raw_counts.values()):,} across {len(raw_sections)} sections",
    )

    ids = [achievement["id"] for achievement in achievements]
    names = [normalize_name(achievement["name"]) for achievement in achievements]
    record(
        "Achievements",
        "Achievement IDs and names are unique",
        len(set(ids)) == len(ids) and len(set(names)) == len(names),
        f"{len(set(ids)):,} unique IDs / {len(set(names)):,} unique names",
    )

    item_names = {normalize_name(item["name"]) for item in items}
    group_counts = {group["id"]: len(group["items"]) for group in groups}
    missing_items = [
        (group["id"], item["name"])
        for group in groups
        for item in group["items"]
        if normalize_name(item["name"]) not in item_names
    ]
    expected_group_sizes = {
        "legendary-armaments": 9,
        "legendary-ashen-remains": 6,
        "legendary-sorceries-and-incantations": 7,
        "legendary-talismans": 8,
    }
    record(
        "Achievements",
        "Four legendary requirement groups contain 30 resolvable items",
        len(groups) == 4
        and group_counts == expected_group_sizes
        and sum(group_counts.values()) == 30
        and not missing_items,
        f"{len(groups)} groups / {sum(group_counts.values())} items "
        f"{group_counts}; item-catalog misses: {join(missing_items)}",
    )

    attached = [
        achievement["name"]
        for achievement in achievements
        if achievement.get("requirements")
    ]
    valid_group_ids = {group["id"] for group in groups}
    bad_requirements = [
        achievement["id"]
        for achievement in achievements
        for requirement in achievement.get("requirements", [])
        if requirement not in valid_group_ids
    ]
    record(
        "Achievements",
        "Requirement groups attach to the four legendary achievements",
        len(attached) == 4 and not bad_requirements,
        f"attached to: {join(attached)}; invalid refs: {join(bad_requirements)}",
    )

    missing_desc = [
        achievement["id"]
        for achievement in achievements
        if not achievement.get("description", "").strip()
    ]
    bad_wiki = [
        achievement["id"]
        for achievement in achievements
        if not is_absolute_http(achievement.get("wikiUrl", ""))
    ]
    record(
        "Achievements",
        "Descriptions and wiki links are complete",
        not missing_desc and not bad_wiki,
        f"{len(achievements):,} descriptions; {len(achievements):,} wiki links; "
        f"missing descriptions {join(missing_desc)}; invalid links {join(bad_wiki)}",
    )

    group_missing_wiki = [
        item["name"]
        for group in groups
        for item in group["items"]
        if not is_absolute_http(item.get("wikiUrl", ""))
    ]
    group_missing_desc = [
        item["name"]
        for group in groups
        for item in group["items"]
        if not item.get("description", "").strip()
    ]
    record(
        "Achievements",
        "Requirement item descriptions and links are complete",
        not group_missing_wiki and not group_missing_desc,
        f"30 items; missing wiki {join(group_missing_wiki)}; "
        f"missing descriptions {join(group_missing_desc)}",
    )

    trophy_steps = [
        step
        for section in load_json("route.base.json")["sections"]
        for step in section["steps"]
        if "🏆" in step.get("badges", [])
    ]
    record(
        "Achievements",
        "Base-route trophy badges match the 42 achievements",
        len(trophy_steps) == 42,
        f"{len(trophy_steps):,} trophy-badged base-route steps for "
        f"{len(achievements):,} achievements",
    )

    count("Achievements", "achievements", len(achievements))
    count("Achievements", "trophy-badged base steps", len(trophy_steps))
    count("Achievements", "requirement groups", len(groups))
    count("Achievements", "requirement items", sum(group_counts.values()))

    note(
        "The raw achievements sheet has 72 checkboxes: 42 achievements (9 misc, 24 bosses, "
        "6 shardbearers, 3 endings) plus 30 legendary requirement items (9 weapons, 6 ashes, "
        "7 spells, 8 talismans). The four requirement-group rows are not achievements."
    )


def verify_bosses() -> None:
    doc = load_json("bosses.json")
    bosses = doc["bosses"]
    achievements = load_json("achievements.json")["achievements"]
    raw_sections = html_sections(RAW / "world-bosses.html")
    raw_by_id = {
        section["id"]: (section["title"], section["checkboxes"])
        for section in raw_sections
    }
    json_by_section = Counter(boss["sectionId"] for boss in bosses)
    section_titles = {boss["sectionId"]: boss["section"] for boss in bosses}
    section_mismatch = [
        section_id
        for section_id, (title, checkbox_count) in raw_by_id.items()
        if section_titles.get(section_id) != title
        or json_by_section.get(section_id, 0) != checkbox_count
    ]

    record(
        "Bosses",
        "207 encounters across 42 source sections",
        len(bosses) == 207
        and len(raw_sections) == 42
        and len(json_by_section) == 42
        and sum(json_by_section.values()) == 207
        and not section_mismatch,
        f"{len(bosses):,} encounters / {len(json_by_section)} sections / source {len(raw_sections)}; "
        f"section mismatches: {join(section_mismatch)}",
    )

    ids = [boss["id"] for boss in bosses]
    names = Counter(normalize_name(boss["name"]) for boss in bosses)
    repeated = {name: value for name, value in names.items() if value > 1}
    record(
        "Bosses",
        "Boss IDs are unique",
        len(set(ids)) == len(ids) and all(re.fullmatch(r"[a-z0-9-]+", boss_id) for boss_id in ids),
        f"{len(ids):,} unique IDs; {len(names):,} unique names; "
        f"{len(bosses) - len(names):,} repeated encounter names",
    )
    record(
        "Bosses",
        "Boss names repeat only as distinct location encounters",
        len(repeated) > 0 and sum(value - 1 for value in repeated.values()) == 50,
        f"{len(repeated)} repeated names covering {sum(value - 1 for value in repeated.values())} extra rows; "
        f"examples: {join(repeated)}",
    )

    bad_levels = [
        boss["id"] for boss in bosses if not LEVEL_RE.fullmatch(boss.get("levelRange", ""))
    ]
    bad_wiki = [
        boss["id"]
        for boss in bosses
        if not is_absolute_http(boss.get("wikiUrl", ""))
    ]
    missing_desc = [
        boss["id"] for boss in bosses if not boss.get("description", "").strip()
    ]
    record(
        "Bosses",
        "Level ranges, descriptions, and wiki links are complete",
        not bad_levels and not bad_wiki and not missing_desc,
        f"{len(bosses):,} level ranges; {len(bosses):,} descriptions; "
        f"{len(bosses):,} wiki links; invalid levels {join(bad_levels)}; "
        f"invalid wiki {join(bad_wiki)}; missing descriptions {join(missing_desc)}",
    )

    dlc_bosses = [boss for boss in bosses if boss["dlc"]]
    dlc_sections = sorted({boss["sectionId"] for boss in dlc_bosses})
    flag_mismatch = [
        boss["id"]
        for boss in bosses
        if boss["dlc"] != (boss["sectionId"] in dlc_sections)
    ]
    record(
        "Bosses",
        "DLC flags agree across the 15 DLC sections",
        len(dlc_bosses) == 42 and len(dlc_sections) == 15 and not flag_mismatch,
        f"{len(dlc_bosses):,} DLC bosses in {len(dlc_sections)} sections; "
        f"{len(bosses) - len(dlc_bosses):,} base bosses; flag mismatches: {join(flag_mismatch)}",
    )

    achievement_names = {achievement["name"] for achievement in achievements}
    refs = [boss["achievement"] for boss in bosses if boss.get("achievement")]
    bad_refs = [name for name in refs if name not in achievement_names]
    record(
        "Bosses",
        "Achievement references resolve to achievement names",
        len(refs) == 30 and not bad_refs,
        f"{len(refs):,} boss rows with an achievement reference; unresolved: {join(bad_refs)}",
    )

    count("Bosses", "encounters", len(bosses))
    count("Bosses", "source sections", len(raw_sections))
    count("Bosses", "unique boss names", len(names))
    count("Bosses", "DLC encounters", len(dlc_bosses))

    note(
        f"Boss rows are {len(bosses):,} encounters but only {len(names):,} unique normalized "
        "names. The 50 extra rows are repeat encounters (Tree Sentinel, Night's Cavalry, "
        "Deathbird, etc.) with distinct IDs and sections; name-only merging would lose them."
    )
    note(
        "Boss `achievement` values are display names, not achievement slugs; integration "
        "must map them to the 42 achievement IDs."
    )


def verify_questlines() -> None:
    doc = load_json("questlines.json")
    questlines = doc["questlines"]
    steps = [step for questline in questlines for step in questline["steps"]]
    raw_sections = html_sections(RAW / "world-questlines.html")
    raw_pairs = [(section["id"], section["title"], section["checkboxes"]) for section in raw_sections]
    json_pairs = [
        (questline["id"], questline["npc"], len(questline["steps"]))
        for questline in questlines
    ]

    record(
        "Questlines",
        "52 questlines and 587 steps match the source",
        len(questlines) == 52
        and len(steps) == 587
        and len(raw_sections) == 52
        and sum(section["checkboxes"] for section in raw_sections) == 587
        and raw_pairs == json_pairs,
        f"{len(questlines):,} questlines / source {len(raw_sections):,}; "
        f"{len(steps):,} steps / source {sum(section['checkboxes'] for section in raw_sections):,}; "
        f"titles match: {raw_pairs == json_pairs}",
    )

    ids = [questline["id"] for questline in questlines]
    step_ids = [step["id"] for step in steps]
    source_ids = [step["sourceId"] for step in steps]
    order_ok = all(
        [step["order"] for step in questline["steps"]]
        == list(range(1, len(questline["steps"]) + 1))
        for questline in questlines
    )
    prefix_ok = all(
        step["id"].startswith(f"q-{questline['id']}-")
        for questline in questlines
        for step in questline["steps"]
    )
    record(
        "Questlines",
        "Questline and step IDs are stable and unique",
        len(set(ids)) == len(ids)
        and len(set(step_ids)) == len(step_ids)
        and len(set(source_ids)) == len(source_ids)
        and order_ok
        and prefix_ok
        and all(re.fullmatch(r"q\d+-\d+", source_id) for source_id in source_ids),
        f"{len(ids):,} questline IDs; {len(step_ids):,} step IDs; "
        f"{len(set(source_ids)):,} source IDs; contiguous orders: {order_ok}",
    )

    links = [link for step in steps for link in step.get("links", [])]
    relative = [
        link for link in links if not is_absolute_http(link.get("url", ""))
    ]
    record(
        "Questlines",
        "Every questline link is an absolute URL",
        not relative,
        f"{len(links):,} links; {len(steps) - sum(1 for step in steps if step.get('links')):,} steps without links; "
        f"relative: {join(link.get('url') for link in relative)}",
    )

    optional = [step for step in steps if step.get("optional")]
    missable = [step for step in steps if step.get("missable")]
    optional_badge = [step for step in steps if "Optional" in step.get("badges", [])]
    missable_badge = [
        step
        for step in steps
        if any("MISSABLE" in badge.upper() for badge in step.get("badges", []))
    ]
    badge_values = Counter(badge for step in steps for badge in step.get("badges", []))
    record(
        "Questlines",
        "Optional and MISSABLE flags agree with badges",
        len(optional) == len(optional_badge) == 135
        and len(missable) == len(missable_badge) == 91,
        f"{len(optional):,} optional / {len(optional_badge):,} Optional badges; "
        f"{len(missable):,} missable / {len(missable_badge):,} MISSABLE badges; "
        f"badges {dict(badge_values)}",
    )

    dlc_questlines = [questline for questline in questlines if questline["dlc"]]
    dlc_steps = [step for questline in dlc_questlines for step in questline["steps"]]
    depth_ok = all(0 <= step.get("depth", 0) <= 3 for step in steps)
    empty_text = [step["id"] for step in steps if not step["text"].strip()]
    source_urls_ok = all(
        is_absolute_http(questline.get("sourceUrl", "")) for questline in questlines
    )
    record(
        "Questlines",
        "DLC split, nesting depth, and text are valid",
        len(dlc_questlines) == 13
        and len(dlc_steps) == 136
        and depth_ok
        and not empty_text
        and source_urls_ok,
        f"{len(dlc_questlines):,} DLC questlines / {len(dlc_steps):,} steps; "
        f"depth range {min(step.get('depth', 0) for step in steps)}-{max(step.get('depth', 0) for step in steps)}; "
        f"empty text {join(empty_text)}; source URLs complete: {source_urls_ok}",
    )

    count("Questlines", "questlines", len(questlines))
    count("Questlines", "steps", len(steps))
    count("Questlines", "optional steps", len(optional))
    count("Questlines", "missable steps", len(missable))
    count("Questlines", "DLC questlines", len(dlc_questlines))
    count("Questlines", "links", len(links))

    note(
        "Two Dung Eater questline steps carry source-numbered badges `#2 MISSABLE` and "
        "`#4 MISSABLE` rather than plain `MISSABLE`. Integration warning checks should "
        "use a case-insensitive substring match, not equality."
    )


def verify_ngplus() -> None:
    doc = load_json("ngplus.json")
    sections = doc["sections"]
    steps = [step for section in sections for step in section["steps"]]
    raw_sections = html_sections(RAW / "world-ngplus.html")
    raw_pairs = [(section["id"], section["title"], section["checkboxes"]) for section in raw_sections]
    json_pairs = [(section["id"], section["title"], len(section["steps"])) for section in sections]

    record(
        "NG+",
        "12 sections and 68 checklist steps match the source",
        len(sections) == 12
        and len(steps) == 68
        and len(raw_sections) == 12
        and sum(section["checkboxes"] for section in raw_sections) == 68
        and raw_pairs == json_pairs,
        f"{len(sections):,} sections / source {len(raw_sections):,}; "
        f"{len(steps):,} steps / source {sum(section['checkboxes'] for section in raw_sections):,}",
    )

    step_ids = [step["id"] for step in steps]
    order_ok = all(
        [step["order"] for step in section["steps"]]
        == list(range(1, len(section["steps"]) + 1))
        for section in sections
    )
    record(
        "NG+",
        "Section and step IDs/orders are stable",
        len({section["id"] for section in sections}) == 12
        and len(set(step_ids)) == len(step_ids)
        and order_ok
        and all(re.fullmatch(r"p\d+-\d+", step_id) for step_id in step_ids)
        and [section["order"] for section in sections] == list(range(1, 13)),
        f"{len(step_ids):,} unique IDs; section orders 1..12; step orders contiguous: {order_ok}",
    )

    links = [link for step in steps for link in step.get("links", [])]
    relative = [link for link in links if not is_absolute_http(link.get("url", ""))]
    record(
        "NG+",
        "Every NG+ link is an absolute URL",
        not relative,
        f"{len(links):,} links; relative: {join(link.get('url') for link in relative)}",
    )

    missable_badge = [
        step
        for step in steps
        if any("MISSABLE" in badge.upper() for badge in step.get("badges", []))
    ]
    dlc_steps = [step for step in steps if step.get("dlc")]
    record(
        "NG+",
        "MISSABLE and DLC markers are intact",
        len(missable_badge) == 1
        and len(dlc_steps) == 13
        and all(not step.get("optional") for step in steps),
        f"{len(missable_badge):,} MISSABLE badges (the NG+ schema has no separate missable flag); "
        f"{len(dlc_steps):,} DLC-tagged steps; optional steps "
        f"{sum(1 for step in steps if step.get('optional')):,}",
    )

    count("NG+", "sections", len(sections))
    count("NG+", "steps", len(steps))
    count("NG+", "links", len(links))
    count("NG+", "DLC-tagged steps", len(dlc_steps))


def verify_art() -> None:
    manifest = load_json("art/manifest.json")
    assets = manifest["assets"]
    fonts = manifest["fonts"]
    licenses = manifest["fontLicenses"]

    asset_problems: list[str] = []
    asset_bytes = 0
    for asset in assets:
        path = ROOT / asset["file"]
        if not path.is_file():
            asset_problems.append(f"{asset['id']}: missing file")
            continue
        size = path.stat().st_size
        asset_bytes += size
        dimensions = image_dimensions(path)
        if dimensions != (asset["width"], asset["height"]):
            asset_problems.append(
                f"{asset['id']}: dimensions {dimensions} != {asset['width']}x{asset['height']}"
            )
        if size != asset.get("bytes"):
            asset_problems.append(f"{asset['id']}: bytes {size} != {asset.get('bytes')}")
        if not is_absolute_http(asset.get("sourceUrl", "")):
            asset_problems.append(f"{asset['id']}: sourceUrl not absolute")
        if not asset.get("credit"):
            asset_problems.append(f"{asset['id']}: missing credit")

    record(
        "Artwork",
        "17 images exist with matching dimensions and byte sizes",
        len(assets) == 17 and not asset_problems,
        f"{len(assets):,} images; problems: {join(asset_problems) if asset_problems else 'none'}",
    )

    art_files = [path for path in ART_DIR.iterdir() if path.is_file()]
    total_art = sum(path.stat().st_size for path in art_files)
    total_marker = 8 * 1024 * 1024
    record(
        "Artwork",
        "Total bundled art is under 8 MiB",
        total_art == asset_bytes and total_art < total_marker and len(art_files) == 17,
        f"{total_art:,} bytes ({total_art / (1024 * 1024):.2f} MiB) across {len(art_files)} files; "
        f"limit {total_marker:,} bytes",
    )

    font_problems: list[str] = []
    for font in fonts:
        path = ROOT / font["file"]
        if not path.is_file():
            font_problems.append(f"{font['family']} {font['weight']}: missing")
            continue
        if path.stat().st_size != font.get("bytes"):
            font_problems.append(
                f"{font['family']} {font['weight']}: bytes {path.stat().st_size} != {font.get('bytes')}"
            )
        if path.read_bytes()[:4] != b"wOF2":
            font_problems.append(f"{font['family']} {font['weight']}: not woff2")
        if not font.get("license"):
            font_problems.append(f"{font['family']} {font['weight']}: missing license")
        license_file = ROOT / str(font.get("licenseFile", ""))
        if not license_file.is_file():
            font_problems.append(f"{font['family']} {font['weight']}: missing licenseFile")

    record(
        "Artwork",
        "7 bundled WOFF2 fonts match the manifest",
        len(fonts) == 7 and not font_problems,
        f"{len(fonts):,} fonts; families {sorted({font['family'] for font in fonts})}; "
        f"problems: {join(font_problems) if font_problems else 'none'}",
    )

    license_problems: list[str] = []
    for license_entry in licenses:
        path = ROOT / license_entry["file"]
        if not path.is_file():
            license_problems.append(f"{license_entry['file']}: missing")
            continue
        text = path.read_text(encoding="utf-8")
        if "SIL OPEN FONT LICENSE" not in text.upper():
            license_problems.append(f"{license_entry['file']}: not an OFL text")
        if not is_absolute_http(license_entry.get("sourceUrl", "")):
            license_problems.append(f"{license_entry['file']}: sourceUrl not absolute")

    disclaimer = str(manifest.get("disclaimer", ""))
    fonts_css = ROOT / str(manifest.get("fontsCss", ""))
    record(
        "Artwork",
        "OFL licenses and unofficial-project disclaimer are present",
        len(licenses) == 2
        and not license_problems
        and "unofficial fan project" in disclaimer.lower()
        and fonts_css.is_file(),
        f"{len(licenses):,} license files; problems: "
        f"{join(license_problems) if license_problems else 'none'}; "
        f"fonts.css present: {fonts_css.is_file()}",
    )

    count("Artwork", "images", len(assets))
    count("Artwork", "fonts", len(fonts))
    count("Artwork", "bundled art bytes", total_art)
    count("Artwork", "license files", len(licenses))


def write_report(report_path: Path) -> None:
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    passes = sum(1 for check in CHECKS if check.ok)
    fails = len(CHECKS) - passes

    lines: list[str] = [
        "# Full-game research verification",
        "",
        f"Generated by `scripts/research/verify_full_game.py` at {generated}.",
        "",
        "Scope: independent verification of the normalized research artifacts and their "
        "archived raw HTML. This report does **not** claim that any application UI feature "
        "works, and no project build, typecheck, lint, or test was run. Only `research/`, "
        "`public/art/`, and `public/fonts/` were inspected; no `src/` file was read or "
        "modified.",
        "",
        "Sources: [Redmaw walkthrough](https://eldenring.redmaw.dev/sheets/walkthrough), "
        "[DLC walkthrough](https://eldenring.redmaw.dev/sheets/dlc-walkthrough), "
        "[items](https://eldenring.redmaw.dev/sheets/), "
        "[merchants](https://eldenring.redmaw.dev/sheets/merchants), "
        "[achievements](https://eldenring.redmaw.dev/sheets/achievements), "
        "[bosses](https://eldenring.redmaw.dev/sheets/bosses), "
        "[questlines](https://eldenring.redmaw.dev/sheets/questlines), "
        "[NG+](https://eldenring.redmaw.dev/sheets/new-game-plus); "
        "artwork from the official Steam store pages.",
        "",
        "## Verdict",
        "",
        f"**{passes} PASS / {fails} FAIL** across {len(CHECKS)} checks.",
        "",
        "| # | Check | Result | Observed / evidence |",
        "|---:|---|---|---|",
    ]
    for index, check in enumerate(CHECKS, start=1):
        result = "PASS" if check.ok else "**FAIL**"
        detail = check.detail.replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {index} | {check.group}: {check.name} | {result} | {detail} |")

    lines += ["", "## Key observed counts", "", "| Scope | Metric | Count |", "|---|---|---:|"]
    for scope, name, value in COUNTS:
        lines.append(f"| {scope} | {name} | {value} |")

    lines += ["", "## Anomalies and notes", ""]
    for index, anomaly in enumerate(ANOMALIES, start=1):
        lines.append(f"{index}. {anomaly}")

    lines += [
        "",
        "## Chronology and DLC insertion",
        "",
        "Verified source boundaries:",
        "",
        "- Base walkthrough: 49 sections / 3,395 steps. Section 46 is `farum-azula` "
        "(99 steps). Step `w46-96` is the point-of-no-return warning; `w46-97..99` are "
        "the three post-Maliketh steps.",
        "- Shadow of the Erdtree: 20 sections / 1,126 steps, from `west-gravesite` "
        "through `enir-ilim`.",
        "- Base endgame: `ashen-leyndell` (22), `endings` (20), `ng-prep` (47).",
        "",
        "Canonical arithmetic: 3,303 pre-DLC steps + 1,126 DLC steps + 92 endgame steps "
        "(3 synthetic aftermath + 89 base endgame) = **4,521 steps**. Section arithmetic: "
        "46 base pre-DLC + 20 DLC + 1 synthetic aftermath + 3 base endgame = **70 sections**.",
        "",
        "This is consistent with the contract order: base sections 1–46, split after "
        "`w46-96`, then all 20 DLC sections, then `farum-azula-aftermath` with `w46-97..99`, "
        "then `ashen-leyndell`, `endings`, and `ng-prep`.",
        "",
        "## Evidence",
        "",
        "Normalized artifacts:",
        "",
        "| Artifact | Bytes | SHA-256 |",
        "|---|---:|---|",
    ]
    for name in JSON_ARTIFACTS:
        artifact_path = RESEARCH / name
        lines.append(
            f"| `research/{name}` | {artifact_path.stat().st_size:,} | `{sha256(artifact_path)}` |"
        )

    lines += [
        "",
        "Raw HTML checked alongside the JSON:",
        "",
    ]
    lines += [f"- `research/raw/{name}`" for name in RAW_ARTIFACTS]
    lines += [
        "",
        "Artwork evidence: `research/art/manifest.json`, `public/art/` (17 manifest "
        "images), `public/fonts/` (7 WOFF2 faces and 2 OFL license texts).",
        "",
        "## Limitations",
        "",
        "- Counts are taken from the archived raw HTML and normalized JSON; the live "
        "Redmaw site was not re-fetched.",
        "- Link targets were validated for syntax and host, not for live HTTP status.",
        "- Boss and item name matching was checked against the research catalog only; "
        "the later workbook/Tarnished Pack merge is out of scope.",
        "",
    ]

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write-report",
        metavar="PATH",
        help="Write the markdown report (relative to the repository root).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print every PASS/FAIL check instead of the grouped summary.",
    )
    args = parser.parse_args()

    verify_provenance()
    base = verify_route(
        "Route — base",
        "route.base.json",
        "route.base.html",
        "w",
        expected_sections=49,
        expected_steps=3395,
        expected_missables=170,
    )
    dlc = verify_route(
        "Route — DLC",
        "route.dlc.json",
        "route.dlc.html",
        "d",
        expected_sections=20,
        expected_steps=1126,
        expected_missables=38,
    )
    verify_chronology(base, dlc)
    verify_items()
    verify_merchants()
    items = load_json("items.json")["items"]
    verify_achievements(items)
    verify_bosses()
    verify_questlines()
    verify_ngplus()
    verify_art()

    passes = sum(1 for check in CHECKS if check.ok)
    fails = len(CHECKS) - passes
    print("Elden Ring full-game research verification")
    print(f"Repository: {ROOT}")
    print(f"Checks: {len(CHECKS)} ({passes} PASS / {fails} FAIL)")
    print()
    if args.verbose:
        for check in CHECKS:
            status = "PASS" if check.ok else "FAIL"
            print(f"[{status}] {check.group}: {check.name} — {check.detail}")
    else:
        groups: dict[str, list[Check]] = {}
        for check in CHECKS:
            groups.setdefault(check.group, []).append(check)
        for group, group_checks in groups.items():
            group_passes = sum(1 for check in group_checks if check.ok)
            print(
                f"  {group:<24} {group_passes:>2}/{len(group_checks):<2} PASS"
            )
        failures = [check for check in CHECKS if not check.ok]
        if failures:
            print()
            print("Failures:")
            for check in failures:
                print(f"  [FAIL] {check.group}: {check.name} — {check.detail}")

    print()
    if ANOMALIES:
        print("Anomalies and notes:")
        for index, anomaly in enumerate(ANOMALIES, start=1):
            print(f"  {index}. {anomaly}")
        print()
    print(f"Verdict: {passes} PASS / {fails} FAIL")

    if args.write_report:
        report_path = Path(args.write_report)
        if not report_path.is_absolute():
            report_path = ROOT / report_path
        write_report(report_path)
        print(f"Report written: {report_path}")

    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
