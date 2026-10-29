#!/usr/bin/env python3
"""Build research/branch-plan.json from the canonical decision matrix.

Source of truth
---------------
* ``src/data/meta.json`` -> ``decisions`` (27 canonical workbook decisions,
  sourced from the workbook's "Choices & Consequences" sheet).
* ``src/data/items.full.json`` -> the 2,325-entry item catalog used to resolve
  reward names to exact catalog IDs.

The decision matrix, not this script, decides branch availability. Every
reward below is tagged with the journey named in that decision's
``journey1Result`` / ``futureOutcome`` text. No reward is scheduled on a
journey the matrix does not state.

Resolution is intentionally conservative:
* exact normalized-name match first;
* a short, documented alias table for source phrases that append an item-type
  suffix ("... Spirit Ash") to a catalog item name;
* armor sets keep their set-level name and are marked ``unresolved`` because the
  catalog stores only individual pieces (the pieces are listed in
  ``componentItemIds``);
* anything else stays unresolved with a reason and ``itemId: ""``.

Usage
-----
    python3 scripts/research/build_branch_plan.py            # write JSON
    python3 scripts/research/build_branch_plan.py --check    # verify on disk
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
META_PATH = ROOT / "src" / "data" / "meta.json"
ITEMS_PATH = ROOT / "src" / "data" / "items.full.json"
ROUTE_PATH = ROOT / "src" / "data" / "route.full.json"
OUT_PATH = ROOT / "research" / "branch-plan.json"
RUNTIME_PATH = ROOT / "src" / "data" / "branch-plan.json"

EXPECTED_DECISIONS = 27

# Specific reasons for known catalog gaps. Anything not listed here falls back
# to the generic resolver reason.
UNRESOLVED_REASONS: dict[str, str] = {
    "Alexander's Innards": "key item absent from items.full.json",
    "Ancient Dragon Smithing Stone": (
        "smithing stones are absent from items.full.json; they belong to the "
        "separate upgrade ledger"
    ),
    "Unalloyed Gold Needle": "key item absent from items.full.json",
    "Zorayas's Letter": "key item absent from items.full.json",
}

# Reward name -> journey named by the decision matrix. ``1``/``2``/``3`` map to
# journey-1/journey-2/journey-3; ``0`` would map to "optional" and is unused
# because every named reward is tied to a concrete journey in the matrix.
REWARD_SPEC: dict[str, list[tuple[str, int, str]]] = {
    "BASE-001": [
        ("Shard of Alexander", 1, "reward"),
        ("Alexander's Innards", 1, "reward"),
        ("Warrior Jar Shard", 2, "reward"),
    ],
    "BASE-002": [
        # Journey 1 gives the potion to Gideon for disposal -> no item reward.
        # The two puppet outcomes are named here and in BASE-003/BASE-004.
        ("Dung Eater Puppet", 2, "reward"),
        ("Nepheli Loux Puppet", 3, "reward"),
    ],
    "BASE-003": [
        ("Ancient Dragon Smithing Stone", 1, "reward"),
        ("Nepheli Loux Puppet", 3, "reward"),
    ],
    "BASE-004": [
        ("Mending Rune of the Fell Curse", 1, "reward"),
        ("Dung Eater Puppet", 2, "reward"),
    ],
    "BASE-005": [
        ("Dolores the Sleeping Arrow Puppet", 1, "reward"),
        ("Nepheli Loux Puppet", 3, "reward"),
    ],
    "BASE-006": [
        ("Glintstone Kris", 1, "reward"),
        ("Shard Spiral", 1, "reward"),
        ("Eccentric's Set", 1, "set"),
        ("Ancient Dragon Smithing Stone", 2, "reward"),
    ],
    "BASE-007": [
        ("Rotten Winged Sword Insignia", 1, "reward"),
        ("Unalloyed Gold Needle", 1, "reward"),
        ("Millicent's Prosthesis", 2, "reward"),
    ],
    "BASE-008": [],
    "BASE-009": [
        ("Daedicar's Woe", 1, "reward"),
        ("Zorayas's Letter", 1, "reward"),
    ],
    "BASE-010": [],
    "BASE-011": [],
    "BASE-012": [],
    "END-001": [],
    "END-002": [("Mending Rune of Perfect Order", 1, "required")],
    "END-003": [("Mending Rune of the Death-Prince", 1, "required")],
    "END-004": [("Mending Rune of the Fell Curse", 1, "required")],
    "END-005": [],
    "END-006": [],
    "DLC-001": [],
    "DLC-002": [
        ("Swift Slash", 1, "reward"),
        ("Lacerating Crossed-Tree", 2, "reward"),
    ],
    "DLC-003": [
        ("Ansbach's Longbow", 1, "reward"),
        ("Obsidian Lamina", 1, "reward"),
        ("Furious Blade of Ansbach", 1, "reward"),
        ("Ansbach's Set", 1, "set"),
        ("Retaliatory Crossed-Tree", 2, "reward"),
    ],
    "DLC-004": [],
    "DLC-005": [
        ("Fire Knight Queelign Spirit Ash", 1, "reward"),
        ("Queelign's Greatsword", 2, "reward"),
    ],
    "DLC-006": [
        ("Swordhand of Night Jolán Spirit Ash", 1, "reward"),
        ("Sword of Night", 2, "reward"),
        ("Swordhand of Night Jolán Spirit Ash", 3, "reward"),
    ],
    "DLC-007": [
        ("Jolán and Anna Spirit Ash", 1, "reward"),
        ("Swordhand of Night Jolán Spirit Ash", 3, "reward"),
    ],
    "DLC-008": [
        ("Flowerstone Gavel", 1, "reward"),
        ("Priestess Heart", 1, "reward"),
        ("Dragonbolt of Florissax", 2, "reward"),
        ("Ancient Dragon Florissax", 2, "reward"),
    ],
    "DLC-009": [
        ("Bayle's Flame Lightning", 1, "reward"),
        ("Bayle's Tyranny", 2, "reward"),
    ],
}

# Source phrase -> catalog name. These differ only by an item-type suffix that
# the decision matrix adds for readability.
ALIASES: dict[str, str] = {
    "Fire Knight Queelign Spirit Ash": "Fire Knight Queelign",
    "Swordhand of Night Jolán Spirit Ash": "Swordhand of Night Jolan",
    "Jolán and Anna Spirit Ash": "Jolan and Anna",
}

# Set-level rewards: the catalog has no set row, so the set name stays
# unresolved while its known pieces are resolved to concrete IDs.
SET_COMPONENTS: dict[str, list[str]] = {
    "Eccentric's Set": [
        "Eccentric's Hood",
        "Eccentric's Armor",
        "Eccentric's Manchettes",
        "Eccentric's Breeches",
    ],
    "Ansbach's Set": [
        "Ansbach's Attire",
        "Ansbach's Boots",
        "Ansbach's Manchettes",
    ],
}

NOTES: dict[str, str] = {
    "BASE-001": "Alexander's Innards is a key item absent from the item catalog.",
    "BASE-002": (
        "Journey 1 (Gideon disposal) grants no reward item. Seluvis's Potion is a "
        "consumed key item and is not in the catalog. The Journey 3 recipient "
        "branch yields the Nepheli Loux Puppet named in BASE-003."
    ),
    "BASE-003": "Gostoc's expanded shop is a shop state, not a discrete item.",
    "BASE-004": "Blessing of Despair is an ending (END-004), not an item.",
    "BASE-005": "",
    "BASE-006": (
        "Eccentric's Set is catalogued as four armor pieces; Shard Spiral is "
        "listed as 'access' (a shop unlock), not a direct drop; 'Sellen's full "
        "conclusion' grants no separate item."
    ),
    "BASE-007": (
        "Miquella's Needle is named as a cure path, not as a summon-sign reward. "
        "The catalog holds only 'Note: Miquella's Needle'."
    ),
    "BASE-008": (
        "Neither branch grants an item. The Larval Tear used on the alternate "
        "branch is a consumed key item and is absent from the catalog."
    ),
    "BASE-009": (
        "The Journey 2 Tonic of Forgetfulness outcome and the Journey 3 "
        "requested-death outcome grant no new item. The tonic itself is a "
        "consumed key item and is absent from the catalog."
    ),
    "BASE-010": (
        "No item reward. The decision text says equipment and the bell bearing "
        "remain obtainable either way but names no item."
    ),
    "BASE-011": "No item reward; the alternate interaction is experiential only.",
    "BASE-012": (
        "No item reward. Miquella's Needle is a required cure input; the catalog "
        "holds only the note about it."
    ),
    "END-001": "No Mending Rune is used, so there is no associated reward item.",
    "END-002": "The mending rune is a prerequisite for the ending, not a reward.",
    "END-003": "The mending rune is a prerequisite for the ending, not a reward.",
    "END-004": (
        "The mending rune is a prerequisite here; BASE-004 is the acquisition "
        "decision."
    ),
    "END-005": "No item reward; Ranni's blue summon sign is an interaction.",
    "END-006": "No item reward; the ending and Melina variant are experiential.",
    "DLC-001": "No item reward; this is a dialogue-state branch only.",
    "DLC-002": "",
    "DLC-003": (
        "Ansbach's Set is catalogued as three armor pieces; 'finale summons' is "
        "an availability state, not an item."
    ),
    "DLC-004": (
        "No unique permanent reward is tied to the summon choice (per the "
        "decision's completion requirement)."
    ),
    "DLC-005": (
        "The reward is the spirit ash. Iris of Grace is a consumed key item and "
        "is absent from the catalog."
    ),
    "DLC-006": (
        "Journey 1's Jolán ash is spent on DLC-007's conversion. Iris items are "
        "consumed and absent from the catalog."
    ),
    "DLC-007": "Converting replaces the single Jolán ash with Jolán and Anna.",
    "DLC-008": (
        "Thiollier's Concoction is a consumed key item and is absent from the "
        "catalog."
    ),
    "DLC-009": (
        "Heart of Bayle is the non-duplicable exchange input and is absent from "
        "the catalog; the rewards are the two incantations."
    ),
}

# Rewards acquired and then spent/replaced inside the same journey. Completion
# tracking should not expect these in the end-of-journey inventory.
TRANSIENT_REWARDS: set[tuple[str, str, int]] = {
    # DLC-006 Journey 1 acquires the Jolán ash, then DLC-007 converts it.
    ("DLC-006", "Swordhand of Night Jolán Spirit Ash", 1),
}

AVAILABILITY = {1: "journey-1", 2: "journey-2", 3: "journey-3", 0: "optional"}


def normalize(name: str) -> str:
    """Case/accent/punctuation-insensitive key used only for matching."""
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", folded.lower()).strip()


def build_index(items: list[dict]) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    for item in items:
        index.setdefault(normalize(item["name"]), []).append(item)
    return index


def resolve(
    name: str, index: dict[str, list[dict]]
) -> tuple[str, str, list[dict], str]:
    """Return (itemId, resolution, candidates, reason)."""
    key = normalize(name)
    if name in ALIASES:
        target = ALIASES[name]
        hits = index.get(normalize(target), [])
        if len(hits) == 1:
            return hits[0]["id"], "alias", hits, ""
        return "", "unresolved", hits, f"alias target {target!r} is not a unique catalog name"
    hits = index.get(key, [])
    if len(hits) == 1:
        return hits[0]["id"], "exact", hits, ""
    if len(hits) > 1:
        return "", "unresolved", hits, "catalog name is ambiguous"
    return "", "unresolved", [], "no exact catalog name match"


# ---------------------------------------------------------------------------
# Route anchors
# ---------------------------------------------------------------------------
# Anchors are derived, never hand-written. Each decision is matched against the
# step instructions in ``src/data/route.full.json`` using only names the
# decision matrix itself states: NPC names, reward names, catalog item names
# quoted in the decision text, area names, and the decision title. Steps are
# filtered by game and (for endings) by the route's "Endings" area, and note
# steps ("Note: ...") cannot carry an anchor because they describe
# consequences rather than the acquisition itself.

STOPWORDS = frozenset(
    {
        "a", "all", "an", "and", "as", "at", "by", "de", "for", "from", "his",
        "her", "in", "its", "la", "no", "none", "of", "on", "or", "s", "the",
        "their", "to", "with", "your",
    }
)

# Questline display name -> spellings used inside route instructions. The route
# uses short names ("Seluvis", "Millicent"); the questline table uses titles.
ROUTE_NPC_NAMES: dict[str, tuple[str, ...]] = {
    "Alexander, Warrior Jar": ("Alexander",),
    "Boc the Seamster": ("Boc",),
    "Kenneth Haight": ("Kenneth Haight",),
    "Nepheli Loux": ("Nepheli",),
    "Gatekeeper Gostoc": ("Gostoc",),
    "Roderika, Spirit Tuner": ("Roderika",),
    "Smithing Master Hewg": ("Hewg",),
    "Ensha of the Royal Remains": ("Ensha",),
    "Sir Gideon Ofnir, the All-Knowing": ("Gideon Ofnir", "Gideon"),
    "Latenna the Albinauric": ("Latenna",),
    "Irina of Morne": ("Irina",),
    "Lightseeker Hyetta": ("Hyetta",),
    "White Mask Varre": ("Varre",),
    "Finger Reader Enia": ("Enia",),
    "Gurranq, Beast Clergyman": ("Gurranq",),
    "D, Hunter of the Dead": ("D, Hunter of the Dead",),
    "D, Beholder of Death": ("D, Beholder of Death",),
    "Fia, Deathbed Companion": ("Fia",),
    "Sorcerer Rogier": ("Rogier",),
    "Ranni the Witch": ("Ranni",),
    "Blaidd the Half-Wolf": ("Blaidd",),
    "War Counselor Iji": ("Iji",),
    "Preceptor Seluvis": ("Seluvis",),
    "Sorceress Sellen": ("Sellen",),
    "Witch-Hunter Jerren": ("Jerren",),
    "Sage Gowry": ("Gowry",),
    "Millicent": ("Millicent",),
    "Brother Corhyn": ("Corhyn",),
    "Dung Eater": ("Dung Eater",),
    "Blackguard Big Boggart": ("Blackguard",),
    "Rya the Scout": ("Rya",),
    "Tanith, Volcano Manor Proprietress": ("Tanith",),
    "Patches": ("Patches",),
    "Knight Bernahl": ("Bernahl",),
    "Knight Diallos": ("Diallos",),
    "Jar-Bairn": ("Jar-Bairn",),
    "Yura, Hunter of Bloody Fingers": ("Yura",),
    "Sorcerer Thops": ("Thops",),
    "Needle Knight Leda": ("Leda",),
    "Dryleaf Dane": ("Dane",),
    "Hornsent": ("Hornsent",),
    "Hornsent Grandam": ("Hornsent Grandam",),
    "Redmane Freyja": ("Freyja",),
    "Sir Ansbach": ("Ansbach",),
    "Moore": ("Moore",),
    "Thiollier": ("Thiollier",),
    "Igon": ("Igon",),
    "Florissax, Dragon Communion Priestess": ("Florissax",),
    "Count Ymir, High Priest": ("Ymir",),
    "Swordhand of Night Jolan": ("Jolan",),
    "Fire Knight Queelign": ("Queelign",),
    "Melina": ("Melina",),
    # NPCs named by decisions but not carried by the questline table.
    "Pidia": ("Pidia",),
    "Zorayas": ("Zorayas",),
    "Swordhand of Night Anna": ("Anna",),
    "Messmer the Impaler": ("Messmer",),
    "Bayle the Dread": ("Bayle",),
}

# Evidence weight and label per match kind. High confidence needs either a
# reward name next to its NPC or an exact title/choice phrase; a bare NPC name
# never leaves ``low``.
ANCHOR_WEIGHTS: dict[str, int] = {
    "npc+item": 5,
    "npc-pair+evidence": 5,
    "title+item": 5,
    "npc+choice": 5,
    "title": 4,
    "choice-phrase": 4,
    "npc-pair": 3,
    "npc+area": 2,
    "npc+term": 2,
    "item-name": 2,
    "npc-name": 1,
}

MAX_ROUTE_STEPS = 6


def fold_ascii(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()


def match_key(value: str) -> str:
    """Accent/apostrophe-insensitive key; apostrophes become separators."""
    folded = fold_ascii(value).lower()
    folded = re.sub(r"[\u2018\u2019'`]", " ", folded)
    return re.sub(r"[^a-z0-9]+", " ", folded).strip()


def compact_key(value: str) -> str:
    """Like :func:`match_key` but apostrophes are deleted ("Zorayas's" ->
    "zorayass"), which is how the route and the decision matrix differ."""
    folded = fold_ascii(value).lower()
    folded = re.sub(r"[\u2018\u2019'`]", "", folded)
    return re.sub(r"[^a-z0-9]+", " ", folded).strip()


class RouteIndex:
    """Route steps indexed for phrase lookups in both key variants."""

    def __init__(self, route: dict, items: list[dict]) -> None:
        self.steps: list[dict] = route["steps"]
        self.areas: list[str] = [area["name"] for area in route["areas"]]
        self.spaces = [" " + match_key(step["instruction"]) + " " for step in self.steps]
        self.compacts = [
            " " + compact_key(step["instruction"]) + " " for step in self.steps
        ]
        self._freq: dict[str, int] = {}
        self.catalog_names = [item["name"] for item in items]
        self.area_keys = {match_key(area) for area in self.areas}
        self.npc_names = sorted(
            {n for names in ROUTE_NPC_NAMES.values() for n in names},
            key=len,
            reverse=True,
        )

    def frequency(self, phrase: str) -> int:
        key = match_key(phrase)
        if key not in self._freq:
            needle = f" {key} "
            self._freq[key] = sum(1 for text in self.spaces if needle in text)
        return self._freq[key]

    @staticmethod
    def occurs(phrase: str, space: str, compact: str) -> bool:
        key = match_key(phrase)
        if key and f" {key} " in space:
            return True
        alt = compact_key(phrase)
        return bool(alt) and f" {alt} " in compact

    def is_area_name(self, phrase: str) -> bool:
        key = match_key(phrase)
        if not key:
            return False
        return any(key == area or f" {key} " in f" {area} " for area in self.area_keys)


def decision_text(decision: dict) -> str:
    return " ".join(
        [
            decision["title"],
            decision["journey1"],
            decision["journey1Result"],
            decision["futureOutcome"],
            decision["futureJourney"],
            decision["notes"],
        ]
    )


def decision_npcs(text: str, index: RouteIndex) -> list[str]:
    space = " " + match_key(text) + " "
    found: list[str] = []
    for display, spellings in ROUTE_NPC_NAMES.items():
        if any(f" {match_key(name)} " in space for name in (display, *spellings)):
            for name in spellings:
                found.append(name)
    return [
        name
        for name in found
        if not any(name != other and f" {match_key(name)} " in f" {match_key(other)} " for other in found)
    ]


def decision_places(text: str, index: RouteIndex) -> list[str]:
    space = " " + match_key(text) + " "
    found: list[str] = []
    for area in index.areas:
        tokens = match_key(area).split()
        runs = {
            " ".join(tokens[i : i + size])
            for size in range(2, len(tokens) + 1)
            for i in range(len(tokens) - size + 1)
            if not all(token in STOPWORDS for token in tokens[i : i + size])
        }
        if any(f" {run} " in space for run in runs):
            found.append(area)
    return found


def decision_terms(
    decision: dict, index: RouteIndex
) -> tuple[list[tuple[str, int]], set[str]]:
    """Return (phrase, route frequency) pairs plus the reward-name keys."""
    text = decision_text(decision)
    space = " " + match_key(text) + " "
    compact = " " + compact_key(text) + " "
    reward_names = [reward["name"] for reward in decision["rewards"]]
    candidates: set[str] = set(reward_names)
    for name in index.catalog_names:
        if RouteIndex.occurs(name, space, compact):
            candidates.add(name)
    candidates.update(re.findall(r"[\u201c\"]([^\u201d\"]{4,60})[\u201d\"]", text))

    kept: list[tuple[str, int]] = []
    for candidate in sorted(candidates, key=lambda value: (-len(match_key(value).split()), value)):
        key = match_key(candidate)
        tokens = key.split()
        if len(tokens) < 2 or tokens[0] in STOPWORDS or tokens[-1] in STOPWORDS:
            continue
        if index.is_area_name(candidate):
            continue
        if any(
            f" {key} " in f" {match_key(other)} " or compact_key(candidate) == compact_key(other)
            for other, _ in kept
        ):
            continue
        if not RouteIndex.occurs(candidate, space, compact):
            continue
        frequency = index.frequency(candidate)
        if frequency == 0:
            continue
        kept.append((candidate, frequency))
    return kept, {match_key(name) for name in reward_names}


def title_stem(decision: dict) -> str:
    stem = re.split(r"\s+[\u2014\u2013]\s+", decision["title"])[0].strip()
    return stem if len(match_key(stem).split()) >= 2 else ""


def route_anchors(
    decision: dict, index: RouteIndex
) -> tuple[list[str], str, str, str]:
    """Return (routeStepIds, area, linkConfidence, linkMethod) for a decision."""
    text = decision_text(decision)
    npcs = decision_npcs(text, index)
    places = decision_places(text, index)
    terms, reward_keys = decision_terms(decision, index)
    stem = title_stem(decision)
    stem_key = match_key(stem)
    stem_freq = index.frequency(stem) if stem else 0
    quotes = {
        match_key(quote)
        for quote in re.findall(r"[\u201c\"]([^\u201d\"]{4,60})[\u201d\"]", text)
    }
    is_ending = decision["category"] == "Ending"
    is_dlc = decision["game"] == "DLC"

    rows: list[dict] = []
    for step, space, compact in zip(index.steps, index.spaces, index.compacts):
        if step["area"] == "New Game Plus Preparation":
            continue
        if step["instruction"].strip().lower().startswith("note:"):
            continue
        if is_ending and step["area"] != "Endings":
            continue
        if (step["game"] == "Shadow of the Erdtree") != is_dlc:
            continue

        step_npcs = [n for n in npcs if RouteIndex.occurs(n, space, compact)]
        step_terms = [
            (name, frequency)
            for name, frequency in terms
            if RouteIndex.occurs(name, space, compact)
        ]
        reward_terms = [
            name
            for name, frequency in step_terms
            if frequency <= 12 or match_key(name) in reward_keys
        ]
        rare = [name for name, frequency in step_terms if frequency <= 4]
        mid = [name for name, frequency in step_terms if frequency <= 12]
        step_places = [
            area
            for area in places
            if RouteIndex.occurs(area, space, compact)
            or match_key(area) == match_key(step["area"])
        ]
        step_quotes = [q for q in quotes if f" {q} " in space]
        title_hit = bool(stem) and f" {stem_key} " in space and stem_freq <= MAX_ROUTE_STEPS

        kind = ""
        if len(step_npcs) >= 2 and (reward_terms or step_places or step_quotes):
            kind = "npc-pair+evidence"
        elif len(step_npcs) >= 2:
            kind = "npc-pair"
        elif step_npcs and reward_terms:
            kind = "npc+item"
        elif title_hit and rare:
            kind = "title+item"
        elif title_hit:
            kind = "title"
        elif step_quotes and reward_terms:
            kind = "npc+choice" if step_npcs else "choice-phrase"
        elif step_quotes:
            kind = "choice-phrase"
        elif step_npcs and step_places:
            kind = "npc+area"
        elif step_npcs and mid:
            kind = "npc+term"
        elif rare:
            kind = "item-name"
        elif step_npcs:
            kind = "npc-name"
        elif mid:
            kind = "item-name"
        if not kind:
            continue

        rows.append(
            {
                "weight": ANCHOR_WEIGHTS[kind],
                "kind": kind,
                "id": step["id"],
                "area": step["area"],
                "order": step["order"],
                "npc": bool(step_npcs),
            }
        )

    if not rows:
        return [], "", "", ""

    best = max(row["weight"] for row in rows)
    # On a tie between NPC-backed and item-only steps, keep the NPC-backed ones:
    # the decision names a person, so a step naming that person is stronger.
    at_best = [row for row in rows if row["weight"] == best]
    npc_best = [row for row in at_best if row["npc"]]
    rows = npc_best or at_best
    rows.sort(key=lambda row: row["order"])
    kept = rows[:MAX_ROUTE_STEPS]

    confidence = "high" if best >= 4 else "medium" if best >= 2 else "low"
    area = Counter(row["area"] for row in kept).most_common(1)[0][0]
    return [row["id"] for row in kept], area, confidence, kept[0]["kind"]


def build() -> dict:
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    items = json.loads(ITEMS_PATH.read_text(encoding="utf-8"))["items"]
    index = build_index(items)
    route = json.loads(ROUTE_PATH.read_text(encoding="utf-8"))
    route_index = RouteIndex(route, items)

    decisions = meta["decisions"]
    if len(decisions) != EXPECTED_DECISIONS:
        raise SystemExit(
            f"expected {EXPECTED_DECISIONS} decisions, found {len(decisions)}"
        )

    seen_ids = {d["id"] for d in decisions}
    missing = sorted(seen_ids - set(REWARD_SPEC))
    extra = sorted(set(REWARD_SPEC) - seen_ids)
    if missing or extra:
        raise SystemExit(f"reward spec drift: missing={missing} extra={extra}")

    out_decisions = []
    resolution_counts: Counter[str] = Counter()
    availability_counts: Counter[str] = Counter()
    kind_counts: Counter[str] = Counter()
    distinct_ids: set[str] = set()
    unresolved_rewards: list[dict] = []

    for decision in decisions:
        did = decision["id"]
        rewards = []
        for name, journey, kind in REWARD_SPEC[did]:
            item_id, resolution, hits, reason = resolve(name, index)
            availability = AVAILABILITY[journey]
            reward = {
                "name": name,
                "itemId": item_id,
                "journey": journey,
                "availability": availability,
                "kind": kind,
                "resolution": resolution,
            }
            if kind == "set":
                components = []
                for piece in SET_COMPONENTS.get(name, []):
                    piece_hits = index.get(normalize(piece), [])
                    if len(piece_hits) != 1:
                        raise SystemExit(f"set piece {piece!r} did not resolve uniquely")
                    components.append(piece_hits[0]["id"])
                    distinct_ids.add(piece_hits[0]["id"])
                reward["componentItemIds"] = components
                reward["unresolved"] = True
                reward["reason"] = (
                    "catalog has no set-level item; component armor pieces resolved"
                )
            elif resolution == "unresolved":
                reward["unresolved"] = True
                reward["reason"] = UNRESOLVED_REASONS.get(name, reason)
                if hits:
                    reward["candidateItemIds"] = [h["id"] for h in hits]
            if (did, name, journey) in TRANSIENT_REWARDS:
                reward["retained"] = False
            if item_id:
                distinct_ids.add(item_id)

            resolution_counts[resolution] += 1
            availability_counts[availability] += 1
            kind_counts[kind] += 1
            if reward.get("unresolved"):
                unresolved_rewards.append(
                    {"decisionId": did, "name": name, "reason": reward["reason"]}
                )
            rewards.append(reward)

        out_decisions.append(
            {
                "decisionId": did,
                "title": decision["title"],
                "game": decision["game"],
                "category": decision["category"],
                "journey1": decision["journey1"],
                "journey1Result": decision["journey1Result"],
                "futureOutcome": decision["futureOutcome"],
                "futureJourney": decision["futureJourney"],
                "rewards": rewards,
                "unresolved": any(r.get("unresolved") for r in rewards),
                "notes": NOTES[did],
            }
        )

    # Route anchors: derived from route.full.json step instructions. See
    # route_anchors() for the evidence rules.
    for entry in out_decisions:
        step_ids, area, confidence, method = route_anchors(entry, route_index)
        entry["routeStepIds"] = step_ids
        entry["area"] = area
        entry["linkConfidence"] = confidence
        entry["linkMethod"] = method

    with_rewards = sum(1 for d in out_decisions if d["rewards"])
    without_rewards = len(out_decisions) - with_rewards
    unresolved_decisions = sum(1 for d in out_decisions if d["unresolved"])
    reward_item_ids = {
        r["itemId"] for d in out_decisions for r in d["rewards"] if r["itemId"]
    }

    counts = {
        "decisions": len(out_decisions),
        "decisionsWithRewards": with_rewards,
        "decisionsWithoutRewards": without_rewards,
        "decisionsWithUnresolvedRewards": unresolved_decisions,
        "decisionsFullyResolved": len(out_decisions) - unresolved_decisions,
        "decisionsWithRewardsFullyResolved": with_rewards
        - sum(1 for d in out_decisions if d["rewards"] and d["unresolved"]),
        "rewards": sum(resolution_counts.values()),
        "resolvedRewards": resolution_counts["exact"] + resolution_counts["alias"],
        "unresolvedRewards": resolution_counts["unresolved"],
        "transientRewards": len(TRANSIENT_REWARDS),
        "exactMatches": resolution_counts["exact"],
        "aliasMatches": resolution_counts["alias"],
        "distinctRewardItemIds": len(reward_item_ids),
        "setComponentItemIds": len(distinct_ids - reward_item_ids),
        "distinctCatalogItemIds": len(distinct_ids),
        "byAvailability": {
            key: availability_counts.get(key, 0)
            for key in ("journey-1", "journey-2", "journey-3", "optional", "unresolved")
        },
        "byKind": {key: kind_counts.get(key, 0) for key in ("reward", "set", "required")},
    }

    return {
        "source": {
            "decisions": "src/data/meta.json -> decisions (workbook 'Choices & Consequences')",
            "catalog": "src/data/items.full.json -> items",
            "decisionMatrixGeneratedAt": meta["generatedAt"],
        },
        "availabilityRule": (
            "journey-* values come only from the decision matrix's journey1/"
            "futureOutcome/futureJourney text; no branch is scheduled on a journey "
            "the matrix does not state."
        ),
        "aliases": [
            {
                "sourceName": source,
                "catalogName": target,
                "reason": "decision text appends an item-type suffix",
            }
            for source, target in ALIASES.items()
        ],
        "counts": counts,
        "unresolvedRewards": unresolved_rewards,
        "decisions": out_decisions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if research/branch-plan.json is not the current build output",
    )
    args = parser.parse_args()

    plan = build()
    rendered = json.dumps(plan, indent=2, ensure_ascii=False) + "\n"

    if args.check:
        if not OUT_PATH.exists():
            print(f"missing {OUT_PATH}", file=sys.stderr)
            return 1
        if OUT_PATH.read_text(encoding="utf-8") != rendered:
            print(f"{OUT_PATH} is stale; rerun without --check", file=sys.stderr)
            return 1
        print(f"{OUT_PATH} is current")
        return 0

    OUT_PATH.write_text(rendered, encoding="utf-8")
    counts = plan["counts"]
    print(
        f"wrote {OUT_PATH.relative_to(ROOT)}: "
        f"{counts['decisions']} decisions, {counts['rewards']} rewards "
        f"({counts['resolvedRewards']} resolved / "
        f"{counts['unresolvedRewards']} unresolved)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
