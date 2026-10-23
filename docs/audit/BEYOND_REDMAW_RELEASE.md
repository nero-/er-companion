# Beyond-Redmaw release audit

Date: 2026-10-22
Scope: the additive ledgers layered over the Redmaw full-game pack — world atlas, upgrade pickups, crafting materials, reference tables, alternate NPC walkthrough, branch plan, and merchant inventory.
Base implementation: commit `598235b` plus the beyond-Redmaw working tree. This document records observed counts and evidence; it does not re-open completed full-game integration.

## Release summary

| Module | Runtime file | Count | Status |
| --- | --- | --- | --- |
| World atlas | `src/data/world.objects.json` | 697 objects | Graces and sword monuments complete; other categories partial or unresolved |
| Upgrades | `src/data/upgrades.json` | 725 pickups / 993 quantity / 101 separate drop leads | 138 pickups keep an imprecise location |
| Crafting materials | `src/data/materials.full.json` | 108 materials | 107 obtainable; zero unresolved rows |
| Reference tables | `src/data/resources.json` | 11 tables / 138 rows | Complete for the Redmaw sheet; no unresolved tables |
| NPC walkthrough | `src/data/npc-walkthrough.json` | 36 sections / 604 steps | Complete for the Redmaw sheet; alternate ordering |
| Branch plan | `src/data/branch-plan.json` | 27 decisions / 43 reward entries | 36 resolved / 7 unresolved |
| Merchant inventory | `src/data/merchants.full.json` | 40 merchants / 627 items | 724 sheet rows = 627 items + 97 headings |
| Completion | `src/lib/selectors.ts` | 16 scopes | Seven beyond-Redmaw scopes appended to the original nine |

The canonical route (4,521 steps / 70 sections), item catalog (2,325), boss ledger (237), questlines (52 / 587), and save schema are unchanged. All new journey state is optional and defaults to empty on older saves.

## Evidence

### Sources and generators

| Output | Generator | Raw cache |
| --- | --- | --- |
| `research/world.json` | `python3 scripts/research/fetch_world_objects.py [--refresh]` | `research/raw/world-objects-*.html` |
| `research/upgrades.json`, `research/materials.json` | `python3 scripts/research/fetch_upgrades.py [--refresh]` | `research/raw/upgrades-*.html` |
| `research/resources.json`, `research/npc-walkthrough.json` | `python3 scripts/research/fetch_reference.py [--refresh]` | `research/raw/reference-*.html` |
| `research/branch-plan.json` | `python3 scripts/research/build_branch_plan.py [--check]` | Reads `src/data/meta.json` and `src/data/items.full.json` |
| `src/data/merchants.full.json` | Redmaw merchant sheet normalization | `research/raw/merchants.html` |

Every row retains `sourceUrl` (and `mapUrl` where a source supplies a marker). Category status, gaps, reconciliation notes and unresolved totals travel inside the data files, not only in prose.

### Verification performed

- **Counts recomputed from entries.** World object counts recompute from `entries`; 697 unique IDs for 697 rows. Upgrade category counts sum to 725 entries, and category quantities sum to 993. Material counts sum to 108. Resource rows sum to 138 across 11 tables. NPC sections sum to 604 steps. Branch entries sum to 43.
- **Cross-checks.** Scadutree Fragments sum to 50 and Revered Spirit Ashes to 25, matching the wiki statements; Sacred Tears = 12; Golden Seeds = 45 against the checklist source; 9 DLC Great Gloveworts match IGN's 6 Great Grave + 3 Great Ghost. Grace rows parse 418 and collapse to 413 after removing five duplicated Leyndell rows; the DLC grace count 105 agrees across both wikis. Sword Monuments = 14 on both sources. Effigies = 157 base + 56 DLC on Fextralife versus 154 unique base gallery entries on wiki.gg, so the category is reported as a partial lower bound.
- **Branch resolution.** 27 of 27 decisions present; 31 exact catalog matches, 5 documented aliases, 7 unresolved entries, 1 transient reward (`retained: false`).
- **Build and tests at release:** `npm run typecheck` clean, `npm test` passes **34 tests**, production build passes.
- **Browser sweep for the new surfaces:** World Atlas, Materials (Upgrades + Crafting Materials), Resources, the Journey NPC-walkthrough tab, the Farms merchants tab, and the Completion Journey Plan tab render with 0 console/page errors; no page-level horizontal overflow at 390 px.
- **State and migration:** `worldChecks`, `upgradeCounts`, and `npcWalkthroughSteps` initialize to `{}` in `emptyJourney` and normalize through boolean/number record sanitizers. Existing `MAT-*` and `MER-*` keys are unchanged, so the ledgers require no save migration.

### Source coverage status

