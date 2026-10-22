# Prioritized Backlog — Remaining Work

Final integration state: 2026-10-22; full-game route and catalogs integrated. Foundation commit: `b7c6c76`.  
This backlog lists work that remains after the final implementation. It does not re-open fixed defects or completed modules.

## Already verified, not backlog

- Full-game route integrated: **4,521 steps / 70 sections** — 3,303 pre-DLC + 1,126 DLC + 92 endgame, in the Maliketh → DLC → Ashen Capital order.
- DLC route integrated: 20 sections / 1,126 steps / 38 missables, with phase gates.
- Missable model reconciled: 206 total (168 base + 38 DLC).
- Item catalog merged: **2,325** with all 1,787 workbook IDs preserved; 1,118 route-linked.
- Achievements integrated: **42**, 4 requirement groups, 30 linked items.
- Boss ledger merged: **237**.
- Questlines integrated: **52 / 587**.
- NG+ checklist integrated: **12 sections / 68 items**.
- Art/theme integrated: 17 official Steam images (2.88 MiB) + 7 OFL fonts, credits and disclaimer.
- 13 routes implemented; 20 desktop and 9 mobile route states pass with 0 page errors and no 390 px page-level overflow.
- `npm run build` passes: JS 16,643.32 kB (gzip 1,759.91 kB); CSS 122.67 kB (gzip 21.34 kB); 36-entry PWA precache 19,505.53 KiB. Typecheck clean.
- `npm test` passes **28 tests**, including route order, DLC placement, missables, catalog merge, achievements, questlines, NG+, legacy remap and completion scopes.
- Offline reload renders Dashboard with a controlling service worker and 0 console errors; hero art is cached.
- Export → reset → import restores route progress; a new journey preserves lifetime items and creates empty journey state.
- The denominator column, progression-loadout fields and remembrance extraction are fixed and test-covered.
- Tarnished Pack content is integrated: 27 items, 2 encounters, 2 classes, patch metadata.
- Completion is scope-based: 9 scopes with real denominators; no single weighted percentage.

The remaining packages are rights, data precision, freshness, migration, accessibility, testing and platform work.

## Reading this backlog

- **P0** — required before trustworthy completion claims or public distribution.
- **P1** — required for complete data coverage or platform reliability.
- **P2** — optional/expansion.
- **Acceptance** is observable; **DoD** requires real data, persistence, tests, accessibility, docs, and no regression.
- Priorities are **inferred** from audit evidence; completed items above are **observed**.

## Cross-package definition of done

1. Real canonical data; no placeholder copy, mock rows, invented counts or silent omissions.
2. UI surfaces the result, including empty/error/unresolved states.
3. State changes persist through the store and survive reload.
4. Tests cover the new behavior and existing tests do not regress.
5. Keyboard labels, focus behavior and 390 px layout are checked.
6. Counts and percentages come from a documented denominator, never a guess.
7. Coverage limits, blockers and source provenance are visible.
8. Licensing/redistribution gates are respected.
9. Audit docs are updated when the data contract changes.

## Ordered work packages

