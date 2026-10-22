# Architecture Decision — Web-First PWA with Static Content and Local Saves

- Status: **Accepted**
- Date: 2026-10-22
- Foundation commit: `b7c6c76c31067de07042cc15d822db443aaf34de`
- Final verified state: uncommitted working tree
- Decision owner: engineering
- Supersedes: none
- Review triggers: full-game route source, licensing clearance, Tauri toolchain, cross-device requirement, 1.17 re-ranking

## 1. Context

The project started from a certified workbook, not an existing application repository. The only pre-existing artifacts were the workbook, a handoff brief and `PLAN.md`. The repository has one foundation commit; the final integration is working-tree state.

Final inspection found:

- React 19, TypeScript 7, Vite 8, `vite-plugin-pwa`/Workbox.
- Eight workbook-derived JSON packs plus a Tarnished Pack/patch overlay in `src/data/game.ts`.
- A `useSyncExternalStore` store with a versioned `AppState` persisted to `localStorage`.
- Hash routing and a responsive custom dark-gold design system.
- 13 implemented routes: Dashboard, Journey, Collection, Builds, Character, Bosses, Quests, Lore, Farms, Tiers, Completion, Patch & DLC, Settings.
- 18 Vitest tests; manual desktop and 390 px sweeps; no CI and no automated browser E2E.
- No backend, account system, network API, AI runtime, database, or `src-tauri`.
- No Rust toolchain: `cargo`, `rustc` and `tauri` are absent.

The product must run beside the game, often offline, on handheld or desktop browsers. It must not lose progress and must preserve a credible path to desktop and synchronization without rewriting the domain layer.

## 2. Decision

Adopt a **web-first React + TypeScript + Vite PWA**:

1. Ship a static site/PWA with service worker and installable manifest.
2. Keep canonical game content as **read-only static JSON**, plus a small, explicitly versioned live-content overlay for post-workbook records.
3. Keep player state in a **separate versioned save object** persisted to `localStorage` through one store module.
4. Run progression logic in **pure deterministic selectors**; no runtime AI and no server dependency.
5. Provide human-readable JSON export/import and corrupt-save quarantine.
6. **Defer Tauri** until a Rust toolchain and desktop target exist; preserve the adapter boundaries.
7. Do not add a backend or cross-device sync yet. Design the save format and storage boundary for later sync with explicit conflict rules.

## 3. Decision drivers

| Driver | Evidence / constraint |
|---|---|
| Time to a verified companion | 13 routes render; final build and 18 tests pass |
| Offline-first play | Static assets + Workbox; offline reload verified on 4173 |
| No server operations | Personal single-user tool; no accounts, hosting DB, or sync service |
| Determinism and trust | Route/quest/completion rules are finite and testable; AI adds non-determinism and spoiler risk |
| Toolchain reality | `cargo`/`rustc`/`tauri` absent; Tauri cannot be built or smoke-tested here |
| Portable saves | JSON export/import verified by a reset/restore drill |
| Future desktop | Pure selectors and a storage adapter keep Tauri a packaging concern |
| Bundle control | Final JS 11,756.98 kB (gzip 1,288.85 kB); one chunk remains the main performance risk |

## 4. Architecture

| Layer | Final implementation | Responsibility |
|---|---|---|
| Content | `src/data/*.json`; `src/data/game.ts` overlay | Read-only canonical entities, stable IDs, patch/pack metadata |
| Domain | `types.ts`, `data.ts`, `selectors.ts`, `classes.ts`, `search.ts`, `format.ts` | Types, indexes, pure progress/ownership/lore/build logic |
| State | `store.ts` | `AppState`, normalization, actions, persistence, export/import |
| Presentation | `pages/*`, `components/*`, `styles.css`, page CSS modules | 13 routes, shell, dialogs, pickers, drawers |
| Routing | `router.ts` | Hash routes with encoded query focus |
| Platform | `vite.config.ts`, `dist/sw.js`, `manifest.webmanifest` | Build, PWA install metadata, precache/update |

### 4.1 Content layer

- Workbook content is extracted once; the final runtime overlay in `game.ts` adds 27 Tarnished Pack items, 2 encounters and patch metadata, while `classes.ts` adds Idus Knight and Heavy Knight to the 10 base classes.
- Content is immutable at runtime. The UI never mutates an item, step, encounter or build profile.
- IDs are domain keys, not row numbers; route order is derived.
- The workbook remains the source for workbook-derived records. Pack records carry `TP-*` IDs and `sourceRow: 0`.
- Every content refresh is a new content version; player saves reference stable IDs and must survive additions.

### 4.2 Domain layer

- Selectors are pure functions over content plus save state: progress, next step, area completion, collection summary, lore access, equipment ownership, tech progression.
- Derived values are recomputed, not persisted as independent truth.
- The domain layer does not read `localStorage`, the DOM, or network state.
- This is the primary **Tauri-ready boundary**.

### 4.3 State layer

`AppState` contains:

- `schemaVersion: 1`
- `characters[]` with class, stats, build/profile, journeys, lifetime items, farmable quantities, lore reads, endings, equipment
- `activeCharacterId`
- `settings` (spoiler mode, density, reduced motion, hide completed)
- `updatedAt`

`JourneyState` is the per-run layer: route steps, notes, supplemental actions, NPC/dialogue flags, decisions, boss results, farm/resource/merchant/scarab state, certifications, transition gates, remembrances and revealed zones.

Lifetime versus journey semantics are verified: a new journey preserved 8 owned items and created Journey 2 with empty route state. Export → reset → import restored two completed route steps.

### 4.4 Persistence boundary

Current implementation is browser-specific:

- Key: `er-companion.state.v1`
- Corrupt raw backup: `er-companion.state.corrupt`
- Debounced write after commit
- Normalization validates shape and drops unknown/invalid values
- Storage failure is swallowed so the in-memory session remains usable

For Tauri, replace the three storage primitives with a `StoragePort`:

```ts
interface StoragePort {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
```

The browser adapter wraps `localStorage`; the desktop adapter uses the app data directory. The store's normalization and actions remain unchanged. This adapter does not exist yet.

### 4.5 Tauri-ready boundaries

- **Pure domain selectors.** Plain content and save objects in; plain values out. No DOM, network or storage dependency.
- **Versioned save schema.** `AppState.schemaVersion` and the JSON export are platform-neutral.
- **Static content JSON.** Plain JSON with stable IDs and no server contract; can be served by a Tauri asset protocol.
- **Storage port only.** The remaining platform-specific code is the storage primitives plus Settings file download/upload.
- **No Node APIs in UI.** Pages use browser APIs only; a WebView can run them without a preload bridge.

Tauri is deferred because the Rust toolchain is absent and browser delivery is faster to validate; it is not rejected as a future desktop path.

## 5. Data versus save separation

| Concern | Content | Save |
|---|---|---|
| Ownership | Read-only pack + overlay | Per-user, mutable |
| Version | Workbook hash + pack metadata (no per-pack content version yet) | `schemaVersion` 1 |
| Identity | Stable domain IDs (`RTE-*`, `COL-*`, `TP-*`, etc.) | IDs as references |
| Refresh | Re-extract / append overlay | Migrate, never overwrite blindly |
| Failure mode | Missing entity → unresolved reference | Corrupt save → quarantine and offer import/reset |
| Portability | Same for every user | Exported/imported JSON |

Rules:

1. A route step is not an item; an item is not an acquisition event; an achievement is not a route cue.
2. Marking a step done may auto-acquire linked items, but manual ownership remains independent.
3. Mutually exclusive content can be unavailable this journey without being permanently complete.
4. Content changes must not renumber progress. IDs must survive insertions.
5. Save data must never contain full content copies.

## 6. Save schema, migration and portability

### Current behavior

- `importState(json)` parses, normalizes, requires `schemaVersion === 1`, and requires at least one valid character.
- Unknown fields are dropped; invalid entries are filtered.
- `exportState()` returns pretty-printed JSON.
- Settings exposes download/upload and reset with confirmation.
- Round-trip and new-journey behavior were manually verified.
- No migration registry, save envelope, content-version pin or file-size guard exists.

### Required evolution

- Introduce a migration registry: `migrate(save, fromVersion) -> save`.
- Add a save envelope: `{ app, schemaVersion, contentVersion, exportedAt, state }`.
- Validate referential integrity after import; report unknown IDs instead of silently discarding history.
- Keep the corrupt raw payload before destructive normalization.
- Test export → clear → import → deep equality, malformed input and future-version rejection.
- Treat export/import as manual transfer, never as cross-device sync.

## 7. PWA and offline

- `registerType: "autoUpdate"`; Workbox precaches JS, CSS, HTML, SVG and WOFF2.
- Navigation falls back to `index.html`.
- Final precache: **9 entries, 11,563.40 KiB**.
- Verified: service worker controlling `http://127.0.0.1:4173/`, 9-entry precache present, offline reload rendered Dashboard with 0 console errors.
- Not yet verified: install prompt, cache-update migration, storage-quota failure, long-lived offline use, physical handheld.

## 8. Bundle size and mitigations

Final `npm run build` evidence:

- 58 modules.
- JS: **11,756.98 kB** raw; **1,288.85 kB** gzip.
- CSS: **82.37 kB** raw; **14.73 kB** gzip.
- PWA precache: **9 entries, 11,563.40 KiB**.
- `builds.json` alone is 8,100,097 bytes; `game.ts` adds 19,424 bytes of pack metadata.
- `data.ts` eagerly indexes 1,814 items, 994 steps, 2,206 presets and 924 strategies.

The single chunk means first paint downloads and parses nearly all content. The 16 MiB Workbox ceiling exists only to admit this bundle.

Mitigations, in order:

1. **Do not statically import every domain.** Fetch content packs from `/data/*.json`; import meta + route first.
2. **Route-level code splitting.** Load Builds, Collection and Bosses chunks on navigation.
3. **Split `builds.json`.** Profiles/loadouts, presets/strategies, and progression/configs are independent.
4. **Lazy indexes.** Build search indexes per domain when that domain loads.
5. **Virtualize** item, tier and preset lists; never render 1,814 cards at once.
6. **PWA caching policy.** Precache shell + route; runtime-cache optional packs after first use.
7. **Compression.** Serve Brotli and keep gzip fallback.
8. **Budget and monitor.** Proposed initial JS budget: under 300 KB gzip before route data.
9. **Remove the 16 MB cache ceiling** once packs are split.

## 9. Alternatives considered

| Alternative | Why not selected |
|---|---|
| **Tauri-first desktop** | No Rust toolchain; cannot build/test here. Delays the browser companion before content correctness. Deferred, not rejected. |
| **Backend + relational database** | No accounts, multi-user need, or server operations. Adds auth, hosting, migrations, backups, network failure modes. |
| **SQLite in the browser** | `localStorage` is sufficient for the current save and simpler to export. SQLite adds WASM weight before the save schema is stable. |
| **IndexedDB now** | Useful for large content caches, but the save is small and synchronous reads simplify the store. Revisit with split packs/sync. |
| **Runtime LLM/AI guidance** | Non-deterministic, needs keys/network, risks spoilers, cannot be the authority for quest/completion state. |
| **Parse the workbook in the browser** | Large XLSX parser, formula/security risk, slow startup, duplicates the offline pipeline. |
| **Next.js/SSR** | No SEO or server-rendered content need; static hosting is simpler and fully offline-capable. |
| **Redux/Zustand** | The store is small and already uses `useSyncExternalStore`; no demonstrated need. |
| **UI component framework** | The custom design system is established and cohesive; replacement is churn. |
| **Cloud sync now** | Identity, conflicts and privacy are unsolved; premature sync risks silent data loss. |
| **Electron** | Heavier runtime/packaging than Tauri; Tauri remains the preferred deferred path. |

## 10. Consequences

### Positive

- Runs in a browser, installs as a PWA, and works offline after caching.
- No server, account, API key or network requirement at play time.
- Content and save are separable, inspectable and testable.
- Deterministic domain logic is unit-tested and reusable by a desktop shell.
- JSON export is a credible manual backup; round-trip is verified.
- 13 routes are implemented and pass desktop/mobile sweeps.

### Negative

- `localStorage` is origin-bound, clearable, and not synchronized.
- The 11.76 MB monolith is slow to download/parse on low-end handhelds.
- No native file-system integration, OS-level offline guarantee, or desktop packaging.
- No save migration registry or content-version pinning.
- Browser storage limits and private-mode behavior are untested.
- A future Tauri adapter must replace storage calls that are currently direct.
- Tier/build recommendations remain 1.16.1 while the live game is 1.17.2 / 1.17.3.

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Third-party content licensing blocks public release | High | Critical | Rights review; independently authored directions; attribution; private/local distribution until cleared |
| Route is limited to 994 of 4,477 steps | Certain | High | Label Act I; full-game ingestion only with source and rights |
| Completion taxonomy produces misleading percentages | High | High | No single whole-game percentage; reconcile 1,814 vs 1,960 and show coverage-qualified boundaries |
| Save loss from cleared site data | Medium | High | Export reminder; corrupt backup; future Tauri file backup |
| 11.76 MB bundle fails on low-end devices | High | High | Split packs, lazy load, compress, precache shell+route |
| 1.16.1 rankings/loadouts mislead after 1.17 | High | Medium | Visible baseline labels; 1.17 re-ranking package; no current-version claim |
| Save schema changes break imports | Medium | High | Migration registry and versioned envelope |
| 18 tests miss store/browser regressions | High | High | Expand tests; E2E and extraction fixtures |
| Accessibility gaps | Medium | Medium | Axe/keyboard/screen-reader audit; continue 390 px testing |
| Offline install/update/quota behavior | Medium | Medium | Install and recovery drill |
| Tauri toolchain absent | Certain now | Medium | Keep domain pure and storage abstracted; defer packaging |
| Provider links rot | Medium | Low | Attribution and periodic link audit |
| Platform achievements cannot be verified | Certain | Medium | Track companion state only; label as not platform telemetry |
| Cross-device sync conflicts | Medium | High | Do not imply sync; design conflict policy before implementation |

## 12. Review triggers

Revisit when:

1. The complete 4,477-step route and DLC route are legally available.
2. Licensing clearance permits public distribution.
3. A Rust/Tauri toolchain and desktop target are available.
4. Cross-device use becomes a real requirement.
5. The save payload approaches storage limits or needs conflict handling.
6. Content packs are split and initial JS falls below the proposed budget.
7. 1.17 re-ranking changes build/tier semantics enough to require a content-version gate.

## 13. Observed versus inferred

**Observed:** stack, routes, storage key, save schema, actions, final build sizes, precache, offline reload, export/import round trip, new-journey behavior, absence of toolchain, static JSON sizes.

**Inferred:** low-end device performance, the need for a storage adapter, the proposed bundle budget, the depth of accessibility gaps, and future sync conflict severity. These are engineering judgments, not measured results.
