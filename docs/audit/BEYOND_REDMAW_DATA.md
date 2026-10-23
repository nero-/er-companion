# Beyond-Redmaw data integration

Date: 2026-10-22
Scope: world interactions, upgrade pickups, crafting materials, resource
tables, the alternate NPC walkthrough, and branch-plan rewards.

These ledgers are additive. The canonical 4,521-step route
(`route.full.json`), 2,325-item catalog (`items.full.json`), and the existing
save schema remain unchanged. New journey state is optional and defaults to
empty maps when older saves load.

## Files

| Runtime file | Source | Top-level shape |
| --- | --- | --- |
| `src/data/world.objects.json` | `research/world.json` | `entries`, `counts`, `categoryStatus`, `gaps`, `sources`, `meta` |
| `src/data/upgrades.json` | `research/upgrades.json` | `entries`, `dropSources`, `counts`, `statedTotals`, `unresolvedByCategory` |
| `src/data/materials.full.json` | `research/materials.json` | `entries`, `counts`, `reconciliation`, `sources` |
| `src/data/resources.json` | `research/resources.json` | `tables`, `counts`, `categories`, `notes` |
| `src/data/npc-walkthrough.json` | `research/npc-walkthrough.json` | `sections`, `counts` |
| `src/data/branch-plan.json` | `research/branch-plan.json` | `decisions`, `counts`, `unresolvedRewards`, `aliases` |

Every row keeps its source URL. IDs are unchanged from the research output.
Boolean, string, and numeric fields are normalized to their declared types;
`null` quantities in the upgrade ledger remain `null` rather than being
guessed. Category status, gaps, reconciliation notes, and unresolved totals
stay inside the data files so coverage claims travel with the data.

## World objects — 697 entries

| Category | Rows | DLC | Status |
| --- | ---: | ---: | --- |
| `grace` | 413 | 105 | resolved against wiki.gg Sites of Grace |
| `finger-reader` | 9 | 0 | partial: Fextralife locations + Enia |
| `stranded-soul` | 44 | 6 | partial: only DLC rows with a text location |
| `sword-monument` | 14 | 0 | resolved against both wikis |
| `stake-of-marika` | 0 | 0 | unresolved: no per-object list exists |
| `martyr-effigy` | 213 | 56 | partial lower bound from Fextralife |
| `birdseye-telescope` | 4 | 0 | unresolved: archived Fandom page only |
| `gatekeeper-statue` | 0 | 0 | unresolved: object does not exist in any source |

`WORLD_CATEGORY_STATUS[category].resolved` is the authority for whether a
category is complete. Stakes of Marika and Gatekeeper Statues are recorded as
gaps in `WORLD_GAPS`; no rows are fabricated. The five duplicated Leyndell
graces are collapsed and documented in `world.objects.json.meta.grace.collapsed`.

## Upgrades — 725 pickups

| Category | Entries | Quantity sum | Unresolved entries | Drop leads |
| --- | ---: | ---: | ---: | ---: |
| `scadutree-fragment` | 40 | 50 | 0 | 0 |
| `revered-spirit-ash` | 23 | 25 | 0 | 0 |
| `golden-seed` | 45 | 45 | 0 | 0 |
| `sacred-tear` | 12 | 12 | 0 | 0 |
| `smithing-stone` | 267 | 420 | 74 | 34 |
| `somber-smithing-stone` | 155 | 165 | 36 | 47 |
| `glovewort` | 165 | 256 | 26 | 20 |
| `great-glovewort` | 18 | 20 | 2 | 0 |
| **Total** | **725** | **993** | **138** | **101** |

`upgrades.json.dropSources` is a separate 101-row lead ledger and is never
counted as a completed pickup. Unresolved rows are pickup rows with an
imprecise place name, not rows marked as unobtainable. `quantity: null` occurs
once (`Grave Glovewort [1]` in Murkwater Catacombs, source says "Multiple") and
contributes zero to quantity totals.

## Crafting materials — 108 entries

69 base game, 39 Shadow of the Erdtree; 58 environmental; 107 obtainable.
`materials.full.json.reconciliation` records 106 name matches with the farms
workbook, the workbook-only `Altus Bloom`, and the wiki-only `Hidden Plumage`
(`MAT-CUT-HIDDEN-PLUMAGE`). Existing `journey.materials` keys already use the
same `MAT-BG-*` / `MAT-DLC-*` ID scheme, so no save migration is required.

## Resource tables — 11 tables / 138 rows

