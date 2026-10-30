# AGENTS.md — working notes for any agent on this repo

**Read this before touching anything.** It is the accumulated knowledge from the last three
work sessions: what the product is, how the data is generated, what is verified, what is broken,
and the environment quirks that will otherwise cost you an hour.

Last verified against `master` @ `db40fc1` + the 1.2.0 version bump. Update the "Verified state"
table at the bottom when you finish a session.

---

## 1. What this is

An offline-first companion for **Elden Ring** + **Shadow of the Erdtree**: one 4,521-step
route, a 2,325-item catalogue, builds, quests, bosses, lore, farms, an atlas, and 16 independent
completion scopes. Web PWA + Tauri 2 desktop (Linux/macOS/Windows). React 19 + TypeScript + Vite.
No runtime API calls, no accounts, no telemetry. Everything is bundled.

The user's goal, in their words: **finish and perfect the offline manual version first**; a live
game link is a long-term goal, not the current job. Do not start live-link work without being
asked. The feasibility study is written (`docs/research/GAME_LINK_FEASIBILITY.md`) and ends with
a gated, phased plan.

---

## 2. Environment — this machine

**`node` and `npm` are NOT on PATH.** There is no system nodejs. A toolchain was downloaded to:

```bash
export PATH="$HOME/.local/share/node-toolchain/node22/bin:$PATH"   # node v22.23.4, npm 10.9.9
```

Prefix every npm command with that export or nothing works. Rust is available
(`cargo 1.99.1`), and `pkg-config webkit2gtk-4.1` resolves to 2.54.2, so desktop builds work.

The session is Wayland/KDE. `Xvfb` is **not** installed and `sudo` requires a password, so you
cannot spin up a virtual X server. For UI verification prefer:
- headless Chromium via the browser tool with `emulate({ viewport, deviceScaleFactor })`
- the running dev server at `http://localhost:5173/`
- `spectacle -b -n -o file.png` for a real desktop capture

The Tern picture-in-picture browser **cannot** emulate viewports (`emulate` silently leaves the
window at its PiP size). Use `app: { relay: false, tern: false }` to get real headless Chromium
when you need responsive testing.

---

## 3. Commands

```bash
export PATH="$HOME/.local/share/node-toolchain/node22/bin:$PATH"

npm run dev            # vite, port 5173, strictPort
npm run typecheck      # tsc --noEmit
npm test               # vitest run — 47 tests
npm run build          # typecheck + vite build
npm run desktop:build  # tauri build → src-tauri/target/release/bundle/{deb,rpm,appimage}
cargo test --manifest-path src-tauri/Cargo.toml    # 3 Rust tests
python3 scripts/verify_release_data.py             # data contract gate, exits non-zero on violation
```

Restart `npm run dev` after changing any `src/data/*.json` or `src/lib/data.ts` export shape —
Vite's HMR cache serves stale module graphs and you get bogus
`does not provide an export named X` errors. Delete `node_modules/.vite` if it persists.

---

## 4. Architecture that matters

```
src/lib/types.ts      all domain types (1,600+ lines). Read before changing state.
src/lib/data.ts       startup data: imports every JSON, builds lookup indexes.
src/lib/reference-data.ts  the 7.0 MiB lazy pack (presets, strategies, upgrades, configs).
src/lib/reference.ts  useReferencePack() hook — the only supported way to read it.
src/lib/store.ts      single mutable AppState + all actions + persistence + save normalization.
src/lib/selectors.ts  pure derivations. No React, no side effects.
src/pages/*           16 feature pages, all lazy-loaded from App.tsx.
src/components/*      Shell (nav + scale driver), ui.tsx primitives, ItemDrawer, Art, Icon.
src-tauri/src/lib.rs  desktop shell: window sizing, native backups, renderer selection.
```

### The state model — the thing most likely to trip you

`AppState` is `{ schemaVersion: 1, characters[], activeCharacterId, settings }`. Persisted to
`localStorage` key `er-companion.state.v1`, debounced 180 ms, corrupt copy at
`er-companion.state.corrupt`.

Two scopes, and putting a field in the wrong one causes subtle data loss:

