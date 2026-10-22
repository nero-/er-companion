# Data Integrity Report — Final Integration

Source: `Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx`  
SHA-256: `9167efbd69b026f4ae844600ca3f63f5ab4234f58a0ba1057e4dc9c047897776`  
Size: 22,032,045 bytes; 79 sheets (17 visible, 62 hidden)  
Runtime overlay: `src/data/game.ts` (27 Tarnished Pack items, 2 encounters, 2 classes, patch metadata)  
Evidence: `DATA_INTEGRITY.json`, `WORKBOOK_INVENTORY.csv`, `src/data/*.json`, final build/test, source-cell spot checks  
Audit date: 2026-10-22. No workbook cell was modified.

## 1. Summary

| Check | Result | Basis |
|---|---|---|
| Extraction errors | 0 | `DATA_INTEGRITY.json.errors` is empty |
| Integrity warning families | 1 aggregate | Unresolved linked IDs by domain |
| Duplicate canonical IDs | 0 detected | Extractor checks plus audit scan across every collection, including the pack |
| Blank canonical IDs | 0 | All serialized records have an ID |
| Duplicate display names | 66 names / 67 extra rows | Distinct variants/acquisition instances; no duplicate ID |
| Workbook permanent items | 1,787 | `items.json` |
| Final runtime catalog | **1,814** | 1,787 workbook + 27 Tarnished Pack |
| Workbook encounters | 50 | `world.json` |
| Final runtime encounters | **52** | 50 workbook + 2 Tarnished Pack |
| Starting classes | **12** | 10 base + Idus Knight + Heavy Knight |
| Exact workbook item-location placeholders | 1,467 | 1,074 base + 393 DLC |
| Route reconciliation | 994 extracted vs 4,477 claimed | 3,483 steps absent |
| Completion denominator | 1,960 | 13 workbook categories; not comparable to 1,814 without a bridge |
| Remembrance extraction | 25/25 | Includes `Elden Remembrance`; test-covered |
| Trophy cue reconciliation | 12 extracted vs 42 claimed | Only 12 numbered cue rows exist |
| Platform ending achievements | 3 | Separate from route cues |
| Final tests | 18 passed in 1 file | Includes denominator, progression, remembrance and pack tests |
| Final build | Passed | 58 modules; JS 11,756.98 kB / gzip 1,288.85 kB; CSS 82.37 kB / gzip 14.73 kB; 9 precache entries; 11,563.40 KiB |

**Resolved during integration:** the denominator column, progression-loadout field alignment, and remembrance extraction are fixed and test-covered. They are no longer defects.

## 2. Identifier and duplicate integrity

- **0 duplicate IDs** across route, items, encounters, NPCs, dialogue, world, traversal, finite resources, farmables, micro-objectives, supplemental actions, objectives, archetypes, profiles, loadouts, tech nodes/edges, progression loadouts, weapon configs, upgrade plans, encounter presets, boss strategies, spell packages, resource presets and buffs. The final test also asserts 27 unique Tarnished Pack IDs.
- **0 blank IDs** in serialized records. Rows that do not match an expected ID pattern are filtered before serialization.
- IDs are stable domain keys; route order is a separate derived field. Pack records use `TP-*` / `TP-ENC-*` IDs and `sourceRow: 0`.
- 66 display names repeat; 67 extra rows. Only two repeat within one category:
  - `Stonesword Key` × 3 (`COL-A1-WP-0001`, `COL-A1-WP-0004`, `COL-A1-STV-0007`): corpse, merchant purchase, second pickup.
  - `Cracked Pot` × 2 (`COL-A1-WL-0018`, `COL-A1-WP-0003`): corpse and purchase.
- Other repeats are cross-domain homonyms (`Golden Vow` incantation vs Ash of War) or armor variants. UI identity must use ID, not name.

## 3. Orphan and unresolved links

`DATA_INTEGRITY.json` records:

```text
{'DEP': 91, 'VAL': 120, 'MER': 101, 'KN': 14, 'LCK': 8, 'SCB': 21, 'REC': 13, 'FRM': 3}
```

These are occurrence counts from route-step `linkedRaw` tokens. 247 of 994 route steps contain at least one token absent from the validator's 12-domain index.

