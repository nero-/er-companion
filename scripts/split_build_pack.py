#!/usr/bin/env python3
"""Split the build content pack into the startup core and the reference pack.

`builds.json` is 7.7 MiB, but only two surfaces read the reference half:
encounter presets and boss strategies. The core half (archetypes, profiles,
loadouts, tech tree, spell packages, buffs) is needed by the store at startup,
so it stays in the initial chunk. The reference half ships as its own module and
is fetched the first time a page opens it.

Usage:
    python3 scripts/split_build_pack.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"

CORE_KEYS = (
    "archetypes",
    "profiles",
    "loadouts",
    "techNodes",
    "techEdges",
    "progressionLoadouts",
    "spellPackages",
    "buffs",
)
REFERENCE_KEYS = (
    "encounterPresets",
    "bossStrategies",
    "weaponConfigs",
    "upgradePlans",
    "resourcePresets",
)


def main() -> int:
    source = json.loads((DATA / "builds.json").read_text(encoding="utf-8"))
    missing = [key for key in (*CORE_KEYS, *REFERENCE_KEYS) if key not in source]
    if missing:
        print(f"builds.json is missing expected keys: {missing}", file=sys.stderr)
        return 1
    unknown = [key for key in source if key not in (*CORE_KEYS, *REFERENCE_KEYS)]
    if unknown:
        print(f"builds.json has unclassified keys: {unknown}", file=sys.stderr)
        return 1

    core = {key: source[key] for key in CORE_KEYS}
    reference = {key: source[key] for key in REFERENCE_KEYS}

    def write(name: str, payload: dict) -> None:
        path = DATA / name
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        print(f"  wrote {name} ({path.stat().st_size / 1024 / 1024:.2f} MiB)")

    write("builds-core.json", core)
    write("builds-reference.json", reference)

    # A tiny index so the shell, search and remembrance links can name bosses
    # without loading the 2.5 MiB strategy pack.
    strategies = source["bossStrategies"]
    counts: dict[str, int] = {}
    for strategy in strategies:
        counts[strategy["boss"]] = counts.get(strategy["boss"], 0) + 1
    index = {
        "source": "builds.json",
        "names": sorted(counts),
        "strategyCounts": dict(sorted(counts.items())),
    }
    path = DATA / "boss-index.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(index, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"  wrote boss-index.json ({len(index['names'])} bosses, {path.stat().st_size} bytes)")

    core_rows = sum(len(value) for value in core.values())
    reference_rows = sum(len(value) for value in reference.values())
    print(f"  core: {core_rows} rows; reference: {reference_rows} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