- **Character (lifetime):** `items`, `itemCounts`, `itemOrigins`, `farmables`, `loreRead`,
  `endings`, `achievements`, `equipment`, `equipmentMode`, `desiredBuild`, `statSnapshots`,
  `progressionChecks`, `journeys[]`.
- **Journey (resettable):** everything in `JourneyState` — `steps`, `supplemental`, `decisions`,
  `bosses`, `materials`, `merchants`, `finite`, `worldChecks`, `upgradeCounts`, `bossReveals`,
  `decisionChecks`, `sweepDeferred`, etc.

**`desiredBuild` vs current stats is a deliberate separation and a bug fix.** `applyProfile(id)`
writes `character.desiredBuild` ONLY. It must never touch `stats` or `equipment`, because the old
behaviour destroyed live characters when previewing a level-200 build. If you add a new "apply
build" path, it goes to `desiredBuild`.

**Saving:** `normalizeState` hard-rejects anything without `schemaVersion: 1`. Every new field must
be added to the relevant `normalize*` function with a safe default, or old saves silently lose it
and future saves fail to load. Unknown keys are preserved deliberately; legacy `RTE-*` step ids are
remapped through `legacy-step-map.json`.

---

## 5. Data pipeline — regenerate in this order

Source of truth is the workbook (`Elden Ring Definitive Companion — v1.1.0 — Production
Certified.xlsx`, 79 sheets) plus normalized Redmaw/wiki scrapes in `research/`. Never modify the
workbook.

```bash
# 1. Workbook → seed JSON (only when the workbook changes)
npm run extract

# 2. Research + seed → full-game JSON
python3 scripts/build_full_content.py

# 3. Beyond-Redmaw ledgers (network; writes research/ + normalized copies)
python3 scripts/research/fetch_world_objects.py --refresh
python3 scripts/research/fetch_upgrades.py --refresh
python3 scripts/research/fetch_reference.py --refresh
python3 scripts/research/build_branch_plan.py
python3 scripts/research/build_area_sweeps.py

# 4. Sweep steps — depends on area-sweeps + items.full + farms + materials + world.objects
python3 scripts/research/build_sweep_steps.py

# 5. Split the build pack (after any builds.json change)
python3 scripts/split_build_pack.py

# 6. Gate
python3 scripts/verify_release_data.py
```

### The sweep-step ledger (added 2026-10-29, central to the product now)

`src/data/sweep-steps.json` — 152 steps / 1,880 rows, generated by
`scripts/research/build_sweep_steps.py`. Purpose: **every catalogue item and crafting material
has an actionable step**, which was the user's biggest complaint.

- Kinds: `merchants` (23), `farmables` (24), `pickups` (55), `materials` (42), `cleanup` (8).
- Each step has `afterStepId` (a real route step it renders after), `area`, `kind`, `entries[]`.
- An entry resolves by one of four keys, in this precedence:
  `itemId` (catalogue ownership) → `materialId` → `purchaseId` (merchant inventory row) →
  `farmId` (farmable ledger row). The last three exist because ~240 merchant rows and 4 DLC drops
  have **no** catalogue record (ammo, consumables).
- `sweepEntryAcquired()` in `selectors.ts` mirrors that precedence. **Catalogue ownership wins**,
  which is what makes "farm it once, cleared in every area" work. Do not reorder it.
- Cleanup steps exist for 723 records whose source pack records no location. They say so. Never
  invent a location to make a cleanup row disappear.

If you regenerate, `verify_release_data.py` fails if any catalogue item or obtainable material
loses its step, or if any entry resolves to nothing.

---

## 6. Non-obvious decisions and traps

**Bundle size.** The initial chunk is ~12.4 MB raw / 1.5 MB gz. That is mostly
`route.full.json` (5 MB) + `items.full.json` + `descriptions.json`, all needed by the shell's
progress counters on every page. `builds.json` was split: 0.85 MiB core stays eager,
6.9 MiB reference pack is lazy, and `boss-index.json` (1.7 KiB) gives boss names + strategy counts
to the shell/search. Don't add another eager import to `data.ts`.

