# Workbook Data Dictionary

Source: `Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx`  
SHA-256: `9167efbd69b026f4ae844600ca3f63f5ab4234f58a0ba1057e4dc9c047897776`  
Size: 22,032,045 bytes  
Generated inventory: `docs/audit/WORKBOOK_INVENTORY.csv` (79 sheets)  
Machine evidence: `docs/audit/DATA_INTEGRITY.json`, `src/data/*.json`, Tarnished Pack overlay in `src/data/game.ts`

## Runtime scope note (2026-10-22)

This dictionary documents **workbook extraction**, not the final runtime catalog. Two boundaries matter:

- **Route Data is superseded.** The workbook's 994 Act I steps are the legacy migration input only. The runtime route is the full Redmaw route in `src/data/route.full.json`: **4,521 steps / 70 sections** (3,303 pre-DLC + 1,126 DLC + 92 endgame), ordered through Maliketh → the entire DLC → Ashen Capital → Endings → NG+ Preparation. See `docs/audit/FULL_GAME_DATA.md`.
- **Items, encounters, achievements, questlines and NG+ are merged catalogs.** The runtime item catalog is **2,325** (1,787 workbook + 538 Redmaw-only, including 27 pack records); encounters are **237**; achievements **42**; questlines **52 / 587**; NG+ **12 / 68**. The workbook remains the seed for builds, tiers, lore, farms and workbook-world domains, and every workbook ID is preserved.

The workbook facts below are retained because they describe the source artifact and the fields the build/lore/farm domains still use. Runtime counts are called out where they differ.

## Method and conventions

`scripts/extract_workbook.py` loads the workbook read-only with `openpyxl(..., data_only=True)`. Every worksheet is retained in memory only if it has at least one non-empty row. `WORKBOOK_INVENTORY.csv` reports **non-empty rows including headers, section titles and metadata rows**, so it does not equal record count. Record counts below are post-filter counts from the extraction script.

- Workbook state: 17 visible sheets, 62 hidden sheets, 79 total.
- Declared versions: workbook v12.44, Companion v10.44, production v1.1.0 (`Settings`).
- The hidden `Release Manifest` is older (v11.53, 69 sheets, 16 player tabs) and is treated as historical, not authoritative.
- `sourceRow` in canonical JSON is the 1-based worksheet row. The sheet name is not repeated inside each record.
- The extraction never writes to the workbook. No Apps Script or VBA source is included in the `.xlsx` export.
- The final app appends a non-workbook overlay from `src/data/game.ts`: 27 Tarnished Pack items, 2 Tarnished Pack encounters, and patch/version metadata, and merges the Redmaw research catalogs. Runtime arrays are therefore larger than the workbook extraction counts: 2,325 items and 237 encounters.
- **Observed:** sheet states, non-empty-row counts, workbook record counts, runtime overlay counts and source fields. **Inferred:** extraction-use labels and domain grouping where a sheet feeds multiple canonical entities.

## Sheet inventory

