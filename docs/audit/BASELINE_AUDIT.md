# Baseline & Final Integration Audit — Elden Ring Definitive Companion

- Initial baseline commit: `b7c6c76c31067de07042cc15d822db443aaf34de` (`master`)
- Final verified implementation: commit `5ce6450` (`master`), 2026-10-22
- Full-game integration commit: `39596b9`; desktop shell commit: `5ce6450`
- Repository: `/home/kal/Agent/Projects/er-companion`
- Workbook: `Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx`
- Workbook SHA-256: `9167efbd69b026f4ae844600ca3f63f5ab4234f58a0ba1057e4dc9c047897776`
- Workbook size: 22,032,045 bytes (21.01 MiB), 79 sheets (17 visible, 62 hidden)
- Research inputs: `research/route.base.json`, `route.dlc.json`, `items.json`, `achievements.json`, `bosses.json`, `questlines.json`, `ngplus.json`, `art/manifest.json`
- Evidence: final `npm run build` / `npm test`, manual browser sweeps, offline drill, `docs/audit/DATA_INTEGRITY.json`, `src/data/content-coverage.json`, `docs/audit/FULL_GAME_DATA.md`, `docs/audit/FULL_GAME_RESEARCH_VERIFICATION.md`, `WORKBOOK_INVENTORY.csv`, and source inspection

This document separates **observed** evidence from **inferred** conclusions. Build, test, browser, offline and backup results below are the final integration verification evidence; filesystem facts, canonical counts and source wiring were independently re-checked during this audit. The foundation commit was a partial implementation; commit `39596b9` is the implemented companion. No source file is modified by this audit.

## Executive findings

1. **The workspace began without an application repository.** Git contains one foundation commit, no tags, no other branches, and no prior application history. The pre-existing inputs were the workbook, the handoff brief, and `PLAN.md`. The implementation is committed in `39596b9`; the full-game route is generated from `research/` by `build_full_content.py`.
2. **The workbook is preserved and identified.** SHA-256 was independently recomputed and matches `DATA_INTEGRITY.json`. `Settings` reports workbook v12.44, Companion v10.44, production state v1.1.0. The older hidden `Release Manifest` still says v11.53 / 69 sheets / 16 player tabs and is treated as historical. The workbook remains the seed for workbook domains (builds, lore, farms, tiers, workbook world state); it is no longer the source of the runtime route or the full item/boss/achievement catalogs.
3. **The runtime route is the full Redmaw route, not Act I.** `route.full.json` contains **4,521 steps across 70 sections**: 3,395 base steps (3,303 through Maliketh + 92 endgame) plus **1,126 Shadow of the Erdtree steps in 20 sections**. Global order is contiguous and follows the mandated three-phase chronology: base through Maliketh → the entire DLC → Farum Azula aftermath, Ashen Capital, Endings, NG+ Preparation.
4. **The missable model is explicit and reconciled.** **206** route steps are missable: **168 base** (167 pre-DLC + 1 Ashen Capital) and **38 DLC**. Two phase gates (`GATE-DLC`, `GATE-ASHEN-CAPITAL`) explain the ordering and filter the relevant missable steps. The original contract's 170 base claim was reduced to the observable 168 rather than padded.
5. **The catalogs are merged, not replaced.** **2,325 items** = 1,787 workbook records (1,562 also matched to a Redmaw record) + 538 Redmaw-only records, 27 of which are Tarnished Pack records that replaced their Redmaw duplicates. All 1,787 workbook IDs are preserved. **237 bosses** = 50 workbook records (22 matched to Redmaw) + 185 Redmaw-only records + 2 Tarnished Pack invasions. **42 achievements** with 4 legendary requirement groups / 30 linked items. **52 questlines / 587 steps**. **12 NG+ sections / 68 checklist items**.
6. **Item guidance is materially richer but not complete.** Every placeholder, slot label and Redmaw-catalog location was removed. Location quality is **378 exact, 930 area-only (route-section derived, with the step instruction in `acquisitionText`), and 1,017 unrecorded**; 1,118 items are route-linked. The 1,017 unrecorded locations are the current content gap, not hidden placeholder text.
7. **Completion is now scope-based.** Nine scopes carry real denominators: route 4,521, collection 2,325, achievements 42, bosses 237, quests 587, lore 69, endings 6, remembrances 25, NG+ 68. There is no single weighted whole-game percentage.
8. **Final build and tests pass.** `npm run build` is TypeScript-clean with Vite 8, JS **16,643.32 kB** (gzip **1,759.91 kB**), CSS **122.67 kB** (gzip **21.34 kB**), and a **36-entry, 19,505.53 KiB** PWA precache. `npm test` passes **28 tests** in one file; `npm run typecheck` is clean.
9. **All routes render cleanly.** Desktop and mobile sweeps covered **20 desktop route/tab states and 9 mobile route states** with 0 console/page errors; no 390 px page-level horizontal overflow was observed.
10. **Offline and recovery behavior are verified.** A service worker controlled `127.0.0.1:4173`, the precache was populated (37 entries in Cache Storage at drill time, including one runtime-cached hero image), and an offline reload rendered the Dashboard with 0 console errors. Export → reset → import restored route progress; a new journey preserved lifetime items and created empty journey state.
11. **Art and theme are official-art based.** 17 optimized official Steam/store images (3,016,212 bytes / 2.88 MiB) plus 7 WOFF2 SIL OFL fonts are bundled locally, documented in `docs/ART_CREDITS.md`, and paired with an unofficial-project disclaimer in the app.
12. **The build/tier baseline is Regulation 1.16.1.** Live game status is App **1.17.2** / Regulation **1.17.3**. The Tarnished Pack content and patch notes are integrated; tier lists, build loadouts, and weapon rankings remain 1.16.1 baseline pending re-validation.
13. **Licensing remains a release gate.** Redmaw-derived route structure and prose, wiki-derived facts, and official artwork require a public-distribution decision. A local personal workbook and a public Steam store page are not redistribution licenses.

