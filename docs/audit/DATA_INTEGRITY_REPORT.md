# Data Integrity Report — Full-Game Integration

Workbook: `Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx`  
Workbook SHA-256: `9167efbd69b026f4ae844600ca3f63f5ab4234f58a0ba1057e4dc9c047897776`  
Workbook size: 22,032,045 bytes; 79 sheets (17 visible, 62 hidden)  
Research inputs: `research/route.base.json`, `route.dlc.json`, `items.json`, `achievements.json`, `bosses.json`, `questlines.json`, `ngplus.json`, `art/manifest.json` (hashes in `src/data/content-coverage.json`)  
Runtime overlay: `src/data/game.ts` (27 Tarnished Pack items, 2 encounters, 2 classes, patch metadata)  
Evidence: `src/data/content-coverage.json`, `docs/audit/DATA_INTEGRITY.json` (workbook-extraction snapshot), `WORKBOOK_INVENTORY.csv`, `src/data/*.json`, final build/test, source-cell spot checks  
Audit date: 2026-10-22. No workbook cell was modified.

## 1. Summary

| Check | Result | Basis |
|---|---|---|
| Extraction errors (workbook) | 0 | `DATA_INTEGRITY.json.errors` is empty |
| Research verification | 64 PASS / 3 FAIL, all resolved during integration | `FULL_GAME_RESEARCH_VERIFICATION.md` |
| Route steps | **4,521** across **70 sections** | 3,303 pre-DLC + 1,126 DLC + 92 endgame |
| Base / DLC split | 3,395 base + 1,126 DLC | `route.full.json.counts` |
| Required / missable steps | 4,307 required; **206 missable** | 167 pre-DLC + 38 DLC + 1 Ashen Capital |
| Final item catalog | **2,325** | 1,787 workbook + 538 Redmaw-only; 1,562 workbook rows matched Redmaw; 27 pack records replaced Redmaw duplicates |
| Item merge | 1,562 matched; 538 Redmaw-only; 225 unmatched workbook retained; 27 pack merged | Every workbook ID survives |
| Item route links | 1,118 linked | `routeStepIds` / `autoStepId` |
| Item location quality | **378 exact / 930 area-only / 1,017 unrecorded** | Runtime `itemLocationKind`; no placeholder text |
| Boss ledger | **237** | 50 workbook (22 matched to Redmaw) + 185 Redmaw-only + 2 pack |
| Achievements | **42** | 9 Misc / 24 Bosses / 6 Shardbearers / 3 Endings |
| Achievement requirement groups | 4 groups / 30 linked items | All 30 resolve to the item catalog |
| Questlines | **52 / 587 steps** | 13 DLC questlines / 136 DLC steps |
| NG+ checklist | **12 sections / 68 items** | 13 DLC-tagged steps |
| Duplicate canonical IDs | 0 detected | Extractor/merge checks plus tests |
| Blank canonical IDs | 0 | All serialized records have an ID |
| Research link resolution | 1,502 of 5,290 labels resolve to catalog records; 51 relative hrefs resolved | 3,788 labels remain display-only |
| Legacy progress map | **62 of 994** old `RTE-*` steps mapped | Conservative text matching |
| Final tests | **28 passed** in 1 file | Includes route order, missables, merge, achievements, questlines, NG+, legacy remap, scopes |
| Final build | Passed | JS 16,643.32 kB / gzip 1,759.91 kB; CSS 122.67 kB / gzip 21.34 kB; 36 precache entries / 19,505.53 KiB |

**Resolved during integration:** the denominator column, progression-loadout field alignment, remembrance extraction, route scope, item placeholders, achievement/cue ambiguity, and relative research links are fixed and test-covered. They are no longer defects.

## 2. Identifier and duplicate integrity

