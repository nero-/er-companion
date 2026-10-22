# Full-content integration contract

Inputs: `research/route.base.json`, `research/route.dlc.json`, `research/items.json`, `research/achievements.json`, `research/bosses.json`, `research/questlines.json`, `research/ngplus.json`, `research/art/manifest.json`.

## Required chronology and DLC insertion

This is a hard product rule, not a display preference:

1. Play the base-game walkthrough through **Crumbling Farum Azula**, ending with **Maliketh, the Black Blade** (`farum-azula`, base section 46).
2. Break from the base walkthrough and play the **entire Shadow of the Erdtree DLC walkthrough** (all 20 sections, 1,126 steps).
3. Return to the base walkthrough at **Leyndell, Ashen Capital**, then Endings, then New Game Plus Preparation (base sections 47–49).

Canonical global order is therefore:

`base sections 1–46, split after the Maliketh step` → `DLC sections 1–20` → `base sections 47–49`

The `farum-azula` section is split at `w46-96` (the point-of-no-return warning immediately after Maliketh). Steps `w46-1..w46-96` close the pre-DLC base phase; steps `w46-97..w46-99` (Capital of Ash grace and post-Maliketh NPC dialogue) form a synthetic `farum-azula-aftermath` endgame section after the DLC, before `ashen-leyndell`.

Do not append the DLC after the base game. Every route step gets a `phase` field:

- `Base Game — through Maliketh` for base sections 1–46
- `Shadow of the Erdtree` for all DLC sections
- `Base Game — endgame` for `ashen-leyndell`, `endings`, `ng-prep`

The Journey page must show this three-phase progression and place the DLC phase immediately after the Maliketh section. The dashboard next-action logic must follow the same order.

### Missable-content contract

Redmaw marks 170 base-game and 38 DLC steps as MISSABLE, plus IMPORTANT/trophy cues. The app must:

- Preserve `badges`, set `missable` and `warning` from MISSABLE/IMPORTANT badges and text containing “missable”, “unobtainable”, “locked out”, or “point of no return”.
- Show a prominent MISSABLE badge and warning on every step card and search result.
- Provide a “Missables only” filter in the Journey page and a Missables panel/summary per phase.
- Insert a **phase gate** before the DLC phase and especially before the Ashen Capital return: “The capital changes after Maliketh. Complete missable steps in Capital Outskirts, Leyndell, and Forbidden Lands before entering the endgame.”
- Link those gates to the filtered missable steps in the relevant sections, not just a generic warning.
- Keep the existing workbook lockout/transition-gate data as supplementary warnings.

The app already ships 994 Act I steps. This integration replaces the route with the live Redmaw full route and merges the full catalog without losing existing ownership or Workbench chronology data.

## Canonical outputs

- `src/data/route.full.json` — generated full route with the existing `RouteStep`/`RouteArea`/`Objective` shapes plus new route metadata.
- `src/data/items.full.json` — merged permanent catalog (workbook + Tarnished Pack + Redmaw).
- `src/data/achievements.json` — 42 achievements and requirement groups.
- `src/data/bosses.full.json` — merged boss ledger (workbook + Tarnished Pack + Redmaw).
- `src/data/questlines.json` — 52 questlines.
- `src/data/ngplus.json` — 12 sections / 68 checklist items.
- `src/data/content-coverage.json` — counts and denominator descriptions.
- `src/data/legacy-step-map.json` — old `RTE-*` step IDs to new route step IDs.

## Route mapping

Global order: base sections 1–46, DLC sections 1–20, base sections 47–49. Step global order is sequential across that sequence. The total is 3,395 + 1,126 = 4,521 steps.

For each Redmaw step:

```ts
{
  id: "RW-B-w1-1",              // RW-B base, RW-D DLC
  order: 1,                     // global 1..4521
  act: "Base Game" | "Shadow of the Erdtree",
  phase: "Base Game — through Maliketh" | "Shadow of the Erdtree" | "Base Game — endgame",
  area: section.title,          // e.g. "Starting Out"
  sectionId: "starting-out",
  levelRange: "",
  objectiveId: "RW-SEC-B-starting-out",
  objectiveOrder: 1,
  stepOrder: 1,
  objectiveName: `${section.title}${levelRange ? ` · ${levelRange}` : ""}`,
  type: "Route",
  instruction: step.text,
  required: !step.optional,
  linkedRaw: links.map(l => l.label).join("; "),
  linkedIds: [matched item/boss IDs],
  linkedItemNames: [matched catalog names],
  links: step.links,
  badges: step.badges,
  prerequisites: "",
  warning: badges containing MISSABLE/IMPORTANT joined,
  location: section.title,
  validation: "Redmaw Completion Sheets · live scrape",
  routeDecision: step.optional ? "Optional" : "Required",
  skipAllowed: step.optional,
  returnWindow: "",
  lockoutRisk: badges.some(b => /missable/i.test(b)) ? "MISSABLE" : "",
  estimatedTime: "",
  sourceUrl: "https://eldenring.redmaw.dev/sheets/walkthrough#section-id",
  game: "Base Game" | "Shadow of the Erdtree",
  sourceStepId: step.id
}
```

