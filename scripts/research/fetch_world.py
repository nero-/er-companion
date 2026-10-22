#!/usr/bin/env python3
"""Fetch and normalize the Redmaw world sheets.

Outputs (all UTF-8 JSON):
  research/achievements.json
  research/bosses.json
  research/questlines.json
  research/ngplus.json

Raw HTML is kept in research/raw/world-<sheet>.html. Re-run with --refresh to
download the sheets again; otherwise existing raw files are reused so output is
deterministic.

The Redmaw Completion Sheets are an unofficial fan resource. Elden Ring and its
content belong to FromSoftware and Bandai Namco Entertainment.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup

BASE = "https://eldenring.redmaw.dev"
ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "research" / "raw"
OUT_DIR = ROOT / "research"

SHEETS = {
    "achievements": "achievements",
    "bosses": "bosses",
    "questlines": "questlines",
    "ngplus": "new-game-plus",
}

ATTRIBUTION = (
    "Unofficial fan project. Data transcribed from the Redmaw Completion Sheets "
    "(https://eldenring.redmaw.dev), a free community resource. Elden Ring and its "
    "content belong to FromSoftware and Bandai Namco Entertainment."
)

# The source page labels these four groups by item type, while the trophy names
# differ. Map each source section to the achievement it satisfies.
LEGENDARY_GROUPS = {
    "weapons": {"achievement": "Legendary Armaments", "kind": "weapon"},
    "ashes": {"achievement": "Legendary Ashen Remains", "kind": "ash"},
    "spells": {"achievement": "Legendary Sorceries and Incantations", "kind": "spell"},
    "talismans": {"achievement": "Legendary Talismans", "kind": "talisman"},
}

ACHIEVEMENT_SECTIONS = ("misc", "bosses", "shardbearers", "endings")
ACHIEVEMENT_SECTION_NAMES = {
    "misc": "Misc",
    "bosses": "Bosses",
    "shardbearers": "Shardbearers",
    "endings": "Endings",
}


# ---------------------------------------------------------------------------
# HTML helpers


def clean_text(node) -> str:
    """Readable plain text with inline formatting collapsed to single spaces."""
    text = node.get_text(" ", strip=True)
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\s+'(?=[A-Za-z])", "'", text)
    text = re.sub(r"\s+\u2019", "\u2019", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return text.strip()


def clone(node):
    return BeautifulSoup(str(node), "lxml").find(node.name)


def label_text(label, drop_info=False) -> str:
    """Label text without checkbox, badges, or DLC abbreviations."""
    frag = clone(label)
    selectors = ["input", "span.badge", "abbr.dlc", "button"]
    if drop_info:
        selectors.append("span.info")
    for selector in selectors:
        for element in frag.select(selector):
            element.decompose()
    return clean_text(frag)


def info_text(label) -> str:
    info = label.select_one("span.info")
    if info is None:
        return ""
    text = clean_text(info)
    return re.sub(r"^:\s*", "", text)


def badges(label) -> list[str]:
    """Optional/MISSABLE style badges, excluding the trophy marker."""
    result = []
    for badge in label.select("span.badge"):
        if "trophy" in (badge.get("class") or []):
            continue
        text = clean_text(badge)
        if text:
            result.append(text)
    return result


def links(label) -> list[dict]:
    result = []
    for anchor in label.find_all("a"):
        href = (anchor.get("href") or "").strip()
        if not href or href.startswith("#"):
            continue
        url = urljoin(BASE + "/", href)
        if not url.startswith(("http://", "https://")):
            continue
        result.append({"label": clean_text(anchor), "url": url})
    return result


def first_wiki_url(label) -> str:
    for anchor in label.find_all("a"):
        href = (anchor.get("href") or "").strip()
        if "wiki.gg" in href:
            return urljoin(BASE + "/", href)
    return ""


def slugify(text: str) -> str:
    value = unicodedata.normalize("NFKD", text)
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = value.replace("'", "").replace("\u2019", "")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def unique_id(base: str, used: set[str]) -> str:
    candidate = base or "item"
    n = 2
    while candidate in used:
        candidate = f"{base}-{n}"
        n += 1
    used.add(candidate)
    return candidate


def heading_text(section) -> str:
    heading = section.find(["h2", "h3"])
    if heading is None:
        return ""
    frag = clone(heading)
    for button in frag.find_all("button"):
        button.decompose()
    return clean_text(frag)


def toc_entries(soup) -> dict[str, dict]:
    """Section metadata from the 'Your Progress' navigation."""
    entries = {}
    for nav in soup.find_all("nav"):
        for anchor in nav.select('a[href^="#"]'):
            href = anchor.get("href") or ""
            section_id = href[1:]
            if not section_id:
                continue
            item = anchor.find_parent("li") or anchor
            raw = clean_text(item)
            raw = re.sub(r"\s*\d+/\d+\s*$", "", raw).strip()
            raw = re.sub(r"\s*SOTE\s*$", "", raw).strip()
            match = re.search(r"\((Levels|Scadu)\s+[^)]+\)", raw)
            level_range = match.group(0)[1:-1] if match else ""
            title = raw[: match.start()].strip() if match else raw
            entries[section_id] = {
                "title": title,
                "levelRange": level_range,
                "dlc": bool(item.find("abbr", class_="dlc")),
            }
    return entries


def is_dlc(label) -> bool:
    return bool(label.select_one("abbr.dlc"))


def badge_flag(values: list[str], needle: str) -> bool:
    return any(needle.lower() in value.lower() for value in values)


# ---------------------------------------------------------------------------
# Fetching


def fetch_raw(refresh: bool) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for sheet, path_name in SHEETS.items():
        target = RAW_DIR / f"world-{sheet}.html"
        if target.exists() and not refresh:
            continue
        url = f"{BASE}/sheets/{path_name}"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "er-companion-research/1.0 (unofficial fan project)"},
        )
        print(f"fetching {url}")
        with urllib.request.urlopen(request, timeout=60) as response:
            target.write_bytes(response.read())


def source_timestamp() -> str:
    times = []
    for sheet in SHEETS:
        path = RAW_DIR / f"world-{sheet}.html"
        if path.exists():
            times.append(path.stat().st_mtime)
    if not times:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return (
        datetime.fromtimestamp(max(times), timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def soup_for(sheet: str) -> BeautifulSoup:
    path = RAW_DIR / f"world-{sheet}.html"
    if not path.exists():
        raise SystemExit(f"missing raw HTML: {path}; run with --refresh")
    return BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")


def source_block(sheet: str, fetched_at: str) -> dict:
    return {
        "name": "Redmaw Completion Sheets",
        "url": f"{BASE}/sheets/{SHEETS[sheet]}",
        "fetchedAt": fetched_at,
    }


# ---------------------------------------------------------------------------
# Achievements


def parse_achievements(soup) -> tuple[list[dict], list[dict]]:
    achievements = []
    used_ids: set[str] = set()
    sections = {section.get("id"): section for section in soup.select("section")}

    for section_id in ACHIEVEMENT_SECTIONS:
        section = sections[section_id]
        for label in section.select("li > label"):
            input_el = label.find("input", {"type": "checkbox"})
            if input_el is None:
                continue
            name_anchor = label.find("a")
            name = clean_text(name_anchor) if name_anchor else label_text(label, drop_info=True)
            badge_values = badges(label)
            achievement = {
                "id": unique_id(slugify(name), used_ids),
                "name": name,
                "section": ACHIEVEMENT_SECTION_NAMES[section_id],
                "sectionId": section_id,
                "sourceId": input_el.get("id") or "",
                "description": info_text(label),
                "wikiUrl": first_wiki_url(label),
                "badges": badge_values,
                "missable": badge_flag(badge_values, "MISSABLE"),
                "requirements": [],
                "links": links(label),
            }
            achievements.append(achievement)

    groups = []
    by_name = {achievement["name"]: achievement for achievement in achievements}
    for section_id, config in LEGENDARY_GROUPS.items():
        section = sections[section_id]
        items = []
        for label in section.select("li > label"):
            input_el = label.find("input", {"type": "checkbox"})
            if input_el is None:
                continue
            name_anchor = label.find("a")
            badge_values = badges(label)
            items.append(
                {
                    "name": clean_text(name_anchor) if name_anchor else label_text(label, drop_info=True),
                    "wikiUrl": first_wiki_url(label),
                    "description": info_text(label),
                    "sourceId": input_el.get("id") or "",
                    "badges": badge_values,
                    "missable": badge_flag(badge_values, "MISSABLE"),
                    "links": links(label),
                }
            )

        target = by_name.get(config["achievement"])
        group = {
            "id": slugify(config["achievement"]),
            "name": config["achievement"],
            "kind": config["kind"],
            "section": heading_text(section),
            "sectionId": section_id,
            "achievementId": target["id"] if target else "",
            "items": items,
        }
        if target is not None:
            target["requirements"].append(group["id"])
        groups.append(group)

    return achievements, groups


# ---------------------------------------------------------------------------
# Bosses


def parse_bosses(soup, fetched_at: str) -> dict:
    toc = toc_entries(soup)
    bosses = []
    used_ids: set[str] = set()
    section_count = 0

    for section in soup.select("section"):
        section_id = section.get("id") or ""
        meta = toc.get(section_id, {})
        title = meta.get("title") or heading_text(section)
        level_range = meta.get("levelRange", "")
        dlc = bool(meta.get("dlc"))
        section_count += 1

        for label in section.select("li > label"):
            input_el = label.find("input", {"type": "checkbox"})
            if input_el is None:
                continue
            name = label_text(label, drop_info=True)
            badge_values = badges(label)
            trophy = label.select_one("span.badge.trophy")
            achievement = ""
            if trophy is not None:
                tooltip = (trophy.get("data-tooltip") or "").strip()
                match = re.match(r"Unlocks the (.+) achievement\.?$", tooltip)
                if match:
                    achievement = match.group(1)
            bosses.append(
                {
                    "id": unique_id(f"{section_id}-{slugify(name)}", used_ids),
                    "name": name,
                    "section": title,
                    "sectionId": section_id,
                    "levelRange": level_range,
                    "description": info_text(label),
                    "wikiUrl": first_wiki_url(label),
                    "dlc": dlc,
                    "sourceId": input_el.get("id") or "",
                    "badges": badge_values,
                    "missable": badge_flag(badge_values, "MISSABLE"),
                    "achievement": achievement,
                    "links": links(label),
                }
            )

    return {
        "source": source_block("bosses", fetched_at),
        "attribution": ATTRIBUTION,
        "sectionCount": section_count,
        "bosses": bosses,
    }


# ---------------------------------------------------------------------------
# Questlines


def step_depth(label) -> int:
    depth = 0
    node = label.parent
    while node is not None:
        if getattr(node, "name", None) == "ul":
            depth += 1
        node = node.parent
    return max(depth - 1, 0)


def parse_questlines(soup, fetched_at: str) -> dict:
    toc = toc_entries(soup)
    questlines = []
    for section in soup.select("section"):
        section_id = section.get("id") or ""
        title = heading_text(section)
        dlc = bool(toc.get(section_id, {}).get("dlc"))
        steps = []
        for order, label in enumerate(section.select("label"), start=1):
            input_el = label.find("input", {"type": "checkbox"})
            if input_el is None:
                continue
            badge_values = badges(label)
            steps.append(
                {
                    "id": f"q-{section_id}-{order}",
                    "sourceId": input_el.get("id") or "",
                    "order": order,
                    "depth": step_depth(label),
                    "text": label_text(label),
                    "optional": badge_flag(badge_values, "Optional"),
                    "missable": badge_flag(badge_values, "MISSABLE"),
                    "badges": badge_values,
                    "links": links(label),
                }
            )
        questlines.append(
            {
                "id": section_id,
                "npc": title,
                "dlc": dlc,
                "sourceUrl": f"{BASE}/sheets/questlines#{section_id}",
                "steps": steps,
            }
        )

    return {
        "source": source_block("questlines", fetched_at),
        "attribution": ATTRIBUTION,
        "questlines": questlines,
    }


# ---------------------------------------------------------------------------
# New Game Plus


def parse_ngplus(soup, fetched_at: str) -> dict:
    sections = []
    for order, section in enumerate(soup.select("section"), start=1):
        section_id = section.get("id") or ""
        steps = []
        for step_order, label in enumerate(section.select("li > label"), start=1):
            input_el = label.find("input", {"type": "checkbox"})
            if input_el is None:
                continue
            badge_values = badges(label)
            steps.append(
                {
                    "id": input_el.get("id") or f"{section_id}-{step_order}",
                    "order": step_order,
                    "text": label_text(label),
                    "optional": badge_flag(badge_values, "Optional"),
                    "badges": badge_values,
                    "links": links(label),
                    "dlc": is_dlc(label),
                }
            )
        sections.append(
            {
                "id": section_id,
                "title": heading_text(section),
                "order": order,
                "levelRange": "",
                "steps": steps,
            }
        )

    return {
        "source": source_block("ngplus", fetched_at),
        "attribution": ATTRIBUTION,
        "game": "ngplus",
        "sections": sections,
    }


# ---------------------------------------------------------------------------
# Output


def write_json(path: Path, data) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="download the sheets again")
    args = parser.parse_args()

    fetch_raw(args.refresh)
    fetched_at = source_timestamp()

    achievements, groups = parse_achievements(soup_for("achievements"))
    bosses = parse_bosses(soup_for("bosses"), fetched_at)
    questlines = parse_questlines(soup_for("questlines"), fetched_at)
    ngplus = parse_ngplus(soup_for("ngplus"), fetched_at)

    achievements_doc = {
        "source": source_block("achievements", fetched_at),
        "attribution": ATTRIBUTION,
        "achievements": achievements,
        "requirementGroups": groups,
    }

    # --- assertions -------------------------------------------------------
    assert len(achievements) == 42, len(achievements)
    section_counts = Counter(achievement["section"] for achievement in achievements)
    assert section_counts == {"Misc": 9, "Bosses": 24, "Shardbearers": 6, "Endings": 3}, section_counts
    assert len(groups) == 4, len(groups)
    assert [len(group["items"]) for group in groups] == [9, 6, 7, 8]
    assert all(group["achievementId"] for group in groups)
    assert sum(len(group["items"]) for group in groups) == 30
    assert all(achievement["description"] and achievement["wikiUrl"] for achievement in achievements)
    assert all(item["wikiUrl"] for group in groups for item in group["items"])

    assert len(bosses["bosses"]) == 207, len(bosses["bosses"])
    assert bosses["sectionCount"] == 42, bosses["sectionCount"]
    assert len({boss["sectionId"] for boss in bosses["bosses"]}) == 42
    assert all(boss["levelRange"] for boss in bosses["bosses"])
    assert all(boss["description"] and boss["wikiUrl"] for boss in bosses["bosses"])
    assert sum(1 for boss in bosses["bosses"] if boss["dlc"]) > 0

    assert len(questlines["questlines"]) == 52, len(questlines["questlines"])
    total_steps = sum(len(questline["steps"]) for questline in questlines["questlines"])
    assert total_steps == 587, total_steps
    note_texts = {clean_text(note) for note in soup_for("questlines").select("li.note")}
    assert not any(
        step["text"] in note_texts
        for questline in questlines["questlines"]
        for step in questline["steps"]
    )
    assert sum(1 for questline in questlines["questlines"] if questline["dlc"]) == 13

    assert len(ngplus["sections"]) == 12, len(ngplus["sections"])
    nga_steps = sum(len(section["steps"]) for section in ngplus["sections"])
    assert nga_steps == 68, nga_steps
    assert all(section["steps"] for section in ngplus["sections"])

    # --- write ------------------------------------------------------------
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(OUT_DIR / "achievements.json", achievements_doc)
    write_json(OUT_DIR / "bosses.json", bosses)
    write_json(OUT_DIR / "questlines.json", questlines)
    write_json(OUT_DIR / "ngplus.json", ngplus)

    # --- report -----------------------------------------------------------
    print(f"fetchedAt: {fetched_at}")
    print(
        "achievements: "
        f"{len(achievements)} "
        f"(misc 9, bosses 24, shardbearers 6, endings 3); "
        f"requirement groups {len(groups)} with "
        f"{[len(group['items']) for group in groups]} items"
    )
    print(
        f"bosses: {len(bosses['bosses'])} across {bosses['sectionCount']} sections; "
        f"dlc rows {sum(1 for boss in bosses['bosses'] if boss['dlc'])}"
    )
    print(
        f"questlines: {len(questlines['questlines'])} with {total_steps} steps; "
        f"dlc questlines {sum(1 for questline in questlines['questlines'] if questline['dlc'])}"
    )
    print(f"ngplus: {len(ngplus['sections'])} sections with {nga_steps} steps")

    samples = {
        "achievement": achievements[0],
        "requirementGroup": groups[0],
        "boss": bosses["bosses"][0],
        "questline": {
            "id": questlines["questlines"][0]["id"],
            "npc": questlines["questlines"][0]["npc"],
            "steps": questlines["questlines"][0]["steps"][:2],
        },
        "ngplusSection": {
            **{key: value for key, value in ngplus["sections"][0].items() if key != "steps"},
            "steps": ngplus["sections"][0]["steps"][:2],
        },
    }
    print(json.dumps(samples, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