| Domain | Occurrences | Unique | Referencing steps | Actual status |
|---|---:|---:|---:|---|
| DEP | 91 | 28 | 75 | All 28 exist in `world.dependencies`; validator index omits DEP |
| VAL | 120 | 78 | 105 | No `VAL-*` dataset; genuine unresolved validation references |
| MER | 101 | 96 | 36 | All 96 exist in `farms.merchants`; validator index omits MER |
| KN | 14 | 7 | 14 | All 7 exist in `world.knowledge`; validator index omits KN |
| LCK | 8 | 4 | 5 | All 4 exist in `world.lockouts`; validator index omits LCK |
| SCB | 21 | 11 | 15 | All 11 exist in `farms.scarabs`; validator index omits SCB |
| REC | 13 | 2 | 13 | No `REC-*` dataset; genuine unresolved recommendation references |
| FRM | 3 | 1 | 3 | `FRM-A1-STV-0004` genuinely absent from 318 farmables |

**Genuine unresolved:** 81 unique tokens (VAL 78, REC 2, FRM 1), 136 occurrences. Six warning domains are validator-scope false positives. No item has a `linkedRouteRaw` that fails to resolve to a route step.

**Inferred cause:** `DOMAIN_INDEXES` still covers only COL, ENC, NPC, DIA, WS, TRV, RES, FRM, MIC, RTE, SUP and OBJ. Fix the validator scope or model VAL/REC explicitly.

## 4. Row-count reconciliation

Non-empty rows include headers, titles and spacer rows. The final runtime counts add the pack overlay where noted.

| Domain / sheet | Non-empty rows | Final canonical | Delta and reason |
|---|---:|---:|---|
| Route Data | 995 | 994 | Header |
| Route Guide | 1,172 | 0 | Legacy route surface, not extracted |
| Objectives Data | 17 | 16 | Header |
| Micro-Objectives | 72 | 71 | Header |
| Completion Units | 8 | 6 | Two header rows |
| Supplemental Content | 118 | 116 | Two header rows |
| Master Collectibles | 2,107 | 1,787 workbook / 1,814 runtime | 2,105 data rows; 318 finite IDs excluded; +27 pack |
| Permanent Collection | 1,788 | 1,787 | Header |
| Finite Resources | 319 | 318 | Header |
| Bosses & Encounters | 51 | 50 workbook / 52 runtime | Header; +2 pack |
| Encounter Metadata | 16 | fields only | Partial rows augment encounters |
| Encounter Recommendations | 16 | fields only | Partial rows augment encounters |
| NPC States | 52 | 51 | Header |
| Dialogue Events | 42 | 41 | Header |
| World States | 154 | 153 | Header |
| Traversal | 65 | 64 | Header |
| Lockout Database | 35 | 30 | Header plus section rows |
| Dependency Matrix | 80 | 75 | Header plus section rows |
| Knowledge Database | 14 | 13 | Header |
| Lore Companion | 97 | 69 | Header plus blank/notes rows |
| Choices & Consequences | 34 | 27 | Header/metadata rows |
| Endings & Achievements | 21 | 6 endings + 7 certifications | Two sections, headers |
| Journey Planner | 258 | 4 | Rows 3–6 only |
| Six Futures | 8 | 5 | One row combines Age of Order and Age of Stars |
| Remembrance Planner | 58 | 25 | 25 data rows; headers/notes account for the remainder |
| Master Completion | 618 | 12 cues + 16 gates + 22 closeout + 13 denominators | Multiple sections |
| Farmable Collection | 323 | 318 | Two header/status rows |
| Crafting Material Farms | 112 | 107 | Two header/status rows |
| Merchants | 168 | 167 | Header |
| Scarab Audit | 112 | 107 | Header/metadata rows |
| Build Catalog | 20 | 18 | Header/status rows |
| Build Profiles | 30 | 28 | Header/status rows |
| Build Loadouts | 110 | 108 | Header/status rows |
| Build Tech Tree | 175 | 123 nodes + 171 edges | Dual node/edge columns |
| Build Progression Loadouts | 99 | 95 | Header/status rows; fields now aligned |
| Build Weapon Configurations | 580 | 576 | Header/status rows |
| Build Upgrade Planner | 389 | 385 | Header/status rows |
| Build Encounter Presets | 2,209 | 2,206 | Header/status rows |
| Build Boss Strategies | 927 | 924 | Header/status rows |
| Build Spell Packages | 178 | 159 | Header/status/filtered rows |
| Build Resource Presets | 401 | 388 | Header/status/filtered rows |
| Build Buff Matrix | 91 | 88 | Header/status rows |
| Tier Lists | 895 | 866 | Header plus six section headers |
| External Resources | 48 | 5 | Header/metadata rows |
| Tarnished Pack overlay | n/a | 27 items; 2 encounters; 2 classes | `game.ts` + `classes.ts` |

