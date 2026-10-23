# World interactions coverage — graces, crones, spirits, monuments, effigies

Status: partial. Sites of Grace and Sword Monuments are complete against an
authoritative list. Every other category is present but explicitly marked
partial or unresolved; Stakes of Marika and Gatekeeper Statues have no
authoritative per-object list and therefore emit zero rows.

- Output: `research/world.json` (697 entries).
- Generator: `python3 scripts/research/fetch_world_objects.py [--refresh]`.
- Raw cache: `research/raw/world-objects-*.html`.
- Captured with user agent `er-companion-research/1.0 (unofficial local fan project)`
  and a 1.2 s delay between wiki requests.
- Entry source URLs are stored per row in `sourceUrl`; the full source list is
  also embedded in `world.json.sources` with cache file names and timestamps.

## Counts

| Category | Entries | DLC | Status | Source |
|---|---:|---:|---|---|
| `grace` | 413 | 105 | resolved | <https://eldenring.wiki.gg/wiki/Sites_of_Grace> |
| `finger-reader` | 9 | 0 | partial | <https://eldenring.wiki.fextralife.com/Finger+Reader+Crone> + <https://eldenring.wiki.gg/wiki/Finger_Reader_Enia> |
| `stranded-soul` | 44 | 6 | partial | <https://eldenring.wiki.gg/wiki/Stranded_Souls> |
| `sword-monument` | 14 | 0 | resolved | <https://eldenring.wiki.gg/wiki/Sword_Monuments> |
| `stake-of-marika` | 0 | 0 | unresolved | <https://eldenring.wiki.gg/wiki/Stakes_of_Marika>, <https://eldenring.wiki.fextralife.com/Stakes+of+Marika> |
| `martyr-effigy` | 213 | 56 | partial | <https://eldenring.wiki.fextralife.com/Effigies+of+the+Martyr> |
| `birdseye-telescope` | 4 | 0 | unresolved | archived <https://eldenring.fandom.com/wiki/Birdseye_Telescope> |
| `gatekeeper-statue` | 0 | 0 | unresolved | none exists |

`world.json.counts` matches these totals. `world.json.categoryStatus` carries
the `resolved` boolean, count, source URL and reason per category;
`world.json.gaps` lists every missing source and why.

## Method

1. wiki.gg first for graces, crones, stranded souls, sword monuments and
   base-game summoning pools.
2. Fextralife for crone locations, Effigies of the Martyr and a sword-monument
   cross-check.
3. Internet Archive snapshot only where the live page is gone. The archive URL
   is the `sourceUrl` on those rows.
4. Categories are deduplicated by normalized name + region + subregion. IDs are
   `category-region-name` slugs, with a numeric suffix on collision.
5. Nothing is inferred: a row exists only when a source states its name and
   location. Rows without a text location are skipped and counted in `gaps`.

## Category detail

### Sites of Grace — complete, 413 entries

The wiki.gg page holds 418 rows: 313 base game and 105 Shadow of the Erdtree.
Region comes from the page's `h2`/`h3` grouping, subregion from each table
caption. Five Leyndell graces are listed twice, once under `Leyndell, Royal
Capital` and again under `Leyndell, Ashen Capital`:

- East Capital Rampart, Erdtree Sanctuary, Queen's Bedchamber, Divine Bridge,
  Elden Throne.

These are the same fast-travel points after the capital changes, so the Ashen
duplicate is dropped and the original kept. The removed rows are recorded in
`meta.grace.collapsed`. The two `Artist's Shack` graces are **not** duplicates:
one is in Limgrave and one in Liurnia, and both are kept. Net: 418 parsed rows →
413 entries.

`mapUrl` is empty for graces; the wiki page has no per-grace map marker.
408 of 413 graces carry a `routeStepId` from an exact (case/punctuation
normalized) match to a route link label on a step whose text mentions a grace.

### Finger Reader Crones — partial, 9 entries

wiki.gg's `Finger_Reader_Crone` page is a stub with no location list. Fextralife
lists eight locations, all captured here:

| Location | Region |
|---|---|
| Collapsed Bridge, north of Stormhill | Limgrave |
| Raya Lucaria Academy bridge | Academy of Raya Lucaria |
| East Raya Lucaria Gate | Liurnia of the Lakes |
| Caelid, near the Smouldering Wall Birdseye Telescope | Caelid |
| Base of the Grand Lift of Rold | Mountaintops of the Giants |
| Deeproot Depths, near the second Site of Grace | Deeproot Depths |
| Forest-Spanning Greatbridge | Altus Plateau |
| Leyndell, Royal Capital | Leyndell, Royal Capital |

`Finger Reader Enia` (Roundtable Hold) is added from wiki.gg because she is the
named Finger Reader; she is also a merchant, so UI consumers may want to
de-duplicate against `research/merchants.json`. Neither source claims the list
is exhaustive and neither covers the DLC, so the category remains partial.

### Stranded Souls — partial, 44 entries

wiki.gg documents 38 base-game spirits and 18 Shadow of the Erdtree spirits.
Base rows give a text location and a dialogue excerpt; all 38 are included. One
of them (`Outside the Limgrave Colosseum`) is flagged `missable: true` because
the page notes it was removed in patch 1.08.

