#!/usr/bin/env python3
"""Fetch and normalize the upgrade/fragment economy and crafting-material ledgers.

Outputs (UTF-8 JSON):
  research/upgrades.json
  research/materials.json

Sources:
  * eldenring.wiki.gg item pages (Scadutree Fragment, Revered Spirit Ash,
    Golden Seed, Sacred Tear, per-tier Smithing/Somber Stone and Glovewort pages)
  * eldenring.wiki.gg Category:Crafting Materials (canonical material list)
  * Fextralife per-tier pages, used where the wiki.gg tier page is a stub
  * game-checklists.com Golden Seed checklist, used because the wiki.gg
    Golden Seed acquisition list is incomplete (41 entries vs 45 known seeds)

Raw HTML is cached in research/raw/upgrades-*.html and reused unless
--refresh is passed. The script never edits src/.

Unofficial fan project. Elden Ring and its content belong to FromSoftware and
Bandai Namco Entertainment.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "research" / "raw"
OUT_DIR = ROOT / "research"
USER_AGENT = "er-companion-research/1.0 (unofficial local fan project)"

WIKI = "https://eldenring.wiki.gg/wiki/"
FEXTRA = "https://eldenring.wiki.fextralife.com/"
CHECKLISTS = "https://game-checklists.com/elden-ring/"

ATTRIBUTION = (
    "Unofficial fan project. Upgrade and crafting-material data transcribed from "
    "eldenring.wiki.gg, eldenring.wiki.fextralife.com and game-checklists.com. "
    "Elden Ring and its content belong to FromSoftware and Bandai Namco Entertainment."
)

# ---------------------------------------------------------------------------
# Source page registry

# Prose "bolstering material" pages: one Acquisition list, region per top-level li.
BOLSTERING_PAGES = {
    "scadutree-fragment": ("Scadutree_Fragment", "scadutree-fragment", "Scadutree Fragment", True),
    "revered-spirit-ash": ("Revered_Spirit_Ash", "revered-spirit-ash", "Revered Spirit Ash", True),
    "golden-seed": ("Golden_Seed", "golden-seed", "Golden Seed", False),
    "sacred-tear": ("Sacred_Tear", "sacred-tear", "Sacred Tear", False),
}

# Tier pages on Fextralife use "Name (N)" in URLs.
TIERS = []
for n in range(1, 9):
    TIERS.append({
        "category": "smithing-stone",
        "variant": "",
        "tier": str(n),
        "name": f"Smithing Stone [{n}]",
        "fextra": f"Smithing+Stone+({n})",
        "wiki": f"Smithing_Stone_{n}",
        "dlc": False,
    })
for n in range(1, 10):
    TIERS.append({
        "category": "somber-smithing-stone",
        "variant": "",
        "tier": str(n),
        "name": f"Somber Smithing Stone [{n}]",
        "fextra": f"Somber+Smithing+Stone+({n})",
        "wiki": f"Somber_Smithing_Stone_{n}",
        "dlc": False,
    })
for variant, prefix, name_prefix in (("grave", "Grave", "Grave Glovewort"), ("ghost", "Ghost", "Ghost Glovewort")):
    for n in range(1, 10):
        TIERS.append({
            "category": "glovewort",
            "variant": variant,
            "tier": str(n),
            "name": f"{name_prefix} [{n}]",
            "fextra": f"{prefix}+Glovewort+({n})",
            "wiki": f"{prefix}_Glovewort_{n}",
            "dlc": False,
        })
TIERS.append({
    "category": "great-glovewort",
    "variant": "grave",
    "tier": "",
    "name": "Great Grave Glovewort",
    "fextra": "Great+Grave+Glovewort",
    "wiki": "Great_Grave_Glovewort",
    "dlc": False,
})
TIERS.append({
    "category": "great-glovewort",
    "variant": "ghost",
    "tier": "",
    "name": "Great Ghost Glovewort",
    "fextra": "Great+Ghost+Glovewort",
    "wiki": "Great_Ghost_Glovewort",
    "dlc": False,
})

# ---------------------------------------------------------------------------
# Region mapping. Keys are matched case-insensitively as substrings of the
# location/link text. Order matters: more specific entries first.

REGION_RULES = [
    # Shadow of the Erdtree
    ("gravesite plain", "Gravesite Plain", True),
    ("belurat", "Gravesite Plain", True),
    ("castle ensis", "Gravesite Plain", True),
    ("fog rift", "Gravesite Plain", True),
    ("scorched ruins", "Gravesite Plain", True),
    ("church of consolation", "Gravesite Plain", True),
    ("prospect town", "Gravesite Plain", True),
    ("ellac", "Gravesite Plain", True),
    ("three-path cross", "Gravesite Plain", True),
    ("highroad cross", "Scadu Altus", True),
    ("scadu altus", "Scadu Altus", True),
    ("moorth ruins", "Scadu Altus", True),
    ("bonny village", "Scadu Altus", True),
    ("ruins of unte", "Scadu Altus", True),
    ("village of flies", "Scadu Altus", True),
    ("taylew", "Scadu Altus", True),
    ("darklight catacombs", "Scadu Altus", True),
    ("shadow keep", "Shadow Keep", True),
    ("specimen storehouse", "Shadow Keep", True),
    ("storehouse", "Shadow Keep", True),
    ("church of the crusade", "Scadu Altus", True),
    ("cerulean coast", "Cerulean Coast", True),
    ("charo", "Charo's Hidden Grave", True),
    ("jagged peak", "Jagged Peak", True),
    ("dragon's pit", "Jagged Peak", True),
    ("stone coffin fissure", "Stone Coffin Fissure", True),
    ("abyssal woods", "Abyssal Woods", True),
    ("midra", "Abyssal Woods", True),
    ("rauh base", "Rauh Base", True),
    ("temple town ruins", "Rauh Base", True),
    ("ruined forge lava intake", "Rauh Base", True),
    ("ancient ruins of rauh", "Ancient Ruins of Rauh", True),
    ("enir-ilim", "Enir-Ilim", True),
    ("land of shadow", "Land of Shadow", True),
    # Base game
    ("chapel of anticipation", "Chapel of Anticipation", False),
    ("roundtable", "Roundtable Hold", False),
    ("sainted hero", "Capital Outskirts", False),
    ("sealed tunnel", "Leyndell, Royal Capital", False),
    ("minor erdtree catacombs", "Caelid", False),
    ("night's sacred ground", "Nokron, Eternal City", False),
    ("four belfries", "Liurnia of the Lakes", False),
    ("cave of the forlorn", "Consecrated Snowfield", False),
    ("wyndham", "Altus Plateau", False),
    ("mohgwyn dynasty", "Mohgwyn Palace", False),
    ("artist's shack", "Limgrave", False),
    ("lakeside crystal cave", "Liurnia of the Lakes", False),
    ("forsaken ruins", "Weeping Peninsula", False),
    ("guardians' garrison", "Mountaintops of the Giants", False),
    ("church of the plague", "Caelid", False),
    ("church of dragon communion", "Limgrave", False),
    ("morne tunnel", "Weeping Peninsula", False),
    ("carian study hall", "Liurnia of the Lakes", False),
    ("school of graven mages", "Raya Lucaria Academy", False),
    ("gaol cave", "Caelid", False),
    ("moonfolk ruins", "Liurnia of the Lakes", False),
    ("yelough anix", "Consecrated Snowfield", False),
    ("uhl palace", "Ainsel River", False),
    ("halligtree", "Miquella's Haligtree", False),
    ("shaded castle", "Altus Plateau", False),
    ("castle sol", "Mountaintops of the Giants", False),
    ("giant-conquering hero", "Mountaintops of the Giants", False),
    ("giant conquering hero", "Mountaintops of the Giants", False),
    ("fort of reprimand", "Scadu Altus", True),
    ("scorpion river", "Gravesite Plain", True),
    ("academy crystal cave", "Liurnia of the Lakes", False),
    ("impassable greatbridge", "Caelid", False),
    ("starfall", "Scadu Altus", True),
    ("ringleader", "Liurnia of the Lakes", False),
    ("church of repose", "Mountaintops of the Giants", False),
    ("crystalline woods", "Liurnia of the Lakes", False),
    ("scaduview", "Scadu Altus", True),
    ("church of the crusade", "Scadu Altus", True),
    ("stormveil", "Stormveil Castle", False),
    ("stormhill", "Stormhill", False),
    ("limgrave", "Limgrave", False),
    ("mistwood", "Limgrave", False),
    ("fort haight", "Limgrave", False),
    ("murkwater", "Limgrave", False),
    ("stormfoot", "Limgrave", False),
    ("deathtouched", "Limgrave", False),
    ("weeping peninsula", "Weeping Peninsula", False),
    ("tombsward", "Weeping Peninsula", False),
    ("impaler's", "Weeping Peninsula", False),
    ("castle morne", "Weeping Peninsula", False),
    ("liurnia", "Liurnia of the Lakes", False),
    ("raya lucaria", "Raya Lucaria Academy", False),
    ("academy of raya lucaria", "Raya Lucaria Academy", False),
    ("caria manor", "Liurnia of the Lakes", False),
    ("black knife catacombs", "Liurnia of the Lakes", False),
    ("cliffbottom", "Liurnia of the Lakes", False),
    ("road's end", "Liurnia of the Lakes", False),
    ("ravine-veiled", "Liurnia of the Lakes", False),
    ("ruin-strewn precipice", "Liurnia of the Lakes", False),
    ("moonlight altar", "Liurnia of the Lakes", False),
    ("caelid", "Caelid", False),
    ("dragonbarrow", "Dragonbarrow", False),
    ("selia", "Caelid", False),
    ("sellia", "Caelid", False),
    ("redmane", "Caelid", False),
    ("war-dead catacombs", "Caelid", False),
    ("gael tunnel", "Caelid", False),
    ("altus plateau", "Altus Plateau", False),
    ("altus", "Altus Plateau", False),
    ("mt. gelmir", "Mt. Gelmir", False),
    ("mt gelmir", "Mt. Gelmir", False),
    ("gelmir", "Mt. Gelmir", False),
    ("volcano manor", "Mt. Gelmir", False),
    ("unsightly catacombs", "Mt. Gelmir", False),
    ("leyndell", "Leyndell, Royal Capital", False),
    ("capital outskirts", "Capital Outskirts", False),
    ("auriza", "Capital Outskirts", False),
    ("subterranean shunning-grounds", "Leyndell, Royal Capital", False),
    ("mountaintops of the giants", "Mountaintops of the Giants", False),
    ("forbidden lands", "Mountaintops of the Giants", False),
    ("giants' mountaintop", "Mountaintops of the Giants", False),
    ("consecrated snowfield", "Consecrated Snowfield", False),
    ("ordina", "Consecrated Snowfield", False),
    ("crumbling farum azula", "Crumbling Farum Azula", False),
    ("farum azula", "Crumbling Farum Azula", False),
    ("siofra river", "Siofra River", False),
    ("siofra", "Siofra River", False),
    ("ainsel river", "Ainsel River", False),
    ("ainsel", "Ainsel River", False),
    ("nokron", "Nokron, Eternal City", False),
    ("nokstella", "Nokstella, Eternal City", False),
    ("lake of rot", "Lake of Rot", False),
    ("grand cloister", "Lake of Rot", False),
    ("deeproot", "Deeproot Depths", False),
    ("mohgwyn palace", "Mohgwyn Palace", False),
    ("haligtree", "Miquella's Haligtree", False),
    ("elphael", "Miquella's Haligtree", False),
    ("miquella's haligtree", "Miquella's Haligtree", False),
    ("dragon temple", "Crumbling Farum Azula", False),
    ("black blade kindred", "Mountaintops of the Giants", False),
    ("freezing lake", "Mountaintops of the Giants", False),
    ("giant's gravepost", "Mountaintops of the Giants", False),
    ("bestial sanctum", "Dragonbarrow", False),
    ("farum greatbridge", "Dragonbarrow", False),
    ("academy gate town", "Liurnia of the Lakes", False),
]


def map_region(*texts: str) -> tuple[str, bool]:
    """Return (region, dlc) for the first matching rule, else ("", False)."""
    blob = " ".join(t for t in texts if t).lower()
    for key, region, dlc in REGION_RULES:
        if key in blob:
            return region, dlc
    return "", False


# ---------------------------------------------------------------------------
# HTTP cache


def fetch(url: str, filename: str, refresh: bool) -> str:
    path = RAW_DIR / filename
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8", errors="ignore")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read()
    path.write_bytes(data)
    time.sleep(0.4)
    return data.decode("utf-8", errors="ignore")


# ---------------------------------------------------------------------------
# Helpers

GENERIC_ANCHORS = {
    "video location",
    "video link",
    "map link",
    "map location",
    "see shadow of the erdtree map",
    "view on interactive map",
    "shadow of the erdtree",
    "base game",
    "site of grace",
    "location",
}

PLACE_KEYWORDS = (
    "catacomb", "cave", "tunnel", "ruin", "grave", "castle", "manor", "church",
    "forge", "keep", "coast", "plain", "altus", "river", "city", "depths",
    "palace", "mountaintop", "snowfield", "azula", "haligtree", "village",
    "town", "shack", "bridge", "academy", "tower", "settlement", "gaol",
    "evergaol", "mausoleum", "sanctum", "garrison", "belfries", "study hall",
    "highroad", "cross", "wood", "woods", "lake", "falls", "cliff", "fort",
    "outskirts", "capital", "leyndell", "stormveil", "stormhill", "limgrave",
    "liurnia", "caelid", "dragonbarrow", "gelmir", "mountaintops", "siofra",
    "ainsel", "nokron", "nokstella", "mohgwyn", "deeproot", "elphael",
    "enir-ilim", "scorpion", "starfall", "repose", "crystalline", "belurat",
    "shadow keep", "cerulean", "charo", "jagged", "abyssal", "rauh",
)


def clean(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text.strip()


def slug(text: str) -> str:
    text = text.lower().replace("'", "").replace("’", "")
    text = re.sub(r"\[|\]|\(|\)", "", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unknown"


QUANTITY_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}


def parse_quantity(text: str) -> tuple[int | None, bool]:
    """Return (quantity, stated). None means the source says 'multiple'/unknown."""
    text = text.strip()
    if re.match(r"^multiple\b", text, re.I):
        return None, False
    head = text[:80]
    match = re.match(r"^\(?\s*(?:x|×)\s*(\d+)\)?", head, re.I)
    if match:
        return int(match.group(1)), True
    match = re.match(r"^(\d+)\s*[x×]\b", head, re.I)
    if match:
        return int(match.group(1)), True
    match = re.match(r"^(\d+)\s*\((?:one|two|three|four|five|six|\d+)\)", head, re.I)
    if match:
        return int(match.group(1)), True
    match = re.match(r"^(One|Two|Three|Four|Five|Six)\b", head)
    if match:
        return QUANTITY_WORDS[match.group(1).lower()], True
    match = re.search(r"\b(One|Two|Three|Four|Five|Six)\s*\(\d+\)", head)
    if match:
        return QUANTITY_WORDS[match.group(1).lower()], True
    match = re.search(r"\b(?:x|×)\s*(\d+)\b", head)
    if match:
        return int(match.group(1)), True
    match = re.search(r"\b(?:a total of|total of)\s*(\d+)\b", text[:120], re.I)
    if match:
        return int(match.group(1)), True
    return 1, False


def is_place(label: str) -> bool:
    lowered = label.lower()
    return any(keyword in lowered for keyword in PLACE_KEYWORDS)


def first_real_anchor(li, require_place: bool = False) -> str:
    fallback = ""
    for anchor in li.find_all("a"):
        label = clean(anchor.get_text(" ", strip=True))
        if not label or label.lower() in GENERIC_ANCHORS or label.lower().startswith("see "):
            continue
        if require_place:
            if is_place(label):
                return label
            fallback = fallback or label
        else:
            return label
    return "" if require_place else fallback


LEAD_QUANTITY = re.compile(
    r"^(?:"
    r"(?:One|Two|Three|Four|Five|Six)\s+(?:is|are)\s+(?:found\s+|dropped\s+)?"
    r"(?:at|in|on|near|by|next to|right next to|inside|beneath|under|behind|from|after|past|through|over|above|below|along)?\s*"
    r"|\d+\s*[x×]\s*"
    r"|\(\s*[x×]\s*\d+\s*\)\s*"
    r")",
    re.I,
)


def strip_lead_quantity(text: str) -> str:
    stripped = LEAD_QUANTITY.sub("", clean(text), count=1).strip()
    stripped = re.sub(r"^(?:the|a|an)\s+", "", stripped, flags=re.I)
    return stripped[:1].upper() + stripped[1:] if stripped else clean(text)


def location_prefix(text: str) -> str:
    """Best-effort place name at the start of a Fextralife bullet."""
    text = clean(text)
    # "Location: rest" / "Location — rest"
    match = re.match(r"^([^:]{3,80}):\s", text)
    if match:
        candidate = match.group(1)
        if candidate.lower() not in GENERIC_ANCHORS and not re.match(
            r"^(found|there|one|two|three|players|can|the item|this|it)\b", candidate, re.I
        ):
            return candidate
    return ""


# ---------------------------------------------------------------------------
# Parser: prose bolstering pages (wiki.gg)


def parse_bolstering(html: str, category: str, name: str, page_dlc: bool):
    soup = BeautifulSoup(html, "lxml")
    content = soup.select_one("#mw-content-text") or soup
    heading = None
    for h2 in content.select("h2"):
        if h2.get_text(strip=True).lower().startswith("acquisition"):
            heading = h2
            break
    if heading is None:
        return [], 0

    leaves: list[tuple[str, str, str]] = []

    def walk(ul, region="", subarea=""):
        for li in ul.find_all("li", recursive=False):
            nested = li.find("ul")
            if nested:
                clone = BeautifulSoup(str(li), "lxml").find("li")
                for child in clone.find_all("ul"):
                    child.decompose()
                anchor = clone.find("a", recursive=False)
                own = clean(clone.get_text(" ", strip=True))
                label = clean(anchor.get_text(strip=True)) if anchor else re.split(r"\s+contains\s+", own)[0]
                if not region:
                    walk(nested, label, "", )
                else:
                    walk(nested, region, label)
            else:
                leaves.append((region, subarea, clean(li.get_text(" ", strip=True))))

    first_ul = heading.find_next_sibling("ul")
    if first_ul is not None:
        walk(first_ul)

    entries = []
    per_region = defaultdict(int)
    for region, subarea, text in leaves:
        quantity, stated = parse_quantity(text)
        effective_region = region or "Land of Shadow"
        dlc = page_dlc
        if not page_dlc:
            mapped, mapped_dlc = map_region(region, text)
            if mapped:
                effective_region, dlc = mapped, mapped_dlc
        per_region[slug(effective_region)] += 1
        idx = per_region[slug(effective_region)]
        entry = {
            "id": f"{category}-{slug(effective_region)}-{idx:02d}",
            "category": category,
            "name": name,
            "tier": "",
            "quantity": quantity,
            "region": effective_region,
            "location": strip_lead_quantity(text),
            "description": "" if subarea == "" else f"Inside {subarea}.",
            "sourceText": text,
            "sourceUrl": WIKI + BOLSTERING_PAGES[category][0],
            "dlc": dlc,
            "unresolved": quantity is None,
        }
        if quantity is None:
            entry["note"] = "Source does not state a quantity (multiple pickups)."
        entries.append(entry)
    return entries, len(leaves)


# ---------------------------------------------------------------------------
# Parser: Fextralife per-tier pages


def parse_fextra_tier(html: str, spec: dict):
    soup = BeautifulSoup(html, "lxml")
    main = soup.select_one(".mw-parser-output") or soup
    heading = None
    for h in main.select("h2,h3"):
        label = h.get_text(" ", strip=True)
        if "Location" in label or "Where to Find" in label:
            heading = h
            break
    if heading is None:
        return []

    entries = []
    counters = defaultdict(int)

    def add_li(li, section_dlc: bool, forced_region: str = "", forced_dlc: bool | None = None):
        text = clean(li.get_text(" ", strip=True))
        if not text:
            return
        quantity, stated = parse_quantity(text)
        prefix = location_prefix(text)
        anchor = first_real_anchor(li, require_place=True)
        location = prefix or anchor
        if location.lower() in GENERIC_ANCHORS or not is_place(location):
            location = ""
        region = forced_region
        mapped_dlc = forced_dlc if forced_dlc is not None else False
        if not region:
            region, mapped_dlc = map_region(location, text)
        entry_dlc = section_dlc or mapped_dlc
        if not region and entry_dlc:
            region = "Land of Shadow"
        lowered = text.lower()
        if re.search(r"purchas|sold by|twin maiden|husks|merchant|\biji\b", lowered):
            return  # infinite merchant stock is not a pickup
        head = lowered[:110]
        if re.search(
            r"^(?:rare |guaranteed )?drop(?:s|ped)?\b|\d+(\.\d+)?% chance|"
            r"chance to drop|chance from|can drop|drop rate",
            head,
        ):
            acquisition = "enemy-drop"
        else:
            acquisition = "pickup"
        counters[slug(region or "unknown")] += 1
        idx = counters[slug(region or "unknown")]
        entry = {
            "id": f"{spec['category']}-{spec['variant'] + '-' if spec['variant'] else ''}{spec['tier'] + '-' if spec['tier'] else ''}{slug(region or 'unknown')}-{idx:02d}",
            "category": spec["category"],
            "name": spec["name"],
            "tier": spec["tier"],
            "quantity": quantity,
            "region": region,
            "location": location or "Source does not name the place",
            "description": text[:400],
            "sourceText": text,
            "sourceUrl": FEXTRA + spec["fextra"],
            "dlc": entry_dlc,
            "unresolved": (not location) or (not region) or (quantity is None),
            "acquisitionType": acquisition,
            "quantityStated": stated,
        }
        if spec["variant"]:
            entry["variant"] = spec["variant"]
        if not location:
            entry["note"] = "Fextralife bullet has no place name; description holds the source text."
        entries.append(entry)

    mode = "pickup"
    dlc = False
    node = heading.find_next_sibling()
    while node is not None and node.name != "h2":
        if node.name == "h3":
            label = node.get_text(" ", strip=True).lower()
            if "guide" in label or "notes" in label or "tips" in label:
                break
            if "purchase" in label or "buy" in label:
                mode = "merchant"
            elif "drop" in label:
                mode = "drop"
            elif "location" in label or "world" in label or "find" in label:
                mode = "pickup"
            else:
                mode = "pickup"
        elif node.name == "h5":
            label = node.get_text(" ", strip=True)
            dlc = "shadow" in label.lower()
            mode = "pickup"
        elif node.name == "p":
            label = node.get_text(" ", strip=True).lower()
            if "purchase" in label or "where to buy" in label:
                mode = "merchant"
            elif "farm" in label:
                mode = "farm"
            elif "find" in label:
                mode = "pickup"
        elif node.name == "ul" and mode in ("pickup", "drop"):
            for li in node.find_all("li", recursive=False):
                add_li(li, dlc)
        elif node.name == "div" and mode in ("pickup", "drop"):
            # Some Fextralife pages group locations into a div.row per region.
            region_label = ""
            region_dlc = dlc
            h3 = node.find("h3")
            if h3 is not None:
                region_label = clean(h3.get_text(" ", strip=True))
                mapped, region_dlc = map_region(region_label)
                if mapped:
                    region_label = mapped
            for ul in node.find_all("ul"):
                for li in ul.find_all("li", recursive=False):
                    add_li(li, dlc, forced_region=region_label, forced_dlc=region_dlc)
        node = node.find_next_sibling()
    return entries


# ---------------------------------------------------------------------------
# Parser: game-checklists Golden Seed table


def parse_checklist_seeds(html: str):
    soup = BeautifulSoup(html, "lxml")
    rows = soup.select("tr[id^=golden-seed-]")
    entries = []
    for tr in rows:
        name_node = tr.select_one(".item-name")
        if name_node is None:
            continue
        label = clean(name_node.get_text(" ", strip=True))
        meta = [clean(x.get_text(" ", strip=True)) for x in tr.select(".item-meta-line")]
        region = ""
        grace = ""
        for item in meta:
            if item.lower().startswith("region:"):
                region = clean(item.split(":", 1)[1])
            elif item.lower().startswith("site of grace:"):
                grace = clean(item.split(":", 1)[1])
        desc_node = tr.select_one(".description-cell")
        description = clean(desc_node.get_text(" ", strip=True)) if desc_node else ""
        description = re.sub(r"\s*Location of Golden Seed #\d+:\s*$", "", description)
        description = re.sub(r"\s*Precise location:\s*$", "", description)
        description = re.sub(r"\s*Reference:\s*$", "", description).strip()
        missable = description.lower().startswith("missable")
        description = re.sub(r"^Missable!\s*", "", description)
        number = re.search(r"#(\d+)", label)
        idx = int(number.group(1)) if number else len(entries) + 1
        subregion = ""
        if region in ("Stormhill", "Stormveil Castle"):
            subregion, region = region, "Limgrave"
        entries.append({
            "id": f"golden-seed-{slug(region)}-{idx:02d}",
            "category": "golden-seed",
            "name": "Golden Seed",
            "tier": "",
            "quantity": 1,
            "region": region,
            "location": description or grace,
            "description": f"Nearest grace: {grace}." if grace else "",
            "sourceUrl": CHECKLISTS + "all-golden-seeds",
            "dlc": False,
            "unresolved": False,
            "nearestGrace": grace,
            "missable": missable,
            **({"subregion": subregion} if subregion else {}),
        })
    return entries


# ---------------------------------------------------------------------------
# Materials ledger


def load_materials():
    farms = json.loads((ROOT / "src" / "data" / "farms.json").read_text(encoding="utf-8"))
    items = json.loads((ROOT / "src" / "data" / "items.full.json").read_text(encoding="utf-8"))["items"]
    catalog_names = {i["name"] for i in items}

    category_html = fetch(
        "https://eldenring.wiki.gg/api.php?action=query&list=categorymembers"
        "&cmtitle=Category%3ACrafting%20Materials&cmlimit=500&format=json",
        "upgrades-category-crafting-materials.json",
        refresh=ARGS.refresh,
    )
    category = json.loads(category_html)
    wiki_names = [
        m["title"] for m in category["query"]["categorymembers"]
        if not m["title"].startswith("Category:")
        and "Crafting Materials" not in m["title"]
    ]

    route_text = ""
    for route_file in ("route.base.json", "route.dlc.json"):
        route_path = ROOT / "research" / route_file
        if route_path.exists():
            route_text += json.dumps(
                json.loads(route_path.read_text(encoding="utf-8")), ensure_ascii=False
            ).lower()

    rows = []
    farm_names = set()
    for mat in farms["materials"]:
        farm_names.add(mat["name"])
        merchant = mat.get("merchant", "")
        bell = merchant if "Bell Bearing" in merchant else ""
        rows.append({
            "id": mat["id"],
            "name": mat["name"],
            "category": mat["category"],
            "environmental": any(
                key in mat["category"] for key in ("Flora", "Fungus", "Mineral", "Resin")
            ),
            "renewability": mat["renewability"],
            "earlySource": mat["earlySource"],
            "lateSource": mat["lateSource"],
            "nearestGrace": mat["grace"],
            "farmMethod": mat["method"],
            "purchasable": mat["purchasable"],
            "merchant": merchant,
            "bellBearing": bell,
            "finiteBeforeUnlock": mat["finiteBeforeUnlock"],
            "priority": mat["priority"],
            "use": mat["use"],
            "sourceUrl": mat["sourceUrl"],
            "dlc": mat["game"] == "Shadow of the Erdtree",
            "game": mat["game"],
            "inFarms": True,
            "inWikiCategory": mat["name"] in wiki_names,
            "inItemCatalog": mat["name"] in catalog_names,
            "inRoute": mat["name"].lower() in route_text,
            "unresolved": False,
        })

    # Hidden Plumage exists in the wiki category but not in the Redmaw workbook.
    hidden_html = fetch(WIKI + "Hidden_Plumage", "upgrades-Hidden_Plumage.html", refresh=ARGS.refresh)
    if "Hidden Plumage" not in farm_names:
        soup = BeautifulSoup(hidden_html, "lxml")
        content = soup.select_one("#mw-content-text") or soup
        text = clean(content.get_text(" ", strip=True))
        rows.append({
            "id": "MAT-CUT-HIDDEN-PLUMAGE",
            "name": "Hidden Plumage",
            "category": "Rare Fauna",
            "environmental": False,
            "renewability": "No — cut content",
            "earlySource": "Unobtainable",
            "lateSource": "Unobtainable",
            "nearestGrace": "",
            "farmMethod": "None — removed from the retail game",
            "purchasable": "No",
            "merchant": "",
            "bellBearing": "",
            "finiteBeforeUnlock": "Yes — cannot be obtained",
            "priority": "None",
            "use": "Cut crafting material; no recipe in the retail game",
            "sourceUrl": WIKI + "Hidden_Plumage",
            "dlc": False,
            "game": "Base Game",
            "inFarms": False,
            "inWikiCategory": True,
            "inItemCatalog": "Hidden Plumage" in catalog_names,
            "inRoute": False,
            "obtainable": False,
            "unresolved": False,
            "note": "The wiki page states it can't be acquired through normal means; cut from the release build.",
        })

    for name in wiki_names:
        if name not in {r["name"] for r in rows}:
            rows.append({
                "id": f"MAT-UNRESOLVED-{slug(name)}",
                "name": name,
                "category": "",
                "environmental": False,
                "renewability": "",
                "earlySource": "",
                "lateSource": "",
                "nearestGrace": "",
                "farmMethod": "",
                "purchasable": "",
                "merchant": "",
                "bellBearing": "",
                "finiteBeforeUnlock": "",
                "priority": "",
                "use": "",
                "sourceUrl": WIKI + name.replace(" ", "_"),
                "dlc": False,
                "game": "",
                "inFarms": False,
                "inWikiCategory": True,
                "inItemCatalog": name in catalog_names,
                "inRoute": name.lower() in route_text,
                "unresolved": True,
                "note": "Listed in Category:Crafting Materials but absent from the workbook ledger.",
            })

    rows.sort(key=lambda r: (not r["dlc"], r["name"].lower()))

    matched_farms = sum(1 for r in rows if r["inFarms"] and r["inWikiCategory"])
    farms_only = [r["name"] for r in rows if r["inFarms"] and not r["inWikiCategory"]]
    new_only = [r["name"] for r in rows if not r["inFarms"]]
    catalog_matches = sum(1 for r in rows if r["inItemCatalog"])

    materials = {
        "source": "eldenring.wiki.gg Category:Crafting Materials + src/data/farms.json",
        "attribution": ATTRIBUTION,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "sources": {
            "materialCategory": "https://eldenring.wiki.gg/wiki/Category:Crafting_Materials",
            "farms": "src/data/farms.json",
            "itemCatalog": "src/data/items.full.json",
            "routes": ["research/route.base.json", "research/route.dlc.json"],
        },
        "counts": {
            "total": len(rows),
            "baseGame": sum(1 for r in rows if not r["dlc"]),
            "dlc": sum(1 for r in rows if r["dlc"]),
            "environmental": sum(1 for r in rows if r["environmental"]),
            "obtainable": sum(1 for r in rows if r.get("obtainable", True)),
        },
        "reconciliation": {
            "farmsMaterials": len(farms["materials"]),
            "wikiCategoryMaterials": len(wiki_names),
            "matched": matched_farms,
            "farmsOnly": farms_only,
            "newOnly": new_only,
            "itemCatalogMatches": catalog_matches,
            "itemCatalogNote": (
                "src/data/items.full.json is an equipment/consumable catalog and contains no "
                "crafting-material group; zero material names resolve to catalog IDs."
            ),
            "unresolved": [r["name"] for r in rows if r["unresolved"]],
            "routeNamed": sum(1 for r in rows if r["inRoute"]),
            "routeUnnamed": sum(1 for r in rows if not r["inRoute"]),
            "routeUnnamedEnvironmental": sum(
                1 for r in rows if r["environmental"] and not r["inRoute"]
            ),
        },
        "entries": rows,
    }
    return materials


# ---------------------------------------------------------------------------
# Main


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="re-download source pages")
    global ARGS
    ARGS = parser.parse_args()

    entries = []
    category_notes = {}
    stated_totals = {}

    # Bolstering pages, parsed from wiki.gg.
    for category, (page, cat_slug, name, is_dlc) in BOLSTERING_PAGES.items():
        filename = f"upgrades-{cat_slug}.html"
        html = fetch(WIKI + page, filename, ARGS.refresh)
        parsed, leaves = parse_bolstering(html, category, name, is_dlc)
        wiki_leaves = leaves
        wiki_sum = sum(e["quantity"] for e in parsed if e["quantity"])
        if category == "golden-seed":
            parsed = []
        entries.extend(parsed)
        category_notes[category] = {
            "sourceUrl": WIKI + page,
            "wikiEntries": wiki_leaves,
            "wikiQuantitySum": wiki_sum,
            "quantitySum": wiki_sum,
        }
        if category == "scadutree-fragment":
            stated_totals[category] = 50
        if category == "revered-spirit-ash":
            stated_totals[category] = 25
        if category == "sacred-tear":
            stated_totals[category] = 12

    # Golden Seed: wiki.gg list is incomplete, use the 45-entry checklist.
    seed_html = fetch(CHECKLISTS + "all-golden-seeds", "upgrades-gamechecklists-golden-seeds.html", ARGS.refresh)
    seeds = parse_checklist_seeds(seed_html)
    entries.extend(seeds)
    category_notes["golden-seed"] = {
        "sourceUrl": CHECKLISTS + "all-golden-seeds",
        "wikiSourceUrl": WIKI + "Golden_Seed",
        "wikiEntries": category_notes["golden-seed"]["wikiEntries"],
        "quantitySum": len(seeds),
        "note": (
            "wiki.gg lists 41 acquisition entries (42 items); game-checklists, Rock Paper Shotgun "
            "and community counts list 45. The 45-entry checklist is used here for completeness."
        ),
        "unresolvedCategory": True,
    }

    # Tier pages from Fextralife.
    for spec in TIERS:
        filename = f"upgrades-fextra-{slug(spec['name'])}.html"
        html = fetch(FEXTRA + spec["fextra"], filename, ARGS.refresh)
        parsed = parse_fextra_tier(html, spec)
        entries.extend(parsed)
        key = spec["category"]
        if key not in category_notes:
            category_notes[key] = {
                "sourceUrl": WIKI + {
                    "smithing-stone": "Smithing_Stones",
                    "somber-smithing-stone": "Somber_Smithing_Stones",
                    "glovewort": "Grave_Glovewort",
                    "great-glovewort": "Great_Grave_Glovewort",
                }[key],
                "fextraIndex": FEXTRA + {
                    "smithing-stone": "Smithing+Stones",
                    "somber-smithing-stone": "Somber+Smithing+Stones",
                    "glovewort": "Grave+Glovewort",
                    "great-glovewort": "Great+Grave+Glovewort",
                }[key],
                "tiers": {},
                "tierSources": {},
                "note": (
                    "Fextralife per-tier pages are used because the wiki.gg tier pages for "
                    "most stone/glovewort levels are stubs with only a merchant note."
                ),
            }
        category_notes[key]["tiers"][spec["name"]] = len(parsed)
        category_notes[key]["tierSources"][spec["name"]] = {
            "fextralife": FEXTRA + spec["fextra"],
            "wiki": WIKI + spec["wiki"],
        }

    # Drop exact duplicate bullets (Fextralife sometimes repeats a row).
    seen = set()
    unique = []
    for entry in entries:
        if entry["category"] in ("scadutree-fragment", "revered-spirit-ash", "golden-seed", "sacred-tear"):
            unique.append(entry)
            continue
        key = (entry["category"], entry["name"], entry["location"], entry["description"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(entry)
    entries = unique

    category_notes["great-glovewort"]["ignSourceUrl"] = (
        "https://www.ign.com/wikis/elden-ring/"
        "Shadow_of_the_Erdtree_Great_Glovewort_Locations"
    )

    # IGN's DLC Great Glovewort guide gives the canonical 6 Great Grave pickups.
    # Fextralife's page lists four Cerulean Coast bullets that overlap; replace
    # them with the six named IGN locations so the DLC count is exact.
    ign_great_glovewort = "https://www.ign.com/wikis/elden-ring/Shadow_of_the_Erdtree_Great_Glovewort_Locations"
    entries = [
        e for e in entries
        if not (e["category"] == "great-glovewort" and e["name"] == "Great Grave Glovewort" and e["dlc"])
    ]
    for idx, (region, location, description) in enumerate([
        ("Cerulean Coast", "Cerulean Coast West",
         "From the Cerulean Coast West Site of Grace, head southeast to the area border and drop into the hole near the tree drawing on the map."),
        ("Cerulean Coast", "Cerulean Coast East",
         "On one of the huge coffins on the left when first entering the Cerulean Coast; climb up and follow the small path towards the east coast."),
        ("Cerulean Coast", "Cerulean Coast Southeast",
         "Climb the coffin near the Cerulean Coast Cross Site of Grace and jump to the closest piece of land with Torrent; the flower sits in front of the statue."),
        ("Charo's Hidden Grave", "Cerulean Coast Center",
         "From the Charo's Hidden Grave Site of Grace, go southeast near the region border; the coffin protrudes from the wall on the right."),
        ("Cerulean Coast", "Cerulean Coast Northwest",
         "From the Cerulean Coast West Site of Grace, pass the first coffin and follow the left path to the northwest coast."),
        ("Shadow Keep", "Church District",
         "In the Church District, the eastern part of Shadow Keep reached from the Church District Entrance Site of Grace; jump the roofs or use the flooded route."),
    ], start=1):
        entries.append({
            "id": f"great-glovewort-grave-dlc-{idx:02d}",
            "category": "great-glovewort",
            "name": "Great Grave Glovewort",
            "tier": "",
            "quantity": 1,
            "region": region,
            "location": location,
            "description": description,
            "sourceText": description,
            "sourceUrl": ign_great_glovewort,
            "dlc": True,
            "unresolved": False,
            "acquisitionType": "pickup",
            "quantityStated": False,
            "variant": "grave",
            "note": "IGN DLC Great Glovewort guide; Fextralife's list overlaps on the Cerulean Coast.",
        })

    # Split fixed pickups from repeatable enemy-drop leads. The ledger tracks
    # distinct pickups; drop leads are retained separately for farming.
    drop_sources = [e for e in entries if e.get("acquisitionType") == "enemy-drop"]
    entries = [e for e in entries if e.get("acquisitionType") != "enemy-drop"]

    # Tier tables must reflect the post-split pickup ledger, not raw parsed rows.
    for key, block in category_notes.items():
        if "tiers" not in block:
            continue
        pickup_counts = Counter(e["name"] for e in entries if e["category"] == key)
        drop_counts = Counter(e["name"] for e in drop_sources if e["category"] == key)
        block["tiers"] = {name: pickup_counts.get(name, 0) for name in block["tiers"]}
        block["tierDropSources"] = {name: drop_counts.get(name, 0) for name in block["tiers"]}

    # Ensure every category has a source block and counts.
    counts = Counter(e["category"] for e in entries)
    category_order = [
        "scadutree-fragment", "revered-spirit-ash", "golden-seed", "sacred-tear",
        "smithing-stone", "somber-smithing-stone", "glovewort", "great-glovewort",
    ]
    counts = {key: counts.get(key, 0) for key in category_order}

    unresolved_by_category = Counter(
        e["category"] for e in entries if e["unresolved"]
    )
    acquisition_counts = Counter(
        f"{e['category']}:{e.get('acquisitionType', 'pickup')}" for e in entries
    )

    for key in category_order:
        block = category_notes.setdefault(key, {})
        block["count"] = counts[key]
        if key not in stated_totals:
            block.setdefault("unresolvedCategory", unresolved_by_category[key] > 0)

    order_index = {key: i for i, key in enumerate(category_order)}
    entries.sort(key=lambda e: (order_index.get(e["category"], 99), e["region"], e["id"]))

    upgrades = {
        "source": "eldenring.wiki.gg, eldenring.wiki.fextralife.com, game-checklists.com",
        "attribution": ATTRIBUTION,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "entries": entries,
        "dropSources": drop_sources,
        "counts": counts,
        "statedTotals": stated_totals,
        "unresolvedByCategory": {k: unresolved_by_category.get(k, 0) for k in category_order},
        "dropSourceCounts": dict(sorted(Counter(e["category"] for e in drop_sources).items())),
        "categories": {k: category_notes[k] for k in category_order},
        "notes": {
            "golden-seed": (
                "45 entries. The DLC adds no Golden Seeds: wiki.gg and Fextralife have no "
                "Shadow of the Erdtree acquisition section and third-party totals (45) match "
                "the base-game count."
            ),
            "sacred-tear": (
                "12 entries, all base game. The DLC adds no Sacred Tears; the Realm of Shadow "
                "uses Scadutree Fragments and Revered Spirit Ashes instead."
            ),
            "revered-spirit-ash": (
                "wiki.gg states 25 and its list sums to 25. IGN's DLC checklist says 24; the "
                "discrepancy is noted rather than resolved."
            ),
            "smithing-stone": (
                "Entries include fixed pickups and enemy-drop leads from Fextralife. Merchant "
                "(infinite-stock) rows are excluded. Quantity defaults to 1 when the source "
                "does not state one; quantityStated records this."
            ),
            "somber-smithing-stone": (
                "Same method as smithing-stone. Ancient Dragon Smithing Stones are outside the "
                "requested tier range and are not in this ledger."
            ),
            "glovewort": (
                "Grave and Ghost Glovewort [1]-[9]. DLC pickups are included where Fextralife "
                "lists a Shadow of the Erdtree section."
            ),
            "great-glovewort": (
                "Great Grave Glovewort and Great Ghost Glovewort, including 9 DLC pickups "
                "(6 Great Grave + 3 Great Ghost). Two Cerulean Coast Great Grave pickups are "
                "added from IGN's DLC guide because Fextralife omits them; the 6+3 total "
                "matches IGN's stated count."
            ),
            "scadutree-fragment": "wiki.gg list sums to exactly 50, the stated DLC total.",
        },
    }

    (OUT_DIR / "upgrades.json").write_text(
        json.dumps(upgrades, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    materials = load_materials()
    (OUT_DIR / "materials.json").write_text(
        json.dumps(materials, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print("upgrades.json:", json.dumps(counts))
    print("stated totals:", json.dumps(stated_totals))
    print("unresolved:", json.dumps({k: v for k, v in unresolved_by_category.items() if v}))
    print("materials.json:", json.dumps(materials["counts"]))
    print("reconciliation:", json.dumps(materials["reconciliation"], ensure_ascii=False))


if __name__ == "__main__":
    main()
