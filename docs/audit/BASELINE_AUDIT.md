# Baseline & Final Integration Audit — Elden Ring Definitive Companion

- Initial baseline commit: `b7c6c76c31067de07042cc15d822db443aaf34de` (`master`)
- Final verified implementation: commit `2ceedc0` (`master`), 2026-10-22; audit documents committed separately
- Repository: `/home/kal/Agent/Projects/er-companion`
- Workbook: `Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx`
- Workbook SHA-256: `9167efbd69b026f4ae844600ca3f63f5ab4234f58a0ba1057e4dc9c047897776`
- Workbook size: 22,032,045 bytes (21.01 MiB), 79 sheets (17 visible, 62 hidden)
- Evidence: final `npm run build` / `npm test`, manual browser sweeps, offline drill, backup/restore drill, `docs/audit/DATA_INTEGRITY.json`, `WORKBOOK_INVENTORY.csv`, and source inspection

This document separates **observed** evidence from **inferred** conclusions. Build, test, browser, offline and backup results below are the final integration verification evidence; filesystem facts, canonical counts and source wiring were independently re-checked during this audit. The foundation commit was a partial implementation; commit `2ceedc0` is the implemented companion. No source file is modified by this audit.

## Executive findings

1. **The workspace began without an application repository.** Git contains one foundation commit, no tags, no other branches, and no prior application history. The pre-existing inputs were the workbook, the handoff brief, and `PLAN.md`. The final integration is committed in `2ceedc0`.
2. **The workbook is preserved and identified.** SHA-256 was independently recomputed and matches `DATA_INTEGRITY.json`. `Settings` reports workbook v12.44, Companion v10.44, production state v1.1.0. The older hidden `Release Manifest` still says v11.53 / 69 sheets / 16 player tabs and is treated as historical.
3. **Final build and tests pass.** `npm run build` is TypeScript-clean with Vite 8, 58 modules, JS 11,756.98 kB (gzip 1,288.85 kB), CSS 82.37 kB (gzip 14.73 kB), and a 9-entry, 11,563.40 KiB PWA precache. `npm test` passes 18 tests in one file.
4. **All 13 application routes render cleanly.** Desktop and 390 px sweeps covered `/`, `/journey`, `/collection`, `/builds`, `/character`, `/bosses`, `/quests`, `/lore`, `/farms`, `/tiers`, `/completion`, `/patch`, and `/settings` with 0 console/page errors and no page-level horizontal overflow.
5. **Offline and recovery behavior is verified.** A service worker controlled `http://127.0.0.1:4173/`, the precache was present, and an offline reload rendered the Dashboard with 0 console errors. Export → reset → import restored two completed route steps. A new journey preserved 8 owned items and created Journey 2 with empty route state.
6. **The final runtime catalog is 1,814 items**: 1,787 workbook permanent records plus **27 Tarnished Pack records**. Runtime encounters are **52** (50 workbook + 2 Tarnished Pack invasions), and starting classes are **12** (10 base + Idus Knight + Heavy Knight).
7. **Route execution is still Act I only.** The workbook export contains 994 steps; its completion ledger claims 4,477. This remains a content/rights blocker, not a UI defect.
8. **Completion reconciliation remains open.** The category denominator extraction is fixed, but the runtime catalog (1,814) is not directly comparable to the 1,960 workbook denominator because of taxonomy differences, 318 finite resources, 27 post-workbook pack records, and 12 cue rows vs a 42-cue claim. The app must not present a single whole-game completion percentage.
9. **Two earlier audit defects were fixed during integration.** The denominator export now reads the true denominator column, and progression loadouts now read the correct talisman, spell-package, physick, status, and upgrade columns. Tests assert both.
10. **The build/tier baseline is Regulation 1.16.1.** Live game status on 2026-10-21 is App Ver 1.17.2 / Regulation 1.17.3. The Tarnished Pack is integrated as content; tier lists, build loadouts, and weapon rankings remain 1.16.1 baseline pending re-validation.
11. **Licensing remains a release gate.** Redmaw-derived route structure, wiki-derived facts, and third-party guide references require a public-distribution decision. A local personal workbook is not a redistribution license.

## Artifacts found