Only 6 of the 18 DLC rows have a text location; the other 12 display only a
screenshot in the location column. Those 12 are skipped rather than guessed and
are listed in `meta.strandedSoul.skipped`. The DLC entries that remain all
resolve to `Gravesite Plain`.

Stranded Souls are unnamed in-game, so `name` uses the convention
`Stranded Soul — <nearest location>`; the raw location text and a dialogue
excerpt are kept in `location` and `description`.

### Sword Monuments — complete, 14 entries

Fourteen rows with English/Japanese inscription and location, matching
Fextralife's statement "There are fourteen locations with hills of swords".
`name` is the inscription's title line; `description` is the full English
inscription with line breaks rendered as ` / `. No DLC monuments are listed by
either source.

### Stakes of Marika — unresolved, 0 entries

No authoritative per-stake list exists in the permitted sources:

- wiki.gg's `Stakes_of_Marika` is a stub; its only `Locations` value is
  `Dungeons`.
- Fextralife's page lists areas that contain stakes (Abandoned Cave, Caelid,
  Leyndell Catacombs, …), not the individual stakes.
- The archived Fandom page is also a stub.

Emitting one row per area would present area names as world objects, so no rows
were generated. A real list needs map-marker data (Mapgenie or game data).

### Effigies of the Martyr — partial, 213 entries

Fextralife's page has two tabs: 157 base-game and 56 DLC effigies, each with a
location description and, for 200 of 213, a working interactive-map marker in
`mapUrl`. Region/subregion come from the page's `h4`/`h5` headings.

Cross-check: wiki.gg's `Summoning_Pools` page independently lists 154 base-game
gallery entries (153 unique names), close to Fextralife's 157. Fextralife itself
says some zone extents still need detail, so the category is reported as a
partial lower bound rather than a verified total.

Two entries share the display name `Queen's Bedchamber`; they are kept because
Fextralife gives them separate map markers and bosses (Morgott in the Royal
Capital, Godfrey in the Ashen Capital).

`wiki.gg` covers the base game only and has no DLC section, so it cannot close
the DLC gap.

### Birdseye Telescopes — unresolved, 4 entries

The live Fextralife pages for `Birdseye Telescopes` and `Birdseye Telescope` are
404; the remaining Fextralife page is the `Telescope` key item (shop location,
not telescope locations). wiki.gg has only `About_Birdseye_Telescopes`, a
tutorial item with no locations.

Four base-game locations are taken from an Internet Archive snapshot of the
Fandom object page (2026-02-08) and every row is marked `unresolved: true`:

- Caelid — south of Caelem Ruins, north of Smoldering Wall
- Limgrave — southeast of Gatefront Ruins, near Agheel Lake North
- Liurnia of the Lakes — northwest of Laskyar Ruins, west of Scenic Isle
- Mountaintops of the Giants — near Freezing Lake

DLC telescopes are undocumented in these sources.

### Gatekeeper Statues — unresolved, 0 entries

No Elden Ring object uses this name. wiki.gg search returns the NPC
`Gatekeeper Gostoc` and no statue object; Fextralife `Gatekeeper Statue` and
`Gatekeeper Statues` both return 404. The nearest documented statue objects are Effigies of the Martyr,
Stakes of Marika, Rebirth Monuments and the Stonesword Key imp seals, but mapping
the request onto one of them would invent a category. The field stays empty and
unresolved pending a source that actually defines it.

## Schema

Each entry has exactly the contract fields from `research/BEYOND_REDMAW.md`:

`id`, `category`, `name`, `region`, `subregion`, `location`, `description`,
`sourceUrl`, `mapUrl`, `dlc`, `missable`, `routeStepId`, `unresolved`.

Report-only additions:

- `categoryStatus` — per-category `resolved`, `count`, `sourceUrl`, `note`.
- `gaps` — category, issue, detail, `sourcesTried`.
- `meta.crossChecks` — summoning-pool and sword-monument cross-checks.
- `meta.grace.collapsed` — the five Leyndell duplicate rows.
- `meta.strandedSoul.skipped` — the twelve DLC rows with screenshot-only locations.

Region grouping follows the wiki.gg grace page: Weeping Peninsula is a
subregion of Limgrave, Mt. Gelmir a subregion of Altus Plateau, and the legacy
dungeons (Stormveil Castle, Academy of Raya Lucaria, Volcano Manor) are their
own region headings even though they sit inside larger map regions.

## Cross-checks and verification

- Grace rows: 313 base + 105 DLC = 418; 413 after collapsing five duplicate
  Leyndell rows. Both the wiki.gg table and Fextralife's per-area counts agree
  on 105 DLC graces (37 + 21 + 27 + 20).
- Sword monuments: 14 on wiki.gg and 14 stated by Fextralife.
- Effigies: 157 base on Fextralife vs 154 base gallery entries on wiki.gg.
- IDs: 697 unique IDs for 697 entries; counts recomputed from `entries` match
  `counts`.
- Every entry has a non-empty `name`, `region`, `location` and `sourceUrl`.

## Reproducing

```
python3 scripts/research/fetch_world_objects.py
```

Add `--refresh` to re-download the cached HTML. `--out PATH` writes elsewhere.
The script uses cached files by default, so it is safe to run offline once
`research/raw/world-objects-*.html` is populated.
