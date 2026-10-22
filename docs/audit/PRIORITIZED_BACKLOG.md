# Prioritized Backlog — Remaining Work

Final integration state: 2026-10-22. Foundation commit: `b7c6c76`.  
This backlog lists work that remains after the final implementation. It does not re-open fixed defects or completed modules.

## Already verified, not backlog

- 13 routes implemented; desktop and 390 px sweeps pass with 0 page errors and no horizontal overflow.
- `npm run build` passes: 58 modules; JS 11,756.39 kB (gzip 1,288.70 kB); CSS 82.37 kB (gzip 14.73 kB); 9-entry PWA precache 11,562.82 KiB.
- `npm test` passes 18 tests, including route/ID integrity, build references, tier ties, lore gating, collection/equipment matching, the fixed denominator, the fixed progression fields, 25/25 remembrance extraction, and Tarnished Pack integration.
- Offline reload renders Dashboard with a controlling service worker and 0 console errors.
- Export → reset → import restores route progress; a new journey preserves lifetime items and creates empty journey state.
- The denominator column and progression-loadout field shift are fixed and test-covered.
- Tarnished Pack content is integrated: 27 items, 2 encounters, 2 classes, patch metadata.

The remaining packages are data scope, freshness, hardening and platform work.

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
| WP-01 | **Content rights and publication gate** | P0 | none | Critical: public distribution may be prohibited | Source inventory covers Redmaw-derived route text, wiki-derived facts, editorial prose, maps/images and bulk extracts. Each class has a written decision: independently authored, attributed deep link, licensed, or excluded. No unlicensed bulk guide prose ships. | Rights record in `docs/`; public build cleared or marked local/private; attribution present; no copied map/image assets; owner sign-off. |
| WP-02 | **Completion denominator and domain reconciliation** | P0 | none; can proceed locally | High: current 1,814 catalog is not comparable to the 1,960 workbook aggregate | One documented bridge: 2,105 master rows = 1,787 permanent + 318 finite; runtime 1,814 = 1,787 + 27 pack. The 13 category denominators remain sourced from column 2 (1,960; 9 true, 4 coverage-qualified). Category deltas are explained or marked incomparable. Trophy cue 42/42 (or the 42 claim corrected), NPC/dialogue 96, and route 994/4,477 each have a visible scope label. | No single whole-game percentage is shown; no category exceeds 100%; runtime/workbook counters are explicitly labelled; tests assert every denominator and scope label; completion docs state Act I vs whole-game. |
| WP-03 | **Full-game route ingestion** | P0 | WP-01 + complete source route; **BLOCKED** | Critical: 3,483 route steps missing; rights unresolved | All available certified route steps are imported with stable IDs, area/objective order, directions, warnings and provenance. Row count reconciles exactly to the validated source filter (4,477 currently claimed vs 994 present). Existing Act I progress survives insertion. | Idempotent import; zero duplicate IDs; area/global order tests; old save survives content insertion; route is labelled full-game only when the source truly covers it. |
| WP-04 | **DLC route coverage** | P1 | WP-03 | High: DLC ordering/quest dependencies | Shadow of the Erdtree route sections exist with validated placement, dependencies, warnings and area boundaries. DLC-only counts reconcile and do not duplicate base steps. | DLC route can be followed end-to-end; quest/world links resolve; ordering decision documented; DLC progress persists. |
| WP-05 | **Exact item-location enrichment** | P1 | WP-01; source data | High: 1,467 workbook records are placeholders (1,074 base + 393 DLC) | Every placeholder record gets exact location/acquisition/missable deadline with source URL and validation date, or an explicit content-pack gap. No "Phase 26E" text remains user-visible. The 27 pack records already have exact locations. | 100% schema validation; sampled audit of at least 5% stratified by category; route links resolve where claimed; Collection labels unresolved rows; provenance retained. |
| WP-06 | **1.17 re-ranking of builds and tiers** | P0/P1 | Official patch data; WP-01 | High: workbook build/tier/weapon data is 1.16.1 | Patch 1.17 / 1.17.2 / Regulation 1.17.3 changes are diffed against the workbook. Tarnished Pack additions are already integrated; now re-validate affected weapons, skills, sorceries, incantations, shields, boss assumptions and loadouts. Tier lists, build loadouts and weapon rankings remain labelled **1.16.1 baseline pending 1.17 re-validation** until each domain passes. | Source URL + checked date per change; version label test; no unverified stat/ranking change; UI never claims 1.17-current for unreviewed rankings; Patch & DLC page reflects the resulting status. |
| WP-07 | **Accessibility audit and fixes** | P0 | final UI (available) | High: no formal audit | Keyboard-only navigation, visible focus, dialog/drawer focus trapping, screen-reader names, heading order, contrast, 200% zoom, 390 px and reduced-motion behavior. `reducedMotion` and `hideCompleted` are already wired; verify them across pages. | Axe scan has no critical issues; manual keyboard/screen-reader checklist passes; no horizontal overflow at 390 px or 200% zoom; findings documented. |
| WP-08 | **Broader automated tests and CI** | P0 | none; can start now | High: 18 tests do not cover store, extraction, import/export or UI | Add extraction fixtures and idempotence checks; store action side effects; save normalization/corruption; export/import round trip; denominator and Tarnished integration guards; one browser E2E flow (desktop) and one 390 px smoke. Add a CI job. | `npm test` and build pass in CI; regression guards fail on a seeded duplicate ID, wrong denominator, corrupt save, or misaligned progression field; E2E covers route → complete → reload → export/import. |
| WP-09 | **Offline install, update and recovery drill** | P1 | WP-08 ideally | Medium: offline reload passes, but install/update/quota are unverified | Install the PWA; cold start offline; complete a step and reload; simulate a cache update; simulate storage quota failure; verify saved state and clear recovery guidance. | Written drill with steps/results; install works; offline route works; update does not wipe state; quota failure does not lose in-memory data; limitations documented. |
| WP-10 | **Bundle split and initial-load budget** | P1 | none; can start now | High: 11.76 MB JS monolith | Route/meta load first; Builds/Collection/Tiers load on demand; content packs split; large lists virtualized; service worker caches only shell+route initially. | Reported JS/gzip and first-paint metrics before/after; no single initial chunk over the agreed budget; offline route still works; 16 MB cache ceiling removed or justified. |
| WP-11 | **Save migration and import/export hardening** | P1 | schema decisions | High: no migration registry or content-version pin | Add a versioned envelope with app/schema/content version and export date; migration registry; future-version rejection; referential-integrity report; retain corrupt raw. | Round-trip deep equality; malformed/future/partial saves rejected with clear messages; migration test; no direct storage access outside the store; docs updated. |
| WP-12 | **Cross-device sync** | P2 | WP-11 + backend/identity decision | High: conflict/privacy risk | ADR covers identity, transport, encryption, offline queue, conflict policy and deletion. Two divergent saves merge without losing route, collection or endings. | Two-device drill passes; conflicts visible/reversible; no silent overwrite; sync is explicitly distinct from export/import; privacy/retention documented. |
| WP-13 | **Tauri desktop wrapper** | P2 | WP-11 + Rust toolchain; **BLOCKED** | Medium: toolchain absent; packaging/DB permissions | `src-tauri` builds on a supported OS; `StoragePort` writes the versioned save to app data; native export/import; WebView loads the same content; no browser-only API crashes. | Desktop artifact produced; save round trip survives restart; no data loss on close; Windows/Linux smoke recorded; Tauri remains an adapter, not a fork. |

