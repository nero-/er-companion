#!/usr/bin/env python3
"""Build ``research/world.json`` from first-party wiki pages.

Redmaw only covers walkthrough checkboxes.  This script collects the world
objects it leaves out: Sites of Grace, Finger Reader Crones, Stranded Souls,
Sword Monuments, Stakes of Marika, Effigies of the Martyr, Birdseye Telescopes
and Gatekeeper Statues.

Sources, in order of preference:

* eldenring.wiki.gg (Eldenpedia) for graces, crones, stranded souls, sword
  monuments and base-game summoning pools.
* eldenring.wiki.fextralife.com for crones, effigies of the martyr, stakes and
  sword-monument cross-checks.
* Archived Fextralife/Fandom pages only where the live page no longer exists
  (Birdseye Telescopes); the archive URL is cited on every such entry.

Raw HTML is cached in ``research/raw/world-objects-*.html`` and re-used unless
``--refresh`` is passed.  The wiki.gg API rejects default user agents, so every
request sends a descriptive one and sleeps between requests.

Never invent a row: categories without an authoritative per-object list emit
zero/partial entries, are marked ``unresolved`` and are explained in ``gaps``.

Usage:
    python3 scripts/research/fetch_world_objects.py [--refresh]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "research" / "raw"
OUT_FILE = ROOT / "research" / "world.json"
ROUTE_FILES = (ROOT / "research" / "route.base.json", ROOT / "research" / "route.dlc.json")

USER_AGENT = "er-companion-research/1.0 (unofficial local fan project)"
DELAY_SECONDS = 1.2
REFRESH = False

CATEGORY_ORDER = (
    "grace",
    "finger-reader",
    "stranded-soul",
    "sword-monument",
    "stake-of-marika",
    "martyr-effigy",
    "birdseye-telescope",
    "gatekeeper-statue",
)

# key -> (url, cached filename)
SOURCES = {
    "graces": (
        "https://eldenring.wiki.gg/wiki/Sites_of_Grace",
        "world-objects-graces.html",
    ),
    "wiki_crone": (
        "https://eldenring.wiki.gg/wiki/Finger_Reader_Crone",
        "world-objects-finger-reader-crone.html",
    ),
    "enia": (
        "https://eldenring.wiki.gg/wiki/Finger_Reader_Enia",
        "world-objects-finger-reader-enia.html",
    ),
    "stranded_souls": (
        "https://eldenring.wiki.gg/wiki/Stranded_Souls",
        "world-objects-stranded-souls.html",
    ),
    "sword_monuments": (
        "https://eldenring.wiki.gg/wiki/Sword_Monuments",
        "world-objects-sword-monuments.html",
    ),
    "stakes_wiki": (
        "https://eldenring.wiki.gg/wiki/Stakes_of_Marika",
        "world-objects-stakes-of-marika.html",
    ),
    "summoning_pools": (
        "https://eldenring.wiki.gg/wiki/Summoning_Pools",
        "world-objects-summoning-pools.html",
    ),
    "birdseye_wiki": (
        "https://eldenring.wiki.gg/wiki/About_Birdseye_Telescopes",
        "world-objects-about-birdseye.html",
    ),
    "fl_crone": (
        "https://eldenring.wiki.fextralife.com/Finger+Reader+Crone",
        "world-objects-fextralife-finger-reader-crone.html",
    ),
    "fl_effigies": (
        "https://eldenring.wiki.fextralife.com/Effigies+of+the+Martyr",
        "world-objects-fextralife-effigies-of-the-martyr.html",
    ),
    "fl_stakes": (
        "https://eldenring.wiki.fextralife.com/Stakes+of+Marika",
        "world-objects-fextralife-stakes-of-marika.html",
    ),
    "fl_monuments": (
        "https://eldenring.wiki.fextralife.com/Sword+Monuments",
        "world-objects-fextralife-sword-monuments.html",
    ),
    "fl_telescope": (
        "https://eldenring.wiki.fextralife.com/Telescope",
        "world-objects-fextralife-telescope.html",
    ),
    # Live Fextralife pages for these two objects are 404s as of 2026-10.
    # Use the Internet Archive snapshots and cite the archive URL.
    "fandom_birdseye": (
        "https://web.archive.org/web/20260208164045/"
        "https://eldenring.fandom.com/wiki/Birdseye_Telescope",
        "world-objects-fandom-birdseye-telescope.html",
    ),
    "fandom_stakes": (
        "https://web.archive.org/web/20251113203014/"
        "https://eldenring.fandom.com/wiki/Stakes_of_Marika",
        "world-objects-fandom-stakes-of-marika.html",
    ),
}

GRACE_URL = SOURCES["graces"][0]
CRONE_URL = SOURCES["fl_crone"][0]
ENIA_URL = SOURCES["enia"][0]
STRANDED_URL = SOURCES["stranded_souls"][0]
MONUMENT_URL = SOURCES["sword_monuments"][0]
EFFIGY_URL = SOURCES["fl_effigies"][0]
TELESCOPE_URL = SOURCES["fandom_birdseye"][0]
STAKES_URL = SOURCES["fl_stakes"][0]


# ---------------------------------------------------------------------------
# Fetching


def fetch_cached(url: str, filename: str, refresh: bool) -> Path:
    """Download ``url`` to ``research/raw/<filename>`` once."""

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    target = RAW_DIR / filename
    if target.exists() and not refresh:
        return target

    print(f"fetch {url}")
    request = Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urlopen(request, timeout=60) as response:
                payload = response.read()
            break
        except (HTTPError, URLError, TimeoutError) as error:  # pragma: no cover
            last_error = error
            time.sleep(2 * (attempt + 1))
    else:
        raise RuntimeError(f"could not fetch {url}: {last_error}")

    target.write_bytes(payload)
    time.sleep(DELAY_SECONDS)
    return target


def soup_for(key: str) -> BeautifulSoup:
    url, filename = SOURCES[key]
    path = fetch_cached(url, filename, REFRESH)
    return BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")


def fetched_at(filename: str) -> str:
    path = RAW_DIR / filename
    stamp = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return stamp.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Shared helpers


def clean_text(node) -> str:
    text = node.get_text(" ", strip=True)
    text = text.replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def clean_source_text(text: str) -> str:
    """Strip escaped markup, map links and bracket artefacts from Fextralife text."""

    text = re.sub(r"</?span[^>]*>", " ", text)
    text = re.sub(r"Elden \w+ Map (?:Link|Here)", " ", text)
    text = re.sub(r"See (?:Shadow of the Erdtree )?Map", " ", text)
    text = re.sub(r"\[\s*\]", " ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip(" []")


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.replace("’", "'").replace("‘", "'")
    value = re.sub(r"[^a-z0-9]+", " ", value.casefold())
    return value.strip()


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = value.replace("'", "")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "entry"


# Region/subregion lookup for source strings that only name a place.  The
# values follow the wiki.gg grace-page grouping so cross-category filtering
# stays consistent (Weeping Peninsula under Limgrave, Mt. Gelmir under Altus…).
AREA_RULES: tuple[tuple[str, str, str], ...] = (
    ("stranded graveyard", "Limgrave", "Stranded Graveyard"),
    ("stormfoot catacombs", "Limgrave", "Limgrave"),
    ("church of pilgrimage", "Limgrave", "Weeping Peninsula"),
    ("limgrave colosseum", "Limgrave", "Limgrave"),
    ("death-touched catacombs", "Limgrave", "Stormhill"),
    ("death touched catacombs", "Limgrave", "Stormhill"),
    ("castle morne", "Limgrave", "Weeping Peninsula"),
    ("weeping peninsula", "Limgrave", "Weeping Peninsula"),
    ("mistwood", "Limgrave", "Limgrave"),
    ("fort haight", "Limgrave", "Limgrave"),
    ("stormhill", "Limgrave", "Stormhill"),
    ("limgrave", "Limgrave", "Limgrave"),
    ("stormveil castle", "Stormveil Castle", "Stormveil Castle"),
    ("albinauric village", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("frenzied flame village", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("gate town bridge", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("kingsrealm ruins", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("carian study hall", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("carian manor", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("purified ruins", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("revenger", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("liurnia highway", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("liurnia", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("raya lucaria academy", "Academy of Raya Lucaria", "Academy of Raya Lucaria"),
    ("raya lucaria gate", "Liurnia of the Lakes", "Liurnia of the Lakes"),
    ("grand lift of dectus", "Altus Plateau", "Altus Plateau"),
    ("dominula", "Altus Plateau", "Altus Plateau"),
    ("altus highway", "Altus Plateau", "Altus Plateau"),
    ("shaded castle", "Altus Plateau", "Altus Plateau"),
    ("fort laiedd", "Altus Plateau", "Mt. Gelmir"),
    ("mt gelmir", "Altus Plateau", "Mt. Gelmir"),
    ("capital outskirts", "Altus Plateau", "Capital Outskirts"),
    ("volcano manor", "Volcano Manor", "Volcano Manor"),
    ("forest-spanning greatbridge", "Altus Plateau", "Altus Plateau"),
    ("altus plateau", "Altus Plateau", "Altus Plateau"),
    ("smouldering wall", "Caelid", "Caelid"),
    ("smoldering wall", "Caelid", "Caelid"),
    ("fort gael", "Caelid", "Caelid"),
    ("aeonia", "Caelid", "Swamp of Aeonia"),
    ("dragonbarrow", "Caelid", "Greyoll's Dragonbarrow"),
    ("rotview", "Caelid", "Caelid"),
    ("caelid", "Caelid", "Caelid"),
    ("castle sol", "Mountaintops of the Giants", "Mountaintops of the Giants"),
    ("consecrated snowfield", "Mountaintops of the Giants", "Consecrated Snowfield"),
    ("freezing lake", "Mountaintops of the Giants", "Mountaintops of the Giants"),
    ("forbidden lands", "Mountaintops of the Giants", "Forbidden Lands"),
    ("mountaintops of the giants", "Mountaintops of the Giants", "Mountaintops of the Giants"),
    ("siofra river", "Siofra River", "Nokron, Eternal City"),
    ("nokron", "Siofra River", "Nokron, Eternal City"),
    ("leyndell, capital of ash", "Leyndell, Royal Capital", "Leyndell, Ashen Capital"),
    ("capital of ash", "Leyndell, Royal Capital", "Leyndell, Ashen Capital"),
    ("eretree sanctuary", "Leyndell, Royal Capital", "Leyndell, Royal Capital"),
    ("erdtree sanctuary", "Leyndell, Royal Capital", "Leyndell, Royal Capital"),
    ("leyndell", "Leyndell, Royal Capital", "Leyndell, Royal Capital"),
    ("deeproot depths", "Deeproot Depths", "Deeproot Depths"),
    ("abandoned ailing village", "Gravesite Plain", "Gravesite Plain"),
    ("scorched ruins", "Gravesite Plain", "Gravesite Plain"),
    ("ellac river", "Gravesite Plain", "Gravesite Plain"),
    ("ruined forge lava intake", "Gravesite Plain", "Gravesite Plain"),
    ("belurat gaol", "Gravesite Plain", "Gravesite Plain"),
)


def locate(text: str) -> tuple[str, str]:
    lowered = norm(text)
    for needle, region, subregion in AREA_RULES:
        if needle in lowered:
            return region, subregion
    return "", ""


def make_id(category: str, region: str, name: str, used: set[str]) -> str:
    base = "-".join(part for part in (category, slugify(region), slugify(name)) if part)
    candidate = base
    counter = 2
    while candidate in used:
        candidate = f"{base}-{counter}"
        counter += 1
    used.add(candidate)
    return candidate


def entry(
    *,
    category: str,
    name: str,
    region: str,
    subregion: str,
    location: str,
    description: str,
    source_url: str,
    used_ids: set[str],
    map_url: str = "",
    dlc: bool = False,
    missable: bool = False,
    route_step_id: str = "",
    unresolved: bool = False,
) -> dict:
    return {
        "id": make_id(category, region, name, used_ids),
        "category": category,
        "name": name,
        "region": region,
        "subregion": subregion,
        "location": location,
        "description": description,
        "sourceUrl": source_url,
        "mapUrl": map_url,
        "dlc": dlc,
        "missable": missable,
        "routeStepId": route_step_id,
        "unresolved": unresolved,
    }


# ---------------------------------------------------------------------------
# Route linking


def load_route_steps() -> list[dict]:
    steps: list[dict] = []
    for path in ROUTE_FILES:
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for section in data.get("sections", []):
            for step in section.get("steps", []):
                labels = [link.get("label", "") for link in step.get("links", [])]
                steps.append(
                    {
                        "id": step.get("id", ""),
                        "text": step.get("text", "") or "",
                        "labels": labels,
                    }
                )
    return steps


def route_step_for(name: str, steps: list[dict]) -> str:
    """Exact link-label match on a step that talks about a grace."""

    target = norm(name)
    for step in steps:
        if "grace" not in step["text"].lower():
            continue
        if any(norm(label) == target for label in step["labels"]):
            return step["id"]
    return ""


# ---------------------------------------------------------------------------
# Sites of Grace


def parse_graces(steps: list[dict], used_ids: set[str]) -> tuple[list[dict], dict]:
    soup = soup_for("graces")
    content = soup.select_one("#mw-content-text")

    entries: list[dict] = []
    seen: dict[tuple[str, str], dict] = {}
    collapsed: list[dict] = []
    row_count = 0
    dlc = False
    region = ""

    for node in content.find_all(["h2", "h3", "table"], recursive=True):
        if node.name == "h2":
            dlc = clean_text(node).startswith("Locations (Shadow of the Erdtree)")
            region = ""
            continue
        if node.name == "h3":
            region = clean_text(node)
            continue

        caption = node.select_one("caption")
        if caption is None:
            continue
        bold = caption.find("b")
        subregion = clean_text(bold) if bold else region

        for item in node.select("li"):
            row_count += 1
            name = clean_text(item)
            if not name:
                continue
            key = (norm(name), norm(region))
            if key in seen:
                collapsed.append(
                    {
                        "name": name,
                        "region": region,
                        "keptSubregion": seen[key]["subregion"],
                        "droppedSubregion": subregion,
                        "dlc": dlc,
                        "reason": "same grace listed under both Leyndell, Royal Capital and "
                        "Leyndell, Ashen Capital",
                    }
                )
                continue

            location = region if subregion == region else f"{region} — {subregion}"
            record = entry(
                category="grace",
                name=name,
                region=region,
                subregion=subregion,
                location=location,
                description="",
                source_url=GRACE_URL,
                used_ids=used_ids,
                dlc=dlc,
                route_step_id=route_step_for(name, steps),
            )
            seen[key] = record
            entries.append(record)

    # Recount rows per game for the report.
    base_rows = 0
    dlc_rows = 0
    dlc_flag = False
    for node in content.find_all(["h2", "table"], recursive=True):
        if node.name == "h2":
            dlc_flag = clean_text(node).startswith("Locations (Shadow of the Erdtree)")
        elif node.select_one("caption"):
            count = len(node.select("li"))
            if dlc_flag:
                dlc_rows += count
            else:
                base_rows += count

    meta = {
        "rowsParsed": row_count,
        "baseRows": base_rows,
        "dlcRows": dlc_rows,
        "collapsed": collapsed,
    }
    return entries, meta


# ---------------------------------------------------------------------------
# Finger Reader Crones


# needle -> (region, subregion, location, short label)
CRONE_AREA = {
    "north of stormhill": (
        "Limgrave",
        "Stormhill",
        "Collapsed Bridge, north of Stormhill",
        "Collapsed Bridge",
    ),
    "raya lucaria academy bridge": (
        "Academy of Raya Lucaria",
        "Academy of Raya Lucaria",
        "Raya Lucaria Academy bridge",
        "Raya Lucaria Academy Bridge",
    ),
    "east raya lucaria gate": (
        "Liurnia of the Lakes",
        "Liurnia of the Lakes",
        "East Raya Lucaria Gate, east side of the road",
        "East Raya Lucaria Gate",
    ),
    "near the birdseye telescope": (
        "Caelid",
        "Caelid",
        "Caelid, near the Smouldering Wall Birdseye Telescope",
        "Caelid, Smouldering Wall",
    ),
    "grand lift of rold": (
        "Mountaintops of the Giants",
        "Forbidden Lands",
        "Base of the Grand Lift of Rold",
        "Grand Lift of Rold",
    ),
    "second site of grace": (
        "Deeproot Depths",
        "Deeproot Depths",
        "Deeproot Depths, near the second Site of Grace",
        "Deeproot Depths",
    ),
    "forest-spanning greatbridge": (
        "Altus Plateau",
        "Altus Plateau",
        "Forest-Spanning Greatbridge, Altus Plateau",
        "Forest-Spanning Greatbridge",
    ),
    "leyndell royal capital": (
        "Leyndell, Royal Capital",
        "Leyndell, Royal Capital",
        "Leyndell, Royal Capital",
        "Leyndell, Royal Capital",
    ),
}


def parse_crones(used_ids: set[str]) -> list[dict]:
    soup = soup_for("fl_crone")
    location_list = None
    for ul in soup.select("ul"):
        if "Collapsed Bridge" in ul.get_text(" ", strip=True):
            location_list = ul
            break
    if location_list is None:
        raise RuntimeError("Fextralife crone page has no location list")

    entries: list[dict] = []
    for li in location_list.find_all("li", recursive=False):
        raw = clean_source_text(clean_text(li)).rstrip(".")
        lowered = raw.casefold()
        match = None
        for needle, value in CRONE_AREA.items():
            if needle in lowered:
                match = value
                break
        if match is None:
            raise RuntimeError(f"unmapped crone location: {raw!r}")
        region, subregion, location, label = match
        entries.append(
            entry(
                category="finger-reader",
                name=f"Finger Reader Crone — {label}",
                region=region,
                subregion=subregion,
                location=location,
                description=raw.rstrip("."),
                source_url=CRONE_URL,
                used_ids=used_ids,
            )
        )

    # Enia is the one named Finger Reader; she is also a merchant, but she is
    # a distinct world object and belongs in this category.
    entries.append(
        entry(
            category="finger-reader",
            name="Finger Reader Enia",
            region="Roundtable Hold",
            subregion="Roundtable Hold",
            location="Roundtable Hold — Two Fingers' audience chamber",
            description=(
                "Named Finger Reader who interprets the words of the Two Fingers; "
                "appears after the player claims a Great Rune. Also a merchant."
            ),
            source_url=ENIA_URL,
            used_ids=used_ids,
        )
    )
    return entries


# ---------------------------------------------------------------------------
# Stranded Souls


def clean_location_cell(cell) -> str:
    work = BeautifulSoup(str(cell), "lxml")
    for image in work.select("a.image, figure, img"):
        image.decompose()
    text = clean_text(work)
    text = re.sub(r"File:[^.]*?\.png", "", text).strip()
    text = re.sub(r"\s{2,}", " ", text)
    return text


def dialogue_excerpt(cell) -> str:
    text = clean_text(cell)
    text = text.replace("...", "…")
    if len(text) > 180:
        text = text[:177].rstrip() + "..."
    return text


def parse_stranded_souls(used_ids: set[str]) -> tuple[list[dict], dict]:
    soup = soup_for("stranded_souls")
    tables = soup.select("#mw-content-text table")
    entries: list[dict] = []
    skipped: list[dict] = []
    base_count = 0
    dlc_count = 0
    missing_locations = 0

    for table in tables:
        heading = table.find_previous("h2")
        is_dlc = heading is not None and "Shadow of the Erdtree" in clean_text(heading)
        rows = table.select("tr")[1:]
        for row in rows:
            cells = row.find_all(["td", "th"])
            if len(cells) < 3:
                continue
            if is_dlc:
                dlc_count += 1
            else:
                base_count += 1

            raw_location = clean_location_cell(cells[-1])
            excerpt = dialogue_excerpt(cells[0])
            if not raw_location:
                missing_locations += 1
                skipped.append({"table": "dlc" if is_dlc else "base", "dialogue": excerpt[:80]})
                continue

            # Some cells append a patch note in parentheses; keep it out of the
            # structured location and surface it in the description instead.
            inline_note = ""
            note_match = re.search(r"\s*\(Note:[^)]*\)", raw_location)
            if note_match:
                inline_note = note_match.group(0).strip(" ()")
                raw_location = raw_location.replace(note_match.group(0), "").strip()

            location = raw_location
            region, subregion = locate(location)
            unresolved = not region
            label = location
            label = re.sub(r"^Outside (?:of )?the ", "", label, flags=re.I)
            label = re.sub(r"^Outside ", "", label, flags=re.I)
            label = re.sub(r"^Found at the ", "", label, flags=re.I)
            label = re.sub(
                r"^At the foot of a tree to the northeast of the ",
                "Northeast of ",
                label,
                flags=re.I,
            )
            label = re.sub(r"\s+site of grace\.?$", "", label, flags=re.I)
            label = re.sub(r"\s+dungeon\.?$", "", label, flags=re.I)
            label = re.sub(r"\s+in Gravesite Plain$", "", label, flags=re.I)
            label = label.rstrip(".")
            if len(label) > 58:
                label = label[:55].rstrip() + "..."
            note = ""
            if inline_note:
                note = f" {inline_note}."
            if "no longer present" in inline_note.casefold():
                note = " Removed in patch 1.08; the ghost is no longer present in-game."
            entries.append(
                entry(
                    category="stranded-soul",
                    name=f"Stranded Soul — {label}",
                    region=region,
                    subregion=subregion,
                    location=location,
                    description=f'Dialogue excerpt: "{excerpt}"{note}',
                    source_url=STRANDED_URL,
                    used_ids=used_ids,
                    dlc=is_dlc,
                    missable="no longer present" in inline_note.casefold(),
                    unresolved=unresolved,
                )
            )

    meta = {
        "baseRows": base_count,
        "dlcRows": dlc_count,
        "dlcRowsWithoutTextLocation": missing_locations,
        "skipped": skipped,
    }
    return entries, meta


# ---------------------------------------------------------------------------
# Sword Monuments


def parse_sword_monuments(used_ids: set[str]) -> list[dict]:
    soup = soup_for("sword_monuments")
    table = soup.select("#mw-content-text table")[0]
    entries: list[dict] = []

    for row in table.select("tr")[1:]:
        cells = row.find_all(["td", "th"])
        if len(cells) < 4:
            continue
        location = clean_source_text(clean_text(cells[-1]))
        italic = cells[1].find("i")
        title = clean_source_text(clean_text(italic)) if italic is not None else clean_source_text(clean_text(cells[1]))
        paragraphs = [
            clean_source_text(clean_text(paragraph))
            for paragraph in cells[1].select("p")
            if clean_text(paragraph)
        ]
        inscription = " / ".join(paragraphs).strip('"“” ')
        region, subregion = locate(location)
        if not region:
            # Location strings such as "in Mt. Gelmir" resolve through the
            # rules; anything else is a source gap.
            raise RuntimeError(f"unmapped sword monument location: {location!r}")
        entries.append(
            entry(
                category="sword-monument",
                name=title,
                region=region,
                subregion=subregion,
                location=location.rstrip("."),
                description=f'Inscription: "{inscription}"',
                source_url=MONUMENT_URL,
                used_ids=used_ids,
                unresolved=False,
            )
        )
    return entries


# ---------------------------------------------------------------------------
# Effigies of the Martyr


def parse_effigies(used_ids: set[str]) -> tuple[list[dict], dict]:
    soup = soup_for("fl_effigies")
    entries: list[dict] = []
    seen: dict[tuple[str, str, str], dict] = {}
    duplicates: list[str] = []

    for panel in soup.select(".tabber__panel"):
        dlc = "Shadow_of_the_Erdtree" in (panel.get("id") or "")
        region = ""
        subregion = ""

        for node in panel.find_all(["h4", "h5", "ul"], recursive=True):
            if node.name == "h4":
                region = clean_text(node)
                continue
            if node.name == "h5":
                subregion = clean_text(node)
                continue

            if not region:
                # The base-game tab omits the first h4; its first h5s are
                # Limgrave subregions.
                if subregion in {"Limgrave", "Stormhill", "Weeping Peninsula"}:
                    region = "Limgrave"
                else:
                    raise RuntimeError(f"effigy entry without region: {subregion!r}")

            for item in node.find_all("li", recursive=False):
                map_url = ""
                for anchor in item.find_all("a"):
                    href = anchor.get("href", "")
                    if "Interactive_Map" in href:
                        map_url = urljoin("https://eldenring.wiki.fextralife.com/", href)
                        break
                raw = clean_source_text(clean_text(item))
                detail = raw

                if ":" in detail:
                    name, rest = detail.split(":", 1)
                else:
                    name, rest = detail, ""
                name = name.strip()
                rest = rest.strip()

                key = (norm(name), norm(region), norm(subregion))
                if key in seen:
                    duplicates.append(f"{name} ({region} / {subregion})")
                    continue
                record = entry(
                    category="martyr-effigy",
                    name=name,
                    region=region,
                    subregion=subregion,
                    location=detail or f"{subregion}, {region}",
                    description=rest if rest else "",
                    source_url=EFFIGY_URL,
                    used_ids=used_ids,
                    map_url=map_url,
                    dlc=dlc,
                )
                seen[key] = record
                entries.append(record)

    meta = {
        "baseEntries": sum(1 for e in entries if not e["dlc"]),
        "dlcEntries": sum(1 for e in entries if e["dlc"]),
        "duplicatesDropped": duplicates,
    }
    return entries, meta


# ---------------------------------------------------------------------------
# Birdseye Telescopes


def parse_birdseye(used_ids: set[str]) -> list[dict]:
    soup = soup_for("fandom_birdseye")
    content = soup.select_one(".mw-parser-output") or soup
    locations_heading = None
    for heading in content.find_all(["h2", "h3"]):
        if heading.get_text(" ", strip=True).startswith("Locations"):
            locations_heading = heading
            break
    if locations_heading is None:
        raise RuntimeError("archived Birdseye Telescope page lost its Locations section")

    entries: list[dict] = []
    for node in locations_heading.find_next_siblings():
        if node.name in {"h2", "h3"}:
            break
        if node.name != "ul":
            continue
        for item in node.find_all("li", recursive=False):
            raw = clean_source_text(clean_text(item))
            if ":" not in raw:
                continue
            region_name, detail = raw.split(":", 1)
            region_name = region_name.strip()
            detail = detail.strip()
            region, subregion = locate(region_name)
            if not region:
                raise RuntimeError(f"unmapped telescope region: {raw!r}")
            entries.append(
                entry(
                    category="birdseye-telescope",
                    name=f"Birdseye Telescope — {region_name.strip()}",
                    region=region,
                    subregion=subregion,
                    location=f"{region_name.strip()} — {detail.strip()}",
                    description="Location from the archived Fextralife/Fandom object page; "
                    "the live Fextralife wiki has no telescope-location list.",
                    source_url=TELESCOPE_URL,
                    used_ids=used_ids,
                    unresolved=True,
                )
            )
    return entries


def crosscheck_summoning_pools() -> dict:
    """Count the gallery entries on wiki.gg's base-game Summoning Pools page."""

    soup = soup_for("summoning_pools")
    labels: list[str] = []
    for box in soup.select("#mw-content-text li.gallerybox"):
        caption = box.select_one(".gallerytext")
        if caption is not None:
            label = clean_text(caption)
            if label:
                labels.append(label)
    return {
        "wikiGgBasePools": len(labels),
        "wikiGgUniquePoolNames": len(set(labels)),
        "note": (
            "Wiki.gg's Summoning Pools page covers the base game only (154 gallery "
            "entries, 153 unique names) and is used as an independent lower bound "
            "for the 157 base-game effigies listed by Fextralife."
        ),
    }