| World category | Rows | DLC | Status | Evidence |
| --- | ---: | ---: | --- | --- |
| `grace` | 413 | 105 | resolved | wiki.gg Sites of Grace; 408 route-linked |
| `finger-reader` | 9 | 0 | partial | Fextralife locations + Enia; neither source claims completeness and neither covers the DLC |
| `stranded-soul` | 44 | 6 | partial | wiki.gg 38 base + 6 DLC with a text location; 12 DLC rows with screenshot-only locations skipped |
| `sword-monument` | 14 | 0 | resolved | wiki.gg + Fextralife cross-check |
| `stake-of-marika` | 0 | 0 | unresolved | No per-object list in any permitted source |
| `martyr-effigy` | 213 | 56 | partial lower bound | Fextralife; 200 rows carry a map marker; wiki.gg base gallery is close but not equal |
| `birdseye-telescope` | 4 | 0 | unresolved | Archived Fandom page only; every row flagged `unresolved` |
| `gatekeeper-statue` | 0 | 0 | unresolved | No such object is defined by any source |

## Module detail

### World atlas — 697 objects

413 graces, 213 martyr effigies, 44 stranded souls, 14 sword monuments, 9 finger readers, 4 Birdseye Telescopes. Stakes of Marika and Gatekeeper Statues emit zero rows rather than area-level approximations; `WORLD_CATEGORY_STATUS` and `WORLD_GAPS` drive the Atlas banners and per-category notes. Five duplicated Leyndell graces are collapsed into their Royal Capital rows and listed in `world.objects.json.meta.grace.collapsed`.

The page keeps eight category tabs, including the two zero-row categories, so an empty ledger is visible as a documented gap rather than silently absent. Checked state is per journey (`worldChecks`).

### Upgrades — 725 pickups / 993 quantity

| Category | Entries | Quantity | Unresolved | DLC entries | Drop leads |
| --- | ---: | ---: | ---: | ---: | ---: |
| Scadutree Fragment | 40 | 50 | 0 | 40 | 0 |
| Revered Spirit Ash | 23 | 25 | 0 | 23 | 0 |
| Golden Seed | 45 | 45 | 0 | 0 | 0 |
| Sacred Tear | 12 | 12 | 0 | 0 | 0 |
| Smithing Stone | 267 | 420 | 74 | 58 | 34 |
| Somber Smithing Stone | 155 | 165 | 36 | 30 | 47 |
| Glovewort | 165 | 256 | 26 | 20 | 20 |
| Great Glovewort | 18 | 20 | 2 | 9 | 0 |
| **Total** | **725** | **993** | **138** | **180** | **101** |

`dropSources` is a separate 101-row enemy-drop lead ledger and is never part of the completion denominator. One row (`Grave Glovewort [1]`, Murkwater Catacombs) keeps `quantity: null` because the source says "Multiple"; it contributes zero to the quantity total and is labelled in the UI. Quantity progress caps each row at its stated quantity.

### Crafting materials — 108

69 base game, 39 Shadow of the Erdtree; 58 environmental; 107 obtainable. 106 of the 107 workbook rows match by name; workbook-only `Altus Bloom` is kept, and wiki-only `Hidden Plumage` is included and flagged unobtainable (cut content). Zero unresolved rows. Nineteen materials are not named in either Redmaw route, including 15 environmental materials — the concrete "Redmaw does not cover this pickup" gap. Material IDs reuse the existing `MAT-BG-*` / `MAT-DLC-*` scheme.

### Reference tables — 11 / 138

Soft caps (12 rows), smithing stones (9), somber stones (10), grave gloveworts (10), ghost gloveworts (10), base runes (21), DLC runes (11), base remembrance runes (15), DLC remembrance runes (10), Scadutree levels (20), Revered Spirit Ash levels (10). Display-only; blank source cells are preserved as null (four top-tier cost cells). No unresolved table.

### NPC walkthrough — 36 / 604

26 base sections / 445 steps and 10 DLC sections / 159 steps; 130 optional, 98 missable, 500 links across 334 steps, two section notes that carry no checkbox. It is an area-ordered companion to the 52 questlines and does not replace the main route. State is stored separately (`npcWalkthroughSteps`) and contributes only to its own completion scope, so it cannot inflate route progress.

### Branch plan — 27 / 43

18 decisions name at least one item reward; 9 name none. 43 reward entries: 36 resolved (31 exact, 5 alias) and 7 unresolved. Distinct resolved item IDs: 30; 37 including set components. Availability is assigned only from the decision matrix (`journey-1`, `journey-2`, `journey-3`); no optional or unresolved-availability entries exist. One Journey 1 reward (Swordhand of Night Jolán Spirit Ash, DLC-006) is consumed by DLC-007 and marked `retained: false`; it still counts as acquired. Branch ownership is read from `character.items`, so existing `journey.decisions` records are untouched.

