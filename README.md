# Elden Ring Definitive Companion

An offline-first companion for **Elden Ring** and **Shadow of the Erdtree**. It ships one ordered full-game route, a merged permanent catalog, achievements, a boss ledger, questlines, a New Game Plus checklist, builds, character planning, farms, tiers, endings, and spoiler-gated lore. Beyond the Redmaw sheets it adds a checkable world atlas, upgrade and crafting-material ledgers, reference tables, an alternate NPC walkthrough, a decision/reward branch plan, and the full merchant inventory.

The route follows the game's intended full-content order: **base game through Maliketh → the entire Shadow of the Erdtree → Leyndell, Ashen Capital → endings → NG+ preparation**. It is a complete route, not a partial export.

The app is a **web-first PWA**: React 19 + TypeScript + Vite, static content generated from the workbook and the Redmaw Completion Sheets, and versioned local persistence. It installs for offline use, works at desktop and handheld widths, and makes no runtime API calls, accounts, or telemetry requests.

## Run

```bash
npm install
npm run dev
```

Production build and preview:

```bash
npm run build
npm run preview
```

Checks:

```bash
npm run typecheck
npm run test
```

`npm run build` runs `tsc --noEmit` before Vite. Unit tests cover content integrity, route/catalog merge, completion scopes and the pure selectors in `src/lib/selectors.test.ts` (34 tests). Evidence-backed audit notes and data integrity reports live in `docs/audit/`.

## Full-game content

Generated on **2026-10-22** from the Redmaw Completion Sheets merged with the certified workbook seed.

| Domain | Coverage |
| --- | --- |
| Route | **4,521 steps / 70 sections** |
| Missable route steps | **206** — 168 in the pre-DLC base game, 38 in the DLC |
| Permanent catalog | **2,325 items** |
| Achievements | **42** (plus 4 legendary requirement groups) |
| Boss ledger | **237 encounters** |
| Questlines | **52 questlines / 587 steps** |
| NG+ checklist | **68 items across 12 sections** |
| Lore | **69 journals** |
| Remembrances | **25** |
| Tarnished Pack | **27 owned-content records / 2 NPC invasions** |
| World atlas | **697 objects** — 413 graces, 213 martyr effigies, 44 stranded souls, 14 sword monuments, 9 finger readers, 4 telescopes |
| Upgrade pickups | **725 pickups / 993 total quantity** |
| Crafting materials | **108** — 69 base game, 39 DLC |
| Reference tables | **11 tables / 138 rows** |
| NPC walkthrough | **36 sections / 604 steps** (alternate ordering) |
| Merchant inventory | **40 merchants / 627 items** |
| Branch plan | **27 decisions / 43 reward entries** — 36 resolved, 7 unresolved |
| Completion scopes | **16 independent scopes** |

### Route order

1. **Base game — through Maliketh**: 46 sections, 3,303 steps. The walkthrough stops at Maliketh, the Black Blade, plus the point-of-no-return warning.
2. **Shadow of the Erdtree**: all 20 sections, 1,126 steps, including Enir-Ilim and the finale.
3. **Base game — endgame**: 4 sections, 92 steps. Crumbling Farum Azula aftermath → Leyndell, Ashen Capital → Endings → NG+ Preparation.

Global step order is contiguous 1–4,521. Two phase gates protect the transitions: one before the DLC and one before the Ashen Capital. The second gate deep-links the unresolved missables in Capital Outskirts, Leyndell, and Forbidden Lands.

### Denominators and coverage edges

- The catalog starts from the workbook's permanent records, adds 538 Redmaw-only records, and merges 27 Tarnished Pack records into matching rows. The final denominator is 2,325.
- 1,502 of 5,290 route link labels resolve to a catalog or boss record. The remaining 3,788 stay in `linkedRaw` and are displayed without inventing a match.
- 225 workbook records had no Redmaw name match; they remain in the catalog with their workbook acquisition text. Source-enumerated records without an exact location are tracked but not assigned a fabricated location.
- Same-name records in different groups (for example an Ash of War and the matching sorcery) stay distinct.
- Boss data merges 50 workbook encounters with 207 Redmaw rows (22 matched) plus 2 Tarnished Pack invasions for a 237-record ledger.

