# Upgrade & crafting-material coverage

Date: 2026-10-22
Owner: `UpgradeMaterialsResearch`
Outputs: `research/upgrades.json`, `research/materials.json`
Generator: `scripts/research/fetch_upgrades.py` (raw HTML cached in `research/raw/upgrades-*.html`)

```bash
python scripts/research/fetch_upgrades.py           # reuses cached HTML
python scripts/research/fetch_upgrades.py --refresh # re-downloads every page
```

The script never edits `src/`. It reads `src/data/farms.json`, `src/data/items.full.json`,
`research/route.base.json` and `research/route.dlc.json` for reconciliation only.

## Sources

| Source | Used for |
| --- | --- |
| `https://eldenring.wiki.gg/wiki/Scadutree_Fragment` | All 50 Scadutree Fragments (40 pickups, quantity-preserved) |
| `https://eldenring.wiki.gg/wiki/Revered_Spirit_Ash` | All 25 Revered Spirit Ashes (23 pickups) |
| `https://eldenring.wiki.gg/wiki/Golden_Seed` | Cross-check only (41 entries / 42 items; incomplete) |
| `https://game-checklists.com/elden-ring/all-golden-seeds` | 45 Golden Seed pickups (primary seed ledger) |
| `https://eldenring.wiki.gg/wiki/Sacred_Tear` | All 12 Sacred Tears |
| `https://eldenring.wiki.gg/wiki/Smithing_Stone_{1..8}` | Tier index / cross-check; most pages are stubs |
| `https://eldenring.wiki.gg/wiki/Somber_Smithing_Stone_{1..9}` | Tier index / cross-check; most pages are stubs |
| `https://eldenring.wiki.gg/wiki/{Grave,Ghost}_Glovewort_{1..9}` | Tier index / cross-check |
| `https://eldenring.wiki.fextralife.com/Smithing+Stone+(N)` | Per-tier pickup and drop lists (N = 1–8) |
| `https://eldenring.wiki.fextralife.com/Somber+Smithing+Stone+(N)` | Per-tier pickup and drop lists (N = 1–9) |
| `https://eldenring.wiki.fextralife.com/Grave+Glovewort+(N)` / `Ghost+Glovewort+(N)` | Per-tier pickup and drop lists (N = 1–9) |
| `https://eldenring.wiki.fextralife.com/Great+Grave+Glovewort` / `Great+Ghost+Glovewort` | Great Glovewort pickups |
| `https://www.ign.com/wikis/elden-ring/Shadow_of_the_Erdtree_Great_Glovewort_Locations` | Canonical 6 Great Grave DLC locations (Fextralife's Cerulean Coast bullets overlap); stated DLC total 6 Great Grave + 3 Great Ghost |
| `https://eldenring.wiki.gg/wiki/Category:Crafting_Materials` (API) | Canonical 107-item crafting-material list |
| `https://eldenring.wiki.gg/wiki/Hidden_Plumage` | The one category member absent from the workbook ledger |
| `https://eldenring.wiki.gg/wiki/Altus_Bloom` | Material present in the workbook but absent from the wiki category |

## `research/upgrades.json`

### Counts

| Category | Entries | Quantity sum | DLC entries | Unresolved entries | Drop leads (separate array) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `scadutree-fragment` | 40 | 50 | 40 | 0 | 0 |
| `revered-spirit-ash` | 23 | 25 | 23 | 0 | 0 |
| `golden-seed` | 45 | 45 | 0 | 0 | 0 |
| `sacred-tear` | 12 | 12 | 0 | 0 | 0 |
| `smithing-stone` | 267 | 420 | 58 | 74 | 34 |
| `somber-smithing-stone` | 155 | 165 | 30 | 36 | 47 |
| `glovewort` | 165 | 256 | 20 | 26 | 20 |
| `great-glovewort` | 18 | 20 | 9 | 2 | 0 |
| **Total** | **725** | — | **180** | **138** | **101** |

`counts` in the JSON contains the eight category totals. `entries` holds fixed
pickups and one-time acquisitions; `dropSources` holds rows the parser classifies as
enemy-drop leads (kept separate so completion counts are not inflated). The split is
heuristic: a bullet whose first 110 characters begin with "Rare drop", "Dropped", a
percentage chance, etc. is a drop lead; a few one-time boss drops may land there.

### Per-tier coverage

| Tier | Entries | | Tier | Entries |
| --- | ---: | --- | --- | ---: |
| Smithing Stone [1] | 34 | | Grave Glovewort [1] | 9 |
| Smithing Stone [2] | 41 | | Grave Glovewort [2] | 8 |
| Smithing Stone [3] | 38 | | Grave Glovewort [3] | 8 |
| Smithing Stone [4] | 43 | | Grave Glovewort [4] | 7 |
| Smithing Stone [5] | 32 | | Grave Glovewort [5] | 7 |
| Smithing Stone [6] | 24 | | Grave Glovewort [6] | 4 |
| Smithing Stone [7] | 20 | | Grave Glovewort [7] | 5 |
| Smithing Stone [8] | 35 | | Grave Glovewort [8] | 5 |
| Somber Stone [1] | 15 | | Grave Glovewort [9] | 8 |
| Somber Stone [2] | 12 | | Ghost Glovewort [1] | 14 |
| Somber Stone [3] | 13 | | Ghost Glovewort [2] | 9 |
| Somber Stone [4] | 18 | | Ghost Glovewort [3] | 9 |
| Somber Stone [5] | 17 | | Ghost Glovewort [4] | 13 |
| Somber Stone [6] | 26 | | Ghost Glovewort [5] | 13 |
| Somber Stone [7] | 20 | | Ghost Glovewort [6] | 10 |
| Somber Stone [8] | 14 | | Ghost Glovewort [7] | 14 |
| Somber Stone [9] | 20 | | Ghost Glovewort [8] | 8 |
| Great Grave Glovewort | 10 | | Ghost Glovewort [9] | 14 |
| Great Ghost Glovewort | 8 | | | |

### Validation

- **Scadutree Fragments:** 40 entries with quantities summing to **50**, matching the wiki statement "There are a total of 50 Scadutree Fragments within the Land of Shadow." ✅
- **Revered Spirit Ashes:** 23 entries summing to **25**, matching the wiki statement of 25. IGN's DLC checklist says 24; the discrepancy is recorded, not resolved. ⚠️
- **Sacred Tears:** 12 entries, matching the wiki list and every third-party count. ✅
- **Golden Seeds:** 45 entries from game-checklists. wiki.gg has only 41 entries / 42 items; Rock Paper Shotgun and community counts also say 45, so the checklist is used. Category-level `unresolvedCategory: true` records that the preferred wiki.gg source is incomplete. ⚠️
- **DLC Golden Seeds / Sacred Tears:** **none exist.** wiki.gg and Fextralife have no Shadow of the Erdtree acquisition section for either item, and third-party totals (45 seeds / 12 tears) equal the base-game totals. The Realm of Shadow uses Scadutree Fragments and Revered Spirit Ashes instead. Recorded in `notes`; this is a cross-checked absence, not a wiki statement.
- **Great Glovewort DLC:** 6 Great Grave + 3 Great Ghost = **9**, matching IGN's stated DLC total. The 6 Great Grave entries use IGN's named locations (West/East/Southeast/Center/Northwest/Church District) because Fextralife's Cerulean Coast bullets overlap. ✅

### Unresolved entries

138 of 725 pickups are marked `unresolved: true`:

- **97** have a region but no place name. Fextralife groups several bullets under a regional heading and writes "Found on a corpse…" without naming the dungeon; the full bullet stays in `description`.
- **40** have neither a place nor a mapped region (all base-game bullets under a page-level "In the World" heading); these are the weakest leads.
- **1** states "Multiple" (`Grave Glovewort [1]` in Murkwater Catacombs) and therefore has `quantity: null`.

Quantity defaults to `1` when the source does not state one; `quantityStated` records whether the number came from the page. Fextralife prose does not distinguish single-item corpses reliably, so a `1` here means "one listed acquisition", not a verified item count.

### Known limits

- wiki.gg tier pages for Smithing Stones [3]–[8] and most Glovewort tiers are 2022 stubs containing only a merchant note. Fextralife is the only usable per-tier list and mixes fixed pickups with boss/enemy drops.
- Fextralife location lists are prose and occasionally repeat an entry; exact duplicate `(category, name, location, description)` rows are removed.
- The DLC sections of most tier pages are incomplete on Fextralife, so DLC tier counts for the stone/glovewort tiers are lower bounds. Great Glovewort is the exception: its 6+3 DLC total is pinned to IGN.
- Ancient Dragon Smithing Stones and Somber Ancient Dragon Smithing Stones are outside the requested tier range and are not in this ledger.

## `research/materials.json`

### Counts

| Metric | Value |
| --- | ---: |
| Total materials | 108 |
| Base game | 69 |
| Shadow of the Erdtree | 39 |
| Environmental (flora/fungus/mineral/resin) | 58 |
| Obtainable | 107 |
| With a bell-bearing source | 10 |
| Named somewhere in `route.base.json` / `route.dlc.json` | 89 |
| Not named in either route | 19 |
| Environmental and not named in either route | 15 |

Fields per row: `id`, `name`, `category`, `environmental`, `renewability`, `earlySource`,
`lateSource`, `nearestGrace`, `farmMethod`, `purchasable`, `merchant`, `bellBearing`,
`finiteBeforeUnlock`, `priority`, `use`, `sourceUrl`, `dlc`, `game`, `inFarms`,
`inWikiCategory`, `inItemCatalog`, `inRoute`, `unresolved`.

### Reconciliation

| Check | Result |
| --- | --- |
| `src/data/farms.json` materials | 107 |
| `Category:Crafting Materials` members | 107 |
| Matched (in both) | **106** |
| Workbook-only | **1 — Altus Bloom** (real base-game flower; the wiki category omits it) |
| Category-only (new) | **1 — Hidden Plumage** (cut content; unobtainable in retail) |
| `src/data/items.full.json` matches | **0** — the catalog has no crafting-material group; all 108 rows are new relative to it |
| Unresolved material rows | **0** |

`items.full.json` was scanned by exact name: it is an equipment/consumable catalog
(2,325 rows: armor, weapons, spells, talismans, ashes, tools, crystal tears, etc.)
and contains no crafting-material group, so zero names resolve.

The 15 environmental materials not named in either route are the concrete
"Redmaw does not cover this pickup" gap: Dragon's Calorbloom, Empyrean-Blood Burgeon,
Finger Mimic, Gas Stone, Nailstone, Nectarblood Burgeon, Sharp Gravel Stone,
Altus Bloom, Cracked Crystal, Dewkissed Herba, Erdleaf Flower, Faded Erdleaf Flower,
Golden Rowa, Rowa Fruit, Volcanic Stone. They are present in the ledger with sources.

### Caveats

- 106 of 107 workbook rows are carried with their existing source-verified fields and
  wiki.gg URLs; this audit did not re-open all 106 pages. Hidden Plumage and Altus Bloom
  were verified directly.
- `renewability`, `finiteBeforeUnlock` and `priority` are the workbook's judgments, not
  wiki statements; they are preserved verbatim so downstream UI keeps its semantics.
- Hidden Plumage is flagged `obtainable: false` and `priority: "None"`.

## Reproduce / verify

```bash
python - <<'PY'
import json
u = json.load(open('research/upgrades.json'))
m = json.load(open('research/materials.json'))
assert sum(u['counts'].values()) == len(u['entries']) == 725
assert u['counts']['scadutree-fragment'] == 40 and sum(
    e['quantity'] for e in u['entries'] if e['category'] == 'scadutree-fragment') == 50
assert u['counts']['revered-spirit-ash'] == 23 and sum(
    e['quantity'] for e in u['entries'] if e['category'] == 'revered-spirit-ash') == 25
assert u['counts']['sacred-tear'] == u['statedTotals']['sacred-tear'] == 12
assert m['counts']['total'] == 108
print('ok')
PY
```
