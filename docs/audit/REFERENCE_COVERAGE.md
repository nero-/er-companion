# Reference coverage — Resources and NPC Walkthrough

Status: complete for both Redmaw reference sheets. No unresolved tables.

- Sources
  - <https://eldenring.redmaw.dev/sheets/resources>
  - <https://eldenring.redmaw.dev/sheets/npc-walkthrough>
- Captured: `2026-10-23T01:00:19Z` (server `Date` header) with user agent
  `er-companion-research/1.0 (unofficial local fan project)`.
- Raw cache: `research/raw/reference-resources.html`, `research/raw/reference-npc-walkthrough.html`.
- Generator: `python3 scripts/research/fetch_reference.py [--refresh]`.
- Outputs: `research/resources.json`, `research/npc-walkthrough.json`.

## `research/resources.json`

11 tables / 138 data rows. Every table keeps the sheet caption, exact column
names in sheet order, a `rowKeys` mapping to the normalized row fields, and a
section-anchored `sourceUrl` (`…#stats`, `…#smithing-stones`, …).

Shape:

```
{ source, tables: [{ id, caption, sectionId, sectionTitle, sourceUrl, dlc,
                     columns, rowKeys, rows }],
  categories: { softCaps, smithingStones, gloveworts, runes, remembrances,
                scadutreeFragments, reveredSpiritAshes },   // table ids
  notes, buildRecommendation, counts, unresolved, unresolvedTables, notesOnCoverage }
```

`categories` is an index into `tables` so consumers can find a requested
category without depending on table order.

| # | Table id | Section | Columns | Rows | DLC |
|---|---|---|---|---|---|
| 1 | `soft-caps` | Stats and Build | Stat, Soft cap 1–4 | 12 | no |
| 2 | `smithing-stones` | Smithing Stones | Material, Upgrades to, Cost, x12, Total, Bell-Bearing | 9 | no |
| 3 | `somber-smithing-stones` | Smithing Stones | Material, Upgrades to, Cost, Total, Bell-Bearing | 10 | no |
| 4 | `grave-gloveworts` | Gloveworts | Material, Upgrades to, Cost, Total, Bell-Bearing | 10 | no |
| 5 | `ghost-gloveworts` | Gloveworts | Material, Upgrades to, Cost, Total, Bell-Bearing | 10 | no |
| 6 | `runes-base` | Runes | Consumable, Runes | 21 | no |
| 7 | `runes-dlc` | Runes | Consumable, Runes | 11 | yes |
| 8 | `remembrances-base` | Remembrances | Remembrance, Runes | 15 | no |
| 9 | `remembrances-dlc` | Remembrances | Remembrance, Runes | 10 | yes |
| 10 | `scadutree-fragments` | Scadutree Fragments | Level, Required, Total Required, Damage Multiplier, Damage Negation | 20 | yes |
| 11 | `revered-spirit-ashes` | Revered Spirit Ashes | Level, Required, Total Required, Damage Multiplier, Mimic Tear Damage, Damage Negation, Mimic Tear Negation | 10 | yes |

Coverage by requested category:

- **Soft caps** — 12 stat rows (Vigor, Mind, Endurance, Equip Load, Strength,
  Dexterity, Intelligence ×2, Faith ×2, Arcane, Status Buildup). Caps are
  integers or `null` when the sheet leaves the cell blank. The eight per-stat
  prose notes plus the Build note are preserved in `notes`; the stat notes are
  also attached to the matching rows as `note`/`noteLinks` (the bare prose name
  applies to both scaling and casting variants, e.g. `Intelligence` → both
  `Intelligence (Weapon)` and `Intelligence (Sorcery)`).
- **Smithing stones** — regular (9 rows, with the sheet's `x12` bulk-cost
  column) and somber (10 rows).
- **Gloveworts** — grave (10) and ghost (10), including their bell bearings.
- **Rune values** — base consumables (21) and DLC consumables (11).
- **Remembrances** — base (15) and DLC (10), each with its rune value.
- **Scadutree / Revered requirements** — all 20 Scadutree levels and all 10
  Revered Spirit Ash levels, including Mimic Tear-specific columns.
