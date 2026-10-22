# Feature Crosswalk — Workbook & Research → Canonical Data → Application

Final integration state: commit `dad630d`, 2026-10-22.  
Foundation commit: `b7c6c76c31067de07042cc15d822db443aaf34de`.  
Evidence: final `npm run build`, `npm test` (28 tests), desktop and 390 px sweeps (20 desktop / 9 mobile route states), offline reload, backup/restore and new-journey drills, plus source inspection.

**Observed:** files, data wiring, counts and the listed verification results. **Inferred:** priority and the impact of the remaining data/scope gaps. Status is not a claim of exhaustive interaction testing.

## Status definitions

- **VERIFIED** — implemented, wired to real canonical data, and loaded without console/page errors in the final desktop/mobile sweeps. Not every control is E2E-tested.
- **PARTIAL** — implemented with a known scope, data-freshness, reconciliation, or accessibility limitation.
- **MISSING** — no implementation.
- **BLOCKED** — external prerequisite prevents completion.
- Priority: **P0** release/data correctness; **P1** remaining core data work; **P2** platform/hardening.

## Crosswalk

| Domain | Source | Canonical data | App module (file) | Status | Evidence / test | Gap | Priority |
|---|---|---|---|---|---|---|---|
| Full-game guided route | `research/route.base.json` + `route.dlc.json` → `build_full_content.py` | `route.full.json`: **4,521 steps / 70 sections** | `lib/data.ts`; `pages/JourneyPage.tsx`; `pages/DashboardPage.tsx` | **VERIFIED** | Route ID/order/objective tests; phase-boundary test; desktop/mobile sweep | No map or turn-by-turn layer; source prose is Redmaw-derived | P1 |
| Canonical chronology (DLC after Maliketh) | `research/INTEGRATION.md` contract | 3,303 pre-DLC → 1,126 DLC → 92 endgame; first DLC order 3304; first Ashen order 4433 | `route.full.json`; `JourneyPage.tsx`; `DashboardPage.tsx` | **VERIFIED** | Test asserts DLC sits after the Maliketh split and before Ashen Capital | Ordering is enforced by the build, not user-configurable | P1 |
| DLC route coverage | `route.dlc.json` | **20 sections / 1,126 steps**; 13 DLC questlines; 42 DLC bosses | `JourneyPage.tsx`; `QuestsPage.tsx`; `BossesPage.tsx` | **VERIFIED** | DLC phase renders; 1,126 steps and 38 missables counted; sweep | DLC item locations are uneven (part of the 1,017) | P1 |
| Endgame route coverage | Synthetic aftermath + base sections 47–49 | **92 steps / 4 sections**; 1 missable | `JourneyPage.tsx` | **VERIFIED** | Phase counts and Ashen gate test; endgame renders | Endings execution not platform-verified | P1 |
| Missables and phase gates | Redmaw badges + warning text | **206** (167 pre-DLC + 38 DLC + 1 Ashen); `GATE-DLC`, `GATE-ASHEN-CAPITAL` | `JourneyPage.tsx`; search results | **VERIFIED** | Test asserts missables in both games; filter and gates render | Text-only warnings remain source-derived, not editorialized | P1 |
| Next action and step completion | `route.full.json` required/order fields | `STEP_BY_ID`, `STEPS_BY_AREA`, `AUTO_ITEMS_BY_STEP` | `DashboardPage.tsx`; `JourneyPage.tsx`; `store.setStepStatus` | **VERIFIED** | Dashboard next action; done/skip/defer/undo; backup restored steps; selector tests | No automated reload test in `npm test` | P1 |
| Directions / navigation | Instruction, Location, Warning, Prerequisite | `route.steps` fields | `JourneyPage.tsx`; `DashboardPage.tsx` | **PARTIAL** | Step list/detail renders directions, warnings, prerequisites | No map or turn-by-turn guidance; location is section-level | P1 |
| Supplemental chronology | Workbook `Supplemental Content` | 116 actions; 49 areas | `JourneyPage.tsx`; `selectors.nextSupplemental` | **VERIFIED** | Chronology tab renders; sweeps | Unchanged workbook scope | P1 |
| Collection catalog | Workbook + Redmaw + pack | **2,325 items** (1,787 workbook + 538 Redmaw-only, including 27 pack records) | `CollectionPage.tsx`; `selectors.collectionSummary` | **VERIFIED** | Merge test preserves every workbook ID; filters/search/ownership; sweep | See location-detail row | P1 |
| Item exact locations | Redmaw acquisition text; route links | **378 exact / 930 area-only / 1,017 unrecorded**; 1,118 route-linked | `ItemDrawer.tsx`; `CollectionPage.tsx` | **PARTIAL** | `itemLocationKind` labels exact/area/unrecorded; no placeholder survives | 1,017 records need source enrichment; 930 are section-level | P0 |
| Farmables | Workbook `Farmable Collection` | 318 | `FarmsPage.tsx`; `store.setFarmable` | **VERIFIED** | Farms route; quantity/target actions wired | No E2E automation | P1 |
| Materials | Workbook `Crafting Material Farms` | 107 | `FarmsPage.tsx`; `store.setMaterialStock` | **VERIFIED** | Farms tab; actions wired | Three journey-limited materials need prominent warnings | P1 |
| Merchants | Workbook `Merchants` | 167 | `FarmsPage.tsx`; `store.setMerchant` | **VERIFIED** | Farms tab; purchase action wired | Workbook-scoped count | P1 |
| Finite resources and scarabs | Workbook `Finite Resources`, `Scarab Audit` | 318 finite; 107 scarabs | `FarmsPage.tsx`; store actions | **VERIFIED** | Farms tabs; actions wired | Scarab route IDs do not auto-link to the full route | P1 |
| NPC states and dialogue | Workbook `NPC States`, `Dialogue Events` | 51 NPC states; 41 dialogue events | `QuestsPage.tsx` | **VERIFIED** | Quests route; NPC/dialogue filters and toggles | No quest-chain visualisation | P1 |
| Decisions and lockouts | Workbook `Choices & Consequences`, `Lockout Database`, `Dependency Matrix` | 27 decisions; 30 lockouts; 75 dependencies | `QuestsPage.tsx`; store actions | **VERIFIED** | Quests tabs; decision/lockout/dependency views | No automated branch-state tests | P1 |
| Questlines | `research/questlines.json` | **52 questlines / 587 steps** (13 DLC / 136 steps) | `QuestsPage.tsx`; `store.setQuestlineStep` | **VERIFIED** | Test asserts 52/587; questline steps persist in journey state; sweep | No per-questline dependency graph | P1 |
| Bosses and encounters | Workbook + Redmaw + pack | **237** (50 workbook + 185 Redmaw-only + 2 pack); 142 route-linked | `BossesPage.tsx`; `store.setBossStatus` | **VERIFIED** | Merge test; filters/status; sweep | 237 is the ledger, not all are unique bosses (repeat encounters retained) | P1 |
| Boss strategy presets | Workbook `Build Boss Strategies`, `Build Encounter Presets` | 924 strategies; 2,206 presets | `BossesPage.tsx`; `BuildsPage.tsx` | **VERIFIED / PARTIAL** | Preset/strategy views; build references tested | 1.16.1 baseline; pack invasions have no dedicated strategy presets | P1 |
| Achievements | `research/achievements.json` | **42** (9 Misc / 24 Bosses / 6 Shardbearers / 3 Endings); 4 groups / 30 items | `CompletionPage.tsx`; `store.setAchievement` | **VERIFIED** | Test asserts 42 and the four requirement groups; completion scope | Companion state only; no Steam/Xbox/PlayStation telemetry | P1 |
| Remembrance planning | Workbook `Remembrance Planner` | 25/25 | `CompletionPage.tsx`; `store.setRemembrance` | **VERIFIED** | Selection/duplication actions; 25/25 test | No known extraction gap | P1 |
| Completion scopes | All catalogs | 9 scopes: route 4,521; collection 2,325; achievements 42; bosses 237; quests 587; lore 69; endings 6; remembrances 25; NG+ 68 | `CompletionPage.tsx`; `selectors.completionScopes` | **VERIFIED** | Test reports every scope with a real denominator | No weighted whole-game percentage by design | P1 |
| Endings and NG+ | Workbook endings/futures; `research/ngplus.json` | 6 endings; 5 futures; 12 NG+ sections / 68 items; 7 certifications; 16 gates | `CompletionPage.tsx`; `store.newJourney`/`resetJourney`; `store.setNgPlusItem` | **VERIFIED** | New journey preserved items and created Journey 2; NG+ 68 test; sweep | Ending execution not E2E-tested; no platform unlock verification | P1 |
| Build archetypes and loadouts | Workbook build sheets | 18 archetypes; 28 profiles; 108 loadouts | `BuildsPage.tsx`; `store.applyProfile`/`applyLoadout` | **VERIFIED / PARTIAL** | Builds route; apply profile/loadout; reference test | Build recommendations are 1.16.1 baseline | P1 |
| Character stats and equipment | Workbook `Build Profiles`; app state | 12 classes; stats/equipment state | `CharacterPage.tsx`; `SettingsPage.tsx` | **VERIFIED** | Class/stat/equipment editing; class-level test | No legality/efficiency engine | P1 |
| Progression and tech tree | Workbook build sheets | 123 nodes; 171 edges; 95 progression loadouts; 576 configs; 385 plans | `BuildsPage.tsx`; `selectors.techProgressionForArchetype` | **VERIFIED / PARTIAL** | Corrected fields; `PLOAD-P0-MELEE` test; sweep | 1.16.1 progression guidance pending 1.17 re-validation | P1 |
| Tier lists | Workbook `Tier Lists` | 866 entries (Weapons 394, Incantations 128, Ashes 116, Talismans 107, Sorceries 84, Crystal Tears 37) | `TiersPage.tsx` | **VERIFIED / PARTIAL** | Rank-order/tie test; sweep | Rankings are 1.16.1 baseline; no 1.17 re-rank | P1 |
| Lore with spoiler control | Workbook `Lore Companion` | 69 entries | `LorePage.tsx`; `selectors.loreAccess` | **VERIFIED** | Read/reveal; section-aware gating test; sweep | Some app-authored area aliases need editorial review | P1 |
| Art and official theme | `research/art/manifest.json`; Steam store pages | 17 images / 2.88 MiB; 7 WOFF2 OFL fonts | `components/Art.tsx`; `styles.css`; `public/art`, `public/fonts` | **VERIFIED** | Assets served locally; art renders in sweep; credits and disclaimer in Settings/shell | Rights remain non-commercial fan use; no map assets | P1 |
| Save / backup / import / export | Workbook registry not extracted | `AppState` schema 1 | `store.ts`; `SettingsPage.tsx` | **VERIFIED / PARTIAL** | Export → reset → import restored route steps; new-journey drill | No migration registry or content-version pin; localStorage only | P1 |
| Legacy progress migration | Pre-integration `route.json` | 994 old steps; **62 mapped** | `legacy-step-map.json`; `store.normalizeJourney` | **PARTIAL** | Test remaps a seeded old ID; unmapped IDs drop safely | 932 old steps have no mapping; conservative text matching | P0 |
| Search / command palette | All catalogs | Route, items, bosses, questlines, builds, lore, NPCs, farms, tiers, decisions | `CommandPalette.tsx`; `Shell.tsx`; `search.ts` | **VERIFIED** | Ctrl/Cmd+K; index/handler present; sweep | No search-specific E2E or fuzzy tuning test | P2 |
| PWA / offline | Build config | Static bundle + Workbox precache | `vite.config.ts`; `dist/sw.js`; `manifest.webmanifest` | **VERIFIED** | SW controlled 4173; 36-entry precache / 19,505.53 KiB; offline reload with cached hero; 0 errors | Install prompt, update migration and quota-failure drill pending | P1 |
| Accessibility | UI source | n/a | `components/*`, `pages/*`, `styles.css` | **PARTIAL** | 390 px sweep: `innerWidth == scrollWidth`; labels/dialogs; reduced-motion and hide-completed wired | No keyboard/screen-reader/axe audit; no physical-device lab | P0 |
| 1.17 freshness | Official patch notes | Patch metadata; 1.16.1 data baseline | `PatchPage.tsx`; `game.ts`; `classes.ts` | **PARTIAL** | Live 1.17.2 / 1.17.3 labeled; pack content integrated | Tier/build/boss rankings not re-validated for 1.17 | P0 |
| Tauri desktop wrapper | n/a | n/a | none | **MISSING / BLOCKED** | No `src-tauri`; `cargo`/`rustc`/`tauri` absent | Toolchain and packaging plan required | P2 |
| Cross-device sync | n/a | n/a | none | **MISSING** | Export/import is manual only | Identity, transport and conflict policy undecided | P2 |
| External references | Workbook `External Resources` | 5 references | `SettingsPage.tsx`; `PatchPage.tsx` sources | **VERIFIED** | Source list renders | Link rot not monitored | P2 |
| Patch / Tarnished Pack | Live version sources; `game.ts`; `classes.ts` | 4 releases; 7 impact groups; 27 items; 2 encounters; 2 classes | `PatchPage.tsx` | **VERIFIED** | Patch route; Tarnished integration test; sweep | Pack content integrated; rankings remain 1.16.1 | P1 |
| Public distribution / licensing | Redmaw route and guide prose; wiki facts; official art | All content packs and art | n/a | **BLOCKED** | Rights gate remains in the handoff | No permission or independently authored route text documented | P0 |

## Cross-cutting observations

1. **Every planned surface is implemented.** The 13 top-level routes, including Journey, Collection, Quests, Completion, Patch & DLC, and Settings, render without page errors on desktop and mobile.
2. **The route and catalogs are full-game.** The earlier Act I limitation is resolved; the largest remaining data risk has shifted from scope to item-location precision (1,017 unrecorded, 930 area-only).
3. **Completion is transparent.** Nine independent scopes replace the former single-percentage ambiguity. No scope uses the workbook's 1,960 aggregate or the obsolete 4,477 ledger claim.
4. **The 28 tests are meaningful but narrow.** They cover data integrity, selectors, route ordering, missables, merge preservation, achievements, questlines, NG+, legacy remapping and completion scopes; they do not cover store mutations, import/export, extraction idempotence, or browser interactions.
5. **Offline reload and backup restore are proven once.** Repeatability, install/update behavior and storage-failure handling remain to be drilled.
6. **Freshness is the second-largest gap.** The app is content-complete for 1.17.2, but build/tier rankings are explicitly 1.16.1 baseline.
7. **Status language is deliberate.** A clean route render is not proof that every filter, bulk action, or edge case was exercised; accessibility and licensing remain release-gating.
