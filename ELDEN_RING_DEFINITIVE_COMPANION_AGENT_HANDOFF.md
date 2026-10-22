# Elden Ring Definitive Companion — Agent Handoff & Audit-First Development Brief

> **Document type:** Working project brief and execution instructions for a software-development agent  
> **Prepared:** 2026-10-21  
> **Mission:** Audit the current codebase **and** the existing Excel/Google Sheets-derived workbook, establish their actual state, then continue the existing project toward a polished, offline-capable **web-first Elden Ring companion** without discarding verified work.  
> **IMPORTANT:** This document is a handoff based on prior project discussions. **It is not itself an audit or proof that any feature exists today.** Verify historical claims against the actual files, repository, tests, and source material before using them as development assumptions.

---

## 0. Agent operating instructions — read first

You are the lead software engineer, data-migration engineer, QA auditor, and product architect for **Elden Ring Definitive Companion**. The user wants you to **continue the current project**, not produce a fresh demo or rewrite an existing application without justification.

### Mandatory sequence

1. **Locate the artifacts:** Find the existing application repository, the most recent usable workbook (`.xlsx`, `.xlsm`, or native Google Sheets export), associated Apps Script/source files, prior exports/backups, design notes, and any `AGENTS.md` / repository-specific instructions.
2. **Conduct a full baseline audit before implementing features or migrating data.** Inventory the code and workbook, reproduce tests/builds, identify regressions and data/schema risks, document discrepancies, and compare real progress against this handoff.
3. **Write an evidence-backed audit report and prioritized gap analysis.** Separate *verified working*, *partially implemented*, *stub/mock*, *broken*, *not present*, and *unknown*.
4. **Decide how to extend the existing codebase rather than replace it.** Document the smallest safe architectural changes needed to support both browser/PWA and desktop/Tauri.
5. **Only after the audit is complete**, implement the first bounded, highest-value development slice (preferably a verified workbook-to-app import for one complete area connected to persistent route progress), if the available artifacts and test baseline support it.
6. Run tests, record results, explain changes, and leave a reproducible next-step plan for a following agent.

### Non-negotiable safeguards

- **Never overwrite, modify, or destructively normalize the original workbook.** Make hashed, read-only source copies for analysis when needed.
- **Do not reset or clobber application progress, existing DBs, git history, local backups, secrets, or user data.** Inspect `git status` first; respect uncommitted work.
- **Do not execute untrusted macros or imported spreadsheet scripts blindly.** Review Apps Script/VBA, external references, formulas, and dependencies before running them.
- **Do not assume the workbook and all its Apps Script automation are represented in an `.xlsx` export.** Locate separate `.gs`/`appsscript.json` or documented code where available; explicitly report any absent logic.
- **Do not treat illustrative counts or old milestone labels in this file as audited truth.** Recount and independently validate them.
- **Do not confuse guide content with freely republishable content.** Preserve sources and attribution; assess copyright/licensing/permission before redistributing third-party guide prose, images, proprietary map assets, or bulk extracted data.
- **Do not claim completion based only on green unit tests or existence of UI elements.** Check whether real data is wired to every feature and whether progress survives restart/refresh.
- **Do not make scope-changing rewrites, high-risk migrations, external deployments, account changes, or irreversible operations without an explicit rationale and, where appropriate, approval.**
- Be autonomous with normal, reversible development once the audit establishes a safe baseline. Ask only about material blockers, missing artifacts, licensing decisions, or destructive steps.

### Required first user-facing update

Summarize (a) which repo/workbook artifacts were found, (b) whether the working tree has uncommitted changes, (c) the baseline test/build status, (d) the key uncertainties, and (e) the audit outputs being prepared. If the Excel file or repo cannot be found, say so; **do not invent their contents**.

---

## 1. Product vision

**Elden Ring Definitive Companion** is intended to be the most reliable integrated companion for **Elden Ring** and **Shadow of the Erdtree** and **Tarnished Edition**: a guided route, a comprehensive completion tracker, and a persistent character/journey planner. It should help a player experience as much of the game as reasonably possible, understand what is happening, avoid irreversible misses, develop builds, and carry achievements across multiple NG+ journeys.

**It is not just a repackaged walkthrough.** It must connect **where the player is**, **what they have done**, **what they own**, **which NPC choices were made**, **what build they use**, and **what comes next**.