- **Other reference content on the sheet** — the "General recommendation"
  heading and its four ordered build steps are stored in `buildRecommendation`.
  The nav "Contents" list and the header feature-request link are navigation,
  not reference tables, and are not duplicated in the JSON.

### Unresolved

`unresolved: []`, `unresolvedTables: []`. The sheet has no "coming soon"
placeholders and all 11 tables were parsed.

Four top-tier rows have `cost: null` because the sheet leaves those cells blank
(no Twin Maiden Husks cost or bell bearing listed): Ancient Dragon Smithing
Stone, Somber Ancient Dragon Smithing Stone, Great Grave Glovewort, Great Ghost
Glovewort. Blank cells are preserved as null; no price is inferred.

## `research/npc-walkthrough.json`

Asserts **36 sections / 604 checkbox steps**, exactly matching the sheet's
36 TOC entries and 604 checkbox inputs.

- 26 base sections / 445 steps; 10 DLC sections / 159 steps (DLC flag from the
  `abbr.dlc` SOTE marker in the TOC; inherited by every step in the section).
- 130 `Optional` steps, 98 `MISSABLE` steps; only those two badge values occur
  on this sheet.
- 500 links across 334 steps: 498 external (wiki.gg + mapgenie) plus 2
  internal section anchors (`#altus`, `#volcano-manor`), preserved verbatim like
  the main route's `#` links.
- 2 section instructions stored as `notes` on their sections (Volcano Manor and
  Leyndell, Royal Capital); they are `li.note` rows, contain no checkbox, and
  are not counted as steps — matching the route's rule.
- Sections use slug IDs (`limgrave`, `roundtable`, …) with list containers
  `n1`–`n36`; step IDs are the Redmaw checkbox IDs `n1-1`…`n36-15`.
- Level/scadu ranges are preserved from the TOC (`Roundtable Hold` has none).
- Nested sub-steps are flattened in DOM order. A parent step's text/badges/links
  exclude its nested sub-step content, so the 604 steps do not duplicate each
  other's text.

Section counts (all reconcile to 604):

| # | Section | Range | Game | Steps |
|---|---|---|---|---|
| 1 | Limgrave | Levels 1-25 | Base | 43 |
| 2 | Roundtable Hold | — | Base | 11 |
| 3 | Weeping Peninsula | Levels 20-30 | Base | 6 |
| 4 | Stormveil Castle | Levels 30-40 | Base | 30 |
| 5 | Liurnia of the Lakes | Levels 40-55 | Base | 41 |
| 6 | Academy of Raya Lucaria | Levels 50-60 | Base | 10 |
| 7 | Caria Manor | Levels 55-60 | Base | 32 |
| 8 | Caelid | Levels 65-70 | Base | 7 |
| 9 | Redmane Castle | Levels 70-80 | Base | 23 |
| 10 | Nokron | Levels 70-75 | Base | 5 |
| 11 | Carian Study Hall | Levels 75-80 | Base | 24 |
| 12 | Deeproot Depths | Levels 80-85 | Base | 5 |
| 13 | Nokstella | Levels 85-90 | Base | 6 |
| 14 | Moonlight Altar | Levels 90-100 | Base | 4 |
| 15 | Altus Plateau | Levels 90-100 | Base | 17 |
| 16 | Mt. Gelmir | Levels 100-105 | Base | 22 |
| 17 | Volcano Manor | Levels 100-105 | Base | 47 |
| 18 | Capital Outskirts | Levels 105-110 | Base | 13 |
| 19 | Leyndell, Royal Capital | Levels 110-115 | Base | 18 |
| 20 | Subterranean Shunning-Grounds | Levels 110-120 | Base | 11 |
| 21 | Mountaintops of the Giants | Levels 115-130 | Base | 22 |
| 22 | Consecrated Snowfield | Levels 135-145 | Base | 3 |
| 23 | Mohgwyn Palace | Levels 145-150 | Base | 4 |
| 24 | Miquella's Haligtree | Levels 145-155 | Base | 19 |
| 25 | Crumbling Farum Azula | Levels 155-160 | Base | 13 |
| 26 | Leyndell, Ashen Capital | Levels 160-165 | Base | 9 |
| 27 | Gravesite Plain | Scadu 0-3 | DLC | 12 |
| 28 | Belurat, Tower Settlement | Scadu 3-4 | DLC | 11 |
| 29 | Cerulean Coast | Scadu 4-5 | DLC | 2 |
| 30 | Scadu Altus | Scadu 7-8 | DLC | 41 |
| 31 | Stone Coffin Fissure | Scadu 9-10 | DLC | 4 |
| 32 | Shadow Keep | Scadu 10-12 | DLC | 40 |
| 33 | Scaduview | Scadu 12-13 | DLC | 16 |
| 34 | Jagged Peak | Scadu 16-17 | DLC | 17 |
| 35 | Ancient Ruins of Rauh | Scadu 17-18 | DLC | 1 |
| 36 | Enir-Ilim | Scadu 18-19 | DLC | 15 |

