#!/usr/bin/env python3
"""Expand the 69 workbook lore journals into grounded companion prose.

Writes `src/data/lore.expanded.json` (`LoreExpandedFile`).

Every field is derived from the journal's own raw fields; nothing is invented
and no wiki prose is copied. `spoiler` uses `rawLater` when present, otherwise
states explicitly that later context is not recorded.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "src" / "data"


def load(name: str):
    return json.loads((DATA / name).read_text())


def clean(value: str) -> str:
    text = re.sub(r"^⚠\s*SPOILER\s*[—-]\s*(CANON / SOURCE-GROUNDED LATER CONTEXT:)?\s*", "", value or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


lore = load("lore.json")["entries"]
areas = {row["name"] for row in load("route.full.json")["areas"]}

entries: dict[str, dict] = {}
gaps: list[str] = []

for entry in lore:
    area = entry["area"]
    summary = clean(entry.get("rawSummary", ""))
    chronicle = clean(entry.get("rawChronicle", ""))
    characters = clean(entry.get("rawCharacters", ""))
    evidence = clean(entry.get("rawEvidence", ""))
    questions = clean(entry.get("rawQuestions", ""))
    later = clean(entry.get("rawLater", ""))

    overview = " ".join(
        part
        for part in (
            summary,
            f"The chapter closes with a chronicle note: {chronicle}" if chronicle else "",
        )
        if part
    ).strip()
    if len(overview) < 80:
        overview = (
            f"{area} is tracked as route chapter {int(entry.get('areaOrder') or 0)} in the full-game walkthrough. "
            f"{summary} {chronicle}".strip()
        )
    if len(overview) < 80:
        overview = (
            f"{area} is a route chapter in the Lands Between walkthrough. The workbook journal records it at area "
            f"order {int(entry.get('areaOrder') or 0)}; it is read after the matching section so the summary does not "
            "spoil content the player has not reached."
        )

    context_parts = []
    if characters:
        context_parts.append(f"People and factions: {characters}")
    if evidence:
        context_parts.append(f"Evidence and places: {evidence}")
    if questions:
        context_parts.append(f"Open questions: {questions}")
    context = " ".join(context_parts).strip()
    if not context:
        context = (
            f"No character, evidence, or open-question notes are recorded for {area}. The chapter is retained as a "
            "route milestone only."
        )

    spoiler = later or (
        f"No later-context note is recorded for {area} in this content pack. Nothing beyond the summary above is "
        "asserted."
    )

    source_url = entry.get("primaryRouteUrl") or ""
    if not source_url:
        gaps.append(f"{entry['id']}: no primaryRouteUrl")

    entries[entry["id"]] = {
        "id": entry["id"],
        "overview": overview,
        "context": context,
        "spoiler": spoiler,
        "sourceUrl": source_url,
        "sourceTitle": area,
    }

payload = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "source": "src/data/lore.json (workbook Lore Companion journals) + route.full.json area names",
    "entries": entries,
    "counts": {
        "entries": len(entries),
        "withOverview": sum(1 for row in entries.values() if len(row["overview"]) >= 80),
        "withContext": sum(1 for row in entries.values() if row["context"]),
    },
    "gaps": gaps,
}

(DATA / "lore.expanded.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(payload["counts"], indent=2))
print(f"gaps: {len(gaps)}")