Soft caps, smithing/somber stone costs, grave/ghost glovewort costs, base and
DLC rune rewards, base and DLC remembrance runes, Scadutree levels, and
Revered Spirit Ash levels. Rows keep their original key set plus `wikiUrl`
and optional `note`/`noteLinks`; values are not recomputed.

## NPC walkthrough — 36 sections / 604 steps

130 optional, 98 missable, 500 wiki links across 334 steps. Ten DLC sections
contain 159 steps. Section notes are retained verbatim. This is an
area-ordered companion to the existing 52 questlines and does not replace
them.

## Branch plan — 27 decisions / 43 reward entries

36 resolved rewards (31 exact, 5 alias) and 7 unresolved rewards. Unresolved
entries are catalog-resolution gaps, not claims that the item is
unobtainable; they keep `itemId: ""` and a `reason`. Distinct resolved item
IDs: 30; distinct catalog IDs including set components: 37. One Journey 1
reward (`Swordhand of Night Jolán Spirit Ash`, DLC-006) is marked
`retained: false` because DLC-007 consumes it, but it still counts as acquired
in the branch reward ledger.

Branch progress is read from `character.items` (the catalog ownership map), so
the existing `journey.decisions` records are untouched.

## Merchant inventory — 40 merchants / 627 items

`src/data/merchants.full.json` is the full Redmaw inventory ledger: 40
merchants and 627 item rows. The older workbook merchant ledger
(`farms.json.merchants`, 167 rows) remains available for its original
objective and route-step links, but **167 is not the full denominator**.
`merchantInventoryProgress` and `farmSummary.merchantsTotal` use 627.

Workbook purchases are still honored: each workbook row is matched to a full
inventory item by normalized merchant name + item name (110 of 167 rows have
a match), and a purchase is counted once when either the full item ID or its
matched workbook ID is true in `journey.merchants`.

## Journey state additions

```ts
worldChecks: Record<string, boolean>;
upgradeCounts: Record<string, number>;
npcWalkthroughSteps: Record<string, boolean>;
```

`emptyJourney` initializes them to `{}` and `normalizeJourney` uses the same
safe boolean/number record sanitizers as existing fields. Older saves load
with empty maps; unknown future keys survive normalization. Actions:

- `setWorldCheck(id, value)`
- `setUpgradeCount(id, count)` — floors, clamps to zero, deletes zero keys
- `setNpcWalkthroughStep(id, value)`

## Selectors and completion scopes

New selectors: `worldProgress`, `upgradeProgress`, `materialProgress`,
`merchantInventoryProgress`, `npcWalkthroughProgress`,
`branchRewardProgress`.

Existing completion scopes are unchanged. Seven separate scopes are appended,
with no blended percentage:

| Scope id | Numerator | Denominator |
| --- | --- | ---: |
| `graces` | checked graces | 413 |
| `world` | checked non-grace objects | 284 |
| `upgrades` | acquired quantity (capped per row) | 993 |
| `materials` | stocked material IDs | 108 |
| `merchants` | purchased full inventory rows | 627 |
| `npc-walkthrough` | checked steps | 604 |
| `branch-rewards` | owned resolved reward entries | 36 |

`branchRewardProgress` separately exposes `unresolved: 7` and distinct
acquired/resolved item counts. Upgrade progress exposes `entriesTouched` out
of 725 in addition to quantity progress.

## Search

New index entry types and targets:

| Type | Path |
| --- | --- |
| World object | `/atlas?focus=<id>` |
| Upgrade | `/materials?tab=upgrades&focus=<id>` |
| Crafting material | `/materials?tab=materials&focus=<id>` |
| Resource table | `/resources?table=<id>` |
| NPC walkthrough | `/journey?tab=npc&step=<id>` |
| Branch decision | `/completion?tab=branch&decision=<id>` |

Existing route, item, achievement, boss, and questline entries are unchanged.

## Known limits

- Stakes of Marika and Gatekeeper Statues have no rows; UI must read
  `categoryStatus`/`gaps` instead of treating zero as complete.
- Finger Reader Crones, Stranded Souls, Effigies of the Martyr, and Birdseye
  Telescopes are partial or single-source lower bounds.
- 138 upgrade pickups have imprecise locations; 101 additional rows are
  enemy-drop leads outside the completion denominator.
- Seven branch rewards have no catalog item; set-level rewards expose
  `componentItemIds` but remain unresolved at the set level.
- Full merchant inventory rows use `MERCH-*` IDs; workbook rows use `MER-*`.
  The normalized-name bridge covers 110 of the 167 workbook rows.