def crosscheck_monuments() -> dict:
    soup = soup_for("fl_monuments")
    text = clean_text(soup.select_one("#mw-content-text") or soup)
    match = re.search(r"There are (\w+) locations with hills of swords", text)
    wiki_soup = soup_for("sword_monuments")
    wiki_table = wiki_soup.select("#mw-content-text table")[0]
    wiki_rows = len(wiki_table.select("tr")) - 1
    return {
        "fextralifeStatement": match.group(0) if match else "",
        "wikiGgTableRows": wiki_rows,
        "note": "Both sources agree on fourteen sword monuments; no DLC monuments are listed.",
    }


# ---------------------------------------------------------------------------
# Report


def category_status(
    counts: dict[str, int],
    grace_meta: dict,
    stranded_meta: dict,
    effigy_meta: dict,
) -> dict:
    return {
        "grace": {
            "resolved": True,
            "count": counts["grace"],
            "sourceUrl": GRACE_URL,
            "note": (
                f"wiki.gg lists {grace_meta['baseRows']} base rows and "
                f"{grace_meta['dlcRows']} Shadow of the Erdtree rows. "
                f"{len(grace_meta['collapsed'])} Leyndell graces are listed twice "
                "(Royal Capital and Ashen Capital) and were collapsed; the two "
                "Artist's Shack graces are distinct objects in different regions "
                "and are both kept."
            ),
        },
        "finger-reader": {
            "resolved": False,
            "count": counts["finger-reader"],
            "sourceUrl": CRONE_URL,
            "note": (
                "The wiki.gg Finger Reader Crone page is a stub with no location list. "
                "Fextralife enumerates 8 crone locations; the named Finger Reader Enia "
                "(wiki.gg) is added separately. Neither source claims the list is "
                "exhaustive and neither covers the DLC."
            ),
        },
        "stranded-soul": {
            "resolved": False,
            "count": counts["stranded-soul"],
            "sourceUrl": STRANDED_URL,
            "note": (
                f"wiki.gg documents {stranded_meta['baseRows']} base-game spirits and "
                f"{stranded_meta['dlcRows']} DLC spirits. "
                f"{stranded_meta['dlcRowsWithoutTextLocation']} DLC rows give only a "
                "screenshot (no text location) and are omitted rather than guessed; "
                "the page does not claim the table is exhaustive."
            ),
        },
        "sword-monument": {
            "resolved": True,
            "count": counts["sword-monument"],
            "sourceUrl": MONUMENT_URL,
            "note": (
                "wiki.gg table with inscription and location for all 14 monuments; "
                "Fextralife states 'There are fourteen locations with hills of swords'."
            ),
        },
        "stake-of-marika": {
            "resolved": False,
            "count": counts["stake-of-marika"],
            "sourceUrl": STAKES_URL,
            "note": (
                "No authoritative per-stake list exists in the permitted sources. "
                "wiki.gg's Stakes of Marika page is a stub; Fextralife lists only area "
                "names (e.g. 'Abandoned Cave', 'Caelid'), not individual stakes. "
                "No rows were generated."
            ),
        },
        "martyr-effigy": {
            "resolved": False,
            "count": counts["martyr-effigy"],
            "sourceUrl": EFFIGY_URL,
            "note": (
                f"Fextralife enumerates {effigy_meta['baseEntries']} base-game and "
                f"{effigy_meta['dlcEntries']} DLC effigies with descriptions and map "
                "markers, but states that some zone extents still need detail. "
                "wiki.gg's Summoning Pools page lists base-game pools only and does not "
                "cover the DLC, so the category is reported as partial."
            ),
        },
        "birdseye-telescope": {
            "resolved": False,
            "count": counts["birdseye-telescope"],
            "sourceUrl": TELESCOPE_URL,
            "note": (
                "No live authoritative list: wiki.gg only has the tutorial item page and "
                "the live Fextralife 'Birdseye Telescopes'/'Martyr Effigies' pages are 404. "
                "Four base-game locations come from an Internet Archive snapshot of the "
                "Fandom object page; DLC telescopes are undocumented in these sources."
            ),
        },
        "gatekeeper-statue": {
            "resolved": False,
            "count": counts["gatekeeper-statue"],
            "sourceUrl": "",
            "note": (
                "No Elden Ring object called 'Gatekeeper Statue' exists in wiki.gg or "
                "Fextralife. The wiki.gg search returns the NPC Gatekeeper Gostoc and no "
                "statue object; both Fextralife title variants return 404. No "
                "authoritative list, so no rows."
            ),
        },
    }


