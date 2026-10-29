# Redesign and content expansion

This release replaces the dense, artwork-heavy layout with a calmer progressive-disclosure UI and fills the content gaps that blocked automatic tracking. Every number below is computed from the runtime JSON, not from prose.

## Interface

| Change | Detail |
|---|---|
| Progressive disclosure | `Disclosure` / `CollapsibleCard` primitives in `src/components/ui.tsx`; secondary panels start collapsed. Settings → **Information density** switches to **Everything**, which opens every panel via a DOM effect in `Shell.tsx`. |
| 4K / high-DPI | `Settings → Interface scale` (`Auto` / `Large`) plus `@media (min-width: 1900px)` and `(min-width: 2500px)` type and width steps; the Tauri window opens at 82%×86% of the current monitor, clamped 1024–1920 × 700–1280. |
| Sidebar | The top-left control now collapses the sidebar on desktop and toggles the drawer below 960px. The brand mark is a new Elden Ring emblem (`public/emblem.svg`). |
| Status indicator | The top-right chip reports real state (`Offline ready`, `Desktop · offline`, `Storage blocked`) and links to Settings. |
| Artwork | One hero image at most per page, and none on the utility pages. Dashboard varies by phase; Journey, Bosses, Quests, Lore, Atlas, Materials, Resources, Patch, Completion and Settings no longer use banners. |
| Handheld | Fixed four-item bottom navigation (Home / Journey / Collection / Search) below 760px; page bottom padding clears it. |
| Descriptions | Item, boss, NPC and area prose in the Collection, boss drawer, quest panel and lore drawer. |

## Data added

| File | Content | Source |
|---|---|---|
| `src/data/descriptions.json` | **2,042 items / 232 bosses / 52 NPCs / 66 areas** (58 items, 5 bosses, 6 areas unresolved and listed) | `{{Description}}` templates and page ledes on eldenring.wiki.gg |
| `src/data/area-sweeps.json` | **70 areas**: 627 merchant items, 154 farmables, 97 loose pickups, 46 materials, 0 unassigned merchants | `merchants.full.json`, `farms.json`, `items.full.json`, `materials.full.json`, `route.full.json` |
| `src/data/questline-route-map.json` | **431 / 587** quest steps anchored (337 high, 67 medium, 27 low); 156 unlinked, never guessed | questlink labels, NPC names, item names, rare-token overlap |
| `src/data/lore.expanded.json` | **69** expanded journals (`overview`, `context`, `spoiler`) grounded in the workbook raw fields | `lore.json` |
| `src/data/remembrance-plan.json` | **25** remembrances in duplication-priority order, with route anchors | `meta.json` + `route.full.json` |
| `src/data/branch-plan.json` | **27 / 27** decisions anchored (24 high, 3 medium), none crossing the DLC boundary; same generator now writes the runtime copy | decision copy vs route instructions |
| `src/data/tiers.json` | **872** rows (866 original + 6 Tarnished Pack weapons); every row has a verified wiki link | existing table + `patch_tiers_117.py` |

The six 1.17 weapon placements are the user-specified ranks: Leontiel's Greatsword **Broken**, Reed Great Katana **S**, Reverse Bladed Swords (Lightning) **A**, Itinerant Sword **A**, Hefty Scimitar **B**, Golden Order Flail **B**.

## Automatic tracking

- Marking a route step done now resolves the atlas entries that carry its Redmaw source step id. The atlas stores `w2-1`-style ids, so `STEP_BY_SOURCE_ID` maps them to runtime `RW-*` steps first; without that map the update silently never fired.
- Merchant purchases, farmable thresholds and finite pickups flow into the shared item count, so one acquisition marks the item everywhere.
- Area sweeps list merchant stock, farmables, loose pickups and materials for the active area with direct ownership toggles.
- Decision cards auto-settle when their anchored route step is done; unanchored decisions keep a manual check. All 27 decisions are anchored today, so every one of them can settle from route progress.

## Build and state

- `Character` now carries `itemCounts`, `itemOrigins`, `statSnapshots`, `progressionChecks` and `bossReveals`; `JourneyState` carries `materialCounts`, `bossReveals` and `decisionChecks`. All default on older saves.
- New actions: `setItemCount`, `setMaterialCount`, `setBossReveal`, `setDecisionCheck`, `setProgressionCheck`, `saveStatSnapshot`, `applyStatSnapshot`, `deleteStatSnapshot`.
- Stat spreads can be saved, applied and deleted; the Character planner has a non-destructive experiment mode.
- Boss names, strategies and lore are hidden until defeated unless **Boss & NPC spoilers → Show everything**.

## Verification

- `npx tsc --noEmit`: clean.
- `npm test`: **41 tests** across three files (content integrity, progress selectors, new gameplay/remembrance contracts).
- `python scripts/verify_release_data.py`: 0 errors, 0 warnings; recomputes every count.
- `npm run build`: passes; precache 37 entries.
- Browser sweep of all 16 routes at 1680 px: 0 console/page errors, no horizontal overflow.
- 390 px mobile sweep: 0 overflow; four-item bottom navigation present.
- Drill: quantity increment persisted (`×2`), step completion persisted across reload, atlas auto-check wrote `grace-limgrave-the-first-step`, reset flow cleared progress.