## Artifacts found

| Artifact | Final state | Role |
|---|---|---|
| Workbook `.xlsx` | 22,032,045 bytes; 79 sheets; hash above; untracked by design | Immutable workbook source |
| `ELDEN_RING_DEFINITIVE_COMPANION_AGENT_HANDOFF.md` | 485 lines | Requirements and audit contract |
| `PLAN.md` | 21 lines | Product intent |
| `scripts/extract_workbook.py` | ~1,600 lines; deterministic JSON writer | Workbook-to-canonical pipeline |
| `scripts/build_full_content.py` | ~1,740 lines | Research-to-runtime integration (route, catalogs, coverage) |
| `scripts/research/fetch_*.py`, `verify_full_game.py` | 4 fetch scripts + verifier | Research scrape, normalization and independent verification |
| `research/*.json` + `research/raw/*.html` | 9 JSON + 14 raw HTML | Frozen research inputs with hashes |
| `src/data/*.json` | 16 JSON packs, 19,353,178 bytes total | Runtime content including full route and merged catalogs |
| `src/data/game.ts` | 19,693 bytes | Tarnished Pack/patch overlay: 27 items, 2 encounters, version metadata |
| `src/lib/*.ts` | Types, data indexes, store, selectors, search, router, classes, format | Domain/state layer |
| `src/components/*.tsx` | Shell, command palette, item drawer, equipment picker, UI primitives, icons, art | Shared presentation |
| `src/pages/*.tsx` | 13 implemented routes | Application surfaces |
| `src/lib/selectors.test.ts` | 28 tests in 5 suites | Automated checks |
| `public/art/*`, `public/fonts/*` | 17 images; 7 WOFF2 + 2 OFL texts | Bundled theme assets |
| `dist/` | Final production build, 2026-10-22 08:43 | Build evidence; ignored by git |
| `docs/audit/DATA_INTEGRITY.json` | 0 extraction errors | Workbook-extraction integrity evidence (Act I route snapshot) |
| `docs/audit/WORKBOOK_INVENTORY.csv` | 79 rows plus header | Sheet inventory |
| `docs/audit/FULL_GAME_DATA.md` | Generated integration summary | Route order, merge arithmetic, missables, provenance |
| `docs/audit/FULL_GAME_RESEARCH_VERIFICATION.md` | 64 PASS / 3 FAIL, all resolved during integration | Independent research verification |
| `README.md` | Current product/run/provenance summary | Operator documentation |

At the initial baseline commit, no `README`, CI workflow, `src-tauri/`, SQLite schema, prior audit set, Apps Script `.gs` file, or test-result artifact was present. The full-game additions are in `39596b9`; the desktop additions are in `5ce6450`.