| ID | Work package | Priority | Depends on | Risk | Acceptance | Definition of done |
|---|---|---|---|---|---|---|
| WP-01 | **Content rights and publication gate** | P0 | none | Critical: public distribution may be prohibited | Source inventory covers Redmaw-derived route text, wiki-derived facts, editorial prose, and official Steam artwork. Each class has a written decision: independently authored, attributed deep link, licensed, or excluded. | Rights record in `docs/`; public build cleared or marked local/private; attribution present; no copied map assets; owner sign-off. |
| WP-02 | **Exact item-location enrichment** | P0 | WP-01; source data | High: 1,017 items have no location; 930 are area-only | Every unrecorded item gets an exact location/acquisition/missable deadline with source URL and validation date, or an explicit content-pack gap. Area-only rows are upgraded where source data exists. The app never invents a place. | Locations reconcile to the catalog; sampled audit of at least 5% stratified by category; Collection labels exact/area/unrecorded correctly; provenance retained. |
| WP-03 | **1.17 re-ranking of builds and tiers** | P0/P1 | Official patch data; WP-01 | High: workbook build/tier/weapon data is 1.16.1; live is 1.17.2 / 1.17.3 | Patch 1.17 / 1.17.2 / Regulation 1.17.3 changes are diffed against the workbook. Tarnished Pack additions are already integrated; now re-validate affected weapons, skills, sorceries, incantations, shields, boss assumptions and loadouts. | Source URL + checked date per change; version label test; no unverified stat/ranking change; UI never claims 1.17-current for unreviewed rankings; Patch & DLC page reflects the resulting status. |
| WP-04 | **Legacy progress migration** | P1 | none; can start now | High: only 62 of 994 old steps map | Improve `legacy-step-map.json` coverage without false positives. Prefer area + objective + order evidence over text similarity alone; consider a positional/structural fallback with a confirmation step. | Mapped count documented; no false mappings in a sampled audit; unmapped IDs still drop safely; old-save drill shows recovered progress; test covers a new mapping class. |
| WP-05 | **Accessibility audit and fixes** | P0 | final UI (available) | High: no formal audit | Keyboard-only navigation, visible focus, dialog/drawer focus trapping, screen-reader names, heading order, contrast, 200% zoom, 390 px and reduced-motion behavior. `reducedMotion` and `hideCompleted` are already wired; verify them across pages. | Axe scan has no critical issues; manual keyboard/screen-reader checklist passes; no horizontal overflow at 390 px or 200% zoom; findings documented. |
| WP-06 | **Broader automated tests and CI** | P0 | none; can start now | High: 28 tests do not cover store, extraction, import/export or UI | Add extraction fixtures and idempotence checks; store action side effects; save normalization/corruption; export/import round trip; mode guards for DLC phase order and scopes; one browser E2E flow (desktop) and one 390 px smoke. Add a CI job. | `npm test` and build pass in CI; regression guards fail on a seeded duplicate ID, wrong route order, corrupt save, or missing missable; E2E covers route → complete → reload → export/import. |
| WP-07 | **Offline install, update and recovery drill** | P1 | WP-06 ideally | Medium: offline reload passes, but install/update/quota are unverified | Install the PWA; cold start offline; complete a step and reload; simulate a cache update; simulate storage quota failure; verify saved state and clear recovery guidance. | Written drill with steps/results; install works; offline route works; update does not wipe state; quota failure does not lose in-memory data; limitations documented. |
| WP-08 | **Bundle split and initial-load budget** | P1 | none; can start now | High: 16.64 MB JS monolith | Route/meta load first; Builds/Collection/Tiers load on demand; content packs split; route split by phase; large lists virtualized; service worker caches only shell+route initially. | Reported JS/gzip and first-paint metrics before/after; no single initial chunk over the agreed budget; offline route still works; 16 MiB cache ceiling removed or justified. |
| WP-09 | **Save migration and import/export hardening** | P1 | schema decisions | High: no migration registry or content-version pin | Add a versioned envelope with app/schema/content version and export date; migration registry; future-version rejection; referential-integrity report; retain corrupt raw. | Round-trip deep equality; malformed/future/partial saves rejected with clear messages; migration test; no direct storage access outside the store; docs updated. |
| WP-10 | **Cross-device sync** | P2 | WP-09 + backend/identity decision | High: conflict/privacy risk | ADR covers identity, transport, encryption, offline queue, conflict policy and deletion. Two divergent saves merge without losing route, collection, achievements or endings. | Two-device drill passes; conflicts visible/reversible; no silent overwrite; sync is explicitly distinct from export/import; privacy/retention documented. |
| WP-11 | **Tauri desktop wrapper** | P2 | WP-09 + Rust toolchain; **BLOCKED** | Medium: toolchain absent; packaging/DB permissions | `src-tauri` builds on a supported OS; `StoragePort` writes the versioned save to app data; native export/import; WebView loads the same content; no browser-only API crashes. | Desktop artifact produced; save round trip survives restart; no data loss on close; Windows/Linux smoke recorded; Tauri remains an adapter, not a fork. |

## Sequencing

### Wave 0 — rights, correctness, tests

1. WP-01 rights gate (parallel; blocks public release).
2. WP-06 test expansion (parallel; can start now).
3. WP-05 accessibility audit (parallel; UI is stable).

### Wave 1 — data precision and freshness

4. WP-02 item-location enrichment (after rights/source decision).
5. WP-03 1.17 re-ranking (parallel).
6. WP-04 legacy progress migration (parallel).

### Wave 2 — reliability

7. WP-07 offline install/update drill.
8. WP-08 bundle split.
9. WP-09 save migration/import hardening.

### Wave 3 — platform expansion

10. WP-10 cross-device sync.
11. WP-11 Tauri wrapper when the toolchain exists.

## Release gates

### Gate A — trustworthy local release

- WP-01 decision recorded for the intended distribution.
- WP-05 accessibility audit passes.
- WP-06 tests/CI cover store, import/export and one E2E flow.
- No completion percentage uses an unreconciled denominator; the 9 scopes remain separate.

### Gate B — content-quality release

- WP-02 item-location enrichment complete or explicitly bounded with visible gaps.
- WP-03 re-ranking complete and labeled.
- WP-04 legacy migration improved with no false mappings.

### Gate C — platform expansion

- WP-07 install/update/recovery drill passes.
- WP-08 initial-load budget met.
- WP-09 migration/export tests pass.
- WP-10 sync has a documented conflict policy and two-device evidence.
- WP-11 builds and preserves saves on desktop.

## Explicit non-claims

- **Item locations:** 1,017 items have no location and 930 are area-only; the app labels them and must not invent places.
- **Completion:** nine scopes are shown independently; there is no single whole-game percentage.
- **Legacy saves:** migration covers 62 of 994 old Act I steps; some completed steps may not carry over.
- **Achievements:** the 42 achievements are companion state, not Steam/Xbox/PlayStation telemetry.
- **Freshness:** build/tier/weapon rankings are 1.16.1 baseline until WP-03.
- **Sync:** export/import is manual; no cross-device synchronization exists.
- **Desktop:** no Tauri build exists in this environment.
- **Licensing:** public distribution remains gated by WP-01.
- **Route:** the 4,521-step route is full-game for the Lands Between + Shadow of the Erdtree; it is not a claim of every optional encounter or every item pickup.