Live counters and source hashes are in `src/data/content-coverage.json` and surfaced in **Settings → Full-game content pack**.

## Beyond Redmaw

Redmaw's sheets do not enumerate every world object, upgrade pickup, crafting material, reference table or merchant stock, and several of its item sheets stop at “coming soon”. Six additive ledgers plus the full merchant inventory close those gaps without changing the 4,521-step route, the 2,325-item catalog, or the save schema. Every row keeps its source URL; rows a source cannot place stay marked unresolved rather than guessed.

| Surface | Where | Count | Boundary |
| --- | --- | --- | --- |
| World atlas | `/atlas` | 697 objects: 413 graces (105 DLC), 213 martyr effigies, 44 stranded souls, 14 sword monuments, 9 finger readers, 4 telescopes | Graces and monuments resolve against authoritative lists; effigies, souls and crones are partial lower bounds; telescopes are archived-only and marked unresolved |
| Upgrades | `/materials?tab=upgrades` | 725 pickups / 993 quantity: 50 Scadutree, 25 Revered, 45 Golden Seeds, 12 Sacred Tears, 267 smithing, 155 somber, 165 glovewort, 18 great glovewort | 138 pickups have an imprecise location; 101 enemy-drop leads are a separate ledger and never count toward completion |
| Crafting materials | `/materials?tab=materials` | 108 materials (69 base, 39 DLC; 58 environmental; 107 obtainable) | Matches 106 of 107 workbook materials; adds wiki-only Hidden Plumage (cut content) and keeps workbook-only Altus Bloom |
| Reference tables | `/resources` | 11 tables / 138 rows: soft caps, stone and glovewort costs, rune values, remembrance runes, Scadutree and Revered levels | Display-only; blank source cells stay blank |
| NPC walkthrough | `/journey?tab=npc` | 36 sections / 604 steps (26 base / 10 DLC; 130 optional, 98 missable) | Alternate area-ordered checklist; state is separate so it cannot inflate main-route progress |
| Branch plan | `/completion?tab=branch` | 27 decisions / 43 reward entries; 36 resolved (31 exact, 5 alias), 7 unresolved | Unresolved rewards are catalog-resolution gaps, labelled with the reason; journey availability comes only from the decision matrix |
| Merchant inventory | `/farms?tab=merchants` | 40 merchants / 627 purchasable items | 167-row workbook merchant ledger stays for objective links; 110 rows bridge to the full inventory |

These ledgers are additive. They do not replace the main route or questlines, and the seven beyond-Redmaw completion scopes are appended to the original nine, for **16 independent scopes** with no blended percentage.

**Dialogue is intentionally deferred.** The app tracks quest-critical actions, decisions, branch rewards and world pickups, not every spoken NPC line. Dialogue lines contribute to no scope denominator, and no page claims a dialogue corpus. The evidence, source list and per-category gaps are in `docs/audit/BEYOND_REDMAW_RELEASE.md` and `docs/audit/BEYOND_REDMAW_DATA.md`.

## Content provenance

### Full-game sources