## Content coverage at final state

| Domain | Final count | Composition / source |
|---|---:|---|
| Route sections | 70 | 46 base pre-DLC + 20 DLC + 4 endgame (aftermath, Ashen Capital, Endings, NG+ prep) |
| Route steps | 4,521 | 3,303 pre-DLC + 1,126 DLC + 92 endgame |
| Required steps | 4,307 | Derived from `optional` |
| Missable steps | 206 | 167 pre-DLC + 38 DLC + 1 Ashen Capital |
| Items | 2,325 | 1,787 workbook + 538 Redmaw-only (of 2,100 deduped; 1,562 matched workbook rows); 27 pack records replace Redmaw duplicates; all workbook IDs preserved |
| Route-linked items | 1,118 | `routeStepIds` or `autoStepId` |
| Item location quality | 378 exact / 930 area-only / 1,017 unrecorded | `itemLocationKind` computed at runtime; no placeholder text remains |
| Encounters (bosses) | 237 | 50 workbook (22 matched to Redmaw) + 185 Redmaw-only + 2 pack |
| Achievements | 42 | 9 Misc + 24 Bosses + 6 Shardbearers + 3 Endings; 4 requirement groups / 30 items |
| Questlines | 52 / 587 steps | 13 DLC questlines / 136 DLC steps |
| NG+ checklist | 12 sections / 68 items | DLC-tagged steps: 13 |
| Lore | 69 entries | Workbook lore companion |
| Remembrances | 25 | Includes `Elden Remembrance`; test-covered |
| Endings | 6 | 7 certifications; 16 transition gates; 12 trophy cue rows |
| Builds | 18 archetypes, 28 profiles, 108 loadouts, 95 progression loadouts | Workbook build sheets |
| Presets/strategies | 2,206 encounter presets, 924 boss strategies | Workbook build sheets |
| Tiers | 866 entries | 1.16.1 baseline |
| Farms | 318 farmables, 107 materials, 318 finite resources, 167 merchants, 107 scarabs | Workbook farm sheets |
| World | 51 NPC states, 41 dialogue events, 153 world states, 64 traversal, 30 lockouts, 75 dependencies, 13 knowledge | Workbook world sheets |
| Chronology | 116 supplemental actions / 49 areas | Workbook supplemental, unchanged |
| Art / fonts | 17 images / 2.88 MiB; 7 WOFF2 fonts + 2 OFL texts / 154,445 bytes | Official Steam store art; SIL OFL fonts |

The runtime `content-coverage.json` carries the same counts and research input hashes; it is the machine-readable source for the table above.

## Git and workspace state

- New repository on `master`; foundation, feature and final-integration commits; no tags; no remotes.
- The full-game implementation is committed in `39596b9`; the desktop shell is committed in `5ce6450`. No source file is modified by this audit.
- The workbook is excluded by `*.xlsx`; there is no committed `data/source/*.xlsx` copy. The checksum is the source fingerprint.
- The foundation commit added the data pipeline, store, and shell. Commit `39596b9` adds the full-game route, merged catalogs, achievements, bosses, questlines, official-art theme and tests. Commit `5ce6450` adds the Tauri desktop shell, native backup dialogs and the Linux/macOS/Windows CI matrix. The workbook still seeds builds/lore/farms; `build_full_content.py` generates the full route/catalog from `research/`.

## Research and integration pipeline

**Observed pipeline:**

1. `scripts/research/fetch_route.py`, `fetch_items.py`, `fetch_world.py`, `fetch_art.py` capture Redmaw sheets and Steam art into `research/raw/`; normalized JSON is written to `research/`.
2. `scripts/research/verify_full_game.py` independently checks counts, IDs, order, link syntax, DLC flags, missable markers and art against the archived raw HTML. Result: 64 PASS / 3 FAIL.
3. `scripts/build_full_content.py` merges research with workbook-derived data and the Tarnished Pack overlay. It writes `route.full.json`, `items.full.json`, `achievements.json`, `bosses.full.json`, `questlines.json`, `ngplus.json`, `content-coverage.json` and `legacy-step-map.json`, plus `docs/audit/FULL_GAME_DATA.md`.
4. The runtime imports these static packs through `src/lib/data.ts`; the UI never mutates content.

