#!/usr/bin/env python3
"""Build src/data/remembrance-plan.json from the canonical remembrance matrix.

Sources of truth
----------------
* ``src/data/meta.json`` -> ``remembrances`` (25 canonical remembrances, each
  with its reward pair, Journey 1 / Journey 2 selections, duplication
  assignment, duplication class, and completion-protection state).
* ``src/data/route.full.json`` -> ``steps``: the boss step whose instruction
  names the remembrance it drops. That step supplies ``routeStepIds`` and
  ``area``.
* ``src/data/bosses.full.json`` -> ``encounters``: used only as a fallback when
  no route step names the remembrance.

The ordering is the user's duplication-priority list (most likely to need a
second copy first). Twenty-five of its twenty-six entries are remembrances.
"Heart of Bayle" (priority 26) is not a remembrance: the Heart is a
non-duplicable exchange input for Bayle's Flame Lightning / Bayle's Tyranny and
has no entry in ``meta.json -> remembrances``, so it is excluded here and
remains documented in ``branch-plan.json``.

Nothing is invented: every reward, selection, duplication site, and
completion-protection state is copied from ``meta.json``. The plan text is
derived deterministically from those fields:

* no remembrance is consumed for runes before both of its rewards are held;
* unique rewards are taken before any duplicate;
* the duplicate, when the matrix assigns one, is used for the *other* unique
  reward of the same remembrance, never for a second copy of the first.

Usage
-----
    python3 scripts/research/build_remembrance_plan.py            # write JSON
    python3 scripts/research/build_remembrance_plan.py --check    # verify on disk
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
META_PATH = ROOT / "src" / "data" / "meta.json"
ROUTE_PATH = ROOT / "src" / "data" / "route.full.json"
BOSSES_PATH = ROOT / "src" / "data" / "bosses.full.json"
OUT_PATH = ROOT / "src" / "data" / "remembrance-plan.json"

SOURCE = (
    "src/data/meta.json -> remembrances (rewards, journey selections, duplication "
    "assignments, duplication class, completion protection); src/data/route.full.json -> "
    "steps (boss kill step that drops each remembrance, and its area); "
    "src/data/bosses.full.json -> encounters (area fallback only)."
)

# User's duplication priority, most-likely-to-duplicate first. Each entry is
# (user label, remembrance id from meta.json). 26th list item ("Heart of Bayle")
# is intentionally absent: it is not a remembrance.
PRIORITY: list[tuple[str, str]] = [
    ("Radagon / Elden Beast", "elden-remembrance"),
    ("Gaius", "remembrance-of-the-wild-boar-rider"),
    ("Maliketh", "remembrance-of-the-black-blade"),
    ("Starscourge Radahn", "remembrance-of-the-starscourge"),
    ("Messmer", "remembrance-of-the-impaler"),
    ("Metyr", "remembrance-of-the-mother-of-fingers"),
    ("Divine Beast", "remembrance-of-the-dancing-lion"),
    ("Romina", "remembrance-of-the-saint-of-the-bud"),
    ("Promised Consort Radahn", "remembrance-of-a-god-and-a-lord"),
    ("Malenia", "remembrance-of-the-rot-goddess"),
    ("Scadutree Avatar", "remembrance-of-the-shadow-sunflower"),
    ("Placidusax", "remembrance-of-the-dragonlord"),
    ("Putrescent Knight", "remembrance-of-putrescence"),
    ("Rellana", "remembrance-of-the-twin-moon-knight"),
    ("Godfrey", "remembrance-of-hoarah-loux"),
    ("Regal Ancestor Spirit", "remembrance-of-the-regal-ancestor"),
    ("Astel", "remembrance-of-the-naturalborn"),
    ("Godrick", "remembrance-of-the-grafted"),
    ("Rennala", "remembrance-of-the-full-moon-queen"),
    ("Rykard", "remembrance-of-the-blasphemous"),
    ("Mohg", "remembrance-of-the-blood-lord"),
    ("Fire Giant", "remembrance-of-the-fire-giant"),
    ("Fortissax", "remembrance-of-the-lichdragon"),
    ("Morgott", "remembrance-of-the-omen-king"),
    ("Midra", "remembrance-of-the-lord-of-frenzied-flame"),
]

PRIORITY_TOTAL = len(PRIORITY)  # Heart of Bayle is the user's 26th line but has no remembrance

RUNE_RULE = "Do not consume this remembrance for runes until both unique rewards are held."


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def clean_rewards(rewards: list[str]) -> list[str]:
    """Drop the placeholder em dash the workbook uses for the empty third slot."""
    return [reward for reward in rewards if reward and reward.strip() != "—"]


def split_duplication(text: str) -> tuple[str, str]:
    """Split 'J1 DUP-01 — Weeping Peninsula bell mausoleum → Rennala's Full Moon'.

    Returns (site, reward). A text without an arrow yields ("", "").
    """
    if "→" not in text:
        return "", ""
    before, reward = text.split("→", 1)
    site = before.split("—", 1)[1].strip() if "—" in before else before.strip()
    return site, reward.strip()


def strip_second_copy(text: str) -> str:
    """'Grafted Dragon 2' -> 'Grafted Dragon'; other phrasings pass through."""
    match = re.fullmatch(r"(.+?)\s+2", text.strip())
    return match.group(1) if match else text.strip()


PUNCTUATED = re.compile(r"[!,]")
SECOND_COPY_PREFIXES = ("Optional — ", "No — ", "Not applicable — ")


def quote(reward: str) -> str:
    """Quote reward names whose punctuation would otherwise break the sentence."""
    return f"\u201c{reward}\u201d" if PUNCTUATED.search(reward) else reward


def second_copy_note(duplicate_target: str) -> str:
    """'Optional — no second identical copy ...' -> 'Second-copy rule: no second ...'.

    meta.json prefixes each duplicateTarget with a verdict ("Optional", "No",
    "Not applicable"); the clause after the dash is the rule itself.
    """
    for prefix in SECOND_COPY_PREFIXES:
        if duplicate_target.startswith(prefix):
            return f"Second-copy rule: {duplicate_target[len(prefix):].rstrip('.')}."
    return f"Second-copy rule: {duplicate_target.rstrip('.')}."


def is_assigned_duplicate(journey1_duplication: str) -> bool:
    return journey1_duplication.startswith("J1 DUP-")


def is_no_duplicate(duplicate_target: str) -> bool:
    target = duplicate_target.strip()
    return target.startswith("No —") or target.startswith("Not applicable")


def route_steps_for(remembrance_name: str, steps: list[dict]) -> list[dict]:
    """Route steps whose instruction names the remembrance they drop."""
    needle = remembrance_name.lower()
    return [step for step in steps if needle in (step.get("instruction") or "").lower()]


def encounter_for(boss: str, encounters: list[dict]) -> dict | None:
    """Best-effort boss encounter match, used only for area fallback."""
    wanted = boss.lower()
    for encounter in encounters:
        if (encounter.get("name") or "").lower() == wanted:
            return encounter
    return None


def build_entry(
    order: int,
    label: str,
    remembrance: dict,
    steps: list[dict],
    encounters: list[dict],
) -> dict:
    name = remembrance["name"]
    matched = route_steps_for(name, steps)
    route_step_ids = sorted({step["id"] for step in matched})
    areas = [step["area"] for step in matched if step.get("area")]
    area = areas[0] if areas else ""
    if not area:
        encounter = encounter_for(remembrance["boss"], encounters)
        area = (encounter or {}).get("region", "")

    rewards = clean_rewards(remembrance["rewards"])
    j1_selection = remembrance["journey1Selection"]
    j1_duplication = remembrance["journey1Duplication"]
    j2_selection = remembrance["journey2Selection"]
    j2_duplication = remembrance["journey2Duplication"]
    duplicate_target = remembrance["duplicateTarget"]
    assigned = is_assigned_duplicate(j1_duplication)
    no_duplicate = is_no_duplicate(duplicate_target)

    site, dup_reward = split_duplication(j1_duplication)
    # The Journey 2 redemption is only a reward when it names one of this
    # remembrance's own unique rewards; "Optional second ..." and "No required
    # redemption ..." mark a journey with nothing left to collect.
    j2_is_reward = any(reward in j2_selection for reward in rewards)
    remaining_reward = next(
        (reward for reward in rewards if reward not in j1_selection), ""
    )

    first_reward = strip_second_copy(j1_selection)
    second_reward = strip_second_copy(j2_selection)
    duplicate_reward = dup_reward or remaining_reward

    if assigned:
        covered = {first_reward, strip_second_copy(duplicate_reward)}
        covered.update(reward for reward in rewards if reward in j2_selection)
        leftover = [reward for reward in rewards if reward not in covered]
        plan = (
            f"Take {quote(first_reward)} first — never duplicate before the unique reward "
            f"is secured. Then spend the duplicate at {site} on "
            f"{quote(duplicate_reward)}."
        )
        if leftover:
            plan += f" {quote(leftover[0])} remains for Journey 2."
        plan += f" {second_copy_note(duplicate_target)} {RUNE_RULE}"
    elif no_duplicate:
        plan = (
            f"Take {quote(first_reward)} first; {quote(remaining_reward or second_reward)} "
            f"waits for Journey 2 and needs no duplicate. "
            f"{second_copy_note(duplicate_target)} {RUNE_RULE}"
        )
    elif j2_is_reward:
        plan = (
            f"Take {quote(first_reward)} first; {quote(second_reward)} is the Journey 2 "
            f"redemption, so the Journey 1 duplicate stays in reserve. "
            f"{second_copy_note(duplicate_target)} {RUNE_RULE}"
        )
    else:
        plan = (
            f"Take {quote(first_reward)} first; no unique reward is left for Journey 2, so "
            f"the duplicate stays in reserve for an optional copy. "
            f"{second_copy_note(duplicate_target)} {RUNE_RULE}"
        )
    duplicate_plan = plan

    # Journey 1's reward leads the list so the row reads in take-order.
    rewards = [reward for reward in rewards if reward in j1_selection] + [
        reward for reward in rewards if reward not in j1_selection
    ]

    journey1 = f"Journey 1 — take {first_reward}. Duplication: {j1_duplication}"
    journey2 = f"Journey 2 — {second_reward}. Duplication: {j2_duplication}"

    if assigned:
        bucket = "duplicateNow"
    elif no_duplicate:
        bucket = "noDuplicate"
    else:
        bucket = "defer"

    priority = (
        f"Duplication priority {order} of {PRIORITY_TOTAL} (user order, "
        f"most-likely-to-duplicate first; the user's 26th line, Heart of Bayle, is not "
        f"a remembrance) — {label}. {remembrance['priority']}"
    )

    notes = " ".join(
        part
        for part in (
            remembrance.get("notes", "").strip(),
            f"Duplication class: {remembrance['duplicationClass']}.",
            f"Consumed for runes: {remembrance['consumedForRunes']}.",
            f"Location: {remembrance['location']}",
            f"Source: {remembrance['sourceUrl']}",
        )
        if part
    )

    return {
        "order": order,
        "remembranceId": remembrance["id"],
        "remembrance": name,
        "boss": remembrance["boss"],
        "game": remembrance["game"],
        "priority": priority,
        "duplicatePlan": duplicate_plan,
        "journey1": journey1,
        "journey2": journey2,
        "rewards": rewards,
        "routeStepIds": route_step_ids,
        "area": area,
        "notes": notes,
        "_bucket": bucket,
    }


def build() -> dict:
    meta = load_json(META_PATH)
    route = load_json(ROUTE_PATH)
    bosses = load_json(BOSSES_PATH)

    remembrances = {entry["id"]: entry for entry in meta["remembrances"]}
    steps = route["steps"]
    encounters = bosses["encounters"]

    entries = []
    problems = []
    for order, (label, remembrance_id) in enumerate(PRIORITY, start=1):
        remembrance = remembrances.get(remembrance_id)
        if remembrance is None:
            problems.append(f"priority {order} {label}: no remembrance {remembrance_id!r}")
            continue
        entry = build_entry(order, label, remembrance, steps, encounters)
        if not entry["routeStepIds"]:
            problems.append(f"{remembrance_id}: no route step names {entry['remembrance']!r}")
        if len(entry["rewards"]) < 2:
            problems.append(f"{remembrance_id}: fewer than two unique rewards")
        entries.append(entry)

    unreferenced = sorted(set(remembrances) - {entry["remembranceId"] for entry in entries})
    if unreferenced:
        problems.append(f"remembrances absent from the priority list: {unreferenced}")

    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        raise SystemExit(1)

    counts = {
        "entries": len(entries),
        "duplicateNow": sum(1 for entry in entries if entry["_bucket"] == "duplicateNow"),
        "defer": sum(1 for entry in entries if entry["_bucket"] == "defer"),
        "noDuplicate": sum(1 for entry in entries if entry["_bucket"] == "noDuplicate"),
    }
    for entry in entries:
        del entry["_bucket"]

    method = (
        "Entries follow the user's duplication-priority order (most likely to need a "
        "second reward first). Each entry is resolved from meta.json remembrances by id: "
        "rewards, Journey 1/Journey 2 selections, and duplication assignments are copied "
        "verbatim; the duplicatePlan text states which reward to take first and which "
        "duplicate site to use. routeStepIds are the route.full.json steps whose "
        "instruction names that remembrance (the boss kill that drops it); area is that "
        "step's area. counts.duplicateNow = entries whose meta journey1Duplication is an "
        "assigned J1 DUP site; counts.noDuplicate = entries whose duplicateTarget states "
        "no duplicate copy is needed and that have no J1 assignment; counts.defer = the "
        "remaining entries, whose second reward waits for Journey 2 with the duplicate "
        "held in reserve. rewards lists the Journey 1 selection first, then the remaining "
        "unique rewards, in meta.json order. Heart of Bayle (user priority 26) is not a remembrance: the "
        "Heart is a non-duplicable exchange input documented in branch-plan.json, so it "
        "does not appear here. Remembrances are never consumed for runes before both "
        "rewards are secured."
    )

    return {
        "generatedAt": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": SOURCE,
        "method": method,
        "entries": entries,
        "counts": counts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare the on-disk JSON with a fresh build instead of writing",
    )
    args = parser.parse_args()

    plan = build()

    if args.check:
        on_disk = load_json(OUT_PATH)
        on_disk.pop("generatedAt", None)
        plan.pop("generatedAt", None)
        if on_disk == plan:
            print(f"OK — {OUT_PATH.relative_to(ROOT)} matches the builder")
            return 0
        print(f"DRIFT — {OUT_PATH.relative_to(ROOT)} differs from the builder", file=sys.stderr)
        return 1

    OUT_PATH.write_text(
        json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {OUT_PATH.relative_to(ROOT)} — {plan['counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