- Redmaw base-game walkthrough — <https://eldenring.redmaw.dev/sheets/walkthrough>
- Redmaw Shadow of the Erdtree walkthrough — <https://eldenring.redmaw.dev/sheets/dlc-walkthrough>
- Redmaw item sheets — <https://eldenring.redmaw.dev/sheets/>
- Redmaw bosses — <https://eldenring.redmaw.dev/sheets/bosses>
- Redmaw questlines — <https://eldenring.redmaw.dev/sheets/questlines>
- Redmaw achievements — <https://eldenring.redmaw.dev/sheets/achievements>
- Redmaw New Game Plus — <https://eldenring.redmaw.dev/sheets/new-game-plus>
- Redmaw resources — <https://eldenring.redmaw.dev/sheets/resources>
- Redmaw NPC walkthrough — <https://eldenring.redmaw.dev/sheets/npc-walkthrough>
- Redmaw merchant inventory — <https://eldenring.redmaw.dev/sheets/merchants>
- wiki.gg — <https://eldenring.wiki.gg/> (Sites of Grace, Sword Monuments, Stranded Souls, Scadutree Fragments, Revered Spirit Ashes, Sacred Tears, crafting-material category)
- Fextralife — <https://eldenring.wiki.fextralife.com/> (finger-reader locations, Effigies of the Martyr, per-tier smithing-stone and glovewort pickup/drop lists)
- game-checklists — <https://game-checklists.com/elden-ring/all-golden-seeds> (45 Golden Seed pickups; the wiki.gg seed list is incomplete)
- IGN — <https://www.ign.com/wikis/elden-ring/Shadow_of_the_Erdtree_Great_Glovewort_Locations> (DLC Great Glovewort locations)
- Internet Archive — archived Fandom pages for Birdseye Telescopes and gap verification

The normalized inputs live in `research/`. Per-input SHA-256 hashes and observed counts are recorded in `src/data/content-coverage.json` and `docs/audit/FULL_GAME_DATA.md`. Beyond-Redmaw counts, rejection rules and per-category gaps are in `docs/audit/WORLD_INTERACTIONS_COVERAGE.md`, `docs/audit/UPGRADE_MATERIALS_COVERAGE.md`, `docs/audit/REFERENCE_COVERAGE.md`, and `docs/audit/BRANCH_PLAN.md`.

### Workbook seed

- `Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx`
- SHA-256: `9167efbd69b026f4ae844600ca3f63f5ab4234f58a0ba1057e4dc9c047897776`
- 79 worksheets (17 visible, 62 hidden)

The workbook remains the source for certified builds, tier lists, encounter presets, progression plans, and the supplemental whole-game chronology. It is never modified in place. Workbook item and boss records keep their stable IDs through the merge; legacy route IDs map only where a high-confidence match exists.

### Live game version

Verified against official Bandai Namco sources on **2026-10-21**:

- Live: **App Ver 1.17.2 / Regulation Ver 1.17.3** (released 2026-10-20).
- The **Tarnished Edition** launched 2026-08-28; patch 1.17 (2026-08-27) added the **Tarnished Pack**: Idus Knight and Heavy Knight classes, new weapons and armor, three Spectral Steed attires, and two NPC invasions.
- The workbook build/tier/encounter data is authored against **Regulation 1.16.1**. It predates the pack and the 1.17 balance pass, so those recommendations are explicitly labelled as baseline in **Patch & DLC**.

## Content pipeline

```bash
# 1. Optional: refresh the Redmaw research artifacts (network)
python3 scripts/research/fetch_route.py --refresh
python3 scripts/research/fetch_items.py --fetch
python3 scripts/research/fetch_world.py --refresh
python3 scripts/research/fetch_art.py --refresh

# 2. Refresh the beyond-Redmaw ledgers (network; writes research/ only)
python3 scripts/research/fetch_world_objects.py --refresh
python3 scripts/research/fetch_upgrades.py --refresh
python3 scripts/research/fetch_reference.py --refresh
python3 scripts/research/build_branch_plan.py

# 3. Rebuild the workbook seed (still workbook-only)
npm run extract          # = python scripts/extract_workbook.py

# 4. Merge research + workbook into the full-game pack
python3 scripts/build_full_content.py

# 5. Independently verify research artifacts and write the report
python3 scripts/research/verify_full_game.py --write-report docs/audit/FULL_GAME_RESEARCH_VERIFICATION.md
```

