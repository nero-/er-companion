# Feature Crosswalk — Workbook → Canonical Data → Application

Final integration state: commit `2ceedc0`, 2026-10-22.  
Foundation commit: `b7c6c76c31067de07042cc15d822db443aaf34de`.  
Evidence: final `npm run build`, `npm test` (18 tests), desktop and 390 px sweeps of 13 routes, offline reload, backup/restore and new-journey drills, plus source inspection.

**Observed:** files, data wiring, counts and the listed verification results. **Inferred:** priority and the impact of the remaining data/scope gaps. Status is not a claim of exhaustive interaction testing.

## Status definitions

- **VERIFIED** — implemented, wired to real canonical data, and loaded without console/page errors in the final desktop/mobile sweeps. Not every control is E2E-tested.
- **PARTIAL** — implemented with a known scope, data-freshness, reconciliation, or accessibility limitation.
- **MISSING** — no implementation.
- **BLOCKED** — external prerequisite prevents completion.
- Priority: **P0** release/data correctness; **P1** remaining core data work; **P2** platform/hardening.

## Crosswalk

| Domain | Workbook source | Canonical data | App module (file) | Status | Evidence / test | Gap | Priority |
|---|---|---|---|---|---|---|---|
| Full-game guided route | `Route Data`, `Master Completion` ledger | `route.json` 994 steps | `pages/JourneyPage.tsx` | **PARTIAL / BLOCKED** | Act I journey renders; ledger claims 4,477 | 3,483 route steps absent; source/rights required | P0 |
| Act I route content | `Route Data` rows 2–995 | 994 steps, 7 route areas, 16 objectives, 71 micro-objectives | `lib/data.ts`; `pages/JourneyPage.tsx` | **VERIFIED** | Desktop/mobile route sweep; route ID/order/objective tests | Only Act I | P1 |
| Next action and step completion | `Route Data` required/order fields | `STEP_BY_ID`, `STEPS_BY_AREA`, `AUTO_ITEMS_BY_STEP` | `DashboardPage.tsx`; `JourneyPage.tsx`; `store.setStepStatus` | **VERIFIED** | Dashboard next action; done/skip/defer/undo; backup restored 2 steps; selector tests | No automated reload test in `npm test` | P1 |
| Directions / navigation | Instruction, Location, Warning, Prerequisite | `route.steps` fields | `JourneyPage.tsx`; `DashboardPage.tsx` | **PARTIAL** | Step list/detail renders directions, warnings, prerequisites | No map or turn-by-turn guidance; Act I only | P1 |
| Supplemental chronology | `Supplemental Content` | 116 actions; 49 areas | `JourneyPage.tsx`; `selectors.nextSupplemental` | **VERIFIED** | Chronology tab renders; 13-route sweep | No missing-data limitation beyond source | P1 |
| Collection catalog | `Master Collectibles` + `Permanent Collection`; `game.ts` overlay | workbook 1,787 + 27 pack = **1,814** | `CollectionPage.tsx`; `selectors.collectionSummary` | **VERIFIED** | Collection route; filters/search/ownership; 1,814 runtime items; tests for equipment matching | 1,467 workbook items lack exact locations | P1 |
| Item exact locations | `Permanent Collection` Phase 26E fields; pack guide data | 320 workbook + 27 pack exact; 1,467 placeholders | `ItemDrawer.tsx`; Collection detail | **PARTIAL** | Placeholder text is labelled, not presented as fact | Source enrichment for 1,074 base + 393 DLC | P0 |
| Farmables | `Farmable Collection` | 318 | `FarmsPage.tsx`; `store.setFarmable` | **VERIFIED** | Farms route; quantity/target actions wired | No E2E automation | P1 |
| Materials | `Crafting Material Farms` | 107 | `FarmsPage.tsx`; `store.setMaterialStock` | **VERIFIED** | Farms tab; actions wired | Three journey-limited materials need prominent warnings | P1 |
| Merchants | `Merchants` | 167 | `FarmsPage.tsx`; `store.setMerchant` | **VERIFIED** | Farms tab; purchase action wired | Denominator story still workbook-scoped | P1 |
| Finite resources and scarabs | `Finite Resources`, `Scarab Audit` | 318 finite; 107 scarabs | `FarmsPage.tsx`; store actions | **VERIFIED** | Farms tabs; actions wired | Scarab route IDs do not auto-link to the Act I route | P1 |
| NPC states and dialogue | `NPC States`, `Dialogue Events` | 51 NPC states; 41 dialogue events | `QuestsPage.tsx` | **VERIFIED** | Quests route; NPC/dialogue filters and toggles | No quest-chain visualisation | P1 |
| Decisions and lockouts | `Choices & Consequences`, `Lockout Database`, `Dependency Matrix` | 27 decisions; 30 lockouts; 75 dependencies | `QuestsPage.tsx`; store actions | **VERIFIED** | Quests tabs; decision/lockout/dependency views | No automated branch-state tests | P1 |
| Bosses and encounters | `Bosses & Encounters`; `game.ts` overlay | workbook 50 + 2 pack = **52** | `BossesPage.tsx`; `store.setBossStatus` | **VERIFIED** | Bosses route; filters/status; 52 runtime encounters | Only 33 bosses have strategy rows | P1 |
| Boss strategy presets | `Build Boss Strategies`, `Build Encounter Presets` | 924 strategies; 2,206 presets | `BossesPage.tsx`; `BuildsPage.tsx` | **VERIFIED / PARTIAL** | Preset/strategy views; build references tested | 1.16.1 baseline; pack invasions have no dedicated strategy presets | P1 |
| Build archetypes and loadouts | `Build Catalog`, `Build Profiles`, `Build Loadouts` | 18 archetypes; 28 profiles; 108 loadouts | `BuildsPage.tsx`; `store.applyProfile`/`applyLoadout` | **VERIFIED / PARTIAL** | Builds route; apply profile/loadout; build reference test | Build recommendations are 1.16.1 baseline | P1 |
| Character stats and equipment | `Build Profiles`; app state | 12 classes; stats/equipment state | `CharacterPage.tsx`; `SettingsPage.tsx` | **VERIFIED** | Character route; class/stat/equipment editing; class-level test | No legality/efficiency engine beyond class levels | P1 |
| Progression and tech tree | `Build Tech Tree`, `Build Progression Loadouts`, `Weapon Configurations`, `Upgrade Planner` | 123 nodes; 171 edges; 95 loadouts; 576 configs; 385 plans | `BuildsPage.tsx`; `selectors.techProgressionForArchetype` | **VERIFIED / PARTIAL** | Progression fields corrected; test for `PLOAD-P0-MELEE`; UI route | 1.16.1 progression guidance pending 1.17 re-validation | P1 |
| Tier lists | `Tier Lists` | 866 entries (Weapons 394, Incantations 128, Ashes 116, Talismans 107, Sorceries 84, Crystal Tears 37) | `TiersPage.tsx` | **VERIFIED / PARTIAL** | Tiers route; rank-order/tie test | Rankings are 1.16.1 baseline; no 1.17 re-rank | P1 |
| Lore with spoiler control | `Lore Companion` | 69 entries | `LorePage.tsx`; `selectors.loreAccess` | **VERIFIED** | Lore route; read/reveal; lore-gating tests | Seven app-authored area rules need editorial review | P1 |
| Completion and achievements | `Master Completion`, `Endings & Achievements` | 6 endings; 3 ending achievements; 12 cues; 16 gates; 13 denominators | `CompletionPage.tsx` | **PARTIAL** | Completion route; tabs and readiness actions render | 1,814 vs 1,960 taxonomy bridge; 12/42 cues; no platform telemetry | P0 |
| Remembrance planning | `Remembrance Planner` | 25/25 | `CompletionPage.tsx`; `store.setRemembrance` | **VERIFIED** | Remembrance tab; selection/duplication actions; 25/25 test coverage | No known extraction gap | P1 |
| Endings and NG+ | `Endings & Achievements`, `Six Futures`, `Journey Planner`, `Supplemental Content` | 6 endings; 5 futures; 4 journeys; gates/certifications | `CompletionPage.tsx`; `store.newJourney`/`resetJourney` | **VERIFIED / PARTIAL** | New journey preserved 8 items and created Journey 2; ending/readiness UI renders | Ending execution not E2E-tested; only companion state; no platform unlock verification | P1 |
| Save / backup / import / export | `Save & Journey Registry` not extracted | `AppState` schema 1 | `store.ts`; `SettingsPage.tsx` | **VERIFIED** | Export → reset → import restored 2 route steps; new-journey drill | No migration registry; localStorage only; no cross-device sync | P1 |
| Search / command palette | Cross-sheet names | `search.ts` indexes route/items/bosses/encounters/builds/lore/NPC/farms/tiers/decisions | `CommandPalette.tsx`; `Shell.tsx` | **VERIFIED** | Search index/handler present; Ctrl/Cmd+K; route loaded in sweep | No search-specific E2E or typo/fuzzy tuning test | P2 |
| PWA / offline | Build config | Static bundle + Workbox precache | `vite.config.ts`; `dist/sw.js` | **VERIFIED / PARTIAL** | SW controlled 4173; 9-entry precache present; offline reload rendered Dashboard; 0 errors | Offline reload is verified; install prompt, update migration and quota-failure drill pending | P1 |
| Accessibility | UI source | n/a | `components/*`, `pages/*`, `styles.css` | **PARTIAL** | 390 px sweep: `innerWidth == scrollWidth`; aria labels/dialogs; reduced-motion and hide-completed settings wired | No keyboard/screen-reader/axe audit; no physical-device lab | P0 |
| Tauri desktop wrapper | n/a | n/a | none | **MISSING / BLOCKED** | No `src-tauri`; `cargo`/`rustc`/`tauri` absent | Toolchain and packaging plan required | P2 |
| External references | `External Resources` | 5 references | `SettingsPage.tsx`; `PatchPage.tsx` sources | **VERIFIED** | Settings source list; patch sources render | Link rot not monitored | P2 |
| Patch / Tarnished Pack | Live version sources; `game.ts`; `classes.ts` | 4 releases; 7 impact groups; 27 items; 2 encounters; 2 classes | `PatchPage.tsx` | **VERIFIED** | Patch route; 13-route sweep; Tarnished integration test | Pack content is integrated; build/tier rankings remain 1.16.1 pending re-validation | P1 |
| DLC route coverage | `Shadow of the Erdtree` content in chronology/items | 393 DLC items; supplemental DLC actions | none as route | **MISSING** | DLC content renders in collection/chronology | No DLC route steps or ordering validation | P1 |
| Public distribution / licensing | Redmaw-derived route and third-party references | All content JSON | n/a | **BLOCKED** | Rights gate remains in the handoff | No permission or independently authored route text documented | P0 |

## Cross-cutting observations

1. **The final UI is implemented across 13 routes.** The earlier placeholder state is historical; the final desktop and mobile sweeps loaded every route with no page errors.
2. **The largest remaining risks are data scope and semantics, not missing screens.** Act I route coverage, item locations, completion denominators, cue counts, and 1.17 freshness remain.
3. **The 18 tests are meaningful but narrow.** They cover data integrity, selectors, progression/denominator fixes, 25/25 remembrance extraction and Tarnished integration; they do not cover store mutations, import/export, extraction idempotence, or browser interactions.
4. **Offline reload and backup restore are proven once.** Repeatability, install/update behavior and storage-failure handling remain to be drilled.
5. **Status language is deliberate.** A clean route render is not proof that every filter, bulk action, or edge case was exercised.