### Merchant inventory — 40 / 627

The Redmaw merchant sheet has 724 rows: 627 purchasable items plus 97 headings. The older workbook merchant ledger (167 rows) remains for objective and route-step links; 110 of its 167 rows bridge to the full inventory by normalized merchant + item name, and a purchase counts once when either the full row ID or its matched workbook ID is true. `merchantInventoryProgress` and `farmSummary.merchantsTotal` use 627, never 167.

### Completion scopes — 16

Route 4,521 · Collection 2,325 · Achievements 42 · Bosses 237 · Quests 587 · Lore 69 · Endings 6 · Remembrances 25 · NG+ 68 · Graces 413 · World (non-grace) 284 · Upgrades 993 · Materials 108 · Merchants 627 · NPC walkthrough 604 · Branch rewards 36.

Every scope keeps its own denominator and no blended percentage is shown. The seven added scopes are separate from the original nine.

## Unresolved categories

| Category | Unresolved | Reason | UI behavior |
| --- | ---: | --- | --- |
| Stakes of Marika | all | No authoritative per-object list; wiki.gg and Fextralife describe areas, not objects | Zero rows; "No list" status and gap note |
| Gatekeeper Statues | all | Object is not defined by any permitted source | Zero rows; "No list" status and gap note |
| Birdseye Telescopes | 4 of 4 | Archived Fandom page only; live pages are gone | Rows shown with "Location unresolved" badge |
| Finger readers | 9 | Partial source list; no DLC coverage | Partial category banner |
| Stranded souls | 44 | 12 DLC rows with screenshot-only locations skipped | Partial category banner; skipped rows listed in metadata |
| Martyr effigies | 213 | Fextralife lower bound; wiki.gg covers base game only | Partial category banner |
| Upgrade pickups | 138 of 725 | 97 region-only, 40 page-level "In the World", 1 "Multiple" | Unresolved filter and per-row location label |
| Branch rewards | 7 of 43 | No catalog row for Alexander's Innards, Ancient Dragon Smithing Stone ×2, Unalloyed Gold Needle, Zorayas's Letter; Eccentric's and Ansbach's sets exist only as pieces | Reason shown; set components linked; not counted as owned reward |
| Workbook merchant rows | 57 of 167 | No normalized-name match to the full inventory | Workbook objective links still work; not counted twice |
| Item locations (carried over) | 1,017 of 2,325 | Source data never named a place | Labelled unrecorded; no fabrication |
| Dialogue | all spoken lines | Explicitly deferred; quest-critical actions only | No dialogue scope; documented in Completion and README |

## Remaining gaps

1. **World-object source gaps.** Stakes of Marika and Gatekeeper Statues need map-marker or game-data sources. Telescopes need a live DLC-capable source; finger readers, stranded souls and effigies need a complete list before their categories can be marked resolved. Five graces also lack a `routeStepId`.
2. **Upgrade locations.** 138 pickups need exact place names; the 101 drop leads are intentionally outside the denominator and need a separate decision if they are ever to be tracked.
3. **Item locations.** 1,017 items remain unrecorded and 930 are area-only, unchanged by this phase.
4. **Branch catalog gaps.** Seven rewards need real catalog rows (or an explicit set-level model) before branch rewards can reach 43/43.
5. **Merchant bridge.** 57 workbook rows need aliases or manual matches if workbook purchases are to count fully.
6. **Dialogue corpus.** Not attempted; would require a separate source and schema.
7. **Freshness.** Build, tier and loadout rankings remain Regulation 1.16.1 baseline pending 1.17 re-validation.
8. **Platform work.** Accessibility audit, CI/E2E, offline install/update drill, bundle split, save migration registry, cross-device sync, Tauri wrapper, and licensing clearance remain open. See `docs/audit/PRIORITIZED_BACKLOG.md`.

## Non-claims

- Zero rows in a world category means "no authoritative list", not "none exist in the game".
- Partial categories are lower bounds, not totals.
- `unresolved` on an upgrade row means the location is imprecise, not that the pickup is unobtainable.
- An unresolved branch reward is still a real branch outcome; only its catalog link is missing.
- The NPC walkthrough is an alternate checklist, not a replacement for the 4,521-step route or the questlines.
- No dialogue corpus is claimed or counted.

## Reproduce

```bash
python3 scripts/research/fetch_world_objects.py
python3 scripts/research/fetch_upgrades.py
python3 scripts/research/fetch_reference.py
python3 scripts/research/build_branch_plan.py --check
```

Add `--refresh` to re-download cached pages. The scripts reuse `research/raw/` when present, so they run offline once the cache is populated. Branch-plan regeneration fails if the decision count changes from 27, a decision ID drifts, or a declared set piece stops resolving uniquely.