| Sheet | State | Non-empty rows | Extraction use |
|---|---|---:|---|
| START HERE | visible | 56 | not extracted |
| Dashboard | visible | 154 | not extracted |
| Journey Planner | visible | 258 | yes — 4 journeys |
| Choices & Consequences | visible | 34 | yes — 27 decisions |
| Character Planner | visible | 2617 | not extracted |
| Build Center | visible | 371 | not extracted |
| Armory & Fashion | visible | 2401 | not extracted |
| Tier Lists | visible | 895 | yes — 866 tier rows |
| Lore Companion | visible | 97 | yes — 69 entries |
| Master Completion | visible | 618 | partial — cues, gates, closeout, denominators |
| Supplemental Content | visible | 118 | yes — 116 actions |
| Farmable Collection | visible | 323 | yes — 318 farmables |
| Crafting Material Farms | visible | 112 | yes — 107 materials |
| Remembrance Planner | visible | 58 | yes — 25 remembrances |
| Endings & Achievements | visible | 21 | yes — 6 endings, 7 certifications |
| NPC & Dialogue Audit | visible | 98 | not extracted |
| External Resources | visible | 48 | yes — 5 references |
| Save & Journey Registry | hidden | 492 | not extracted |
| Build Tech Tree | hidden | 175 | yes — 123 nodes, 171 edges |
| Build Progression Loadouts | hidden | 99 | yes — 95 loadouts |
| Build Weapon Configurations | hidden | 580 | yes — 576 configs |
| Build Upgrade Planner | hidden | 389 | yes — 385 plans |
| Build Progression Sources | hidden | 68 | not extracted |
| Companion Data | hidden | 80 | not extracted |
| Route Guide | hidden | 1172 | not extracted (legacy duplicate route view) |
| Objectives | hidden | 95 | not extracted |
| Completion Units | hidden | 8 | yes — 6 units |
| Master Collectibles | hidden | 2107 | yes — 1,787 canonical of 2,105 rows |
| NPC States | hidden | 52 | yes — 51 states |
| Dialogue Events | hidden | 42 | yes — 41 events |
| Bosses & Encounters | hidden | 51 | yes — 50 workbook encounters (237 runtime after Redmaw + pack merge) |
| World States | hidden | 154 | yes — 153 states |
| Traversal | hidden | 65 | yes — 64 routes |
| Relationships | hidden | 77 | not extracted |
| Validation Log | hidden | 3056 | not extracted |
| Engineering | hidden | 95 | not extracted |
| Settings | hidden | 38 | not extracted (read for version context) |
| Objective Packages | hidden | 16 | not extracted |
| Permanent Collection | hidden | 1788 | yes — 1,787 items |
| Finite Resources | hidden | 319 | yes — 318 resources |
| Merchants | hidden | 168 | yes — 167 purchases |
| Knowledge Database | hidden | 14 | yes — 13 entries |
| Micro-Objectives | hidden | 72 | yes — 71 micro-objectives |
| Route Data | hidden | 995 | yes — 994 legacy Act I steps (superseded by `route.full.json`) |
| Objectives Data | hidden | 17 | yes — 16 objectives |
| Progression Matrix | hidden | 86 | not extracted |
| Dependency Matrix | hidden | 80 | yes — 75 dependencies |
| Encounter Metadata | hidden | 16 | partial — fields applied to encounters |
| Encounter Recommendations | hidden | 16 | partial — fields applied to encounters |
| Lockout Database | hidden | 35 | yes — 30 lockouts |
| Regional Audit Template | hidden | 27 | not extracted |
| Act I Collection Audit | hidden | 83 | not extracted |
| Scarab Audit | hidden | 112 | yes — 107 scarabs |
| Act I Reconciliation | hidden | 72 | not extracted |
| Build Catalog | hidden | 20 | yes — 18 archetypes |
| Build Profiles | hidden | 30 | yes — 28 profiles |
| Build Loadouts | hidden | 110 | yes — 108 loadouts |
| Six Futures | hidden | 8 | yes — 5 future rows in `meta` |
| Inventory Coverage Audit | hidden | 58 | not extracted |
| Engineering Audit | hidden | 1788 | not extracted |
| Operational Acceptance | hidden | 17 | not extracted |
| Release Manifest | hidden | 283 | not extracted |
| Build Encounter Presets | hidden | 2209 | yes — 2,206 presets |
| Build Incantation Analysis | hidden | 365 | not extracted |
| Build Spell Packages | hidden | 178 | yes — 159 packages |
| Build Resource Presets | hidden | 401 | yes — 388 presets |
| Build Buff Matrix | hidden | 91 | yes — 88 buffs |
| Build Boss Strategies | hidden | 927 | yes — 924 strategies |
| Build Specialist Strategies | hidden | 313 | not extracted |
| Build Named Boss Strategies | hidden | 507 | not extracted |
| Build Named Boss Audit | hidden | 124 | not extracted |
| Build Acquisition Gates | hidden | 658 | not extracted |
| Build Production Certification | hidden | 473 | not extracted |
| Build Weapon Diversity Audit | hidden | 118 | not extracted |
| Build Weapon Analysis | hidden | 731 | not extracted |
| Build Equipment Analysis | hidden | 244 | not extracted |
| Upgrade Dependency Index | hidden | 1347 | not extracted |
| Finite Resource Allocation | hidden | 291 | not extracted |
| Collection Intelligence Index | hidden | 15546 | not extracted |

