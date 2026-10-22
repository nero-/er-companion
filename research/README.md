# Research artifacts — Redmaw completion sheets

Source: https://eldenring.redmaw.dev/sheets/walkthrough
DLC: https://eldenring.redmaw.dev/sheets/dlc-walkthrough

The workbook is the starting point. These artifacts extend it to the live full-game route and item data. Raw HTML may stay in `research/raw/`; normalized JSON is the app input.

## Required normalized files

### `research/route.base.json`

```json
{
  "source": { "name": "Redmaw Completion Sheets", "url": "...", "fetchedAt": "ISO" },
  "game": "base",
  "sections": [
    {
      "id": "starting-out",
      "title": "Starting Out",
      "order": 1,
      "levelRange": "",
      "steps": [
        {
          "id": "w1-1",
          "order": 1,
          "text": "Pick any origin you want…",
          "optional": false,
          "badges": [],
          "links": [{ "label": "Vagabond", "url": "https://eldenring.wiki.gg/wiki/Vagabond" }]
        }
      ]
    }
  ]
}
```

Rules:
- One section per `<section>` in the walkthrough form.
- Step IDs are the Redmaw checkbox IDs (`w1-1`, `w2-14`, …).
- `text` is readable plain text with inline formatting collapsed to spaces.
- `optional` is true when the step contains the `Optional` badge.
- `badges` preserves `Optional`, `MISSABLE`, `IMPORTANT`, etc.
- `links` preserves every `href` in the step label with its displayed label.
- Do not include `li.note` rows; they are section instructions, not steps.
- Base must reconcile to **3,395** steps / **49** sections.

### `research/route.dlc.json`

Same schema with `game: "dlc"` and IDs from the DLC page (`d1-1`, …).
It must reconcile to **1,126** steps / **20** sections.

### `research/items.json`

```json
{
  "source": "...",
  "items": [
    {
      "id": "rw-weapons-e1-1",
      "name": "Dagger",
      "group": "Weapon",
      "category": "Dagger",
      "slot": "",
      "dlc": false,
      "section": "Daggers",
      "info": "Starting equipment for…",
      "wikiUrl": "https://eldenring.wiki.gg/wiki/Dagger"
    }
  ]
}
```

Parse all of:
- weapons (487 checkboxes; includes shields)
- armor (722; slot from `Head` / `Chest` / `Arms` / `Legs` section title)
- ashes (200; Spirit Ashes + Ashes of War)
- spells (213; Sorceries + Incantations)
- talismans (154)
- key-items (212)
- miscellaneous-items (128)

Rules:
- Skip `li.note`.
- `info` comes from `span.info`, without the leading colon.
- `dlc` is true when the label contains `abbr.dlc`.
- `wikiUrl` is the first `wiki.gg` link. Keep it even when no info text exists.
- Deduplicate by normalized name + group + category. Preserve the first source section.
- Expected total is **2,116** before dedupe; report the deduped count.

### `research/merchants.json`

```json
{
  "merchants": [
    {
      "id": "kale",
      "name": "Merchant Kale",
      "items": [
        { "name": "Throwing Dagger", "price": 40, "stock": "infinite", "wikiUrl": "...", "stepId": "m1-1" }
      ]
    }
  ]
}
```

Parse the merchant sheet: `∞` stock becomes `"infinite"`; `5x` becomes `"5"`; price from `: 40 runes`; strip commas.

### `research/achievements.json`

```json
{
  "achievements": [
    {
      "id": "roundtable-hold",
      "name": "Roundtable Hold",
      "section": "Misc",
      "description": "Be invited…",
      "requirements": []
    }
  ],
  "requirementGroups": [
    {
      "id": "legendary-armaments",
      "name": "Legendary Armaments",
      "kind": "weapon",
      "items": [{ "name": "Grafted Blade Greatsword", "wikiUrl": "...", "description": "..." }]
    }
  ]
}
```

- Actual achievements are the 42 rows in `misc` (9), `bosses` (24), `shardbearers` (6), `endings` (3). Do **not** count the legendary item checklist rows as separate achievements.
- Attach the four legendary groups (weapons, ashes, spells, talismans) as `requirements` on the matching achievement name where possible.
- Preserve descriptions and wiki links.

### `research/bosses.json`

```json
{
  "bosses": [
    {
      "id": "weeping-peninsula-leonine-misbegotten",
      "name": "Leonine Misbegotten",
      "section": "Weeping Peninsula",
      "levelRange": "Levels 20-30",
      "description": "Kill Leonine at the end of Castle Morne.",
      "wikiUrl": "...",
      "dlc": false
    }
  ]
}
```

Expect **207** boss rows across 42 sections. Preserve optional/required text in the description; do not invent flags.

### `research/questlines.json`

```json
{
  "questlines": [
    {
      "id": "melina",
      "npc": "Melina",
      "steps": [
        {
          "id": "q-melina-1",
          "order": 1,
          "text": "Rest at the Gatefront…",
          "optional": false,
          "missable": false,
          "badges": [],
          "links": []
        }
      ]
    }
  ]
}
```

Expect **52** questlines (base + DLC NPCs). Preserve `Optional` and `MISSABLE`.

### `research/ngplus.json`

Same section/step schema as the route, for the New Game Plus sheet. Expect **68** items across 12 sections.

## Artwork contract

`research/art/manifest.json`:

```json
{
  "source": "Steam / official store assets",
  "disclaimer": "Unofficial fan project. Elden Ring and its artwork belong to FromSoftware and Bandai Namco.",
  "assets": [
    { "id": "hero", "file": "public/art/hero-erdtree.jpg", "sourceUrl": "...", "width": 3840, "height": 1240, "kind": "hero" }
  ],
  "fonts": [
    { "family": "Cinzel", "file": "public/fonts/cinzel-600.woff2", "license": "OFL", "sourceUrl": "..." }
  ]
}
```

Use official store/press imagery and open-licensed fonts. Do not hotlink at runtime; bundle the files. Include a visible unofficial-fan-project disclaimer in the app.