**Scaling.** `resolveUiScale` in `Shell.tsx` uses the **logical viewport**, not
`innerWidth * devicePixelRatio`. A 4K panel at 200% OS scaling reports 1920×1080 and must get
scale 1.0; multiplying by DPR double-scales and was a real bug. Thresholds: ≥2000 short edge or
≥3400 long edge → 1.25; ≥1300/2400 → 1.1. `interfaceScale: "large"` pins 1.25.

**Performance.** All `backdrop-filter` was removed and `body::after` deleted — they forced full
repaints on WebKitGTK. Do not reintroduce blur on the sidebar, topbar, drawer or palette. Long
lists use `content-visibility: auto`. The Rust shell now defaults to hardware rendering on Linux;
the old unconditional `WEBKIT_DISABLE_DMABUF_RENDERER=1` was the reported AppImage lag.

**Merchant state.** The workbook merchant ledger (`MER-A1-…`) and the full inventory
(`MERCH-kale-1`) are different id spaces. `MERCHANT_INVENTORY_ID_BY_LEGACY_ID` bridges them and
FarmsPage routes both checkbox paths through the canonical id. Never write a legacy key again.

**Lore matching.** `QuestsPage` has `NPC_LORE_ALIASES` and `NPC_LORE_NOTES` because exact
normalized-name matching missed 21 of 38 world-state NPCs (`Blaidd` vs `Blaidd the Half-Wolf`).
All 74 rendered names resolve now. Add to the alias map rather than loosening the matcher.

**Progression keys** are `${archetypeId}:${nodeId}` so two builds don't share ticks.
`setProgressionCheck(archetypeId, nodeId, value)` takes three args.

**Step deep links.** `?step=` must resolve through `STEP_BY_ID ?? STEP_BY_SOURCE_ID ?? remapStepId`
plus `SWEEP_STEP_BY_ID`. World objects store Redmaw source ids (`w2-1`), not `RW-B-w2-1`; that
mismatch silently broke every Atlas link once.

**Error boundary.** `App.tsx` wraps pages in `PageBoundary`. Keep it — without it one render throw
blanks the entire app, which is how a stale-HMR error looked like total failure.

---

## 7. What is verified vs open

Verified by actually running it (not just tests):

- Applying a level-200 target on a level-9 character leaves live stats at 9; target becomes 200;
  survives reload.
- Character create (named) and delete (confirm + last-character guard) from Character page.
- Boss reveal → "Hide again" clears `journey.bossReveals` and re-seals; persists.
- Sweep tick writes the right ledger (`items`/`materials`/`merchants`/`farmables`) and shows up on
  Collection / Materials / Farms.
- Workbook merchant tick makes the inventory row tick and vice versa (one canonical key).
- `/journey?step=w2-1` opens Step 15.
- Scale reads 1.0 / 1.1 / 1.25 at 1080p / 1440p / 4K; 4K@200% stays 1.0.
- 20 scroll steps over 3,921 px: 0 long tasks; computed `backdrop-filter` none.
- Production build: all 12 routes render, service worker precaches 62 entries, offline reload works.
- Desktop: `.deb`, `.rpm`, `.AppImage` build. The AppImage runs: `WebKitWebProcess` spawns under
  the app and reaches ~406 MB RSS, which means the 12 MB bundle parsed and React mounted (a blank
  webview sits near 60 MB). **No screenshot of the desktop window was captured** — X11 auth is
  denied from this shell (`xprop` fails, no `~/.Xauthority`), KWin's screenshot DBus interface is
  unavailable, and `spectacle` captures a black frame. Treat *visual* desktop QA as unverified;
  the process-level evidence above is what exists.

Open / deliberately not done:

- **Build, tier and encounter rankings are still the Regulation 1.16.1 baseline.** Re-ranking for
  1.17 is a content-authoring job needing patch-by-patch review, not a refactor. The Patch page
  labels this honestly; keep it labeled.
- 1,017 catalogue records have no recorded location. They are trackable via cleanup steps but not
  placed. Do not fabricate locations.