## 5. Required reconciliations

### 5.1 Route: 994 vs 4,477

- `Route Data`: **994** steps (`RTE-A1-WL-0001` … `RTE-A1-AUD-0012`).
- Completion ledger at `Master Completion` row 598: **4,477**.
- Missing: **3,483**.
- Areas: West Limgrave 135, East Limgrave 90, Weeping Peninsula 188, Castle Morne 73, Stormhill 105, Stormveil Castle 401, Act I Exit Audit 2. Tutorial has supplemental actions only.
- **Conclusion:** the app route is Act I. The 4,477 figure is a source claim, not migrated data.

### 5.2 Persistent items: 1,814 runtime vs 1,960 denominators

- Workbook permanent records: **1,787**.
- Tarnished Pack records: **27**.
- Final runtime catalog: **1,814**.
- Workbook denominator sum across 13 categories: **1,960** (9 true whole-game, 4 coverage-qualified).
- The denominator predates the Tarnished Pack and is not a superset of the runtime taxonomy.

| Category (workbook) | Base | DLC | Denominator | Final catalog | Difference |
|---|---:|---:|---:|---:|---:|
| Armor | 559 | 145 | 704 | 518 | -186 |
| Ash of War | 91 | 25 | 116 | 116 | 0 |
| Casting Tool | 27 | 5 | 32 | 32 | 0 |
| Cookbook / Recipe | 59 | 45 | 104 | 122 | +18 |
| Crystal Tear | 29 | 8 | 37 | 37 | 0 |
| Incantation | 101 | 28 | 129 | 129 | 0 |
| Key / Unique Collectible | 25 | 5 | 30 | 30 | 0 |
| Shield | 69 | 10 | 79 | 63 | -16 |
| Sorcery | 70 | 14 | 84 | 84 | 0 |
| Spirit Ash | 64 | 20 | 84 | 86 | +2 |
| Talisman | 115 | 39 | 154 | 157 | +3 |
| Tool / Unique Collectible | 32 | 7 | 39 | 49 | +10 |
| Weapon | 281 | 87 | 368 | 307 | -61 |
| **Mapped total** |  |  | **1,960** | **1,730** | **-230** |
| Unmapped catalog categories (key items, gestures, flasks, maps, upgrade materials, 3 Steed Attires, etc.) |  |  |  | **84** |  |
| **Runtime catalog total** |  |  |  | **1,814** |  |

- The 27 pack records add 16 Armor, 6 Weapon, 2 Shield and 3 Steed Attire entries. Only 24 fall into the 13 workbook categories; the 3 attires are unmapped.
- Catalog **exceeds** the denominator for Cookbook/Recipe, Spirit Ash, Talisman and Tool, so a simple "missing count" is invalid.
- **Do not display 1,960 as the app's collection denominator, and do not compute a single whole-game percentage across the 1.16.1 workbook denominator and the pack overlay.**

### 5.3 The 318 master rows are finite resources

- `Master Collectibles`: 2,105 data rows.
- `Permanent Collection`: 1,787 rows.
- `Finite Resources`: 318 rows.
- Permanent ∩ finite = **0**; permanent ∪ finite = **2,105**.
- **Conclusion:** the 318 difference is exactly the finite-resource registry. The runtime catalog is 1,787 + 27 pack = 1,814; finite resources remain separate.

### 5.4 Remembrance: 25/25

- `Remembrance Planner`: 25 data rows (rows 4–28); all 25 are canonical records.
- `Elden Remembrance` (Elden Beast) is included.
- **Observed:** 25 source rows, 25 records. The test suite asserts both the count and the presence of `Elden Remembrance`.

### 5.5 Trophy cues: 12 vs 42; 3 achievements