- **0 duplicate IDs** across route steps, items, encounters, NPCs, dialogue, world, traversal, finite resources, farmables, micro-objectives, supplemental actions, objectives, archetypes, profiles, loadouts, tech nodes/edges, progression loadouts, weapon configs, upgrade plans, encounter presets, boss strategies, spell packages, resource presets, buffs, achievements, questline steps and NG+ steps. Tests assert route ID uniqueness and pack uniqueness.
- **0 blank IDs** in serialized records.
- IDs are stable domain keys; route order is a separate derived field.
- Route IDs are `RW-B-*` (base) and `RW-D-*` (DLC), with `sectionId`/`order` carrying chronology. Legacy `RTE-*` IDs survive only in `legacy-step-map.json` as migration keys.
- **68 duplicate-name keys** remain in the merged item catalog. These are intentional same-name records across groups or acquisition instances (for example `Golden Vow` incantation vs Ash of War; `Beast Claw` weapon vs spell; `Stonesword Key` × 3). UI identity uses ID, never name.
- Boss names repeat as distinct location encounters; the 237 ledger includes repeat encounters (Tree Sentinel, Night's Cavalry, Deathbird, etc.) with distinct IDs.

## 3. Route integrity and chronology

- Global order is contiguous 1–4,521 across 70 sections. The first DLC step is order **3304**; the first Ashen Capital step is **4433**.
- Phases: `Base Game — through Maliketh` (3,303), `Shadow of the Erdtree` (1,126), `Base Game — endgame` (92).
- The `farum-azula` section is split after `w46-96` (post-Maliketh point of no return); `w46-97..99` form a synthetic aftermath section after the DLC.
- Phase gates: `GATE-DLC` before `west-gravesite` and `GATE-ASHEN-CAPITAL` before the endgame. The Ashen gate filters missables in Capital Outskirts, Leyndell Royal Capital, and Forbidden Lands.
- Sections: 46 pre-DLC base + 20 DLC + 1 synthetic aftermath + 3 base endgame = 70. Section titles and per-section step counts are in `route.full.json.areas`.
- The obsolete 4,477 ledger claim is not used by the runtime. It is retained only in workbook documentation as a source claim.

## 4. Missable reconciliation (168 + 38 = 206)

| Phase | MISSABLE badge | Text-only warning | Total |
|---|---:|---:|---:|
| Base pre-DLC | 165 | 2 (`w8-61`, `w9-15`) | 167 |
| Base endgame | 0 | 1 (`w46-96`) | 1 |
| DLC | 37 | 1 (`d12-29`) | 38 |
| **Total** | **202** | **4** | **206** |

- The integration contract named 170 base missables. The source contains 165 MISSABLE badges plus 4 observable text-only warnings and one trophy-only marker (`w46-91`). The widest any-marker union is 169; the build preserves the 168 observable badge-or-text warnings instead of inventing two.
- No missable row was dropped to satisfy a denominator.
- `missable` is set from MISSABLE/IMPORTANT badges or warning text (missable, unobtainable, locked out, point of no return), case-insensitively. Source-numbered badges such as `#2 MISSABLE` are handled by substring match.
- Tests assert missable steps exist in both games and that the DLC phase remains after the Maliketh split.

## 5. Item catalog merge and location quality

### 5.1 Merge arithmetic

| Step | Count |
|---|---:|
| Workbook permanent items | 1,787 |
| Redmaw raw rows | 2,116 |
| Redmaw parsed after 13 placeholders | 2,103 |
| Redmaw deduped | 2,100 |
| Workbook rows matched by normalized name + compatible group | 1,562 |
| Unmatched workbook rows retained | 225 |
| New Redmaw-only records | 538 (511 keep `RW-ITEM-*` after 27 pack replacements) |
| Tarnished Pack records merged by name | 27 |
| **Final catalog** | **2,325** (1,787 + 538; 538 includes the 27 pack records) |

- Every one of the 1,787 workbook IDs survives; the merge test asserts this explicitly.
- Name-only matching is never used: normalized name **plus** compatible group/category. `Beast Claw` (weapon vs spell) and same-name Ash of War/sorcery pairs remain distinct.
- Redmaw-only IDs are `RW-ITEM-<slug>`; pack records remain `TP-COL-*` with `sourceRow: 0`.
- The 1,960 workbook category denominator and its taxonomy are documented in §8 but are not the runtime collection denominator. The runtime denominator is 2,325.

### 5.2 Location quality

| Quality | Count | Meaning |
|---|---:|---|
| Exact | **378** | Location is a concrete place, not an area, section or slot label |
| Area-only | **930** | Location is a route section name; the step instruction is stored in `acquisitionText` |
| Unrecorded | **1,017** | Placeholder cleared because no route proof existed; the UI labels it unrecorded |
| **Total** | **2,325** | |

- All 1,947 bogus/placeholder/slot/`Redmaw catalog` locations were removed. No `Phase 26E`, slot label, category label, or catalog-label value remains user-visible as a location.
- 1,118 items have route links (`routeStepIds` or `autoStepId`); 1,695 carry Redmaw acquisition prose in `acquisitionText`. Acquisition prose is guidance, not an exact map coordinate, so it is not counted as exact location.
- **Current gap:** 1,017 unrecorded + 930 area-only = 1,947 items without an exact location. Enrichment needs source data; the app must not fabricate locations.

## 6. Achievements, bosses, questlines, NG+

### 6.1 Achievements — 42

- Section split: Misc 9, Bosses 24, Shardbearers 6, Endings 3.
- 42 unique IDs and 42 unique names; 42 descriptions and 42 wiki links.
- 4 legendary requirement groups with 30 items: Armaments 9, Ashen Remains 6, Sorceries & Incantations 7, Talismans 8. All 30 resolve to the merged item catalog.
- The workbook's 12 numbered trophy cue rows and 3 named platform ending achievements are separate workbook concepts; the runtime achievement catalog is the 42-row research set. The old "42 cues vs 12 rows" ambiguity no longer determines the completion denominator.
- Achievement state is companion state (`character.achievements`), not Steam/Xbox/PlayStation telemetry.

### 6.2 Bosses — 237

- Workbook 50 preserved by ID; 22 matched to Redmaw names; 185 Redmaw-only appended as `RW-BOSS-*`; 2 Tarnished Pack invasions added.
- 157 unique Redmaw names across 207 rows; 50 repeated names are distinct location encounters and are intentionally retained.
- 142 bosses are route-linked; 42 are DLC encounters; 30 carry achievement references that resolve to the 42 achievement names.
- The 924 workbook boss strategies remain the strategy library; not every ledger row has a dedicated strategy.

### 6.3 Questlines — 52 / 587

- 52 questlines, 587 steps, IDs stable and contiguous; 13 DLC questlines / 136 DLC steps.
- 135 optional steps; 91 missable steps (89 plain + 2 source-numbered `#2/#4 MISSABLE` badges).
- 395 links, all absolute after normalization; 308 steps carry no link.
- Questline step state is per-journey (`journey.questlineSteps`).

### 6.4 NG+ — 12 / 68

- 12 sections, 68 steps, 68 unique IDs, contiguous section/step orders.
- 60 links, all absolute; 1 MISSABLE badge; 13 DLC-tagged steps; 0 optional.
- NG+ state is per-journey (`journey.ngplusChecklist`).

## 7. Link and reference integrity

- **Route entity links:** 5,290 link labels across 4,521 steps. 1,502 resolve to catalog items or bosses and populate `linkedIds`; 3,788 remain display-only labels. A display-only label is not a broken link — it is prose or a location/wiki reference that has no matching canonical record.
- **Relative research hrefs:** 51 (49 base + 2 DLC) were resolved against `https://eldenring.redmaw.dev` with `urljoin`. The verifier's two absolute-URL FAILs are closed in the integrated output.
- **Item → route:** 1,118 items resolve to at least one step; every `routeStepIds` entry is checked against the route index by test.
- **Boss → route:** 142 bosses resolve; the encounter-link test passes.
- **Build references:** profile/loadout/config/preset references resolve; test passes.
- **Known workbook-extraction warnings:** `DATA_INTEGRITY.json` reports DEP 91, VAL 120, MER 101, KN 14, LCK 8, SCB 21, REC 13, FRM 3 for the 994-step workbook route. DEP/MER/KN/LCK/SCB are validator-index scope false positives (records exist); VAL 78 unique and REC 2 unique have no canonical dataset; `FRM-A1-STV-0004` is genuinely absent. This concerns the legacy workbook route only, not `route.full.json`.

## 8. Workbook row-count reconciliation (extraction snapshot)

Non-empty rows include headers, titles and spacer rows. This table documents the workbook extraction; the runtime columns reflect the integrated catalogs. The machine artifact `DATA_INTEGRITY.json` is the pre-Redmaw extraction snapshot (994 workbook route steps and its workbook+pack overlay); `content-coverage.json` is the integrated truth.

| Domain / sheet | Non-empty rows | Workbook canonical | Runtime canonical |
|---|---:|---:|---:|
| Route Data | 995 | 994 | 4,521 (`route.full.json`, legacy workbook route retained as migration input) |
| Route Guide | 1,172 | 0 | 0 (legacy duplicate surface) |
| Objectives Data | 17 | 16 | 70 |
| Micro-Objectives | 72 | 71 | 0 (superseded by section objectives) |
| Completion Units | 8 | 6 | 6 (workbook metadata) |
| Supplemental Content | 118 | 116 | 116 |
| Master Collectibles | 2,107 | 1,787 | 2,325 |
| Permanent Collection | 1,788 | 1,787 | 1,787 workbook IDs preserved |
| Finite Resources | 319 | 318 | 318 |
| Bosses & Encounters | 51 | 50 | 237 |
| Encounter Metadata | 16 | fields only | fields applied |
| Encounter Recommendations | 16 | fields only | fields applied |
| NPC States | 52 | 51 | 51 |
| Dialogue Events | 42 | 41 | 41 |
| World States | 154 | 153 | 153 |
| Traversal | 65 | 64 | 64 |
| Lockout Database | 35 | 30 | 30 |
| Dependency Matrix | 80 | 75 | 75 |
| Knowledge Database | 14 | 13 | 13 |
| Lore Companion | 97 | 69 | 69 |
| Choices & Consequences | 34 | 27 | 27 |
| Endings & Achievements | 21 | 6 endings + 7 certifications | 6 endings / 7 certifications; 42 achievements from research |
| Journey Planner | 258 | 4 | 4 |
| Six Futures | 8 | 5 | 5 |
| Remembrance Planner | 58 | 25 | 25 |
| Master Completion | 618 | 12 cues + 16 gates + 22 closeout + 13 denominators | workbook metadata; runtime uses 9 completion scopes |
| Farmable Collection | 323 | 318 | 318 |
| Crafting Material Farms | 112 | 107 | 107 |
| Merchants | 168 | 167 | 167 |
| Scarab Audit | 112 | 107 | 107 |
| Build Catalog | 20 | 18 | 18 |
| Build Profiles | 30 | 28 | 28 |
| Build Loadouts | 110 | 108 | 108 |
| Build Tech Tree | 175 | 123 nodes + 171 edges | 123 / 171 |
| Build Progression Loadouts | 99 | 95 | 95 |
| Build Weapon Configurations | 580 | 576 | 576 |
| Build Upgrade Planner | 389 | 385 | 385 |
| Build Encounter Presets | 2,209 | 2,206 | 2,206 |
| Build Boss Strategies | 927 | 924 | 924 |
| Build Spell Packages | 178 | 159 | 159 |
| Build Resource Presets | 401 | 388 | 388 |
| Build Buff Matrix | 91 | 88 | 88 |
| Tier Lists | 895 | 866 | 866 |
| External Resources | 48 | 5 | 5 |
| Research: questlines | n/a | n/a | 52 / 587 |
| Research: NG+ | n/a | n/a | 12 / 68 |
| Research: achievements | n/a | n/a | 42 / 4 groups / 30 items |
| Tarnished Pack overlay | n/a | 27 items; 2 encounters; 2 classes | merged |
| Art / fonts | n/a | 17 images; 7 fonts | bundled |

## 9. Completion scopes

The runtime reports nine independent scopes, each with numerator and denominator:

| Scope | Denominator | Source |
|---|---:|---|
| Route | 4,521 | `route.full.json.steps` |
| Collection | 2,325 | `items.full.json.items` |
| Achievements | 42 | `achievements.json.achievements` |
| Bosses | 237 | `bosses.full.json.encounters` |
| Quests | 587 | `questlines.json` steps |
| Lore | 69 | `lore.json.entries` |
| Endings | 6 | `meta.endings` |
| Remembrances | 25 | `meta.remembrances` |
| NG+ | 68 | `ngplus.json` steps |

- No single weighted whole-game percentage is computed or displayed.
- The workbook's 1,960 category denominator and 4,477 ledger claim are not runtime denominators. They remain documentation of the workbook's own taxonomy.
- A test asserts every scope reports a real denominator.

## 10. Legacy progress migration

- `legacy-step-map.json` maps old `RTE-*` IDs to new `RW-*` IDs using normalized-text similarity with an area preference (token Dice ≥ 0.55; global fallback ≥ 0.65).
- **Observed:** 62 of 994 old steps map. 932 have no high-confidence match.
- Unmapped `RTE-*` keys are dropped by `normalizeJourney`; unknown non-`RTE-*` keys are preserved.
- A test seeds an old ID, remaps it, and survives a save reload.
- **Impact:** a user with Act I progress from the pre-integration build may lose completed-step flags. This is a real migration limitation, not a UI defect; a content-version pin or positional migration is not implemented.

## 11. Resolved during integration

| Previous defect | Resolution | Evidence |
|---|---|---|
| Route was Act I only (994 steps) | Replaced by the 4,521-step full route with DLC after Maliketh | Route order/missable tests; `FULL_GAME_DATA.md` |
| DLC had no route | 20 sections / 1,126 steps / 38 missables integrated | Phase-boundary test |
| Catalog was 1,814 | Merged to 2,325 with workbook IDs preserved | Merge test |
| 237 encounters missing | 50 workbook + 185 Redmaw-only + 2 pack merged | Boss ledger test |
| 3 achievements only | 42 achievements with 4 groups / 30 items | Achievement test |
| Questlines absent | 52 / 587 integrated with journey state | Questline test |
| NG+ checklist absent | 12 / 68 integrated | NG+ test |
| 1,467 placeholder item locations | All 1,947 placeholders replaced or cleared; 0 placeholder strings remain | Location classification |
| 51 relative research links | Resolved with `urljoin` against Redmaw | `content-coverage.json` `relativeResolved: 51` |
| Base missable 170 vs 169/168 | Reconciled to 168 observable base missables (206 total) | Missable test |
| Denominator read "Complete" | `total` reads column 2; Armor 704 / 559 / 145 | Test asserts |
| Progression talismans/spells/physick shifted | Fields 14–20 aligned; `PLOAD-P0-MELEE` test | Test asserts |
| Remembrance coverage | 25/25 including `Elden Remembrance` | Test asserts |
| Mobile overflow | 390 px sweep passes | `innerWidth == scrollWidth` |
| Offline claim unverified | Offline reload verified with controlling SW | Drill |

## 12. Remaining defects and limitations

### 12.1 Data coverage

- **1,017 items have no location** and **930 have area-only locations**; 378 are exact. Acquisition prose exists for 1,695 records but is not a map location.
- **Legacy migration covers 62/994** old steps.
- **Build/tier freshness:** all 28 profiles cite Regulation 1.16.1 while live is 1.17.2 / 1.17.3.
- **Workbook-extraction link warnings:** VAL/REC and one FRM remain genuine for the legacy Act I route; six other domains are validator-index false positives.
- **Workbook coverage note** still says 47 chronology areas; actual is 49.
- **Counters in `meta.json`** remain workbook metadata (1,787 items, 50 encounters, 12 cues, 13 denominators). Runtime pages and the Settings coverage card read `route.full.json` / `content-coverage.json` (2,325 items, 237 encounters, 4,521 steps); the workbook counters are retained for workbook domain provenance, not displayed as the catalog total.
- 64 of 1,787 workbook items have no source URL; 14 of 71 micro-objectives have no source URL.
- One upgrade-plan `configId` does not resolve to a weapon-config ID.

### 12.2 Claims that remain bounded

- **No platform telemetry.** Achievements and endings are companion state; Steam/Xbox/PlayStation unlocks cannot be verified.
- **No single completion percentage.** Nine scopes are shown separately.
- **No 1.17-current ranking claim.** Builds, tiers and boss recommendations are labeled 1.16.1 baseline.
- **No full location guarantee.** Unrecorded and area-only rows are labeled as such.
- **No public-distribution clearance.** Redmaw-derived route prose, wiki facts and official art remain subject to a rights decision.

## 13. Source discrepancies and claim boundaries

| Claim | Observed source | Status |
|---|---|---|
| 79 sheets / 17 visible | Settings + workbook | Confirmed |
| 69 sheets / 16 player tabs | Release Manifest | Stale |
| Workbook v12.44 / Companion v10.44 | Settings | Authoritative workbook snapshot |
| Workbook v11.53 / Companion v9.53 | Release Manifest title | Stale |
| 4,477 route steps | Workbook Master Completion | Source claim; runtime uses 4,521 |
| 1,960 persistent items | Workbook 13 categories | Workbook aggregate; runtime catalog is 2,325 |
| 2,105 master collectibles | Master Collectibles | 1,787 permanent + 318 finite |
| 170 base missables | Integration contract | 168 observable badge-or-text warnings preserved |
| 42 trophy cues | Workbook heading | 12 numbered rows; runtime achievements are the 42 research rows |
| 3 ending achievements | Workbook `Endings & Achievements` | True for platform endings; runtime tracks 42 achievements |
| 96 NPC/dialogue audit | Workbook Master Completion | 51 NPC + 41 dialogue = 92 records |
| 47 chronology areas | Workbook coverage note | 49 actual |
| Regulation 1.16.1 | All 28 build profiles | Predates 1.17.2 / 1.17.3 |

## 14. Hash and provenance strategy

- Workbook SHA-256 is stored in `DATA_INTEGRITY.json.source.sha256` and `meta.json.source.sha256`.
- Independently recomputed: `9167efbd...897776`; size `22,032,045`. Match.
- Research artifact hashes are recorded in `content-coverage.json.sources`.
- The workbook is excluded from git by `*.xlsx`; there is no committed source copy.
- Each extraction overwrites JSON and integrity output; there is no output hash diff gate or per-record content version.
- `sourceRow` is retained for workbook records; sheet identity is implicit in the domain. Item `sourceRow` is the `Master Collectibles` row, not the joined `Permanent Collection` row. Pack records use `sourceRow: 0`; Redmaw records carry research row provenance.
- **Recommended:** read-only source copy + `.sha256`, content-pack version in every JSON envelope, and extraction failure on unexpected hash change. Not implemented.

## 15. Sample spot checks

| Check | Source | Final canonical | Result |
|---|---|---|---|
| First route step | `route.base.json` `w1-1` | `RW-B-w1-1`, order 1, Starting Out | Pass |
| DLC boundary | `route.dlc.json` first step | Order 3304, `Shadow of the Erdtree` | Pass |
| Last route step | `route.base.json` `w49-37` | `RW-B-w49-37`, order 4521, NG+ Preparation | Pass |
| Maliketh split | `w46-96` warning | End of pre-DLC phase; `w46-97..99` after DLC | Pass |
| Missable count | badges + text | 168 base + 38 DLC = 206 | Pass |
| Workbook ID preservation | `COL-A1-WL-0000` | Present in merged catalog | Pass |
| Redmaw-only item | `rw-weapons-e29-1` (`Beast Claw`) | Distinct from spell record | Pass |
| Location placeholder | any `Phase 26E` string | 0 occurrences; 1,017 labeled unrecorded | Pass |
| Boss merge | 50 workbook IDs | All present; 237 total | Pass |
| Achievement groups | 4 groups / 30 items | All 30 resolve | Pass |
| Questlines | 52 / 587 | Matches source | Pass |
| NG+ | 12 / 68 | Matches source | Pass |
| Legacy map | seeded `RTE-*` | Remaps to `RW-*` and survives reload | Pass |
| Tier list | `Tier Lists` | 866 entries, ranks sorted per list | Pass at count level |

## 16. Severity and release impact

| Severity | Finding | Impact |
|---|---|---|
| Critical | Licensing unresolved for Redmaw-derived route prose, wiki facts and official art | Public distribution remains gated |
| High | 1,017 item locations unrecorded; 930 only area-level | Exact pickup guidance exists for 378 of 2,325 |
| High | Legacy migration maps 62/994 old steps | Pre-integration saves may lose completed-step flags |
| High | Build/tier/boss rankings are 1.16.1 baseline | Recommendations not re-validated for 1.17.2 / 1.17.3 |
| Medium | Accessibility audit absent | Keyboard/screen-reader/contrast risk |
| Medium | No E2E or CI; 28 tests are selector-level | Store, import/export and UI regressions can ship |
| Medium | 16.64 MB single JS chunk | Low-end initial-load risk |
| Medium | Offline install/update/quota drill pending | Recovery behavior unproven |
| Medium | No save migration registry/content pin | Future content changes may break imports |
| Low | Stale workbook `meta.counts` and Release Manifest labels | Documentation/labeling risk |
| Resolved | Route scope, DLC order, catalog merge, achievements, questlines, NG+, placeholders, relative hrefs, missable denominator, denominator column, progression fields, remembrance | Fixed and test-covered |

**Bottom line:** the route, catalogs, achievements, bosses, questlines, NG+ and theme are integrated and verified. The remaining data defects are item-location precision, legacy-save migration, 1.17 freshness and provenance/licensing — not missing UI or missing content scope. Completion claims are bounded per scope, and no whole-game percentage is asserted.