| Artifact | Final state | Role |
|---|---|---|
| Workbook `.xlsx` | 22,032,045 bytes; 79 sheets; hash above; untracked by design | Immutable content source |
| `ELDEN_RING_DEFINITIVE_COMPANION_AGENT_HANDOFF.md` | 485 lines | Requirements and audit contract |
| `PLAN.md` | 21 lines | Product intent |
| `scripts/extract_workbook.py` | 1,619+ lines; deterministic JSON writer | Workbook-to-canonical pipeline |
| `src/data/*.json` | 8 files, ~11.9 MB | Static workbook-derived content |
| `src/data/game.ts` | 19,424 bytes; Tarnished Pack/patch overlay | 27 items, 2 encounters, patch/version metadata |
| `src/lib/*.ts` | Types, data indexes, store, selectors, search, router, classes, format | Domain/state layer |
| `src/components/*.tsx` | Shell, command palette, item drawer, equipment picker, UI primitives, icons | Shared presentation |
| `src/pages/*.tsx` | 13 implemented routes | Application surfaces |
| `src/lib/selectors.test.ts` | 18 tests in 3 suites | Automated checks |
| `dist/` | Final production build, 2026-10-22 00:11 | Build evidence; ignored by git |
| `docs/audit/DATA_INTEGRITY.json` | 0 errors; unresolved-link warning; coverage notes | Machine integrity evidence |
| `docs/audit/WORKBOOK_INVENTORY.csv` | 79 rows plus header | Sheet inventory |
| `README.md` | Current product/run/provenance summary | Operator documentation |

At the initial baseline commit, no `README`, CI workflow, `src-tauri/`, SQLite schema, prior audit set, Apps Script `.gs` file, or test-result artifact was present. These final additions are in `2ceedc0` and the audit revision, not the foundation commit.

## Git and workspace state

- New repository on `master`; foundation + feature commits; no tags; no remotes.
- The final implementation is committed in `2ceedc0`; the audit documents are committed separately. No source file is modified by this audit.
- The workbook is excluded by `*.xlsx`; there is no committed `data/source/*.xlsx` copy. The checksum is the source fingerprint.
- The foundation commit added the data pipeline, store, and shell. Commit `2ceedc0` adds the feature modules, Tarnished Pack overlay, patch page, styles, tests, and point-of-use balance warnings.

## Build, test and runtime verification

### Final commands

| Check | Observed result |
|---|---|
| `npm run build` | Passed; TypeScript clean; Vite 8; 58 modules; JS 11,756.98 kB (gzip 1,288.85 kB); CSS 82.37 kB (gzip 14.73 kB) |
| `npm test` | Passed; 18 tests, 1 file |
| PWA precache | 9 entries; 11,563.40 KiB |
| Desktop sweep | 13 routes; 0 console/page errors |
| Mobile 390 px sweep | 13 routes; `innerWidth == scrollWidth`; no page-level horizontal overflow |
| Offline PWA | Service worker controlling `http://127.0.0.1:4173/`; precache present; offline reload rendered Dashboard; 0 console errors |
| Backup/restore | Export → reset → import restored two completed route steps |
| New journey | Preserved 8 owned items; created Journey 2 with empty route state |

The foundation-era build artifact (11,500,158-byte JS, 11,529,890-byte precache) is historical and superseded by the final figures above.

### What the automated tests cover

The 18 tests cover route ID uniqueness/order, objective references, item route links, build references, encounter links, tier rank ties, lore gating, collection/equipment matching, route/area progress, the fixed denominator columns (Armor 704 / base 559 / DLC 145), the fixed progression prompt fields, live version/class levels, 12 starting classes, 25 remembrances including `Elden Remembrance`, and Tarnished Pack integration (27 items, 2 encounters, no duplicate IDs).

They do not cover store action side effects, save normalization, import/export round trips, extraction idempotence, UI interactions, or browser E2E. Those remain backlog items.

### Bundle composition

- The single JS bundle dominates because all content is imported and indexed at startup. `builds.json` alone is 8,100,097 bytes and `game.ts` adds the pack overlay.
- The 16 MiB Workbox cache ceiling exists only to admit this bundle. PWA precache is functional but heavy.
- Initial-load performance on low-end handhelds is **inferred** risk, not a measured result.

## Feature inventory at final state