All three research FAILs are resolved in the integrated output: 51 relative hrefs were resolved with `urljoin`, the base missable denominator was reconciled to the observable 168 (not padded to 170), and no data was dropped (all 1,787 workbook items and all 50 workbook encounters survive).

## Build, test and runtime verification

### Final commands

| Check | Observed result |
|---|---|
| `npm run build` | Passed; TypeScript clean; Vite 8; JS 16,643.32 kB (gzip 1,759.91 kB); CSS 122.67 kB (gzip 21.34 kB) |
| `npm run typecheck` | Passed; no diagnostics |
| `npm test` | Passed; 28 tests, 1 file, 5 suites |
| PWA precache (build manifest) | 36 entries; 19,505.53 KiB |
| Desktop sweep | 20 route/tab states; 0 console/page errors |
| Mobile 390 px sweep | 9 route states; `innerWidth == scrollWidth`; no page-level horizontal overflow |
| Offline PWA | Service worker controlling `127.0.0.1:4173`; precache present; 37 Cache Storage entries at drill time; hero art cached; offline reload rendered Dashboard; 0 console errors |
| Backup/restore | Export → reset → import restored completed route steps and ownership |
| New journey | Preserved lifetime items; created Journey 2 with empty route state |

The foundation-era build artifact (11,500,158-byte JS, 11,529,890-byte precache) and the 13-route Act I sweep are historical and superseded by the final figures above.

### What the automated tests cover

The 28 tests cover route ID uniqueness and contiguous global order, the DLC-after-Maliketh split and Ashen Capital boundary, missable preservation in both games, explicit-only auto-acquisition, objective and item/boss link resolution, build reference resolution, live version and class levels, corrected progression prompt fields, corrected denominator columns, Tarnished Pack uniqueness, tier tie ordering, progress selectors (next action, area completion, lore gating), full catalog merge (workbook IDs preserved, boss ledger, 42 achievements with 4 groups, 52 questlines, 68 NG+ items), legacy `RTE-*` remapping, completion scopes with real denominators, and collection/equipment normalization.

They do not cover store action side effects, save normalization, import/export round trips, extraction idempotence, UI interactions, or browser E2E. Those remain backlog items.

### Bundle composition

- The single JS chunk dominates because all content is imported and indexed at startup: 16,643.32 kB raw, 1,759.91 kB gzip. `builds.json` alone is 8.1 MB; `route.full.json` is 5.3 MB; `items.full.json` is 1.7 MB.
- `data.ts` eagerly indexes 2,325 items, 4,521 steps, 237 bosses, 2,206 presets and 924 strategies.
- The 20 MiB Workbox cache ceiling exists only to admit this bundle.
- Initial-load performance on low-end handhelds is **inferred** risk, not a measured result.

## Feature inventory at final state

Status meaning: **VERIFIED** = implemented, data-wired, and loaded without error in the final desktop/mobile sweeps; **PARTIAL** = implemented with a known data/scope/accessibility limitation; **MISSING** = absent; **BLOCKED** = external prerequisite.

