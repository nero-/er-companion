#!/usr/bin/env python3
"""Map questline steps onto route steps using explicit, conservative signals.

Writes `src/data/questline-route-map.json` (`QuestlineRouteMap`).

Evidence ladder (highest wins), all against route step instructions:
1. exact linked wiki label (from the quest step's `links`)
2. NPC name + shared place token
3. shared place token + order window
4. shared distinctive keyword (rare token) + area window

Only matches at or above the configured thresholds are emitted. Unmatched steps
are counted in `gaps` and never guessed.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "src" / "data"

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "with", "from",
    "by", "as", "is", "are", "be", "it", "this", "that", "then", "than", "if", "you",
    "your", "their", "his", "her", "they", "them", "can", "will", "must", "should",
    "after", "before", "once", "when", "where", "which", "while", "into", "also",
    "get", "gets", "got", "make", "makes", "use", "used", "using", "talk", "speak",
    "return", "head", "go", "goes", "find", "found", "give", "gives", "given",
    "speak", "speaks", "meet", "meets", "defeat", "defeats", "kill", "kills",
}


def load(name: str):
    return json.loads((DATA / name).read_text())


def norm(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def tokens(value: str) -> set[str]:
    return {token for token in norm(value).split() if len(token) > 2 and token not in STOPWORDS}


route = load("route.full.json")
quests = load("questlines.json")["questlines"]
items = load("items.full.json")["items"]
item_names = {norm(row["name"]): row["name"] for row in items}

steps = route["steps"]
area_names = sorted({row["name"] for row in route["areas"]}, key=len, reverse=True)
norm_areas = [(norm(name), name) for name in area_names]

# Token document frequency across route instructions, so rare places/items win.
STEP_TOKENS: dict[str, set[str]] = {step["id"]: tokens(step["instruction"]) for step in steps}
STEP_HAY: dict[str, str] = {step["id"]: norm(step["instruction"]) for step in steps}

df: Counter[str] = Counter()
for step in steps:
    df.update(STEP_TOKENS[step["id"]])
rare = {token for token, count in df.items() if 2 <= count <= 40}

# Item names are resolved ONCE per quest, then tested against the candidate
# step text. Scanning the whole catalog per route step was quadratic.
ITEM_KEYS = [(key, name) for key, name in item_names.items() if key and len(key) >= 4]


def quest_item_keys(quest_hay: str) -> list[str]:
    return [key for key, _ in ITEM_KEYS if key in quest_hay]

by_area: dict[str, list[dict]] = {}
for step in steps:
    by_area.setdefault(step["area"], []).append(step)


def areas_in_text(text: str) -> list[str]:
    hay = norm(text)
    return [name for key, name in norm_areas if key and key in hay]


def score(
    step: dict, quest: dict, quest_tokens: set[str], item_keys: list[str]
) -> tuple[int, str] | None:
    hay = STEP_HAY[step["id"]]
    quest_text = quest["text"]
    npc = norm(quest.get("npc", ""))

    # 1. Linked wiki labels must appear verbatim in the instruction.
    for link in quest.get("links", []):
        label = norm(link.get("label", ""))
        if len(label) >= 5 and label in hay:
            return 6, "linked-label"

    # 2. NPC name plus a shared place token.
    if npc and npc in hay:
        shared = quest_tokens & STEP_TOKENS[step["id"]] & rare
        if shared:
            return 5, "npc+keyword"
        # NPC mentioned alone in the same chapter is medium confidence.
        return 3, "npc"

    # 3. Shared rare tokens, including item names, in the same area band.
    shared = quest_tokens & STEP_TOKENS[step["id"]] & rare
    if any(key in hay for key in item_keys):
        return 4, "item-name"
    if len(shared) >= 3:
        return 2, "keyword-3"
    if len(shared) == 2:
        return 1, "keyword-2"
    return None


links: dict[str, dict] = {}
unmatched: list[str] = []
confidence_counts = {"high": 0, "medium": 0, "low": 0}

QUEST_HAY: dict[str, str] = {
    quest["id"]: norm(quest["text"]) for questline in quests for quest in questline["steps"]
}
QUEST_TOKENS: dict[str, set[str]] = {
    quest["id"]: tokens(quest["text"]) for questline in quests for quest in questline["steps"]
}

for questline in quests:
    for quest in questline["steps"]:
        quest_tokens = QUEST_TOKENS[quest["id"]]
        item_keys = quest_item_keys(QUEST_HAY[quest["id"]])
        candidates: list[tuple[int, str, dict]] = []
        hinted_areas = [area for area in areas_in_text(quest["text"]) if area in by_area]
        pool = steps
        if hinted_areas:
            pool = [step for area in hinted_areas for step in by_area[area]]
        for step in pool:
            result = score(step, quest, quest_tokens, item_keys)
            if result is None:
                continue
            weight, method = result
            candidates.append((weight, method, step))
        if not candidates:
            unmatched.append(quest["id"])
            continue
        candidates.sort(key=lambda row: (-row[0], row[2]["order"]))
        weight, method, step = candidates[0]
        if weight >= 5:
            confidence = "high"
        elif weight >= 3:
            confidence = "medium"
        elif weight >= 1 and len(candidates) == 1:
            confidence = "low"
        else:
            unmatched.append(quest["id"])
            continue
        links[quest["id"]] = {
            "questlineStepId": quest["id"],
            "questlineId": quest["questlineId"],
            "routeStepId": step["id"],
            "area": step["area"],
            "confidence": confidence,
            "method": method,
        }
        confidence_counts[confidence] += 1

total = sum(len(line["steps"]) for line in quests)
payload = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "method": "linked label > NPC+keyword > item name > rare-keyword overlap; never below the low threshold.",
    "links": links,
    "coverage": {
        "steps": total,
        "linked": len(links),
        "high": confidence_counts["high"],
        "medium": confidence_counts["medium"],
        "low": confidence_counts["low"],
    },
    "gaps": sorted(unmatched),
}

(DATA / "questline-route-map.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(payload["coverage"], indent=2))
print(f"unmatched: {len(unmatched)}")