## Sequencing

### Wave 0 — rights, correctness, tests

1. WP-01 rights gate (parallel; blocks public release).
2. WP-02 completion reconciliation.
3. WP-08 test expansion (parallel).

### Wave 1 — data coverage and freshness

4. WP-05 item enrichment (after rights/source).
5. WP-06 1.17 re-ranking (parallel).
6. WP-03 full-game route ingestion when source/rights are available.
7. WP-04 DLC route after WP-03.

### Wave 2 — reliability

8. WP-07 accessibility.
9. WP-09 offline install/update drill.
10. WP-10 bundle split.
11. WP-11 save migration/import hardening.

### Wave 3 — platform expansion

12. WP-12 cross-device sync.
13. WP-13 Tauri wrapper when the toolchain exists.

## Release gates

### Gate A — trustworthy local release

- WP-01 decision recorded for the intended distribution.
- WP-02 completion reconciliation and WP-08 tests complete.
- WP-07 accessibility audit passes.
- No completion percentage uses an unreconciled denominator.

### Gate B — content-complete route

- WP-03 and WP-04 complete with row-level reconciliation.
- Existing saves survive new step insertion.
- Route label changes to full-game only with the full source.
- Licensing still permits distribution.

### Gate C — platform expansion

- WP-09 install/update/recovery drill passes.
- WP-10 initial-load budget met.
- WP-11 migration/export tests pass.
- WP-12 sync has a documented conflict policy and two-device evidence.
- WP-13 builds and preserves saves on desktop.

## Explicit non-claims

- **Route:** Act I only until WP-03/WP-04 land. The 4,477 ledger figure is not migrated data.
- **Item locations:** 1,467 workbook records are placeholders; they must not be invented.
- **Completion:** no single whole-game percentage; 1,814 runtime and 1,960 workbook are different scopes.
- **Achievements:** 3 ending achievements are named; 12 cue rows exist against a 42-cue claim; no platform telemetry.
- **Freshness:** build/tier rankings are 1.16.1 baseline until WP-06.
- **Sync:** export/import is manual; no cross-device synchronization exists.
- **Desktop:** no Tauri build exists in this environment.
- **Licensing:** public distribution remains gated by WP-01.