def gaps(grace_meta: dict, stranded_meta: dict, effigy_meta: dict) -> list[dict]:
    return [
        {
            "category": "stake-of-marika",
            "issue": "no authoritative per-object list",
            "detail": (
                "wiki.gg Stakes of Marika is a stub whose only 'Locations' value is "
                "'Dungeons'. Fextralife lists areas that contain stakes, not the stakes "
                "themselves. Generating one row per area would misrepresent area names as "
                "world objects, so zero rows are emitted."
            ),
            "sourcesTried": [
                SOURCES["stakes_wiki"][0],
                SOURCES["fl_stakes"][0],
                SOURCES["fandom_stakes"][0],
            ],
        },
        {
            "category": "gatekeeper-statue",
            "issue": "object does not exist in any source",
            "detail": (
                "No page or list uses the term 'Gatekeeper Statue'. The closest statues "
                "documented by the wikis are Effigies of the Martyr (summoning pools), "
                "Stakes of Marika, Rebirth Monuments and the Stonesword Key imp seals; "
                "none is called a gatekeeper statue. Treated as unresolved rather than "
                "mapped to a different object."
            ),
            "sourcesTried": [
                "https://eldenring.wiki.gg/api.php?action=query&list=search&srsearch=Gatekeeper+Statue",
                "https://eldenring.wiki.fextralife.com/Gatekeeper+Statue",
                "https://eldenring.wiki.fextralife.com/Gatekeeper+Statues",
            ],
        },
        {
            "category": "stranded-soul",
            "issue": "DLC rows lack text locations",
            "detail": (
                f"{stranded_meta['dlcRowsWithoutTextLocation']} of "
                f"{stranded_meta['dlcRows']} Shadow of the Erdtree rows show only a "
                "screenshot in the location column. They were skipped instead of "
                "assigning a guessed area."
            ),
            "sourcesTried": [STRANDED_URL],
        },
        {
            "category": "birdseye-telescope",
            "issue": "only a tertiary archived list exists",
            "detail": (
                "Live Fextralife pages for 'Birdseye Telescopes' and 'Birdseye Telescope' are "
                "404s; wiki.gg has only 'About Birdseye Telescopes' (no locations). Four "
                "base-game locations are taken from an archived Fandom page and flagged "
                "unresolved."
            ),
            "sourcesTried": [
                SOURCES["birdseye_wiki"][0],
                SOURCES["fl_telescope"][0],
                TELESCOPE_URL,
            ],
        },
        {
            "category": "finger-reader",
            "issue": "no exhaustive list",
            "detail": (
                "wiki.gg's page is a stub; Fextralife's 8 locations are the only "
                "enumeration and do not cover the DLC, so the category stays partial."
            ),
            "sourcesTried": [SOURCES["wiki_crone"][0], CRONE_URL],
        },
        {
            "category": "martyr-effigy",
            "issue": "source hedges completeness",
            "detail": (
                "Fextralife says some effigy zone extents still need detail; wiki.gg "
                "covers base-game summoning pools only. Counts are reported as a "
                "lower bound, not a verified total."
            ),
            "sourcesTried": [EFFIGY_URL, SOURCES["summoning_pools"][0]],
        },
        {
            "category": "grace",
            "issue": "same-name rows collapsed",
            "detail": (
                f"{len(grace_meta['collapsed'])} Leyndell graces appear under both "
                "Leyndell, Royal Capital and Leyndell, Ashen Capital in the source. "
                "They are the same fast-travel points, so the Ashen listing is dropped "
                "and the overlap is recorded under meta.grace.collapsed."
            ),
            "sourcesTried": [GRACE_URL],
        },
    ]