## Canonical extraction mapping

| Domain | Source sheet(s) and header | Canonical location | Records | Key source fields |
|---|---|---|---:|---|
| Route steps (workbook) | `Route Data` row 1 header, data rows 2–995 | `route.json` → `steps`; legacy input to `legacy-step-map.json` | 994 | ID, Act, Completion Unit, Objective ID, Objective/Step Order, Step Type, Instruction, Required, Linked IDs, Prerequisites, Warning, Location, Validation, Route Decision, Skip Allowed, Return Window, Lockout Risk, Estimated Time |
| Route areas | Derived from `Route Data` plus `Completion Units` | `route.json` → `areas` | 8 (7 route + Tutorial) | Area name, objective IDs, step counts, required counts, description, validation |
| Objectives | `Objectives Data` | `route.json` → `objectives` | 16 | ID, completion unit, order, name, location, requirement, prerequisite, summary, validation |
| Micro-objectives | `Micro-Objectives` | `route.json` → `microObjectives` | 71 | ID, objective ID, order, name, location, type, required, prerequisite, route range, completion rule, URL |
| Completion units | `Completion Units` (header row 2) | `meta.json` → `completionUnits` | 6 | ID, act, name, order, validation, description, objective total |
| Supplemental actions | `Supplemental Content` (header row 2) | `route.json` → `supplemental`; `chronologyAreas` | 116; 49 areas | ID, journey, area, area order, category, action, trigger, missable, source URL, coverage, future journey, notes, research status |
| Items | `Master Collectibles` + `Permanent Collection`; Redmaw research; runtime overlay `game.ts` | `items.full.json` → 2,325 merged records (workbook `items.json` 1,787 + 538 Redmaw-only, including 27 pack records) | 1,787 workbook / 2,325 runtime | Permanent ID, category, name, region, location, acquisition type, status, objective link, route link, missable, validation, source URL, notes, game. Pack records use `TP-*` IDs, `game: "Tarnished Pack"`, `sourceRow: 0` |
| Encounters | `Bosses & Encounters`, `Encounter Metadata`, `Encounter Recommendations`; Redmaw research; runtime overlay `game.ts` | `bosses.full.json` → 237 merged encounters (50 workbook + 185 Redmaw-only + 2 pack) | 50 workbook / 237 runtime | ID, name, region, location, type, required, validation, route link, act, boss flags, achievement, quest/missable flags, level/weapon/flask/ash/strategy recommendations. Pack records use `TP-ENC-*` IDs |
| Starting classes | Not a workbook sheet; `src/lib/classes.ts` | `CLASSES` | 12 | ID, name, level, eight stats, blurb. 10 base classes + Idus Knight + Heavy Knight, added from 1.17 sources |
| NPC states | `NPC States` | `world.json` → `npcStates` | 51 | ID, NPC, region, milestone, route link, validation, warning |
| Dialogue events | `Dialogue Events` | `world.json` → `dialogueEvents` | 41 | ID, NPC, location, trigger, route link, warning, validation, notes |
| World states | `World States` | `world.json` → `worldStates` | 153 | ID, name, region, trigger, target state, route link, validation, notes |
| Traversal | `Traversal` | `world.json` → `traversal` | 64 | ID, name, region, location, state, route link, prerequisite, validation, notes |
| Lockouts | `Lockout Database` (header row 2) | `world.json` → `lockouts` | 30 | ID, act, area, trigger, type, changes, severity, reversible, safe window, pre-checks, objective, route link, status |
| Dependencies | `Dependency Matrix` (header row 2) | `world.json` → `dependencies` | 75 | ID, act, area, event, depends-on, unlocks, changes, lockout risk, timing, objective, route link, rationale |
| Knowledge | `Knowledge Database` | `world.json` → `knowledge` | 13 | ID, category, title, region, location, unlock timing, objective, route link, spoiler level, validation, URL, guidance |
| Lore | `Lore Companion` (header row 3) | `lore.json` → `entries` | 69 | ID, journey, area, unlock condition, area order, summary, characters, evidence, questions, later context, chronicle, source contract, URL |
| Decisions | `Choices & Consequences` (header row 7) | `meta.json` → `decisions` | 27 | ID, game, category, title, decision point, deadline, outcomes, journey/future results, completion requirement |
| Endings | `Endings & Achievements` (header row 5) | `meta.json` → `endings` | 6 | Order, ending, Steam achievement, recovery state, permanent flag, after-completion action |
| Certifications | `Endings & Achievements` (header row 13) | `meta.json` → `certifications` | 7 | ID, order, name, timing, purpose, mandatory, notes |
| Journeys | `Journey Planner` rows 3–6 | `meta.json` → `journeys` | 4 | Name, purpose, route scope, ending target, alternate choices, remembrance/duplicate plan, cleanup, entry requirements, status |
| Six Futures | `Six Futures` | `meta.json` → `sixFutures` | 5 | Order, recovery state, ending, after-completion, permanent. The fifth row combines Age of Order and Age of Stars |
| Remembrances | `Remembrance Planner` (header row 3) | `meta.json` → `remembrances` | 25 | Name, boss, game, reward A/B/C, journey selections/duplications, NG+ need, duplicate target, location, class, priority, URL. Includes `Elden Remembrance`; test-covered |
| Trophy cues | `Master Completion` numeric TROPHY rows | `meta.json` → `trophyCues` | 12 | Order, area, cue, flags, source step, boundary |
| Transition gates | `Master Completion` `LCK-P22C-*` rows | `meta.json` → `transitionGates` | 16 | ID, trigger, game, area, severity, safe window, pre-check, status, notes |
| Merchant closeout | `Master Completion` `MCO-P22F-*` rows | `meta.json` → `merchantCloseout` | 22 | ID, merchant, scope, obligation, deadline, authority, coverage, validation, notes |
| Category denominators | `Master Completion` rows 612–624 | `meta.json` → `categoryDenominators` | 13 | Category, complete, denominator, base, DLC, state, claim rule. `total` now reads the denominator column and is test-verified (Armor 704 / 559 / 145) |
| Farmables | `Farmable Collection` (header row 5) | `farms.json` → `farmables` | 318 | ID, game, item, category, slot, source, location, grace, drop rate/type, target quantity, timing, validation, URL, coverage, notes |
| Materials | `Crafting Material Farms` (header row 5) | `farms.json` → `materials` | 107 | ID, game, name, category, renewability, early/late source, grace, method, purchasable, merchant, finite-before-unlock, priority, use, verification, URL |
| Finite resources | `Finite Resources` | `farms.json` → `finiteResources` | 318 | ID, type, name, tier, quantity, region, location, acquisition type, objective, route link, eventually purchasable, validation, URL |
| Merchants | `Merchants` | `farms.json` → `merchants` | 167 | ID, merchant, item, category, cost, stock, priority, objective, route link, missable, validation, URL, notes |
| Scarabs | `Scarab Audit` (header row 5) | `farms.json` → `scarabs` | 107 | ID, game, region, section/order, behavior, location, reward/type, quantity, collection ID, route reference |
| Archetypes | `Build Catalog` (header row 2) | `builds.json` → `archetypes` | 18 | ID, name, priority stats, fantasy, research status, shared/recommended class, family role, parent, family, variant, disposition, selection policy |
| Profiles | `Build Profiles` (header row 2) | `builds.json` → `profiles` | 28 | ID, archetype ID/name, level, class, eight stats, calculated level, primary/secondary stat, role, package, regulation, status, URL, notes |
| Loadouts | `Build Loadouts` (header row 2) | `builds.json` → `loadouts` | 108 | ID, build ID, archetype, level, type, primary/secondary weapon and skill, offhand, shield, armor, talismans, package, physick |
| Tech tree | `Build Tech Tree` (header row 4) | `builds.json` → `techNodes`, `techEdges` | 123 / 171 | Node identity, type, stage, level bounds, stats, origin, loadout/requirement IDs, edges with transitions and boundaries |
| Progression loadouts | `Build Progression Loadouts` (header row 4) | `builds.json` → `progressionLoadouts` | 95 | ID, node, stage, level, role, weapons/configs, catalyst, armor, talismans, spell package, physick, upgrade plan, survival class, status, notes |
| Weapon configs | `Build Weapon Configurations` (header row 5) | `builds.json` → `weaponConfigs` | 576 | ID, weapon, item class, build context, stage, role, recommendation class, skill/affinity, buffable, stat fit, tier/rank |
| Upgrade plans | `Build Upgrade Planner` (header row 5) | `builds.json` → `upgradePlans` | 385 | ID, node, config, weapon, track, owned/combat state, current/minimum/recommended/stop upgrades, replacement, resource, archetype |
| Encounter presets | `Build Encounter Presets` (header row 3) | `builds.json` → `encounterPresets` | 2,206 | ID, build, archetype, level, encounter type, target, loadout, priority, equipment overrides, package, physick, great rune, flask, consumables |
| Boss strategies | `Build Boss Strategies` (header row 3) | `builds.json` → `bossStrategies` | 924 | ID, preset, build, level, route order, boss, location, loadout, weapon/skill, talismans, package, physick, flask, buffs, phase plans, safe/damage/tool/avoid |
| Spell packages | `Build Spell Packages` (header row 3) | `builds.json` → `spellPackages` | 159 | ID, build, archetype, level, name, role, modes, ten slots, tools, pre-fight, hard swap |
| Resource presets | `Build Resource Presets` (header row 3) | `builds.json` → `resourcePresets` | 388 | ID, preset, build, level, target, flask split, FP math, buffs, use order, conflicts, risk |
| Buffs | `Build Buff Matrix` (header row 3) | `builds.json` → `buffs` | 88 | ID, source, type, category, effect, duration, recommendation, conflicts, stacking, resource policy, URL |
| Tier entries | `Tier Lists` six sections | `tiers.json` → `entries` | 866 | List, rank, tier, name, class/pool or effect/duration/role/ceiling/limitation, notes |
| External resources | `External Resources` (header row 2) | `meta.json` → `externalResources` | 5 | Priority, name, role, when to use, coverage, required, URL, audit, notes |
| Patch / live version | Not workbook content; `src/data/game.ts` | `GAME_VERSION`, `DATA_BASELINE`, `PATCHES`, `PATCH_IMPACTS`, `PACK_HIGHLIGHTS` | 4 releases; 7 impact groups; 5 highlights | Live app/regulation versions, checked date, sources, 1.16.1 baseline note, patch summaries, affected systems |

