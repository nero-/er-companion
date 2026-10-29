#!/usr/bin/env python3
"""Patch src/data/tiers.json to 1.17 — user-supplied weapon tiers + wiki links.

Two changes, both idempotent:

1. The six Tarnished Pack (patch 1.17) weapons the user ranks become
   authoritative over any older row. Each is moved/inserted at the *end* of its
   tier group in the ``Weapons`` list, so no unrelated relative order changes,
   and the ``Weapons`` ranks are then renumbered 1..N. Other lists keep their
   ranks untouched (Crystal Tears intentionally shares ranks between tied
   entries).
2. Every entry in all six lists gets ``wikiUrl`` and ``source``.

``wikiUrl`` derivation
----------------------
Default: ``https://eldenring.wiki.gg/wiki/<name with spaces -> _, otherwise
percent-encoded>``. Ash-of-War names are prefixed with ``Ash of War: `` because
that is the wiki article title for every skill in that list. ``EXCEPTIONS``
below lists the few names whose wiki article title genuinely differs (verified
against the wiki API on 2026-10-29); each carries the reason.

``source`` derivation
---------------------
Rows the 1.17 patch introduces carry ``SOURCE_117``. Every other row keeps its
existing ranking, so it is labelled ``SOURCE_EXISTING``. Nothing is claimed
about sources that the repository does not already state.

Usage
-----
    python3 scripts/research/patch_tiers_117.py            # write JSON
    python3 scripts/research/patch_tiers_117.py --check    # verify on disk
    python3 scripts/research/patch_tiers_117.py --verify   # + wiki API title check
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TIERS_PATH = ROOT / "src" / "data" / "tiers.json"

WIKI = "https://eldenring.wiki.gg/wiki/"
SOURCE_117 = "Tarnished Pack / 1.17 — user consensus"
SOURCE_EXISTING = "User-provided ranking (existing tier list)"

# Tier groups are positional in the file; the six
# 1.17 rows are appended to the end of their group.
NEW_WEAPONS: list[dict] = [
    {
        "name": "Leontiel's Greatsword",
        "tier": "Broken",
        "className": "Greatsword",
        "notes": (
            "Tarnished Pack (1.17). Drops from Knight Leontiel's invasion in the "
            "Wailing Dunes after Starscourge Radahn. Ranked in the user's 1.17 list."
        ),
    },
    {
        "name": "Reed Great Katana",
        "tier": "S-Tier",
        "className": "Great Katana",
        "notes": (
            "Tarnished Pack (1.17). Corpse on the pale mound north of Fort Faroth, "
            "Dragonbarrow. Ranked in the user's 1.17 list."
        ),
    },
    {
        "name": "Reverse Bladed Swords (Lightning)",
        "tier": "A-Tier",
        "className": "Backhand Blade",
        "notes": (
            "Tarnished Pack (1.17), Lightning configuration. The weapon is the "
            "Reverse-Bladed Sword, sold by the Twin Maiden Husks; the tier is the "
            "user's Lightning-affinity ranking."
        ),
    },
    {
        "name": "Itinerant Sword",
        "tier": "A-Tier",
        "className": "Light Greatsword",
        "notes": (
            "Tarnished Pack (1.17). User list name for the Idus Sword (Idus Knight "
            "starting weapon; also on a corpse northwest of Liurnia Lake Shore); "
            "the wiki article is Idus Sword."
        ),
    },
    {
        "name": "Hefty Scimitar",
        "tier": "B-Tier",
        "className": "Curved Greatsword",
        "notes": (
            "Tarnished Pack (1.17). Heavy Knight starting weapon; also sold by the "
            "Nomadic Merchant north of Fort Haight. Ranked in the user's 1.17 list."
        ),
    },
    {
        "name": "Golden Order Flail",
        "tier": "B-Tier",
        "className": "Flail",
        "notes": (
            "Tarnished Pack (1.17). Drops from The Noble Broken Mask invasion in "
            "Leyndell, Royal Capital (Law of Regression at the Marika statue). "
            "Ranked in the user's 1.17 list."
        ),
    },
]

NEW_NAMES = {weapon["name"] for weapon in NEW_WEAPONS}

POOL_WEAPON = "Weapon / Casting Tool"

# Wiki article titles that differ from the tier-list name. Verified via the
# MediaWiki API on 2026-10-29.
EXCEPTIONS: dict[tuple[str, str], tuple[str, str]] = {
    ("Weapons", "Nightrider's Glaive"): ("Nightrider Glaive", "wiki article omits the apostrophe"),
    ("Weapons", "Nightrider's Flail"): ("Nightrider Flail", "wiki article omits the apostrophe"),
    ("Weapons", "Bastard Stars"): ("Bastard's Stars", "tier list drops the apostrophe"),
    ("Weapons", "Itinerant Sword"): ("Idus Sword", "community name for the Tarnished Pack Idus Sword"),
    ("Weapons", "Reverse Bladed Swords (Lightning)"): (
        "Reverse-Bladed Sword",
        "tier list names the Lightning-affinity ranking of this weapon",
    ),
    ("Incantations", "Land of Shadow (Incantation)"): (
        "Land of Shadow (spell)",
        "wiki disambiguates the incantation as (spell)",
    ),
    ("Sorceries", "Impenetrable Thorns"): (
        "Impenetrable Thorns (spell)",
        "wiki disambiguates the sorcery as (spell)",
    ),
    ("Weapons", "Varre's Bouquet"): ("Varré's Bouquet", "wiki spells the name with an accented é"),
    ("Ashes of War", "Blink Bolt"): ("Ash of War: Blinkbolt", "wiki spells the skill Blinkbolt"),
    ("Talismans", "Talisman of Dread"): ("Talisman of the Dread", "wiki article is 'of the Dread'"),
}

ASH_PREFIX = "Ash of War: "


def wiki_title(entry: dict) -> str:
    key = (entry["list"], entry["name"])
    if key in EXCEPTIONS:
        return EXCEPTIONS[key][0]
    title = entry["name"]
    if entry["list"] == "Ashes of War" and not title.startswith(ASH_PREFIX):
        title = ASH_PREFIX + title
    return title


def wiki_url(entry: dict) -> str:
    title = wiki_title(entry)
    slug = urllib.parse.quote(title.replace(" ", "_"), safe="(),:/-._~")
    return WIKI + slug


def load_tiers() -> dict:
    with TIERS_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def add_new_weapons(entries: list[dict]) -> list[dict]:
    """Drop any existing rows for the six names, then append to their groups."""
    existing = [entry for entry in entries if entry["list"] != "Weapons"]
    weapons = [entry for entry in entries if entry["list"] == "Weapons"]
    weapons = [entry for entry in weapons if entry["name"] not in NEW_NAMES]

    for weapon in NEW_WEAPONS:
        row = {
            "list": "Weapons",
            "rank": 0,
            "tier": weapon["tier"],
            "name": weapon["name"],
            "className": weapon["className"],
            "poolType": POOL_WEAPON,
            "notes": weapon["notes"],
            "source": SOURCE_117,
        }
        last_index = max(
            (index for index, entry in enumerate(weapons) if entry["tier"] == weapon["tier"]),
            default=None,
        )
        if last_index is None:
            # Unknown tier group: create it after the last row so the file keeps
            # a single contiguous block per tier.
            weapons.append(row)
        else:
            weapons.insert(last_index + 1, row)

    for rank, entry in enumerate(weapons, start=1):
        entry["rank"] = rank

    return weapons + existing


def attach_wiki_and_source(entries: list[dict]) -> list[dict]:
    for entry in entries:
        if entry.get("source") not in (SOURCE_117,):
            entry["source"] = SOURCE_EXISTING
        entry["wikiUrl"] = wiki_url(entry)
    return entries


def build() -> dict:
    data = load_tiers()
    entries = attach_wiki_and_source(add_new_weapons(data["entries"]))
    data["entries"] = entries
    return data


def check(plan: dict) -> int:
    on_disk = load_tiers()
    if on_disk != plan:
        print(f"DRIFT — {TIERS_PATH.relative_to(ROOT)} differs from the patch", file=sys.stderr)
        return 1
    entries = on_disk["entries"]
    by_name = {entry["name"]: entry for entry in entries if entry["list"] == "Weapons"}
    problems = []
    for weapon in NEW_WEAPONS:
        row = by_name.get(weapon["name"])
        if row is None:
            problems.append(f"{weapon['name']}: missing")
        elif row["tier"] != weapon["tier"] or row["source"] != SOURCE_117:
            problems.append(f"{weapon['name']}: tier/source mismatch")
    seen = set()
    for entry in entries:
        if not entry.get("wikiUrl", "").startswith(WIKI):
            problems.append(f"{entry['name']}: wikiUrl missing")
        if not entry.get("source"):
            problems.append(f"{entry['name']}: source missing")
        key = (entry["list"], entry["name"])
        if key in seen:
            problems.append(f"{key}: duplicate list+name")
        seen.add(key)
    for lst in {entry["list"] for entry in entries}:
        if lst == "Weapons":
            ranks = [entry["rank"] for entry in entries if entry["list"] == lst]
            if ranks != list(range(1, len(ranks) + 1)):
                problems.append("Weapons ranks are not 1..N")
    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        return 1
    print(f"OK — {TIERS_PATH.relative_to(ROOT)} matches the patch ({len(entries)} entries)")
    return 0


def verify_titles(titles: list[str]) -> int:
    """Query the wiki API in batches and report titles that do not resolve."""
    missing = []
    for start in range(0, len(titles), 40):
        batch = titles[start : start + 40]
        query = urllib.parse.urlencode(
            {
                "action": "query",
                "format": "json",
                "prop": "info",
                "redirects": 1,
                "titles": "|".join(title.replace("|", "") for title in batch),
            }
        )
        request = urllib.request.Request(
            "https://eldenring.wiki.gg/api.php?" + query,
            headers={"User-Agent": "EldenRingCompanionResearch/1.0 (tiers wiki link check)"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
        pages = payload["query"]["pages"]
        present = {page["title"] for page in pages.values() if "missing" not in page}
        redirects = {item["from"]: item["to"] for item in payload["query"].get("redirects", [])}
        normalized = {item["from"]: item["to"] for item in payload["query"].get("normalized", [])}
        for title in batch:
            resolved = redirects.get(normalized.get(title, title), normalized.get(title, title))
            if resolved not in present:
                missing.append(title)
    for title in missing:
        print(f"UNRESOLVED: {title}", file=sys.stderr)
    print(f"checked {len(titles)} titles — {len(missing)} unresolved")
    return 0 if not missing else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the on-disk JSON only")
    parser.add_argument("--verify", action="store_true", help="also check titles against the wiki API")
    args = parser.parse_args()

    if args.check:
        return check(build())

    plan = build()
    # Compact like the other generated data files (route.full.json, items.full.json);
    # the repository stores this catalog without pretty-printing.
    TIERS_PATH.write_text(
        json.dumps(plan, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"wrote {TIERS_PATH.relative_to(ROOT)} — {len(plan['entries'])} entries")

    if args.verify:
        return verify_titles(sorted({wiki_title(entry) for entry in plan["entries"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
