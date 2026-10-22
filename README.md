# Elden Ring Definitive Companion

An offline-first companion for **Elden Ring** and **Shadow of the Erdtree**: a guided Act I route, whole-game companion chronology, master collection, certified builds, character planner, quest decisions, spoiler-gated lore, farms, tier lists, endings, and NG+ readiness.

The app is a **web-first PWA**: React 19 + TypeScript + Vite, static content extracted from the source workbook, and versioned local persistence. It installs for offline use, works at desktop and handheld widths, and is designed so a Tauri/Rust shell can wrap the same UI later without changing the domain model.

## Run

```bash
npm install
npm run dev
```

Production build and preview:

```bash
npm run build
npm run preview
```

Checks:

```bash
npm run typecheck
npm run test
```

The build is intentionally self-contained. Content is bundled; at runtime there are no API calls, accounts, or telemetry.

## Content provenance

The canonical content pack is extracted from:

- `Elden Ring Definitive Companion — v1.1.0 — Production Certified.xlsx`
- SHA-256: `9167efbd69b026f4ae844600ca3f63f5ab4234f58a0ba1057e4dc9c047897776`
- 79 worksheets (17 visible, 62 hidden)

### Live game version

Verified against official Bandai Namco sources on **2026-10-21**:

- Live: **App Ver 1.17.2 / Regulation Ver 1.17.3** (released 2026-10-20).
- **Tarnished Pack** released 2026-08-28 with patch 1.17: Idus Knight and Heavy Knight classes, new weapons/armor, three Spectral Steed attires, and two NPC invasions.
- The workbook build/tier/encounter data is authored against **Regulation 1.16.1**, so it predates the pack and the 1.17 balance pass.
- The app appends the 27 Tarnished Pack collection records and both invasion encounters from official/guide sources; build and tier recommendations are explicitly labelled as 1.16.1 baseline in **Patch & DLC**.

The original workbook is never modified. Re-run the extraction with:

```bash
npm run extract
```

The script writes deterministic JSON to `src/data/` and evidence to `docs/audit/`.

### Coverage boundary

The workbook export contains:

- **994 Act I route steps** with objectives, warnings, prerequisites, linked records, and area ordering.
- **116 whole-game companion/certification/ending actions** (the chronology), including DLC and NG+ preparation.
- **1,787 workbook-catalogued permanent items** plus **27 Tarnished Pack records** (1,814 total in the app), **318 farmables**, **107 crafting materials**, **318 finite pickups**, **167 merchant rows**, and **107 reward-bearing scarabs**.
- **14 certified parent builds** (plus 4 historical redirects), 28 Level-150/200 profiles, 108 loadouts, 123 tech nodes, 171 edges, 95 progression loadouts, 576 weapon configurations, 2,206 encounter presets, and 924 boss-strategy rows.
- **69 spoiler-gated lore journals**, 27 decisions, 6 endings, 7 certifications, 24 remembrances, 16 transition gates, and 866 tier entries.

The workbook's completion ledger references **4,477** route steps and 69 route sections, but only the **994 Act I steps** are present as structured step records in this export. The app does not fabricate the missing route sections. It exposes the Act I route in full and the whole-game companion chronology separately. See `docs/audit/BASELINE_AUDIT.md` and `docs/audit/DATA_INTEGRITY_REPORT.md`.

Some catalog records are source-enumerated without exact acquisition locations (1,074 base-game and 393 DLC records). They are tracked and displayable, but the app does not invent locations.

## Architecture

```text
src/data/*.json          extracted canonical content (static, versioned by source hash)
src/lib/types.ts         domain types
src/lib/data.ts          arrays + indexes (route, items, builds, world, farms, lore, tiers)
src/lib/selectors.ts     pure progress, collection, lore, equipment, and build selectors
src/lib/store.ts         versioned localStorage state + actions + import/export
src/lib/search.ts        global in-memory search index
src/pages/*              feature modules
src/components/*         shell, command palette, UI primitives, icons
scripts/extract_workbook.py  reproducible workbook → canonical JSON pipeline
docs/audit/*             evidence-backed audit deliverables
```

### State model

- **Character** owns lifetime data: collection, farmable quantities, lore reads, endings, equipment, and journeys.
- **Journey** owns resettable data: route/supplemental status, notes, NPC/dialogue state, decisions, boss results, finite pickups, materials, merchants, scarabs, certifications, transition gates, remembrances, and manually revealed lore zones.
- Starting a new journey resets journey state while preserving lifetime collection and endings.
- Completing a route step auto-acquires linked items/bosses/resources where the source links them. Undo does not revoke ownership; collection edits are explicit.

Persistence is `localStorage` under `er-companion.state.v1`, debounced, with corrupt-state backup to `er-companion.state.corrupt`. Export/import is human-readable JSON in Settings.

## Design

Dark, gold-accented, serif display type, dense-but-readable data surfaces. No UI framework, icon package, or external font request. The production bundle is roughly 11.8 MB of JS before gzip (about 1.29 MB gzip) because the full content pack is bundled for offline use, plus a PWA service worker precache (~11.6 MiB).

## Licensing / distribution

The workbook aggregates guide-derived content and third-party references. Before public distribution, review the rights for route prose, item data, maps, and images. The app preserves source links and attribution fields. This repository is a local companion build, not a legal clearance for republishing third-party guide content.

## Status

The UI modules are implemented against the extracted data. Verification is tracked in `docs/audit/PRIORITIZED_BACKLOG.md`; the current build passes typecheck, unit tests, and browser smoke checks.
