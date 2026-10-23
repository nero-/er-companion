# Beyond-Redmaw coverage

Redmaw explicitly excludes several complete-game ledgers, and its own item sheets leave some sections as “Coming soon…”. This phase adds them. Dialogue is intentionally deferred; the current app tracks quest-critical dialogue actions, not every spoken line.

## Sources

- Eldenpedia/wiki.gg pages (set a custom user agent; the API is rate-limited without one).
- Fextralife pages where wiki.gg has no structured list.
- Redmaw `Resources` and `NPC Walkthrough` sheets.
- Existing `research/merchants.json`.
- Workbook `Choices & Consequences`, `Choices`, `Remembrance Planner`, and item catalog.

Do not invent a count or location when a source is missing. Report `unresolved: true` and a reason.

## `research/world.json`

```json
{
  "source": "...",
  "entries": [
    {
      "id": "grace-limgrave-the-first-step",
      "category": "grace",
      "name": "The First Step",
      "region": "Limgrave",
      "subregion": "Limgrave",
      "location": "Limgrave — west of Gatefront",
      "description": "",
      "sourceUrl": "https://eldenring.wiki.gg/wiki/Sites_of_Grace",
      "mapUrl": "",
      "dlc": false,
      "missable": false,
      "routeStepId": "",
      "unresolved": false
    }
  ],
  "counts": { "grace": 0, "finger-reader": 0, "stranded-soul": 0, "sword-monument": 0, "stake-of-marika": 0, "martyr-effigy": 0, "birdseye-telescope": 0, "gatekeeper-statue": 0 }
}
```

Categories:
- `grace`
- `finger-reader`
- `stranded-soul`
- `sword-monument`
- `stake-of-marika`
- `martyr-effigy`
- `birdseye-telescope`
- `gatekeeper-statue`

Rules:
- One entry per distinct world object. Graces use the exact in-game name.
- `region` is the map region; `subregion` is the area/dungeon heading.
- `dlc` true for Shadow of the Erdtree entries.
- If a category has no authoritative complete list, include the entries that exist and mark the category `unresolved` in `counts`/report; do not make up rows.
- `routeStepId` may be linked to the full route by matching grace/name where exact.

## `research/upgrades.json`

```json
{
  "entries": [
    {
      "id": "scadutree-fragment-gravesite-plain-01",
      "category": "scadutree-fragment",
      "name": "Scadutree Fragment",
      "tier": "",
      "quantity": 1,
      "region": "Gravesite Plain",
      "location": "...",
      "description": "",
      "sourceUrl": "...",
      "dlc": true,
      "unresolved": false
    }
  ],
  "counts": { "scadutree-fragment": 0, "revered-spirit-ash": 0, "golden-seed": 0, "sacred-tear": 0, "smithing-stone": 0, "somber-smithing-stone": 0, "glovewort": 0, "great-glovewort": 0 }
}
```

Include every distinct pickup/tier entry. Preserve quantity where a single pickup gives multiple.

## `research/materials.json`

All crafting materials, including base + DLC, with:
- name, category, renewability, early source, best late source, nearest grace, farm method, purchasable/merchant, finite-before-unlock, priority, use, source URL, DLC flag, unresolved flag.

Reconcile against existing `src/data/farms.json` materials (107 rows) and `research/items.json`. Report new-only and matched counts.

## `research/resources.json`

Normalize the Redmaw Resources sheet:
- soft caps (stat, cap 1–4, notes)
- smithing stone table
- glovewort table
- rune values
- remembrance list
- scadutree/revered requirements
- any other reference tables.

## `research/npc-walkthrough.json`

Same section/step schema as `route.base.json`:
- 36 sections / 604 checkbox steps.
- step IDs, text, badges, optional, links, DLC flag.
- This is an alternate NPC-ordered route, not a replacement for the main route.

## `research/branch-plan.json`

Map the 27 canonical decisions to concrete item/reward IDs and journey availability:

```json
{
  "decisions": [
    {
      "decisionId": "BASE-001",
      "title": "Alexander, Warrior Jar",
      "journey1": "complete quest",
      "journey2": "kill early",
      "journey3": "",
      "rewards": [
        { "name": "Shard of Alexander", "itemId": "...", "journey": 1, "availability": "journey-1" },
        { "name": "Warrior Jar Shard", "itemId": "...", "journey": 2, "availability": "journey-2" }
      ],
      "unresolved": false,
      "notes": ""
    }
  ]
}
```

Use exact catalog IDs when names match. If an item name cannot be resolved, keep the name and set `itemId: ""`, `unresolved: true`. Do not assert that a branch is available on a journey unless the source decision matrix says so.

## Integration contract

- Add persisted `worldChecks` (world interaction IDs), `upgradeCounts` (upgrade IDs → number), and `branchDecisions` already exists as decisions; branch availability is derived from `branch-plan.json`.
- Add completion scopes: graces, world interactions, upgrade ledgers, merchants, branch rewards.
- New pages: `AtlasPage` (world objects), `MaterialsPage`/merchant tab, `ResourcesPage`, NPC Walkthrough view, branch plan in Completion/Quests.
- Dialogue remains a documented gap, not a hidden omission.