## How the NPC Walkthrough differs from Questlines

Both sheets cover the same quest content but answer different questions.
`questlines.json` is organised per NPC; `npc-walkthrough.json` is organised per
area in play order. The NPC walkthrough is an alternate route, **not** a
replacement for `route.base.json` / `route.dlc.json` / `questlines.json`.

| | Questlines | NPC Walkthrough |
|---|---|---|
| Organisation | 52 NPC questlines (39 base + 13 DLC) | 36 location sections (26 base + 10 DLC) |
| Steps | 587 | 604 |
| Optional / missable | 135 / 91 | 130 / 98 |
| Links | 395 | 500 |
| Unique external pages (wiki.gg) | 349 (316) | 422 (399) |
| Ordering | quest chronology per NPC | level/Scadu progression per area |
| Step IDs | `q-<npc>-<n>` with `sourceId` (`q1-1`) | Redmaw checkbox IDs (`n1-1`) |
| Extra fields | `depth`, `missable` boolean, per-NPC `sourceUrl` | `dlc` on sections and steps, `levelRange`, section `notes` |
| DLC signal | per-questline `dlc` | `abbr.dlc` SOTE marker in the TOC |

Quantitative overlap: 332 of the 349 external questline targets also appear in
the NPC walkthrough (311 of 316 unique wiki.gg pages). The NPC walkthrough adds
90 external pages the questline sheet never links (area pickups, graces, bosses,
gestures used as route landmarks) and omits 17 questline-only links. All 52
questline NPCs are named somewhere in the walkthrough text or links (Boggart
appears as "Blackguard"), so no questline is missing from the alternate route.

Practical consequences:

- Use Questlines for "what happens to this NPC and in what order"; use the NPC
  Walkthrough for "what do I do next in this area", including non-quest steps
  that the Questlines sheet omits.
- The two cannot be joined one-to-one: the walkthrough interleaves several NPCs
  per section, may split one questline across many sections, and includes
  route-only steps with no questline owner. Integration should keep them as two
  independent checklists that share the same step schema, not merge their IDs.
- Both are superseded for full-game progression by the 3,395-step base route and
  1,126-step DLC route. Do not use either as the primary completion scope.

## Integration notes

- `resources.json` is display-only reference data; no completion state. A
  `ResourcesPage` can render `tables[]` generically from `columns` + `rowKeys`,
  with `sourceUrl` as the provenance link. Use `categories` to locate the
  soft-cap, smithing, glovewort, rune, remembrance, Scadutree, and Revered
  tables.
- `npc-walkthrough.json` is a second route source. Persist its checkbox state
  separately from `route.*` progress (for example under a distinct scope) so
  the alternate route cannot inflate main-route completion.
- `dlc` on both sections and steps lets the NPC view filter base/DLC without
  splitting the file.