Product principles:

1. **Completeness:** Permanent/unique collectibles, bosses, important optional content, NPC interactions, quests, achievements, endings, base game and DLC.
2. **Trustworthy progression:** Coherent chronological route, quest dependencies, exact source provenance, verifiable warnings, controlled deviations from source guide ordering.
3. **Character awareness:** Build and equipment advice informed by current character level, selected build, acquired items, upgrade access, and boss context.
4. **Persistence across journeys:** Preserve lifetime accomplishments while accurately resetting journey-specific events and world state on NG+.
5. **Offline-first functionality:** Play-time navigation and tracking must work without internet once content is installed/cached.
6. **Auditable engineering:** Structured datasets, stable content IDs, repeatable migrations, validation, regression tests, and non-destructive upgrades.
7. **Unified yet understandable UX:** Make it simple to follow the next objective; allow detail on demand without overwhelming the player.
8. **True Production Quality:**It must end up as a lightweight, beautiful, production-ready, UX/UI.

### Intended players and use cases

- A first-time completionist following a spoiler-aware route.
- A returning player who wants to track all collectibles/quests and prepare for the next region.
- A high-level NG+ player switching between many PvE/PvP builds.
- A handheld/desktop player using an offline companion beside the game.
- A player researching why a given route step matters, what it unlocks, and what becomes unavailable if skipped.

---

## 2. Source guides versus the companion — critical distinction

Prior work draws on, but is **not synonymous with**, the following references:

| Source | Intended role | Distinctive strengths | What **our product must add** |
|---|---|---|---|
| [Redmaw Elden Ring Completion Sheets](https://eldenring.redmaw.dev/sheets/walkthrough) | **Primary chronological route reference** | Extensive base-game and DLC walkthrough, item/boss/NPC steps, route ordering, missable notes, existing progress tools | Integrate its verified route structure with *our own* quest-state engine, build data, persistent player state, lifetime tracking, and audits; do not falsely claim Redmaw lacks progress features |
| [Roundtable Hold](https://roundtablehold.net/) | Secondary walkthrough/progress reference and coverage cross-check | Alternate organization and progression reference | Resolve gaps/conflicts, attach provenance, maintain one consistent player state |
| [Future Press Books of Knowledge](https://www.future-press.com/elden-ring-books-of-knowledge/) | Deep secondary reference for mechanics, lore, equipment, encounters | Rich explanatory/reference content | Curated, independently worded, source-attributed explanations surfaced *when relevant*, not copied books |
| Other verified game/community sources (e.g., Fextralife, map audits, collection audits, game testing) | Coverage and accuracy checks | Alternate evidence for locations, drop conditions, items and patch effects | Validation metadata, conflict resolution, completeness metrics, patches |

**Important:** Redmaw is already a relatively sophisticated tracker/web app, including route checklists and progression management. **The differentiator is contextual integration**, not merely presenting its route online. The companion should answer combined questions such as: *Is this item available to me now? Have I acquired it? Does my current build need it? Does an NPC choice affect it? Should I collect it before the next boss or NG+?*

### Rights and distribution gate

Before shipping any adapted route text, images, item art, maps, or bulk structured excerpts from third-party sources, inspect the actual license/terms, consider permissions, and document a safe content strategy. Use independently authored directions/summaries, verified game facts, deep links, attribution, or licensed data as appropriate. **Do not silently wholesale-scrape or publish copyright-protected guide content.** A local personal workbook is not automatically cleared for public redistribution.

---

## 3. Original design decisions to preserve unless the audit reveals a conflict

### Completion scope

- All significant bosses, including optional bosses and invasions relevant to completion.
- Permanent, rare, and unique collectibles: weapons, armor, talismans, spells, incantations, Spirit Ashes, Ashes of War, cookbooks, gestures, key items, and other relevant rewards.
- NPC quests, consequential dialogue and branching choices, missed interactions, and end-state outcomes.
- Locations, dungeons, special encounters, secrets, major upgrade resources, achievements, ending paths, and DLC-specific progression.
- Uniquely obtainable drops and reasonable finite farming; ordinary repeatable crafting material farming should usually be supplemental, not block main progression.
- Strong pre-NG+ audits and subsequent-journey coverage for mutually exclusive rewards.

### Route philosophy

- Favor a natural, readable and narratively coherent completionist route rather than speedrun efficiency.
- Reduce unnecessary backtracking when possible **without** sacrificing quest dialogue, missable opportunities, exploration, or intended difficulty.
- Prior planning specifically placed **Shadow of the Erdtree after Maliketh and before final Ashen Capital/endgame completion**. Treat this as a historically chosen ordering, not an unquestionable requirement: validate quest/world-state consequences, player level and actual dependencies before locking it into canonical content.
- Plan endings carefully, with **Ranni's Age of Stars** as the intended final master-character story outcome; other endings/achievements may be managed through suitable native save backups and/or additional journeys. Do not assume simultaneous mutually exclusive endings are possible in one unbranched playthrough.

### Multi-character / NG+ philosophy

- One long-lived primary character may proceed across many NG+ cycles and high levels.
- Historical plans included level-150 and level-200 anchors for builds plus a separate level-150 PvP profile/character where useful.
- Build libraries should support flexible archetypes, alternate loadouts, and high-level experimentation.
- Maintain distinct concepts of **character**, **save/profile**, **journey**, **quest decision**, **route-step completion**, **current inventory**, and **lifetime acquisition**.
- Avoid third-party save editing as a dependency. Native/platform-supported backups are preferred, with strong warnings about overwritten saves and platform restrictions.

---

## 4. Historical progress — to verify, not assume

### 4.1 Google Sheets / Excel-derived companion

Prior reports describe a mature Google Sheets implementation containing:

- **79 worksheets**, including **17 player-visible tabs**.
- **4,477** certified Redmaw route steps in the referenced production baseline.
- **14** major build-parent archetypes, **28** profiles, **108** loadouts, and **2,206** encounter presets.
- Dashboard navigation, area selection, previous/current/next controls, step tracking and automatic progress calculations.
- Interleaved **Redmaw route steps** and independently authored **Companion supplemental actions**.
- Build Center / Build Dashboard with attributes, equipment, tier/profile/loadout selectors, encounter target and approach, and some dynamic recommendations.
- Collection, NPC/quest, boss, reference, farming/resource, lore, completion, pre-NG+, journey, save, and achievement planning components.
- Validation, regression checks, migrations, protected player inputs, source-linked data, and Apps Script logic.

Reported milestones:

| Reported milestone | Historical claim | Agent verification required |
|---|---|---|
| Production v1.0.2 | Workbook v12.43 / Companion v10.43, Hotfix 14, dashboard/build repair and certification | Find actual release files/logs; rerun tests and compare behavior |
| Navigation v1.1.0 | Workbook v12.44 / Companion v10.44, current-step directions window and later target-selection hotfix | Confirm file version, directions data, dependencies, working selectors |
| Patch work | Isolated analysis/update package for game patch 1.17 / Tarnished Pack changes | Find patch artifacts; verify applicability, release/version status and rights before merging |

**Do not use the above counts to generate missing rows.** Check the physical workbook and classify every number as observed, derived, or unresolved. If the supplied Excel export lacks Apps Script, query other local artifacts; if scripts are inaccessible, report that limitation instead of presenting the export as the entire original system.

### 4.2 Standalone app

Historically discussed stack:

- **React + TypeScript + Vite** for frontend.
- **Tauri 2 / Rust** for a Windows desktop wrapper (including possible handheld/Legion Go S use).
- Planned **SQLite** for canonical application data/local state (not necessarily implemented).
- Shared UI components, app shell, navigation, initial player-state/persistence features, and sample route/build data.
- Development phases reportedly passed through **0H**; **0I** had begun but its final acceptance is unconfirmed.
- **Full production workbook data migration had not been verified as completed** when the previous status summary was written.

**Actual repository inspection overrides every one of these descriptions.** There may have been further development after the historic summary. Look for the most recent branches, tags, scripts, test runs, data directories, application packaging, and local artifacts.

---

## 5. FULL AUDIT — required before development

Perform a comprehensive, evidence-backed audit. Work read-only wherever practical. For any test that writes generated files, run in a controlled development copy or explain the side effects. Capture date, environment, repository commit, workbook filename, size, hash, and every test command/result.

### Audit A — repository, branches, instructions, and existing implementation

1. Discover the project root(s); locate `README*`, `AGENTS.md` (including nested instances), package manifests, lockfiles, workspace config, `src-tauri`, CI, test tooling, prior audit docs, migrations and schema files.
2. Inspect `git status`, current branch, HEAD, tags, recent commits, untracked files, and existing changes. **Do not reset, stash, checkout destructive branches, or rewrite history.**
3. Map the actual application modules and state flows: route browsing, directions, checklists, collections, character/builds, quests, bosses, lore, completion, NG+, settings, backups/import/export, search, persistence, onboarding.
4. For each feature, classify: `VERIFIED`, `PARTIAL`, `MOCK_ONLY`, `BROKEN`, `MISSING`, or `UNVERIFIED`. Include file paths/functions/tests proving classification.
5. Run existing lint/typecheck/unit/integration/build/smoke tests, using the project's lockfile-supported package manager. Check browser startup and Tauri integration *only if the environment supports them*; do not fake pass results for unavailable platforms.
6. Validate mobile/handheld/responsive layouts, keyboard navigation, offline behavior and accessible labels if already implemented.
7. Inspect data flows for duplicated mutable state, unsafe ID coupling to row numbers, brittle local storage keys, corrupted saves, missing schema versions, and hidden coupling to mock data.
8. Check dependency/security posture: vulnerable or abandoned dependencies, CORS/remote content use, external services, secrets, unsafe HTML rendering, and update strategy.

**Deliver:** implementation inventory, architecture map, test matrix, known bugs, integration risks, and precise current app baseline.

### Audit B — workbook structure, formulas, scripts, and live behavior

1. Enumerate **all worksheets**, hidden/very-hidden states, tables, named ranges, external links, charts/pivots as applicable, protected ranges, merged regions, data-validation rules, conditional formats, column headers, IDs, row counts, and formulas.
2. Identify the workbook's *version markers*, declared release notes, tests, audit tabs, and certified snapshots. Preserve the workbook's original ordering and formatting in the archive.
3. Trace all user-facing sheets and their dependencies onto hidden/internal tables, formula networks and Apps Script/UI automation. Note missing scripts explicitly.
4. Separate **static canonical content** (route steps, items, bosses, NPCs, source metadata, lore, loadouts) from **derived calculations**, **user choices/progress**, and **UI/layout workarounds**.
5. Inspect every primary data domain for keys, duplicate IDs, blank IDs, orphaned relations, mixed types, inferred columns, duplicate content, non-deterministic references and broken formulas.
6. Catalog Redmaw route records, Companion supplemental records, area boundaries, step ordering, direction text, source links, checklist semantics, conditional branches and warnings.
7. Catalog all build parents/profiles/loadouts, level tiers, attributes, equipment, affinity/skill references, encounter types/targets/approaches and preset rules. Verify observed counts against historic figures.
8. Audit collections, boss lists, NPC choices, ending flags, journey markers and dependency graphs. Determine whether these are complete datasets or partially implemented worksheets.
9. Check version/game-patch assumptions; flag possible outdated or conflicting data, without applying speculative fixes.
10. Validate spot checks **by following actual references** from a dashboard control to the underlying rows/formulas/scripts; do not equate the presence of a sheet with functional completion.
11. Look for privacy-sensitive player saves or personal data, external formulas, script permissions, credentials, and network calls; protect them.

**Deliver:** workbook inventory/data dictionary, formula/script dependency map, counts and integrity report, functionality assessment, and safely exportable data candidates.

### Audit C — crosswalk between workbook, app, and guides

Create a row-by-row **feature crosswalk**, with columns such as:

`Domain | Workbook sheets/fields | Script/function | App module | Migration status | Source/provenance | Verified test | Gap | Priority`

At minimum map:

- Route areas, Redmaw steps and Companion supplemental steps.
- Directions/navigation and step completion.
- Character, builds, profiles, equipment, encounters and upgrade recommendations.
- Items, acquisition conditions, collections, achievements and unique drops.
- NPC quests, state transitions, decisions and missables.
- Bosses, strategies, level guidance and combat encounter presets.
- Lore, locations, maps/reference links, farming resources.
- Save planning, endings, pre-NG+ closeout, per-journey versus lifetime progress.
- Import/export, backups, validation, coverage reports and update/migration procedures.

Capture discrepancies with reproducible examples, not speculation. Identify when a feature is **spreadsheet-only**, **app-only**, **duplicated**, **stale**, or **truly working end-to-end**.

### Audit D — content integrity, licensing and patch compatibility

- Compare route/source provenance to current usable source links; record dead links and disagreements.
- Identify copied or licensed third-party guide text/images. Document publication/distribution risks before shipping a public web app.
- Distinguish objective game facts from editorial directions or strategies.
- Establish game build/patch metadata per relevant dataset; review the earlier patch 1.17/Tarnished Pack notes if present, but do not assume every patch detail is correct.
- Flag branches/mutually exclusive rewards, irrevocable world states and DLC/ending ordering hazards.
- Enumerate completion metrics: unique-content coverage, missing area links, missing references, empty directions, unknown NPC dependencies, build references to nonexistent items.

### Audit E — architecture and migration feasibility

Evaluate, with evidence, the smallest sound shared-app approach:

- Shared **React/TypeScript UI and deterministic domain logic**.
- **Web/PWA adapter** for offline browser storage, likely IndexedDB or another proven offline-compatible engine.
- **Tauri adapter** for desktop-specific persistence/capabilities, potentially SQLite.
- One versioned **canonical content format**, with a separate versioned **player-save schema**.
- Deterministic import/export and migration behavior, stable identifiers and clean fallback when source data changes.
- Investigate existing implementation first; do **not** select a new database/framework simply because this document proposes one.

Compare options for bundle size, performance, offline guarantees, Tauri compatibility, synchronization readiness, backup/restore, schema evolution and maintainability.

### Audit F — end-user experience

Inspect what happens during a real guided play session:

1. Choose/start a character and journey.
2. Open an area and see the **next actionable route step with directions**.
3. Mark a step done; navigate previous/next; refresh and restart; confirm persistence.
4. View supplemental steps and warnings in the intended sequence.
5. Inspect an item/quest/boss connected to that step.
6. Change build/profile and encounter selection; verify calculated recommendations against the underlying data.
7. Export a backup, import to a test profile, and verify fidelity if the feature exists.
8. Verify a journey reset does not erase lifetime acquisitions or prior journey history.
9. Use narrow screen/offline mode if supported.

For absent or incomplete steps, record exactly where the flow breaks.

---

## 6. Required audit artifacts

Write these under `docs/audit/` or the existing repo documentation convention **without overwriting older audit artifacts**. Use dated filenames/subdirectories if the paths already exist.

| Artifact | Required contents |
|---|---|
| `docs/audit/BASELINE_AUDIT.md` | Executive findings, discovered artifacts and versions, environmental caveats, git state, evidence links, test/build outputs, bugs and blockers |
| `docs/audit/WORKBOOK_DATA_DICTIONARY.md` | Sheet inventory; columns, keys, formula/script relationships, record counts, source provenance and extraction constraints |
| `docs/audit/FEATURE_CROSSWALK.md` | Workbook → application mapping with VERIFIED/PARTIAL/MOCK_ONLY/BROKEN/MISSING/UNVERIFIED status for every major system |
| `docs/audit/DATA_INTEGRITY_REPORT.md` | Duplicate/orphan/blank IDs, empty fields, coverage, integrity checks, source problems, checksum strategy and sample reconciliation |
| `docs/audit/ARCHITECTURE_DECISION.md` | Current architecture vs minimum-change web-first architecture, tradeoffs, decision, migration/storage/backups and known risks |
| `docs/audit/PRIORITIZED_BACKLOG.md` | Ordered work packages with dependencies, effort/risk, testable acceptance criteria and definition of done |

Add machine-readable inventories (`.csv`/`.json`), a concise test command transcript, and small migration probes as appropriate. **Include provenance:** repo commit and workbook checksum in every audit run; label conclusions as observed or inferred.

### Audit exit gate

No production data migration or feature-building beyond diagnostic probes until:

- The current repo and workbook are positively identified or their absence documented.
- Baseline tests and build status are known.
- The source workbook is preserved untouched and checksum-recorded.
- Critical workbook domains, scripts and app modules are inventoried.
- Major gaps/risks and source/IP issues are documented.
- A minimal first implementation slice with measurable acceptance criteria is chosen.

If a critical input is missing, complete all feasible audit work, state exactly what is blocked, and request the **specific path/file/export** needed. Never fabricate workbook data or mark migration done.

---

## 7. Product modules and target functionality

Treat this as the feature specification to reconcile with the audit—not as a claim of implementation.

### M1 — Guided Journey / Route Engine (first-class MVP)

- Redmaw-based, validated chronological route combined with Companion supplemental actions.
- Area and step navigation; clear current/previous/next actions; directions; optional detours; notes.
- Filtering, search, hide/show optional content, accurate per-area and total completion.
- Source attribution, warnings and prerequisite/dependency displays.
- Distinguish automatically completed, manually completed, skipped, deferred, impossible-on-this-branch, and pending states where needed.
- Maintain progression if route order or content changes across releases.

### M2 — Character & Build Center

- Character profiles, class, level, attribute spread, progression tiers (including 150/200 anchors), respec/loadouts.
- Weapons/armor/talismans/spells/Physick/upgrade choices and saved variants.
- Encounter-specific presets and recommendation explanations.
- Recommendations constrained by owned/obtainable equipment and progression; distinguish theorycrafting from presently equippable options.

### M3 — Collection & Armory

- Searchable, categorized collectible catalog with item IDs, acquisition conditions, optional map/source references, current ownership and lifetime acquisition history.
- Duplicate/variant handling, unique rewards and mutually exclusive choices.
- Upgrade resources, crafting and sensible finite farming references.

### M4 — NPC Quest & Consequence Engine

- Stateful quest milestones, NPC location shifts, dialogue, dependency ordering and mutually exclusive branches.
- Clear warnings at the decision point, ideally with reversible user confirmation for tracker edits.
- Journey-specific quest state, persistent decision history and link to affected items/achievements.

### M5 — Boss & Encounter Assistant

- Boss order, zone, optionality, weaknesses/resistances, major encounter constraints and preparations.
- Contextual build presets and accessible gear recommendations, with sources and assumptions.

### M6 — Lore & Narrative Context

- Opt-in, spoiler-aware lore snippets connected to route milestones and newly encountered entities.
- Separate established facts, dialogue references, and interpretations/theories.
- Source-attributed, independently authored content.

### M7 — Completion / NG+ / Endings Manager

- Global, current-journey and lifetime dashboards with meaningful completion denominators.
- Achievement/endings tracking with known branch constraints, save-backup preparation warnings and per-journey outcomes.
- Pre-NG+ checklist, missable-content reconciliation, incomplete quests, unique pickups and journey transition confirmation.
- Non-destructive journey start with historical records intact.

### M8 — Reference Library & Exploration

- Unified search across all primary entities and gameplay references.
- Maps, item/location deep links, resource acquisition, explanatory mechanics and curated cross-references.

### M9 — Platform, Accessibility & Data Reliability

- Responsive browser experience, installable offline PWA and preserved Tauri desktop option.
- Fast navigation for mouse, touch/controller-friendly handheld usage where practical, keyboard and screen-reader support.
- Versioned saves, human-accessible export/import, explicit backup/restore UX, migrations, integrity checks and diagnostic reporting.
- Future optional cross-device sync, with explicit conflict-resolution rules; **do not imply local IndexedDB and desktop SQLite synchronize automatically**.

---

## 8. Proposed data architecture — subject to findings from the audit

The workbook may contain essential knowledge, but its worksheet coordinates, display labels and Apps Script specifics should not dictate the new data model.

### Separate the data into three layers

**A. Canonical, versioned game/reference content (mostly read-only):**

- `areas`, `locations`, `route_steps`, `route_step_dependencies`, `route_variants`, `source_references`
- `items`, `item_categories`, `item_acquisition_methods`, `equipment`, `upgrades`
- `npcs`, `quests`, `quest_stages`, `quest_decisions`, `quest_lockouts`
- `bosses`, `encounters`, `encounter_properties`
- `build_archetypes`, `build_profiles`, `loadouts`, `level_tiers`, `encounter_presets`
- `achievements`, `endings`, `lore_entries`, `patch_applicability`

**B. Versioned player data (read/write):**

- `characters`, `character_build_selections`, `character_loadouts`, `equipment_owned`
- `journeys`, `journey_step_progress`, `journey_quest_state`, `journey_decisions`, `journey_boss_results`
- `lifetime_acquisition_history`, `lifetime_ending_history`, `achievement_progress`
- `preferences`, `bookmarks`, `notes`, `backup_metadata`, `save_schema_version`

**C. Derived application state (recomputed):**

- Completion percentages, actionable next steps, missing items, warnings, available builds, boss preparedness, route gates, NG+ readiness and search indexes.

Derived state should not become an untraceable independent source of truth. Prefer pure deterministic functions and materialized caches that can be rebuilt.

### Identifier and migration rules

- IDs must be **stable** across route insertions, row moves, translations and presentation changes. Do not use `row 173` or step ordinal as the only identity.
- Preserve source workbook cell/sheet provenance and old row keys in import metadata, but generate durable canonical IDs with a published algorithm/mapping table.
- When IDs change, maintain explicit `old_id → new_id` migrations and test preservation of existing user progress.
- A route step is **not** the same object as an item, acquisition event, quest stage or achievement; connect them through relations.
- An item can be acquired without marking its source route step done, and a route step can be done without acquiring every related item. Model these independently.
- A mutually exclusive branch can be **unavailable this journey** and still be eligible next journey; do not mark it falsely complete or permanently unachievable.
- Source/author, source URL/citation, game version, validation timestamp/status and confidence should be available where relevant.
- Import must be reproducible/idempotent, with deterministic ordering and integrity checks.

### Why deterministic rules first

Most useful companion behavior—quest prerequisites, accessible equipment, missable warnings, next-step selection, pre-NG+ checks—can be driven by structured rules. **No LLM/AI runtime is required** for a reliable MVP. Conversational help could be added later, but it must not replace verifiable state logic.

---

## 9. Migration method — workbook → canonical data → app

**Do not attempt a blind export of every sheet into application database tables.** Use a documented domain-by-domain pipeline.

1. **Snapshot:** Preserve workbook file, Apps Script exports, relevant source notes and SHA-256 checksums.
2. **Inventory:** Generate data dictionary and classify source versus generated/derived/player-state fields.
3. **Schema proposal:** Draft stable entities/relationships and decision records, with schema/versioning plan.
4. **Small full-fidelity pilot:** Choose **one complete representative area** that includes route steps, Companion supplemental entries, source/direction links, at least one NPC dependency and an item/encounter link. Import only after the audit exit gate.
5. **Reconciliation:** Check counts, IDs, ordering, field-level parity, references, directions, optional/required semantics and manual spot checks against workbook.
6. **Working UI integration:** Display pilot area using actual imported records—not hard-coded mocks. Mark steps complete, switch areas, refresh/restart, verify saved player state and import/export if supported.
7. **Regression:** Validate that changed route order does not remap or erase progress; verify content version migration.
8. **Scale:** Import remaining route areas, then collections, quests, builds/encounter presets, achievements/NG+, lore and references in dependency order.
9. **Publish gate:** Separate licensable/publicly distributable content from material requiring permission or local/private sourcing.
10. **Patch pipeline:** Version incoming changes as reviewable diffs; run automated integrity checks and manual targeted validation before release.

### Acceptance tests for migration

- Imported row counts reconcile exactly to validated source filters, with documented exceptions—never silently omitted rows.
- No duplicate canonical IDs; no unresolved foreign keys or invalid dependency targets.
- Route order preserves area and global sequence; supplemental steps are anchored reproducibly.
- Direction text/source links survive where legally usable.
- Existing player progress is preserved through reload and content version changes.
- No destructive changes to original workbook or existing player data.
- Tests use **real imported fixtures**, including branching and missing data edge cases.

---

## 10. Phased implementation plan (after audit)

| Phase | Objective | Exit / acceptance |
|---|---|---|
| **0. Audit & baseline** | Inspect repository, workbook, scripts, source rights, patch assumptions, and real app behavior | All six audit deliverables; reproducible baseline; chosen first slice |
| **1. Canonical models & import pilot** | Stable IDs, typed schemas, provenance, extraction pipeline, one complete area | Row-level reconciliation, source preservation and integrity tests |
| **2. Guided Journey MVP** | Full certified route + supplemental actions, directions, checklists, persistent progress and search | End-to-end journey tests; area counts verified; no mock-data dependency |
| **3. Web/PWA platform** | Deployable responsive browser build, offline assets/data, safe local save and export/import | Tested offline refresh/restart, mobile/handheld layout and backup restore |
| **4. Collection & quests** | Item ownership, NPC states, decisions, missable warnings, completion linkage | Branch and lockout tests; current-vs-lifetime state verified |
| **5. Builds & boss integration** | Bring over verified build parents/profiles/loadouts/encounter presets | Imported-data parity; representative recommended loadouts match workbook rules |
| **6. NG+ / endings / completion** | Per-journey/lifetime views, ending plans, audits, transition mechanics | Simulated multi-journey regression and non-destructive NG+ transition |
| **7. Lore and reference enrichment** | Spoiler controls, independent explanations, rich search/deep links | Source/provenance coverage, spoiler-state tests, performance budget |
| **8. Release hardening** | Performance, reliability, accessibility, licensing, distribution and patch pipeline | Reproducible release builds, recovery drills, coverage report, license review |

**Do not follow this phase ordering mechanically if the audit finds something else is already production-ready.** Preserve existing quality and prioritize the most valuable missing dependency.

---

## 11. Test strategy and quality gates

At minimum:

- **Unit:** canonical IDs, type/schema validation, completion calculations, quest-state transitions, route gating, encounter selection, migration mapping.
- **Importer:** no implicit formula evaluation; idempotence; duplicate/orphan detection; stable ordering; known input-to-output fixtures; checksum reports.
- **Integration:** data-to-view links, item/quest/boss relation resolution, profile switching, save persistence, multi-journey progression.
- **E2E:** start journey → complete steps → trigger warning → select build → inspect acquisition → reload → export/import → NG+ transition → revisit historical state.
- **Offline/PWA:** install/update cache, cold startup after installation, existing save while offline, cached data availability, storage errors and recovery.
- **Tauri:** platform adapter smoke tests, DB file permissions, Windows packaging where build environment allows, no accidental player-data loss.
- **UX/accessibility:** mobile widths, low-resolution handheld view, readable directions, accessible interaction, keyboard focus, no dead-end navigation.
- **Performance:** large route datasets, dashboard responsiveness, search latency and database size; measure rather than guess.
- **Safety:** backup/restore round trip, malformed import rejection, migration rollback/recovery, missing/renamed source entries.

**Definition of done for any feature:** real data, observable UI, documented semantics, persisted behavior, tests passing, any limitations stated, and no regressions in previously certified flows.

---

## 12. Recommended first implementation work package

After completing the audit and producing the audit artifacts, prefer the following **unless the real codebase already has it or the audit reveals a prerequisite blocker**:

### Pilot: complete one-area Guided Journey using genuine workbook data

Deliver:

1. A reproducible extraction script for a selected complete area, including Redmaw and Companion entries and per-entry provenance.
2. Canonical schema and stable-ID mapping with validation/error reporting.
3. App page showing the area's ordered combined route, directions, next action, source link, optional/required semantics and progress.
4. Persistent per-character/per-journey state, kept distinct from static content.
5. An integrity report with source-count reconciliation and manual spot checks.
6. Tests covering reload, skipped/deferred actions, stable IDs under inserted records, and a corrupted/unknown record.
7. Clear `README` instructions to repeat the extraction/import/test pipeline.

This proves the riskiest dependency—**faithful workbook-to-real-app migration**—and makes the rest of the plan safer.

### End-of-session report format

At every meaningful checkpoint, report:

- **Found / audited:** precise files, branch/commit, workbook hash, test environment.
- **Verified working:** tests and concrete observed behavior.
- **Gaps or failures:** issue, impact, evidence, severity, reproduction.
- **Changed:** files, rationale, schema implications, test results.
- **Next three tasks:** prioritized, bounded, independently testable.
- **Blocking questions:** only facts that cannot be determined from existing artifacts.

---

## 13. Final success definition

A user can start the companion in a browser, install it for offline use, or open the desktop edition; select their character and current journey; follow a validated chronological base-game/DLC route; mark progress; receive context-aware quest/missable guidance; access their builds, items and encounters; understand story context without unwanted spoilers; safely back up progress; and reliably prepare for and track NG+.

**The benchmark is not whether the UI looks like Redmaw or the workbook. It is whether it unifies guide content, player state, and deterministic progression intelligence into a more capable and more trustworthy experience—and whether the migrated data and saved progress remain correct over time.**