`npm run extract` intentionally does **not** build the full route: it regenerates the workbook JSON seed (`src/data/meta.json`, `items.json`, `route.json`, `world.json`, and related files). Run `scripts/build_full_content.py` afterward to produce `route.full.json`, `items.full.json`, `achievements.json`, `bosses.full.json`, `questlines.json`, `ngplus.json`, `content-coverage.json`, and `legacy-step-map.json`. The beyond-Redmaw generators write `research/world.json`, `upgrades.json`, `materials.json`, `resources.json`, `npc-walkthrough.json`, and `branch-plan.json`; their normalized runtime copies are `src/data/world.objects.json`, `upgrades.json`, `materials.full.json`, `resources.json`, `npc-walkthrough.json`, and `branch-plan.json`, and `src/data/merchants.full.json` mirrors the Redmaw merchant sheet. Those ledgers are additive and do not rewrite the route or catalog. The research contract, schemas, and expected counts are documented in `research/README.md`, `research/INTEGRATION.md`, and `research/BEYOND_REDMAW.md`. Workbook extraction expects the certified `.xlsx` at the repository root and requires Python with `openpyxl`; the research scrapers require `beautifulsoup4` and `lxml`.

## Architecture

```text
research/*.json              normalized Redmaw inputs + art manifest
src/data/route.full.json     full 4,521-step route and three phases
src/data/items.full.json     merged 2,325-item catalog
src/data/achievements.json   42 achievements + requirement groups
src/data/bosses.full.json    merged 237-encounter ledger
src/data/questlines.json     52 questlines / 587 steps
src/data/ngplus.json         12 NG+ sections / 68 items
src/data/world.objects.json  697 world objects + category status/gaps
src/data/upgrades.json       725 upgrade pickups / 993 quantity + drop leads
src/data/materials.full.json 108 crafting materials
src/data/resources.json      11 reference tables / 138 rows
src/data/npc-walkthrough.json  36-section / 604-step alternate route
src/data/branch-plan.json    27 decisions / 43 reward entries
src/data/merchants.full.json 40 merchants / 627 inventory rows
src/data/content-coverage.json  counts, source paths, SHA-256 hashes
src/data/game.ts             live version, Tarnished Pack, patch timeline
src/data/*.json              workbook seed (route, items, world, builds, farms, lore, tiers)
src/lib/types.ts             domain types
src/lib/data.ts              arrays + indexes (route, items, builds, world, farms, lore, tiers, atlas, upgrades, materials, resources, NPC walkthrough, branch plan)
src/lib/selectors.ts         progress, collection, achievement, boss, quest, NG+, lore, world, upgrade, material, merchant, NPC walkthrough, branch reward, equipment selectors
src/lib/store.ts             versioned localStorage state + actions + import/export + legacy step remap
src/lib/search.ts            global in-memory search index
src/pages/*                  feature modules
src/components/*             shell, command palette, UI primitives, icons, local art library
public/art                   bundled official store/press artwork
public/fonts                 Cinzel + EB Garamond WOFF2 subsets and OFL licenses
scripts/extract_workbook.py  workbook → seed JSON
scripts/build_full_content.py  research + seed → full-game JSON
scripts/research/*           Redmaw/wiki scrapers, beyond-Redmaw ledgers, branch builder, artwork fetch, independent verification
docs/audit/*                 audit, integrity, and full-game evidence
```

### State model

- **Character** owns lifetime data: item collection, farmable quantities, lore reads, endings, achievements, equipment, and journeys.
- **Journey** owns resettable data: route and supplemental status, notes, NPC/dialogue state, decisions, boss results, finite pickups, materials, merchants, scarabs, certifications, transition gates, remembrances, questline steps, the NG+ checklist, world-object checks, upgrade quantities, NPC-walkthrough steps, and manually revealed lore zones.
- Starting a new journey resets journey state while preserving lifetime collection, farmable quantities, lore reads, achievements, and endings.
- Completing a route step auto-acquires linked items, bosses, and resources where the source links them. Undo does not revoke ownership; collection edits are explicit.