def main() -> None:
    global REFRESH
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="re-download cached HTML instead of re-using research/raw",
    )
    parser.add_argument("--out", type=Path, default=OUT_FILE)
    args = parser.parse_args()
    REFRESH = args.refresh

    route_steps = load_route_steps()
    used_ids: set[str] = set()

    graces, grace_meta = parse_graces(route_steps, used_ids)
    crones = parse_crones(used_ids)
    souls, stranded_meta = parse_stranded_souls(used_ids)
    monuments = parse_sword_monuments(used_ids)
    effigies, effigy_meta = parse_effigies(used_ids)
    telescopes = parse_birdseye(used_ids)

    # Categories without an authoritative per-object list stay empty.
    stakes: list[dict] = []
    gatekeepers: list[dict] = []

    entries = graces + crones + souls + monuments + stakes + effigies + telescopes + gatekeepers
    counts = {category: 0 for category in CATEGORY_ORDER}
    for record in entries:
        counts[record["category"]] += 1

    status = category_status(counts, grace_meta, stranded_meta, effigy_meta)
    archive_url = SOURCES["fandom_birdseye"][0]

    payload = {
        "source": (
            "Eldenpedia (eldenring.wiki.gg) for graces, crones, stranded souls, sword "
            "monuments and base-game summoning pools; Fextralife for crone locations, "
            "effigies of the martyr and monument cross-checks; Internet Archive "
            "snapshots for Birdseye Telescopes and, for gap verification, Stakes of "
            "Marika where live pages are missing."
        ),
        "generatedAt": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": [
            {
                "key": key,
                "url": url,
                "cachedFile": f"research/raw/{filename}",
                "fetchedAt": fetched_at(filename) if (RAW_DIR / filename).exists() else "",
                "archive": url.startswith("https://web.archive.org/"),
            }
            for key, (url, filename) in SOURCES.items()
        ],
        "notes": {
            "idScheme": "category-region-name, lowercased ASCII slugs; numeric suffix on collision.",
            "regionGrouping": (
                "Regions follow the wiki.gg grace-page grouping. Weeping Peninsula and "
                "Mt. Gelmir are subregions of Limgrave and Altus Plateau there, even "
                "though they are separate labels on the in-game map."
            ),
            "unnamedSouls": (
                "Stranded Souls have no canonical names; they are labelled "
                "'Stranded Soul — <location>' and the location/dialogue fields carry the "
                "source text."
            ),
            "routeStepId": (
                "Only linked when a route step's link label matches the grace name after "
                "case/punctuation normalization and the step text mentions a grace; "
                "otherwise empty."
            ),
        },
        "entries": entries,
        "counts": counts,
        "categoryStatus": status,
        "meta": {
            "grace": grace_meta,
            "strandedSoul": stranded_meta,
            "martyrEffigy": effigy_meta,
            "routeLinkedGraces": sum(1 for record in graces if record["routeStepId"]),
            "entriesWithUnresolvedFlag": sum(1 for record in entries if record["unresolved"]),
            "archiveUrls": [archive_url],
            "crossChecks": {
                "summoningPools": crosscheck_summoning_pools(),
                "swordMonuments": crosscheck_monuments(),
            },
        },
        "gaps": gaps(grace_meta, stranded_meta, effigy_meta),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps(counts, indent=2))
    print(
        f"wrote {args.out} ({len(entries)} entries, "
        f"{payload['meta']['routeLinkedGraces']} graces linked to route steps)"
    )


if __name__ == "__main__":
    main()