- `Master Completion` heading says "0/42"; only 12 numbered TROPHY rows exist (rows 637–648); extraction returns 12.
- `Endings & Achievements` reports 0/3 Steam ending achievements: Lord of Frenzied Flame, Elden Lord, Age of the Stars.
- The 42 figure is a route-cue claim, not a platform achievement denominator. The app does not claim all achievements are tracked.

### 5.6 Tarnished Pack integration

- 27 items, all with `TP-COL-*` IDs, exact location text and official/guide source links.
- 2 encounters: Knight Leontiel and Broken Gold Mask, both marked missable.
- 2 classes: Idus Knight (level 7) and Heavy Knight (level 10), both stat-consistent by test.
- 4 patch/release entries, 7 impact groups, 5 pack highlights in `game.ts`.
- These records are not in the workbook's 1,960 denominator or 50-encounter ledger. Counters in `meta.json` remain workbook-only: 1,787 items and 50 encounters. The Settings content-coverage card displays the workbook count; runtime pages display 1,814 and 52.

### 5.7 Other workbook claims

- `DATA_INTEGRITY.json` coverage note says 47 chronology areas; actual is **49**.
- `Settings` says 79 sheets / 17 visible; `Release Manifest` says 69 / 16. Settings matches the workbook; manifest is historical.
- `Settings` says workbook v12.44 / Companion v10.44; manifest title says v11.53 / v9.53.
- `Master Completion`: 9 true whole-game denominators, 4 coverage-qualified.
- `Six Futures` title has **5 rows**; the last combines Age of Order and Age of Stars.

## 6. Resolved during integration

| Previous defect | Resolution | Evidence |
|---|---|---|
| Denominator read "Complete" instead of denominator | `total` now reads column 2 | Armor 704 / base 559 / DLC 145; test asserts |
| Progression talismans/spells/physick shifted | Talismans 14–17, spell package 18, physick 19–20, upgrade/status/notes aligned | `PLOAD-P0-MELEE` test; `spellPackage`, `physick`, `upgradePlanId`, `status` |
| Remembrance coverage | All 25 rows extracted, including `Elden Remembrance` | 25/25 assertion in the test suite |
| Ten placeholder pages | Journey, Collection, Builds, Character, Bosses, Quests, Lore, Farms, Tiers, Completion implemented | 13-route desktop/mobile sweep |
| Tarnished Pack absent | 27 items, 2 encounters, 2 classes, patch metadata appended | Tarnished integration test |
| Mobile horizontal overflow | 390 px sweep passes | `innerWidth == scrollWidth` on 13 routes |
| Offline claim unverified | Offline reload verified | SW on 4173; 9-entry precache; Dashboard renders offline; 0 errors |

The denominator and progression defects must not remain in the severity list or backlog as open extraction work.

## 7. Remaining field-level defects and limitations

### 7.1 Item location/region

- 1,467 workbook items have `location = "Exact acquisition location queued for Phase 26E"`; 90 carry placeholder missable deadlines.
- 320 workbook items have concrete acquisition/route records; the 27 pack items all have exact locations.
- `region` is a game tag for 1,467 workbook rows and a geographic label for 320 workbook + 27 pack rows.
- **Impact:** final runtime catalog can show identity/ownership for all 1,814, but exact guidance exists for 347 (320 workbook + 27 pack).

### 7.2 Remaining count/semantic defects

- Trophy cues 12 vs 42; 3 platform ending achievements.
- Runtime counters vs workbook counters (1,814/52 vs 1,787/50).
- Validator warning scope.
- 47-area note.
- Denominator taxonomy (not extraction).
- 1.16.1 build/tier baseline.

### 7.3 Data completeness

- 487/994 route steps have blank validation; 477 blank warning; 818 blank prerequisites.
- 14/71 micro-objectives have no source URL; 64/1,787 workbook items have no source URL.
- 320 items have route links; 316 have objective IDs; 7 are starting-class owned.
- One upgrade-plan `configId` does not resolve to a weapon-config ID.

## 8. Source discrepancies and claim boundaries