Status meaning: **VERIFIED** = implemented, data-wired, and loaded without error in the final desktop/mobile sweeps; **PARTIAL** = implemented with a known data/scope/accessibility limitation; **MISSING** = absent; **BLOCKED** = external prerequisite.

| Surface | Status | Evidence / limitation |
|---|---|---|
| Canonical content pipeline | VERIFIED | Extractor, JSON, integrity report; 0 extraction errors |
| Persistent store and save normalization | VERIFIED | `store.ts`; schema v1; corrupt-save quarantine; round-trip drill |
| Shell, hash router, navigation | VERIFIED | 13-route desktop/mobile sweep; 0 errors |
| Dashboard | VERIFIED | Real next action, collection, lore, build, ending summaries |
| Journey (Act I route + chronology) | VERIFIED | Route areas, steps, filters, notes, done/skip/defer, chronology |
| Collection | VERIFIED | 1,814 runtime items, filters, ownership, bulk actions |
| Builds | VERIFIED / PARTIAL (freshness) | Archetypes, profiles, loadouts, presets, boss strategies; recommendations are 1.16.1 baseline |
| Character | VERIFIED | Stats, class, equipment, profile/loadout application |
| Bosses | VERIFIED | 52 runtime encounters, filters, route links, strategies |
| Quests & NPCs | VERIFIED | 51 NPC states, 41 dialogue events, 27 decisions, 30 lockouts, 75 dependencies |
| Lore | VERIFIED | 69 entries, spoiler gating, read/reveal actions |
| Farms | VERIFIED | 318 farmables, 107 materials, 318 finite resources, 167 merchant rows, 107 scarabs |
| Tier lists | VERIFIED (UI) / PARTIAL (freshness) | 866 entries browsable; rankings are 1.16.1 baseline |
| Completion | PARTIAL | Endings/remembrances/readiness UI implemented; catalog/denominator reconciliation incomplete |
| Patch & DLC | VERIFIED | 1.17.2 / 1.17.3, 4 releases, 7 impact groups, 27 pack items, 2 invasions |
| Settings / backups | VERIFIED | Characters, journeys, class/stats, export/import, reset |
| Search / command palette | VERIFIED | Route, items, bosses, builds, lore, NPCs, farms, tiers, decisions |
| PWA / offline | VERIFIED (offline reload) | Service worker/precache verified; install/update/quota drill pending |
| Accessibility | PARTIAL | 390 px overflow check and labels; no formal keyboard/screen-reader/axe audit |
| Tauri desktop wrapper | MISSING / BLOCKED | No `src-tauri`; `cargo`, `rustc`, `tauri` absent |

## Known bugs, gaps and blockers

1. **Route scope.** 994 Act I steps vs 4,477 claimed. Full-game route ingestion is blocked on source data and licensing.
2. **Completion reconciliation.** Runtime catalog 1,814 vs workbook denominator 1,960; 318 finite resources, 27 post-workbook pack items, and taxonomy differences prevent a single percentage. The workbook's 9 true/4 coverage-qualified split must remain visible.
3. **Trophy cues.** 12 numbered cue rows exist against a 42-cue sheet heading; platform ending achievements are 3.
4. **Item exact locations.** 1,467 workbook items (1,074 base + 393 DLC) have placeholder acquisition detail. The 27 Tarnished Pack records do have exact locations.
5. **Runtime vs workbook counters.** `META.counts.items` remains 1,787 and `META.counts.encounters` remains 50, while runtime arrays are 1,814 and 52. The Settings content-coverage card shows the workbook count; labels should distinguish workbook vs runtime.
6. **Freshness.** All 28 build profiles cite Regulation 1.16.1. Build, tier, weapon, and boss recommendation data is not 1.17-validated.
7. **Unresolved-link warning.** The extractor still reports DEP 91, VAL 120, MER 101, KN 14, LCK 8, SCB 21, REC 13, FRM 3. Six domains are validator-index false positives; VAL/REC and one FRM are genuine.
8. **Coverage note.** `DATA_INTEGRITY.json` says 47 chronology areas; actual is 49.
9. **Platform achievements.** Only 3 ending achievements are named; the app tracks companion execution state, not Steam/Xbox/PlayStation telemetry.
10. **Licensing.** Public distribution of third-party route/guide content is unresolved.
11. **Bundle size.** 11.76 MB JS raw / 1.29 MB gzip; single chunk. Split/lazy loading remains.
12. **No automated E2E/CI.** The 18 tests are selector/integration level; browser sweeps were manual.
13. **Offline install/update drill.** Offline reload passed; install prompt, update migration, and quota-failure recovery are not yet drilled.
14. **No Tauri toolchain.** Desktop packaging cannot be built or smoke-tested here.
15. **No committed source copy.** The workbook is ignored and represented only by its hash; a read-only source copy plus checksum file is recommended.
16. **Storage model.** `localStorage` is origin-bound and clearable; export/import is manual, not cross-device sync.