Areas: one per section. `hasRoute: true`. `stepCount`/`requiredCount` derived. `description` = level range. `game` set. `phase` set. Areas must be ordered by the three-phase sequence above, not by source file order alone.

Objectives: one per section, populated with `id`, `name`, `order`, `area`, `summary` (level range), `requirement` ("Route").

Keep the existing workbook supplemental chronology (`route.json` supplemental/chronologyAreas) unchanged.

## Legacy progress migration

Generate `legacy-step-map.json` from the pre-integration `src/data/route.json`:

- Normalize old `instruction` and new `instruction` (lowercase, strip punctuation, collapse whitespace).
- Match within broadly equivalent areas first, then across all steps.
- Use token Jaccard/Dice similarity; accept only high-confidence matches.
- Map `RTE-*` → `RW-*`.
- Store migration: when normalizing saved journeys, remap unknown old step IDs through the map; drop only unmapped IDs.
- Achievement/boss/questline state additions must default safely for older saves.

## Item merge

Match by normalized name (case/punctuation-insensitive) plus compatible group.

- Existing workbook/Tarnished Pack item keeps its stable ID and ownership.
- If the existing location/acquisition is a placeholder (`queued`, empty, `Not in the content pack`), replace it with Redmaw acquisition data or the linked route step.
- Redmaw-only items get IDs `RW-ITEM-<slug>` and are appended.
- Preserve existing `sourceUrl` when it is authoritative; otherwise use the wiki URL.
- `game`: Base Game or Shadow of the Erdtree based on DLC flag; Tarnished Pack stays Tarnished Pack.
- Add `wikiUrl`, `dlc`, `section`, `routeStepIds`, `acquisitionText`.
- Route step links matching an item name add that route step ID to the item.
- Final catalog denominator must be reported, not hardcoded.

## Achievements

Add to `Character`:

```ts
achievements: Record<string, boolean>;
```

Action `setAchievement(id, value)`. Achievement IDs are stable slugs. Default `{}` for saved states. Requirements are display-only (they link to items or boss names).

## Bosses

`src/data/bosses.full.json` merges workbook encounters + Tarnished Pack + Redmaw 207.

- Match by normalized boss name; preserve the existing workbook ID and boss status when names match.
- Redmaw-only bosses get `RW-BOSS-<slug>`.
- Keep the existing `Encounter` shape; add `game`, `section`, `levelRange`, `wikiUrl`, `dlc`.
- The major-boss strategy library remains a separate build-strategy dataset.

## Questlines

Add to `JourneyState`:

```ts
questlineSteps: Record<string, boolean>;
```

Action `setQuestlineStep(id, value)`. IDs: `Q-<questline-id>-<step-id>`. Defaults `{}`.

## NG+ checklist

Add to `JourneyState`:

```ts
ngplusChecklist: Record<string, boolean>;
```

Action `setNgPlusItem(id, value)`. IDs: `NGP-<section-id>-<step-id>`. Defaults `{}`.

## Lore gating

Replace object-ID lore rules with section-title matching:

- Build `SECTION_BY_NORMALIZED_TITLE` from `ROUTE_AREAS`.
- If a lore area matches a section title, unlock when that section is complete.
- Special cases: `Tutorial` → `Starting Out`; `Fringefolk Hero's Grave` → matching section; `Endings` → `Endings`; `New Game Plus Preparation` → matching section.
- Fallback to the existing supplemental-area completion.
- Keep manual zone reveal and reveal-all behavior.

## Completion model

Add selectors for:

- `collectionCompletion(character)` — owned / full catalog.
- `achievementCompletion(character)` — earned / 42.
- `bossCompletion(journey)` — defeated / merged boss ledger.
- `questlineCompletion(journey)` — steps resolved / total.
- `ngplusCompletion(journey)` — checklist resolved / total.
- `completionScopes(character, journey)` — route, collection, achievements, bosses, quests, lore, endings, remembrances, NG+; each with numerator/denominator/percent/complete.
- The completion view must show scopes, not one weighted percentage that hides a missing denominator. A headline may say `X / 8 scopes complete`.

## Verification gates

- Route IDs unique, global order contiguous, 49+20 sections, 3,395+1,126 steps.
- All item links resolve to catalog or remain in `linkedRaw` with a warning.
- No duplicate catalog IDs; every existing workbook item ID still present.
- 42 achievements, 207 bosses, 52 questlines, 68 NG+ items.
- Legacy migration test: seeded old step ID maps to a new step and survives a save reload.
- Typecheck, unit tests, production build, desktop/mobile browser sweeps.