## Derived versus source fields

**Source-derived and retained:** IDs, names, categories, locations, acquisition text, route links, warnings, validations, stats, loadout equipment, strategy prose, ranks, source URLs, source row. Tarnished Pack records are source-authored in `game.ts`, not workbook-derived.

**Derived by the application/extractor, not authored in the workbook:**

- `route.steps.order`, `area`, `objectiveName`, `linkedIds`, `routeStepIds`, `autoStepId`.
- `areas` and `chronologyAreas`, including step/required counts and supplemental-only Tutorial.
- `item.group` from category (or supplied by the pack overlay); `item.game` from region prefix or pack constant; `routeStepIds` and `autoStepId`.
- `itemRegions` (mixed game/geographic labels), `itemGroups`, `bossStrategyTargets`, `routeAreaCounts`.
- Archetype `familyRole` is source; navigation/search indexes and completion percentages are app-derived.
- `meta.counts` are workbook extraction counts, not final runtime counts. Runtime `ITEMS` is 2,325 and `ENCOUNTERS` is 237 after the Redmaw merge and pack overlay.

## Extraction constraints and coverage limits

1. **Route Data is legacy.** The workbook contains 994 Act I steps and its completion ledger claims 4,477. It is retained as the source for `legacy-step-map.json` (62 of 994 map to the new route), but the runtime route is `route.full.json` at 4,521 steps / 70 sections. `Route Guide` (1,172 non-empty rows) is not extracted and appears to be a legacy/duplicated route surface.
2. **Finite resources are not permanent items.** `Master Collectibles` has 2,105 data rows; 1,787 match permanent IDs and join `Permanent Collection`. The remaining 318 correspond to finite-resource rows and are modeled in `farms.json`. The workbook catalog is 1,787; the merged runtime catalog is 2,325 (1,787 workbook + 538 Redmaw-only, including 27 pack records). It is not 2,105, and the 1,960 workbook category aggregate is not the runtime denominator.
3. **Acquisition detail was enriched during integration.** The 1,467 workbook `Phase 26E` placeholders no longer appear at runtime. All 1,947 placeholder/slot/catalog locations were replaced: 930 became route-section areas with the step instruction in `acquisitionText`; 1,017 were cleared and are labeled unrecorded. Runtime location quality is 378 exact / 930 area-only / 1,017 unrecorded of 2,325.
4. **Item region is not a geographic key for many rows.** Workbook rows often use a game tag; merged Redmaw and pack rows use section or location labels. Do not treat `counts.itemRegions` as a region completion denominator.
5. **Remembrance extraction is complete.** All 25 data rows, including `Elden Remembrance`, are extracted; the test suite asserts the count and presence.
6. **Workbook trophy cues differ from the runtime achievement catalog.** The workbook cue section heading says 0/42, but only 12 numbered cue rows exist. The 3 platform ending achievements on `Endings & Achievements` are a separate workbook field. The runtime achievement catalog is the 42-row Redmaw research set with 4 requirement groups; workbook cue rows are not its denominator.
7. **Progression loadout fields were corrected during integration.** Talismans read 14–17, spell package reads 18, physick reads 19–20, and upgrade/status/notes align. The runtime record now exposes `spellPackage`, `requiredEquipment`, `upgradePlanId`, and `status`; a test asserts the corrected prompt.
8. **Category denominators were corrected during integration.** `total` now reads column 2; a test asserts Armor 704 with base 559 + DLC 145. The 13-category workbook aggregate (1,960) remains documentation of the workbook taxonomy; the runtime collection scope uses the merged catalog denominator of 2,325.
9. **Tarnished Pack is outside the workbook denominator.** The 27 items and 2 encounters are appended from official/guide sources and are not part of the workbook's 1,960 aggregate or 50-encounter ledger.
10. **Linked-ID validation is incomplete.** `DOMAIN_INDEXES` covers only COL, ENC, NPC, DIA, WS, TRV, RES, FRM, MIC, RTE, SUP and OBJ. Route-step links to DEP, MER, KN, LCK and SCB therefore appear unresolved even when the records exist. VAL and REC have no canonical dataset; one FRM token is genuinely missing.
11. **Range expansion is positional.** `RTE-X:RTE-Y` expands by index order within the canonical domain. It is deterministic but depends on source ordering; no explicit range type or cycle check exists.
12. **No formula evaluation.** `data_only=True` reads cached values. Derived workbook formulas (completion percentages, ratios, acceptance checks) are not recalculated.
13. **No Apps Script.** The `.xlsx` export contains no script source. Dashboard automation, validation routines and protected-input behavior are not reproducible from this artifact.
14. **Not extracted:** character planner, armory/fashion inventory surfaces, relationships, validation log, engineering/audit records, save/journey registry, acquisition gates, finite-resource allocation, named/specialist boss sheets, weapon/equipment analysis, and the 15,546-row collection intelligence index. These remain source evidence, not app data.
15. **Provenance is partial.** Every workbook record has `sourceRow`, but the sheet is implied by domain. Item `sourceRow` is the `Master Collectibles` row; the joined `Permanent Collection` row is not retained. Pack records use `sourceRow: 0` and a `TP-*` ID. There is no cell-level provenance or content version ID per record.
16. **Coverage is a content snapshot.** It is not proof of game completeness, current patch coverage, platform achievements, or redistribution rights. The workbook's own coverage note still says 47 chronology areas; the extracted count is 49.