## Resolved during integration

- **Denominator column fixed.** `categoryDenominators` now reads the true denominator column; Armor is 704 with base 559 + DLC 145. Tests assert this.
- **Progression loadouts fixed.** Talismans read columns 14–17, spell package reads column 18, physick reads 19–20, and upgrade/status/notes align. Tests assert the corrected prompt fields.
- **Feature modules implemented.** The ten baseline placeholders were replaced by real Journey, Collection, Builds, Character, Bosses, Quests, Lore, Farms, Tiers, and Completion modules, plus Patch & DLC.
- **Remembrance extraction fixed.** `Elden Remembrance` is included; `META.remembrances` is 25/25 and the test suite asserts it.
- **Tarnished Pack integrated.** 27 items, 2 encounters, 2 classes, patch metadata, and live-version labels.
- **Mobile overflow fixed.** The 13-route 390 px sweep passes.
- **Offline reload verified.** Precache and service-worker control are working.
- **Backup/new-journey behavior verified.** Import restores route progress; new journey preserves lifetime items.

## Current game-version context (external, not workbook-observed)

Verified against official Bandai Namco pages on 2026-10-21:

- Current App Ver **1.17.2**; Regulation Ver **1.17.3**, released 2026-10-20: <https://www.bandainamcoent.com/news/elden-ring-tarnished-edition-patch-1-17-2>
- Patch 1.17 released 2026-08-27; Tarnished Pack released 2026-08-28. It adds Idus Knight and Heavy Knight classes, new weapons/armor, three Spectral Steed attires, and two NPC invasions (Knight Leontiel in Caelid Wailing Dunes; Broken Gold Mask in Leyndell via Law of Regression), plus balance changes: <https://en.bandainamcoent.eu/elden-ring/news/elden-ring-patch-notes-version-117>
- 1.17.2 is bugfix-only; no additional content.
- All 28 workbook build profiles cite Regulation 1.16.1. Tier lists, build loadouts, and weapon rankings are **1.16.1 baseline pending 1.17 validation**, not 1.17-current.

## Environment caveats

- OS: Linux 7.2.8-9-omarchy, x64.
- Node v26.7.0; npm 12.2.0; Python 3.14.8.
- `cargo`, `rustc`, and `tauri` are absent; a Tauri wrapper cannot be built here.
- The workbook is read with `openpyxl` in read-only/data-only mode. Formulas are not evaluated; Apps Script/VBA behavior is not present in the `.xlsx`.
- No browser E2E framework, CI pipeline, or test-result artifact is checked in.
- The app makes no network calls at runtime and cannot verify platform achievements.
- Mobile verification is a 390 px viewport sweep, not a physical-device lab.

## Evidence links

- `ELDEN_RING_DEFINITIVE_COMPANION_AGENT_HANDOFF.md`, `PLAN.md`, `README.md`
- `scripts/extract_workbook.py`
- `docs/audit/DATA_INTEGRITY.json`, `docs/audit/WORKBOOK_INVENTORY.csv`
- `src/data/*.json`, `src/data/game.ts`
- `src/lib/types.ts`, `data.ts`, `store.ts`, `selectors.ts`, `search.ts`, `classes.ts`
- `src/pages/*.tsx`, `src/components/*.tsx`
- `src/lib/selectors.test.ts`, `dist/`, `vite.config.ts`, `package.json`

## Audit boundary

**Observed:** file/hash facts, final build/test results, route sweeps, offline/backup drills, source wiring, counts in canonical data and runtime arrays. **Inferred:** low-end performance, accessibility depth beyond the 390 px check, install/update resilience, future sync conflicts, and completion-methodology risk.