- 7 of 43 branch rewards have no catalogue row. Labelled with reasons.
- Dialogue is intentionally untracked; no scope counts it.
- Licensing / redistribution review is outstanding and gates any public release.
- Live game link: research only. Phase 1 would be a read-only save watcher; DLC event flags are
  effectively unmapped in community tables (~0.2% joinable), so scope any promise to the base game.

---

## 8. Release process

Version lives in **four** files and they must agree: `package.json`,
`package-lock.json` (root `version` and `packages[""].version` only — do not touch dependency
versions), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

CI (`.github/workflows/desktop.yml`) runs on `push` of a `v*` tag or manual dispatch; it builds
Linux/macOS/Windows but **only uploads workflow artifacts** — it does not attach them to a release.
To publish, build locally and use `gh`:

```bash
npm run desktop:build
gh release create v1.2.0 --title "…" --notes-file notes.md \
  "src-tauri/target/release/bundle/deb/…deb" \
  "src-tauri/target/release/bundle/appimage/…AppImage" \
  "src-tauri/target/release/bundle/rpm/…rpm" SHA256SUMS.txt
```

macOS and Windows installers are **built by CI, not here** — this host has only the
`x86_64-unknown-linux-gnu` Rust target, and a Tauri NSIS `.exe` needs a Windows toolchain. The v1.1.0
release got its `.exe` and `.dmg` by `gh run download <run-id>` + manual upload (see
`/tmp/ci-1.1.0/` for that layout). As of v1.2.0 the workflow's `publish` job does this itself.

**Every release must carry Linux *and* Windows.** A Linux-only release is incomplete. If you are
assembling by hand because CI is unavailable:

```bash
gh run list --workflow=desktop.yml --limit 1
gh run watch <run-id> --exit-status            # wait for windows + macos jobs
mkdir -p /tmp/ci && cd /tmp/ci && gh run download <run-id>
# then upload the .exe / .dmg / .deb / .rpm / .AppImage alongside SHA256SUMS.txt
```

Do not describe "this machine cannot build Windows" as the reason a release lacks a `.exe` — it is
the reason CI exists, not an excuse to skip it.

**Do not claim a release is complete until the assets are attached and the release page lists
them.** A tag alone ships nothing.

### Release gotchas found the hard way (v1.2.0)

- **The repo is private.** `https://github.com/…/releases/download/…` returns `404` for anyone not
  authenticated, including your own `curl`. That is not a broken upload. Verify assets with the
  API instead:
  ```bash
  gh release view v1.2.0 --json assets --jq '.assets[] | "\(.name) \(.size) \(.state)"'
  curl -sSL -H "Authorization: token $(gh auth token)" -H "Accept: application/octet-stream" \
    -o out.bin "https://api.github.com/repos/nero-/er-companion/releases/assets/<asset-id>"
  ```
  Then compare `sha256sum` against the built file. A 9-byte download is the string `Not Found`.
- **`gh release create` / `PATCH /releases` intermittently return HTTP 500** on this repo. Workaround
  that worked: `DELETE` the broken release, then `POST /releases` with a JSON body containing
  `tag_name`, `name`, `body`, and no assets; then `gh release upload` one asset at a time.
- **GitHub rewrites asset names**: spaces become dots
  (`Elden.Ring.Definitive.Companion_1.2.0_amd64.deb`). `SHA256SUMS.txt` keeps the original names,
  so document the mapping or users will report a mismatch.
- Uploading the 114 MB AppImage is fine, but do it alone — batching it with other assets was part
  of what tripped the 500.

---

## 9. Working style the user expects

- Fix root causes, not symptoms. The user sends bug lists; they expect every item addressed or
  explicitly explained, not silently dropped.
- When the user asks "what do you think" about a design (they did this for the soft-cap section
  and the phase-gate banner), give an opinion with reasoning, then implement.
- Verify in a running build. Tests passing is not proof a feature works; three real bugs this
  session were found only by exercising the UI.
- Parallelise with subagents for disjoint files; keep shared contracts (types/store/data/selectors)
  to a single owner. Give each subagent the exact contract, file list, and "do not run gates".
- Commit per coherent phase, then push. The user checks GitHub.