| Claim | Observed source | Status |
|---|---|---|
| 79 sheets / 17 visible | Settings + workbook | Confirmed |
| 69 sheets / 16 player tabs | Release Manifest | Stale |
| Workbook v12.44 / Companion v10.44 | Settings | Authoritative snapshot |
| Workbook v11.53 / Companion v9.53 | Release Manifest title | Stale |
| 4,477 route steps | Master Completion | Claim only; 994 exported |
| 1,960 persistent items | 13 categories | Mixed aggregate; not comparable to 1,814 |
| 2,105 master collectibles | Master Collectibles | 1,787 permanent + 318 finite |
| 1,787 workbook items | items.json | Confirmed; 1,814 runtime after pack |
| 50 encounters | world.json | Confirmed; 52 runtime after pack |
| 25 remembrances | Remembrance Planner | 25/25 extracted; test-covered |
| 42 trophy cues | Master Completion heading | 12 cue rows |
| 3 ending achievements | Endings & Achievements | 3 named |
| 96 NPC/dialogue audit | Master Completion | 51 NPC + 41 dialogue = 92 records; audit sheet 98 non-empty rows, not extracted |
| 47 chronology areas | Integrity coverage note | 49 actual |
| Regulation 1.16.1 | All 28 build profiles | Predates 1.17.2 / 1.17.3 |

## 9. Hash and provenance strategy

- Workbook SHA-256 is stored in `DATA_INTEGRITY.json.source.sha256` and `meta.json.source.sha256`.
- Independently recomputed: `9167efbd...897776`; size `22,032,045`. Match.
- The workbook is excluded from git by `*.xlsx`; there is no committed source copy.
- Each extraction overwrites JSON and integrity output; there is no output hash, diff gate or per-record content version.
- `sourceRow` is retained for workbook records; sheet identity is implicit in the domain. Item `sourceRow` is the `Master Collectibles` row, not the joined `Permanent Collection` row. Pack records use `sourceRow: 0`.
- **Recommended:** read-only source copy + `.sha256`, content-pack version in every JSON envelope, and extraction failure on unexpected hash change. Not implemented.

## 10. Sample spot checks

| Check | Source | Final canonical | Result |
|---|---|---|---|
| First route step | `Route Data` row 2, `RTE-A1-WL-0001` | Same ID, instruction, links, order 0 | Pass |
| Last route step | `Route Data` row 995, `RTE-A1-AUD-0012` | Order 993 | Pass |
| Collection item | `Permanent Collection` row 2, `COL-A1-WL-0000` | Name/category/location/link match | Pass |
| Encounter | `Bosses & Encounters` row 2, `ENC-A1-WL-0001` | Name/region/location/link match | Pass |
| Lore | `Lore Companion` row 4, `LOR-J1-001` | Area/order/RAW/contract match | Pass |
| Denomination | `Master Completion` row 612, Armor | 704 total / 559 base / 145 DLC | Pass — fixed |
| Progression | `PLOAD-P0-MELEE` | Physick, upgrade plan, status correct | Pass — fixed |
| Tarnished item | `TP-COL-IDUS-SWORD` | Exact location/source; unique ID | Pass |
| Tarnished encounter | `TP-ENC-LEONTIEL` | Name/region/location/missable | Pass |
| Remembrance | `Elden Remembrance` | Present; 25/25 records | Pass |
| Trophy cues | `Master Completion` heading vs rows | 42 claim / 12 rows | Fail — source discrepancy |
| Tier list | `Tier Lists` | 866 entries, ranks sorted per list | Pass at count level |

## 11. Severity and release impact

| Severity | Finding | Impact |
|---|---|---|
| Critical | Route is 22% of claimed steps (994/4,477) | Cannot claim whole-game route completion |
| Critical | Completion denominator/taxonomy bridge missing | No trustworthy single completion percentage |
| High | 1,467 workbook item locations are placeholders | Guidance exists for only 347/1,814 |
| High | 12 cues vs 42; 3 achievements | Achievement/completion claims remain bounded |
| Medium | Runtime counters differ from workbook counters | Labels must distinguish 1,814/52 from 1,787/50 |
| Medium | Unresolved VAL/REC/FRM references | Broken route-detail cross-links |
| Medium | 1.16.1 build/tier baseline | Recommendations not current for 1.17.2 |
| Low | Stale 47-area note / Release Manifest | Documentation inconsistency |
| Resolved | Denominator column; progression field shift | Fixed and test-covered |

**Bottom line:** the implementation and build are real and verified. The remaining data defects are scope, reconciliation, freshness and provenance issues, not missing UI. Completion claims must stay bounded until those are resolved.