| Surface | Status | Evidence / limitation |
|---|---|---|
| Canonical content pipeline | VERIFIED | Research fetch/verify + `build_full_content.py`; 0 extraction errors; content-coverage hashes |
| Persistent store and save normalization | VERIFIED | `store.ts`; schema v1; corrupt-save quarantine; round-trip drill; legacy step remap |
| Shell, hash router, navigation | VERIFIED | 20 desktop / 9 mobile route states; 0 errors |
| Dashboard | VERIFIED | Phase-aware next action, collection, lore, build, ending summaries |
| Journey (full route + chronology) | VERIFIED | 4,521 steps / 70 sections / 3 phases; missables filter and phase gates; chronology |
| Collection | VERIFIED | 2,325 items, filters, ownership, bulk actions; 1,118 route-linked |
| Item location detail | PARTIAL | 378 exact / 930 area-only / 1,017 unrecorded; no invented locations |
| Builds | VERIFIED / PARTIAL (freshness) | Archetypes, profiles, loadouts, presets, boss strategies; recommendations are 1.16.1 baseline |
| Character | VERIFIED | Stats, class, equipment, profile/loadout application |
| Bosses | VERIFIED | 237 encounters, filters, route links, 924 strategies |
| Quests & NPCs | VERIFIED | 52 questlines / 587 steps plus 51 NPC states, 41 dialogue events, 27 decisions, 30 lockouts, 75 dependencies |
| Lore | VERIFIED | 69 entries, section-aware spoiler gating, read/reveal actions |
| Farms | VERIFIED | 318 farmables, 107 materials, 318 finite resources, 167 merchant rows, 107 scarabs |
| Tier lists | VERIFIED (UI) / PARTIAL (freshness) | 866 entries browsable; rankings are 1.16.1 baseline |
| Completion | VERIFIED | Nine scopes with real denominators; achievements 42; endings 6; remembrances 25; NG+ 68 |
| Patch & DLC | VERIFIED | 1.17.2 / 1.17.3, 4 releases, 7 impact groups, 27 pack items, 2 invasions |
| Settings / backups | VERIFIED | Characters, journeys, class/stats, export/import, reset, art credits |
| Search / command palette | VERIFIED | Route, items, bosses, builds, lore, NPCs, farms, tiers, decisions, questlines |
| Art / theme | VERIFIED | 17 official Steam images + 7 OFL fonts served locally; credits and disclaimer in app |
| PWA / offline | VERIFIED | Service worker/precache verified; offline reload with cached hero art; install/update/quota drill pending |
| Legacy progress migration | PARTIAL | 62 of 994 legacy `RTE-*` steps mapped by conservative text matching; unmapped IDs are dropped |
| Accessibility | PARTIAL | 390 px overflow check and labels; no formal keyboard/screen-reader/axe audit |
| Tauri desktop wrapper | VERIFIED (Linux) / CONFIGURED (macOS, Windows) | Tauri 2 shell, native backup dialogs and external-link bridge; Linux binary and `.deb` built and smoke-tested; CI matrix for macOS/Windows |

## Known bugs, gaps and blockers

1. **Unrecorded item locations.** 1,017 of 2,325 items have no location; 930 more are area-only. The app labels both instead of inventing a place. Enrichment requires source data.
2. **Freshness.** All 28 build profiles cite Regulation 1.16.1. Tier lists, build loadouts, weapon rankings and boss recommendations are not 1.17-validated.
3. **Legacy progress migration.** Only 62 of 994 old Act I step IDs map to the new route. Matching is conservative (token Dice similarity with an area preference); users with old saves may lose some completed steps.
4. **Licensing.** Public distribution of Redmaw-derived route prose, wiki-derived facts and official artwork is unresolved.
5. **Bundle size.** 16.64 MB JS raw / 1.76 MB gzip in one chunk. Split/lazy loading remains.
6. **No automated E2E/CI.** The 28 tests are selector/integration level; browser sweeps were manual.
7. **Offline install/update drill.** Offline reload passed; install prompt, update migration, and quota-failure recovery are not yet drilled.
8. **No formal accessibility audit.** Only a 390 px overflow check, labels, reduced-motion and hide-completed settings are verified.
9. **No save migration registry or content-version pin.** Import requires `schemaVersion === 1`; unknown fields are dropped.
10. **macOS and Windows installers are not locally verified.** The Linux desktop build is verified; the macOS universal and Windows NSIS bundles depend on the CI matrix and remain unsigned.
11. **No committed source copy.** The workbook is ignored and represented only by its hash; a read-only source copy plus checksum file is recommended.
12. **Storage model.** `localStorage` is origin-bound and clearable; export/import is manual, not cross-device sync.
13. **Workbook-extraction link warnings.** `DATA_INTEGRITY.json` still reports DEP 91, VAL 120, MER 101, KN 14, LCK 8, SCB 21, REC 13, FRM 3 for the Act I workbook route. Six domains are validator-index scope false positives; VAL/REC and one FRM are genuine workbook-route references. This does not affect the integrated Redmaw route, whose 5,290 link labels resolve to 1,502 catalog items/bosses and 3,788 display-only labels.
14. **Workbook extraction snapshot.** `DATA_INTEGRITY.json` describes the legacy 994-step workbook route and its pre-Redmaw workbook+pack overlay. The integrated truth is `content-coverage.json` (4,521 route steps, 2,325 items); the JSON is retained as extraction evidence rather than as a current catalog.

## Resolved during integration