Persistence is `localStorage` under `er-companion.state.v1`, debounced, with corrupt-state backup to `er-companion.state.corrupt`. Export/import is human-readable JSON in Settings. Older saves are normalized on load: new state maps (`worldChecks`, `upgradeCounts`, `npcWalkthroughSteps`) default empty, unknown future keys survive, and legacy `RTE-*` step IDs are remapped when a high-confidence match exists. Existing material and merchant keys retain the `MAT-*` and `MER-*` schemes, so the beyond-Redmaw ledgers require no save migration.

## Artwork, fonts, and licensing

- **Artwork** is official Steam store and press art for ELDEN RING (app 1245620) and ELDEN RING Shadow of the Erdtree (app 2778580), optimized and bundled under `public/art`. Nothing is hotlinked at runtime.
- **Fonts** are Cinzel and EB Garamond WOFF2 latin subsets licensed under the **SIL Open Font License 1.1**, bundled under `public/fonts` with license texts in `public/fonts/licenses/`. The app makes no external font request.
- Full asset-by-asset dimensions, source URLs, and license notes are in `docs/ART_CREDITS.md`; the fetch and verification contract is in `research/art/manifest.json`.

> **Unofficial fan project.** ELDEN RING and ELDEN RING Shadow of the Erdtree are trademarks of FromSoftware, Inc. and Bandai Namco Entertainment Inc. All game artwork, logos, and screenshots remain the property of their owners. This free, non-commercial project is not affiliated with, endorsed by, or sponsored by FromSoftware, Bandai Namco Entertainment, or Valve/Steam. Rights holders may request removal at any time.

The workbook and Redmaw sheets aggregate guide-derived content and third-party references. Before public distribution, review the rights for route prose, item data, maps, and images. This repository is a local companion build, not a legal clearance for republishing third-party guide content.

## Design

Dark, gold-accented, serif display type, dense-but-readable data surfaces. No UI framework, icon package, or external font request. The full content pack is bundled for offline use, and the PWA service worker precaches the app shell, artwork, and fonts.

## Remaining limitations

- **Build/tier baseline:** certified builds, tier rankings, encounter presets, weapon configurations, and upgrade plans still reflect Regulation 1.16.1. The 1.17 changes in **Patch & DLC** have not been folded back into those rankings.
- **Tarnished Pack sequencing:** the 27 pack records and 2 invasions are tracked in the collection and boss ledger, but are not yet inserted as route steps.
- **Progress migration:** only 62 legacy workbook step IDs map to the full route. Unmapped legacy `RTE-*` keys are dropped during normalization; non-legacy keys and lifetime data are preserved.
- **Coverage edges:** 3,788 route link labels remain unresolved, 225 workbook catalog records had no Redmaw match, and 68 duplicate name keys represent intentionally distinct records. The app does not fabricate links or locations for these.
- **Item locations:** 1,017 of 2,325 items have no recorded location and 930 are area-only. Both states are labelled; no place is invented.
- **World-object sources:** Stakes of Marika and Gatekeeper Statues have no authoritative per-object list and therefore zero rows. Finger readers, stranded souls and martyr effigies are partial lower bounds; the four Birdseye Telescopes come from an archived page and are marked unresolved. The Atlas shows each category's status and gap.
- **Upgrade locations:** 138 of 725 upgrade pickups have an imprecise location (97 regional, 40 page-level, 1 "Multiple"). Another 101 enemy-drop leads are excluded from the completion denominator.
- **Branch rewards:** 7 of 43 reward entries have no catalog row (Alexander's Innards, Ancient Dragon Smithing Stone ×2, Unalloyed Gold Needle, Zorayas's Letter, and the Eccentric's and Ansbach's sets at set level). They stay labelled with a reason; set components are still linked.
- **Merchant bridge:** 110 of 167 workbook merchant rows match the full inventory by normalized merchant + item name. The workbook ledger remains available for its objective links, but 627 is the completion denominator.
- **Dialogue:** intentionally deferred. Quest-critical actions, choices and rewards are tracked; spoken NPC lines are not, and no scope counts them.
- **Licensing:** third-party guide content, artwork, and marks require rights review before redistribution.
