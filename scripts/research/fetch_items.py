#!/usr/bin/env python3
"""Scrape the Redmaw item and merchant sheets into normalized JSON.

Provenance: https://eldenring.redmaw.dev/sheets/
Unofficial fan project. Elden Ring belongs to FromSoftware / Bandai Namco.

The script is deterministic: pass ``--fetch`` to (re)download raw HTML, then
run without it to regenerate JSON from ``research/raw/``. Every sheet count is
asserted against the live checkbox totals before any JSON is written.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "research" / "raw"
RESEARCH = ROOT / "research"

BASE_URL = "https://eldenring.redmaw.dev/sheets"
FETCHED_AT = "2026-10-22"
DISCLAIMER = (
    "Unofficial fan project. Elden Ring and its content belong to "
    "FromSoftware and Bandai Namco. Data from the Redmaw Completion Sheets."
)

# Sheet key -> (redmaw slug, expected checkbox rows)
SHEETS = {
    "weapons": ("weapons", 487),
    "armor": ("armor", 722),
    "ashes": ("ashes", 200),
    "spells": ("spells", 213),
    "talismans": ("talismans", 154),
    "key-items": ("key-items", 212),
    "miscellaneous-items": ("miscellaneous-items", 128),
}

MERCHANT_EXPECTED_ROWS = 724

# The sheets use "Coming soon..." as a single placeholder checkbox for
# sections the sheet author has not filled in yet. They are not items and are
# skipped; the raw checkbox total is still asserted below.
PLACEHOLDER = "Coming soon..."

KEY_ITEM_GROUPS = {
    "great-runes": "Key & Lore",
    "crystal-tears": "Consumable",
    "cracked-pots": "Upgrade",
    "ritual-pots": "Upgrade",
    "hefty-pots": "Upgrade",
    "perfume-bottles": "Upgrade",
    "memory-stones": "Upgrade",
    "talisman-pouches": "Upgrade",
    "mending-runes": "Key & Lore",
    "stonesword-keys": "Key & Lore",
    "imbued-keys": "Key & Lore",
    "keys": "Key & Lore",
    "cookbooks": "Key & Lore",
    "whetblades": "Upgrade",
    "regalias": "Key & Lore",
    "maps": "Key & Lore",
}

MISC_GROUPS = {
    "reusable": "Consumable",
    "irises": "Key & Lore",
    "multiplayer": "Consumable",
    "sacred-tears": "Upgrade",
    "golden-seeds": "Upgrade",
    "scadu-fragments": "Upgrade",
    "revered-ashes": "Upgrade",
    "notes": "Note",
    "paintings": "Key & Lore",
    "gestures": "Gesture",
}

SPIRIT_ASH_SECTIONS = {"spirit-ashes-1", "spirit-ashes-2", "special-ashes", "puppets"}

# Filled in from a verified run; guards against silent regressions.
EXPECTED_DEDUPED = 2100
EXPECTED_MERCHANT_ITEMS = 627
EXPECTED_MERCHANT_HEADINGS = 97


def fetch_raw(force: bool = False) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for key, (slug, _) in SHEETS.items():
        dest = RAW / f"items-{key}.html"
        if force or not dest.exists():
            url = f"{BASE_URL}/{slug}"
            with urllib.request.urlopen(url, timeout=60) as resp:
                dest.write_bytes(resp.read())
    dest = RAW / "merchants.html"
    if force or not dest.exists():
        with urllib.request.urlopen(f"{BASE_URL}/merchants", timeout=60) as resp:
            dest.write_bytes(resp.read())


def soup_for(key: str) -> BeautifulSoup:
    return BeautifulSoup((RAW / f"items-{key}.html").read_text(encoding="utf-8"), "lxml")


def clean_text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def heading_text(section) -> str:
    """h3 text without the collapse / check-all buttons and their counters."""
    h3 = section.find("h3")
    for button in h3.find_all("button"):
        button.decompose()
    title = clean_text(h3)
    return re.sub(r"\s*\d+/\d+$", "", title).strip()


def normalize_name(name: str) -> str:
    name = unicodedata.normalize("NFKC", name).replace("\u2019", "'")
    return re.sub(r"\s+", " ", name).strip().casefold()


def item_group(sheet: str, section_id: str, section: str) -> str:
    if sheet == "weapons":
        return "Shield" if "shield" in section.lower() else "Weapon"
    if sheet == "armor":
        return "Armor"
    if sheet == "ashes":
        return "Spirit Ash" if section_id in SPIRIT_ASH_SECTIONS else "Ash of War"
    if sheet == "spells":
        return "Spell"
    if sheet == "talismans":
        return "Talisman"
    if sheet == "key-items":
        return KEY_ITEM_GROUPS[section_id]
    if sheet == "miscellaneous-items":
        return MISC_GROUPS[section_id]
    raise ValueError(f"unknown sheet {sheet}")


def item_category(sheet: str, section: str) -> tuple[str, str]:
    """Return (category, slot)."""
    if sheet == "armor":
        category = re.sub(r"\s*\(\d+\)$", "", section)
        return category, category
    return section, ""


def parse_items() -> tuple[list[dict], dict]:
    items: list[dict] = []
    report: dict[str, dict] = {}
    seen: dict[tuple[str, str, str], str] = {}
    duplicates: list[str] = []
    placeholders: list[dict] = []

    for sheet, (_, expected) in SHEETS.items():
        soup = soup_for(sheet)
        checkboxes = soup.select("input[type=checkbox]")
        if len(checkboxes) != expected:
            raise AssertionError(
                f"{sheet}: expected {expected} checkboxes, found {len(checkboxes)}"
            )

        sheet_rows = 0
        sheet_placeholders = 0
        for section in soup.select("section"):
            title = heading_text(section)
            section_id = section.get("id", "")
            category, slot = item_category(sheet, title)
            group = item_group(sheet, section_id, title)

            for li in section.select("ul > li"):
                if "note" in (li.get("class") or []):
                    continue
                label = li.find("label")
                if label is None:
                    continue
                checkbox = label.find("input", {"type": "checkbox"})
                if checkbox is None:
                    continue
                sheet_rows += 1

                label_text = clean_text(label)
                if label_text == PLACEHOLDER:
                    sheet_placeholders += 1
                    placeholders.append({"sheet": sheet, "section": title,
                                         "stepId": checkbox.get("id")})
                    continue

                wiki = label.find("a", href=re.compile(r"wiki\.gg"))
                info_node = label.select_one("span.info")
                info = clean_text(info_node) if info_node else ""
                info = re.sub(r"^:\s*", "", info)
                if wiki:
                    name = clean_text(wiki)
                else:
                    # A few rows (three crystal tears) have no wiki link; the
                    # name is the label text minus the checkbox/info/badge bits.
                    clone = BeautifulSoup(str(label), "lxml").find("label")
                    for node in clone.select("input, span.info, abbr.dlc"):
                        node.decompose()
                    name = re.sub(r"\s+", " ", clone.get_text(" ", strip=True)).strip()

                record = {
                    "id": f"rw-{sheet}-{checkbox.get('id')}",
                    "name": name,
                    "group": group,
                    "category": category,
                    "slot": slot,
                    "dlc": label.select_one("abbr.dlc") is not None,
                    "section": title,
                    "info": info,
                    "wikiUrl": wiki["href"] if wiki else "",
                }
                key = (normalize_name(name), group, category)
                if key in seen:
                    duplicates.append(f"{name} [{group}/{category}] "
                                      f"kept {seen[key]}, dropped {record['id']}")
                    continue
                seen[key] = record["id"]
                items.append(record)

        if sheet_rows != expected:
            raise AssertionError(
                f"{sheet}: expected {expected} checkbox rows, parsed {sheet_rows}"
            )
        report[sheet] = {
            "checkboxes": len(checkboxes),
            "rows": sheet_rows,
            "parsed": sheet_rows - sheet_placeholders,
            "placeholdersSkipped": sheet_placeholders,
        }

    for item in items:
        assert item["name"], item
        assert item["wikiUrl"] == "" or item["wikiUrl"].startswith(
            "https://eldenring.wiki.gg/"
        ), item

    report["_dedupe"] = {
        "rawItems": len(items) + len(duplicates),
        "deduped": len(items),
        "removed": len(duplicates),
        "duplicates": duplicates,
    }
    report["_placeholders"] = placeholders
    return items, report


def parse_merchants() -> tuple[list[dict], dict]:
    soup = BeautifulSoup((RAW / "merchants.html").read_text(encoding="utf-8"), "lxml")
    checkboxes = soup.select("input[type=checkbox]")
    if len(checkboxes) != MERCHANT_EXPECTED_ROWS:
        raise AssertionError(
            f"merchants: expected {MERCHANT_EXPECTED_ROWS} checkboxes, found {len(checkboxes)}"
        )

    merchants: list[dict] = []
    rows = items = headings = 0
    rune_prices = other_costs = remembrance_costs = 0

    for section in soup.select("section"):
        section_id = section.get("id", "")
        name = heading_text(section)
        merchant_items: list[dict] = []

        for li in section.select("li"):
            if "note" in (li.get("class") or []):
                continue
            label = li.find("label")
            if label is None:
                continue
            checkbox = label.find("input", {"type": "checkbox"})
            if checkbox is None:
                continue
            rows += 1
            step_id = checkbox.get("id")
            text = clean_text(label)
            nested = li.find("ul", recursive=False) is not None

            if nested:
                headings += 1
                continue

            wiki = label.find("a", href=re.compile(r"wiki\.gg"))
            if not wiki:
                raise AssertionError(f"merchant {section_id}: row without wiki link ({step_id})")
            item_name = clean_text(wiki)

            # Stock prefix lives before the item link: "∞", "5x", or nothing.
            full = text
            prefix = full[: full.find(item_name)].strip()
            prefix = re.sub(r"MISSABLE", "", prefix).strip()
            stock = ""
            if prefix == "∞":
                stock = "infinite"
            elif re.fullmatch(r"\d+x", prefix):
                stock = prefix[:-1]
            elif prefix:
                raise AssertionError(f"merchant {section_id}/{step_id}: odd prefix {prefix!r}")

            cost_match = re.search(
                r"([\d,]+)\s*(runes?|Starlight Shards?|Dragon Hearts?|Heart of Bayle)\b",
                text,
            )
            price = None
            cost = None
            note = None
            if cost_match:
                amount = int(cost_match.group(1).replace(",", ""))
                unit = cost_match.group(2)
                if unit.startswith("rune"):
                    price = amount
                    rune_prices += 1
                else:
                    cost = f"{cost_match.group(1)} {unit}"
                    other_costs += 1
                parent = li.find_parent("li")
                if parent is not None and parent.find("label") is not None:
                    note = re.sub(r"\s*:\s*(SOTE|TP)?\s*$", "", clean_text(parent.find("label"))).strip()
            else:
                # Remembrance rewards (Enia): each pair is bought with the
                # parent remembrance rather than runes.
                parent = li.find_parent("li")
                if parent is None or parent.find("label") is None:
                    raise AssertionError(
                        f"merchant {section_id}/{step_id}: no price and no parent heading"
                    )
                cost = re.sub(r"\s*:\s*(SOTE|TP)?\s*$", "",
                              clean_text(parent.find("label"))).strip()
                remembrance_costs += 1

            record = {
                "name": item_name,
                "price": price,
                "stock": stock,
                "wikiUrl": wiki["href"],
                "stepId": step_id,
            }
            if cost is not None:
                record["cost"] = cost
            if note:
                record["note"] = note
            merchant_items.append(record)

        if not merchant_items:
            raise AssertionError(f"merchant {section_id}: no items parsed")
        merchants.append({"id": section_id, "name": name, "items": merchant_items})

    items = sum(len(m["items"]) for m in merchants)
    if items + headings != rows:
        raise AssertionError(f"merchants: {items} items + {headings} headings != {rows} rows")

    report = {
        "sections": len(merchants),
        "rows": rows,
        "items": items,
        "headingsSkipped": headings,
        "runePrices": rune_prices,
        "otherCosts": other_costs,
        "remembranceCosts": remembrance_costs,
    }
    return merchants, report


def write_json(path: Path, payload: dict) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="re-download raw sheets")
    args = parser.parse_args()

    fetch_raw(force=args.fetch)

    items, item_report = parse_items()
    if item_report["_dedupe"]["deduped"] != EXPECTED_DEDUPED:
        raise AssertionError(
            f"deduped item count {item_report['_dedupe']['deduped']} != {EXPECTED_DEDUPED}"
        )

    merchants, merchant_report = parse_merchants()
    if merchant_report["items"] != EXPECTED_MERCHANT_ITEMS:
        raise AssertionError(
            f"merchant item count {merchant_report['items']} != {EXPECTED_MERCHANT_ITEMS}"
        )
    if merchant_report["headingsSkipped"] != EXPECTED_MERCHANT_HEADINGS:
        raise AssertionError(
            f"merchant headings {merchant_report['headingsSkipped']} != {EXPECTED_MERCHANT_HEADINGS}"
        )

    dedupe = item_report.pop("_dedupe")
    placeholders = item_report.pop("_placeholders")

    write_json(
        RESEARCH / "items.json",
        {
            "source": "Redmaw Completion Sheets",
            "sourceUrl": f"{BASE_URL}/",
            "fetchedAt": FETCHED_AT,
            "disclaimer": DISCLAIMER,
            "counts": {
                "checkboxRows": sum(v["rows"] for v in item_report.values()),
                "parsed": dedupe["rawItems"],
                "deduped": dedupe["deduped"],
                "duplicatesRemoved": dedupe["removed"],
                "placeholdersSkipped": len(placeholders),
            },
            "sheets": item_report,
            "items": items,
        },
    )

    write_json(
        RESEARCH / "merchants.json",
        {
            "source": "Redmaw Completion Sheets",
            "sourceUrl": f"{BASE_URL}/merchants",
            "fetchedAt": FETCHED_AT,
            "disclaimer": DISCLAIMER,
            "counts": merchant_report,
            "merchants": merchants,
        },
    )

    print("=== items ===")
    for sheet, info in item_report.items():
        print(f"{sheet:20} checkboxes={info['checkboxes']:4} rows={info['rows']:4} "
              f"parsed={info['parsed']:4} placeholders={info['placeholdersSkipped']}")
    print(f"raw checkbox rows: {sum(v['rows'] for v in item_report.values())}")
    print(f"parsed items:      {dedupe['rawItems']}")
    print(f"deduped:       {dedupe['deduped']} (removed {dedupe['removed']})")
    if dedupe["duplicates"]:
        for line in dedupe["duplicates"]:
            print("  dup:", line)
    if placeholders:
        for p in placeholders:
            print(f"  placeholder skipped: {p['sheet']}/{p['section']} {p['stepId']}")

    print("=== merchants ===")
    for key, value in merchant_report.items():
        print(f"{key}: {value}")
    print("wrote research/items.json and research/merchants.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