- **Full-game route.** The Act I-only runtime route was replaced by the 4,521-step Redmaw route with the mandated DLC-after-Maliketh order and explicit endgame sections.
- **DLC route.** 20 sections / 1,126 steps, 38 missables, ordered between Maliketh and Ashen Capital.
- **Missable reconciliation.** 168 base + 38 DLC = 206 observed warnings; the unobservable 170 base contract figure was not padded.
- **Catalog merge.** 2,325 items with every workbook ID preserved; 237 bosses; no duplicate IDs.
- **Achievements.** 42 achievements, 4 requirement groups, 30 linked items, nine completion scopes.
- **Questlines and NG+.** 52 questlines / 587 steps; 12 NG+ sections / 68 items, both wired to journey state.
- **Item locations.** All 1,947 placeholder/slot/Redmaw-catalog locations were replaced: 930 with route-section areas and 1,017 cleared rather than invented.
- **Relative research hrefs.** 51 relative links were resolved against `https://eldenring.redmaw.dev` with `urljoin`.
- **Denominator column and progression loadouts.** Fixed and test-covered (Armor 704 / base 559 / DLC 145; talismans 14–17, spell package 18, physick 19–20).
- **Remembrance extraction.** `Elden Remembrance` included; 25/25.
- **Tarnished Pack.** 27 items, 2 encounters, 2 classes, patch metadata and live-version labels.
- **Mobile overflow.** The 390 px sweep passes.
- **Offline reload and backup behavior.** Verified with a controlling service worker and a restore drill.
- **Art and theme.** 17 official Steam images and 7 OFL fonts are bundled, credited and covered by an in-app disclaimer.

## Current game-version context (external, not workbook-observed)

Verified against official Bandai Namco pages on 2026-10-21:

- Current App Ver **1.17.2**; Regulation Ver **1.17.3**, released 2026-10-20: <https://www.bandainamcoent.com/news/elden-ring-tarnished-edition-patch-1-17-2>
- Patch 1.17 released 2026-08-27; Tarnished Pack released 2026-08-28. It adds Idus Knight and Heavy Knight classes, new weapons/armor, three Spectral Steed attires, and two NPC invasions (Knight Leontiel in Caelid Wailing Dunes; Broken Gold Mask in Leyndell via Law of Regression), plus balance changes: <https://en.bandainamcoent.eu/elden-ring/news/elden-ring-patch-notes-version-117>
- 1.17.2 is bugfix-only; no additional content.
- All 28 workbook build profiles cite Regulation 1.16.1. Tier lists, build loadouts, and weapon rankings are **1.16.1 baseline pending 1.17 validation**, not 1.17-current.

## Environment caveats

- OS: Linux 7.2.8-9-omarchy, x64.
- Node v26.7.0; npm 12.2.0; Python 3.14.8.
- Rust 1.99.1 and Tauri CLI 2.12.4 were installed for the desktop release; see the desktop addendum. The host is Linux, so macOS/Windows bundles were not compiled locally.
- The workbook is read with `openpyxl` in read-only/data-only mode. Formulas are not evaluated; Apps Script/VBA behavior is not present in the `.xlsx`.
- No browser E2E framework or checked-in test-result artifact; desktop CI is checked in but was not executed from this host.
- The app makes no network calls at runtime and cannot verify platform achievements.
- Mobile verification is a 390 px viewport sweep, not a physical-device lab.
- Browser sweep route counts include tab/query states; the router itself has 16 top-level paths after the beyond-Redmaw additions.

## Beyond-Redmaw addendum (2026-10-22)

The findings above cover the Redmaw full-game pack. A later additive phase layered six checkable ledgers over it without changing the 4,521-step route, 2,325-item catalog, 237-boss ledger, or save schema:

- **World atlas** — 697 objects: 413 graces, 213 martyr effigies, 44 stranded souls, 14 sword monuments, 9 finger readers, 4 telescopes; Stakes of Marika and Gatekeeper Statues emit zero rows because no authoritative per-object list exists.
- **Upgrades** — 725 pickups / 993 quantity across eight categories, plus 101 enemy-drop leads kept outside the completion denominator; 138 pickups have an imprecise location.
- **Crafting materials** — 108 (69 base / 39 DLC; 107 obtainable), zero unresolved rows.
- **Reference tables** — 11 tables / 138 rows, display-only, no unresolved tables.
- **NPC walkthrough** — 36 sections / 604 steps as an alternate area-ordered checklist with separately persisted state.
- **Branch plan** — 27 decisions / 43 reward entries: 36 resolved (31 exact, 5 alias), 7 unresolved.
- **Merchants** — 40 merchants / 627 purchasable items; the 167-row workbook ledger remains for objective links, with 110 rows bridged.

These additions raise completion to **16 independent scopes** (seven appended to the original nine), the automated suite to **34 tests**, and the router to **16 top-level routes**; those figures supersede the earlier nine-scope / 28-test / 13-route statements in this document. The six new surfaces render with 0 console/page errors and no 390 px page-level overflow. Dialogue remains intentionally deferred: quest-critical actions, choices and rewards are tracked, but no spoken line is stored or counted.

Evidence: `docs/audit/BEYOND_REDMAW_RELEASE.md`, `docs/audit/BEYOND_REDMAW_DATA.md`, `docs/audit/WORLD_INTERACTIONS_COVERAGE.md`, `docs/audit/UPGRADE_MATERIALS_COVERAGE.md`, `docs/audit/REFERENCE_COVERAGE.md`, `docs/audit/BRANCH_PLAN.md`, and the runtime files `src/data/world.objects.json`, `upgrades.json`, `materials.full.json`, `resources.json`, `npc-walkthrough.json`, `branch-plan.json`, and `merchants.full.json`.

## Evidence links

- `ELDEN_RING_DEFINITIVE_COMPANION_AGENT_HANDOFF.md`, `PLAN.md`, `README.md`
- `scripts/extract_workbook.py`, `scripts/build_full_content.py`, `scripts/research/*`
- `research/*.json`, `research/raw/*`, `research/art/manifest.json`, `docs/ART_CREDITS.md`
- `docs/audit/DATA_INTEGRITY.json`, `docs/audit/WORKBOOK_INVENTORY.csv`, `docs/audit/FULL_GAME_DATA.md`
- `docs/audit/FULL_GAME_RESEARCH_VERIFICATION.md`
- `src/data/*.json`, `src/data/content-coverage.json`, `src/data/game.ts`
- `src/lib/types.ts`, `data.ts`, `store.ts`, `selectors.ts`, `search.ts`, `classes.ts`
- `src/pages/*.tsx`, `src/components/*.tsx`
- `src/lib/selectors.test.ts`, `dist/`, `vite.config.ts`, `package.json`
- `docs/DESKTOP.md`, `src-tauri/*`, `.github/workflows/desktop.yml`

## Desktop release addendum (2026-10-22)

The companion now has a **Tauri 2** desktop shell in `src-tauri/`, sharing the same renderer and content pack as the PWA.

- **Linux verified:** Rust 1.99.1; Tauri CLI 2.12.4; Tauri crate 2.12.5; `cargo check` clean; 3 Rust validation tests and 34 frontend tests pass; release binary 20 MB; Debian package 8.39 MiB.
- **Native I/O verified:** the save dialog wrote a valid 2,510-byte JSON backup; the open dialog restored it and the renderer showed “Backup imported. Progress restored.”
- **Desktop asset build verified:** 17,961.49 kB JS / 1,935.54 kB gzip; 155.14 kB CSS; no service worker or registration is emitted for Tauri builds.
- **Window verified:** launched under Xvfb + dwm; Settings rendered the desktop host card, platform, architecture, version, and app-data path, and both native dialogs appeared and completed. `npm run desktop:dev` also launched and rendered the dashboard with no startup errors.
- **Fixes found by the desktop smoke test:** synchronous Tauri commands deadlocked the GTK main loop, so backup dialogs now use async callbacks; WebKitGTK’s DMABUF renderer produced a blank Xvfb window, so Linux defaults to the shared-memory fallback with an environment override.
- **External links:** desktop clicks are intercepted, restricted to HTTP/HTTPS in Rust, and opened in the system browser.
- **Not verified locally:** macOS and Windows bundles. `.github/workflows/desktop.yml` builds Linux DEB/AppImage, a macOS universal DMG/app, and a Windows NSIS installer. Signing and notarization are not configured.

## Audit boundary

**Observed:** file/hash facts, final build/test results, route sweeps, offline/backup drills, source wiring, counts in canonical data and runtime arrays. **Inferred:** low-end performance, accessibility depth beyond the 390 px check, install/update resilience, future sync conflicts, and completion-methodology risk.
