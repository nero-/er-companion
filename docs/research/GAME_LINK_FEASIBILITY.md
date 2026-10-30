# Game link feasibility — reading live progress out of Elden Ring

**Status:** research only. No app source was modified for this document.
**Date:** 2026-10-29
**Scope:** what it takes to make this offline companion follow a live playthrough, while the
manual/offline product stays primary and fully working.

**Reader contract for this document.** Every claim that comes from a repository file carries
`path:line`. Every claim about the game or a third-party tool carries a URL. Claims derived by
arithmetic or by running an analysis against this repo's data files are labelled
`[DERIVED]`. Claims that are plausible but not confirmed by source or by running anything are
labelled `[UNVERIFIED]`.

---

## 0. Bottom line

1. **The save file is the only sane read channel.** On PC, `ER0000.sl2` is a plain BND4
   container — not encrypted; each of its 12 entries is `[16-byte MD5][payload]`. Reading it is
   a pure file-parsing problem with no anti-cheat surface. This is confirmed both by the
   community format reference (which documents an "AES fallback… never needed for a stock save")
   and by the reference save-manager documentation ("MD5, PC only, stored in front of each
   character slot").
2. **The data that is fully recoverable is smaller than the app's vocabulary.** Level, eight
   stats, runes, per-character identity, exact inventory (item id + quantity), equipment,
   discovered graces, defeated bosses, map markers and the whole 1,833,375-byte event-flag
   bitfield all come out cleanly. What does **not** come out cleanly is *meaning*: only 833
   distinct event flags are labelled by the best available community tables, against
   **14,667,000** available bits `[DERIVED]`, and only **~21.5 %** of this repo's 4,521 route
   steps are anchored to a boss or an item at all `[DERIVED]`.
3. **Read-only save watching is not a ban risk in any meaningful sense** — the save file is a
   normal file that Steam itself reads to upload cloud saves. Process-memory reading is a
   different posture and is rejected for this project.
4. **Recommended path: Phase 1 (read-only save watcher in Rust → local bridge → import into the
   existing state model), then stop and measure.** Phase 2 (flags → route progress) is where the
   real work and the real disappointment live. Phase 3 (overlay) is optional and cheap once
   Phase 1 exists.

---

## 1. On-disk save file parsing

### 1.1 Where the file lives

| Platform | Path | Source |
| --- | --- | --- |
| Windows (Steam) | `%APPDATA%\EldenRing\<SteamID64>\ER0000.sl2` | <https://eldenringdeaths.com/>, <https://github.com/tvhdev/er-save-watcher> |
| Windows (Seamless Co-op) | same folder, `ER0000.co2` | <https://github.com/Aznlilly/EldenRingSaveBackupTool>, <https://ersc-docs.github.io/seamless-modding/> (`save_file_extension = co2`) |
| Windows (Elden Ring Reforged) | same folder, `ER0000.err` | <https://github.com/egormagurin/EldenRingMap> (`README`, "The server picks up `ER0000.err` saves as well as `.sl2`") |
| Linux, Steam via Proton | `~/.local/share/Steam/steamapps/compatdata/1245620/pfx/drive_c/users/steamuser/AppData/Roaming/EldenRing/<SteamID>/ER0000.sl2` | <https://github.com/llmandres/elden-ring-hub/blob/main/docs/user-guide/linux-compatdata.md> |
| Linux, Flatpak Steam | `~/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/compatdata/1245620/pfx/drive_c/users/steamuser/AppData/Roaming/EldenRing/<SteamID>/ER0000.sl2` | same |
| Steam Deck | identical to the Linux row (`1245620` compatdata prefix; Deck runs standard Steam) | same page; also note the non-standard-prefix warning below |

Details that matter for discovery logic:

- `1245620` is Elden Ring's Steam AppID. A save inside `compatdata/<other-id>/` means the game was
  launched through a non-Steam entry (Seamless Co-op launcher, ModEngine2). Steam **deletes** that
  compatdata folder, and the save with it, if the entry is removed
  (<https://github.com/llmandres/elden-ring-hub/blob/main/docs/user-guide/linux-compatdata.md>).
  A watcher must therefore enumerate **all** `compatdata/*/pfx/.../EldenRing/*/ER0000.*` and not
  assume `1245620`.
- Additional Steam libraries are declared in `libraryfolders.vdf`; the same hub doc lists
  `~/.steam/steam/steamapps/compatdata/` as a symlink of the same location.
- The `<SteamID>` directory is a 17-digit Steam64 id. Multiple accounts can coexist; the watcher
  must pick the most recently modified `ER0000.*`, exactly as EldenRingMap does
  (<https://github.com/egormagurin/EldenRingMap>, `server/index.js` — `listSaves()` sorts by
  `mtime` and prefers `.err` on ties).
- `.co2` and `.err` are **the same container format** with a different extension, produced by
  mods. `.co2` keeps its own item ids that vanilla game data does not list; the current save editor
  had to be patched specifically so unknown mod items do not block loading
  (<https://github.com/ClayAmore/ER-Save-Editor/pull/100>). A read-only parser must therefore never
  fail on an unknown item id — it must pass it through.

### 1.2 Container format (`.sl2` / `.co2`)

File is **always exactly 28,967,888 bytes (`0x1BA03D0`)** on PC
(<https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure>).

```
0x000000  0x40    BND4 header  (magic "BND4", entry count 12, header size 0x40,
                               version string "00000001", entry hdr size 0x20,
                               data start 0x300, UTF-16 names flag)
0x000040  12×0x20 entry table (flags 0x50, -1, entry size, data offset, name offset, 0)
0x0001C0          entry names  (UTF-16LE "USER_DATA000" … "USER_DATA011")
0x000300  0x280010  slot 0 = [0x10 MD5][0x280000 character data]
          … 10 slots, stride 0x280010
0x19003A0 0x60010   USER_DATA_10 = [0x10 MD5][0x60000 global data]
0x19603B0 0x240020  USER_DATA_11 = [0x10 MD5][regulation copy + rest]
```

Layout arithmetic verified against the documented total `[DERIVED]`:
`0x300 + 10*0x280010 + 0x60010 + 0x240020 = 0x1BA03D0 = 28,967,888`.
An independent write-up states the same slot stride and the same per-entry
`[16-byte MD5][payload]` framing
(<https://github.com/egormagurin/EldenRingMap/blob/main/docs/HOW-IT-WORKS.md>).

**Encryption.** A stock PC save is **not** AES-encrypted. The hands-on reverse-engineering notes
say so directly: "Elden Ring PC saves are **not encrypted** — the MD5 verifies directly against the
raw bytes. (An AES path exists in `server/lib/bnd4.js` as a fallback, but it is never needed for a
stock save.)" (<https://github.com/egormagurin/EldenRingMap/blob/main/docs/HOW-IT-WORKS.md>).
The save-editor audit reaches the same conclusion and adds that its AES-128-CBC path
(key `99 AD 2D 50 ED F2 FB 01 C5 F3 EC 3A 2B CA B6 9D`, IV = first 16 bytes) is a **Steam-layer**
artifact, and that it is *not* needed on Steam Deck
(<https://github.com/oisis/EldenRing-SaveForge/blob/main/docs/sl2-binary-format-spec.md> §10).
Treat AES as a defensive fallback only: if the file starts with `BND4` → plaintext; otherwise try
decryption and check for `BND4` again. Do **not** build the reader on the assumption of encryption,
and do not confuse this with the AES-256-CBC used *inside* `USER_DATA_11` for regulation, which a
read-only companion never needs to touch.
`[UNVERIFIED]` Whether some Steam/Windows configurations still write an encrypted container; the two
sources above disagree about how common the Steam-layer encryption is.

**Checksums.** Per-entry MD5, PC only, computed over the payload *including* nothing of the
checksum itself:

| Section | Checksum at | Data from | Size |
| --- | --- | --- | --- |
| Slot k | `0x300 + k*0x280010` | checksum + 0x10 | `0x280000` |
| USER_DATA_10 | `0x19003A0` | `0x19003B0` | `0x60000` |
| USER_DATA_11 | `0x19603B0` | `0x19603C0` | `0x240010` |

(<https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure>).
An empty slot carries a valid MD5 of its own all-zero data — **the checksum does not mark an empty
slot**; `version == 0` at the start of the slot does.

This MD5 is the single most useful thing in the whole format for a live watcher: because the file
size never changes, *"has the game finished writing?"* cannot be answered by watching size or
mtime, but it **can** be answered exactly by verifying the per-entry digests. EldenRingMap does
precisely this — read, verify all 12 digests; on failure retry (15 tries, 80 ms apart) before
giving up (<https://github.com/egormagurin/EldenRingMap> → `server/lib/saveParser.js`, function
`readStable`).

### 1.3 Inside a slot

A slot is a **single sequentially serialised struct with several variable-length members**, so
nothing after the first variable block sits at a fixed offset. The canonical field-order list is in
the save-manager reference
(<https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure#character-slot>).
Order (abridged, sizes are the important part):

```
version(4) map_id(4) play_time_ms(8) unk0x10(16)
gaitem_map                     variable — 5118 entries if version<=81 else 5120,
                                         8/16/21 bytes each depending on handle nibble
player_game_data(0x1B0)
sp_effects(0xD0) equipment_slots(0x58) active_weapon(0x1C) equip ids(0x58) equip handles(0x58)
inventory_held(0x9010)         common 0xA80 + key 0x180 × 12-byte records
equipped_spells(0x74) equipped_items(0x8C) equipped_gestures(0x18)
acquired_projectiles            variable
equipped_armaments(0x9C) equipped_physics(0xC) face_data(0x12F)
inventory_storage_box(0x6010)
gestures(0x100)
unlocked_regions                variable — count + count*4
horse(0x28) control_byte(1) blood_stain(0x44) gamedataman×2(8)
menu_profile_save_load          variable
trophy_equip_data(0x34) gaitem_game_data(0x1B588)
tutorial_data                   variable
gameman bytes(3) total_deaths(4) character_type(4) in_online_session(1)
character_type_online(4) last_rested_grace(4) not_alone(1) countdown(4) unk(4)
event_flags(0x1BF99F) event_flags_terminator(1)
field_area / world_area / world_geom_man / world_geom_man2 / rend_man   variable
player_coordinates(0x3D) … net_man(0x20004) world_area_weather(0xC) world_area_time(0xC)
base_version(0x10) steam_id(8) ps5_activity(0x20) dlc(0x32) player_data_hash(0x80)
rest                            padding to 0x280000
```

Consequences a reader must respect:

- **Walk it forward.** EldenRingMap measured the event-flag bitfield moving **2,216 bytes between
  two saves taken minutes apart** (<https://github.com/egormagurin/EldenRingMap/blob/main/docs/HOW-IT-WORKS.md>).
  Any implementation that hardcodes an event-flag offset is broken by design.
- **Assert while walking.** The same project validates a `FACE` magic, booleans that must be 0/1, a
  0/8 enum and a zero terminator byte immediately after the bitfield, so a mis-step throws instead
  of returning plausible garbage (`server/lib/slotWalk.js`). This is the correct pattern: **fail
  loud**. Two saves from the same user are cheap to obtain, so a bad walk should be a test failure,
  not a silent wrong answer.
- **`rest` absorbs size changes.** Growth of any variable block comes out of `rest`; the slot stays
  `0x280000`. For a read-only companion this is irrelevant, but it is why every write path is
  dangerous (§5).
- **`player_data_hash`** (last 0x80 bytes of each slot) is an Adler-32-derived 32-word structure
  (<https://github.com/oisis/EldenRing-SaveForge/blob/main/docs/sl2-binary-format-spec.md> §12;
  <https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure>). Whether
  the game validates it is documented as **ambiguous**. **A reader must never validate or
  recompute it.** It is a write-path concern only.

### 1.4 What is actually recoverable

| Field | Recoverable? | Where | Notes |
| --- | --- | --- | --- |
| Character name | Yes | `PlayerGameData+0x94`, UTF-16LE, 16 chars | also mirrored in `USER_DATA_10` `ProfileSummary` |
| Level | Yes | `PlayerGameData+0x60` | validated by `sum(stats)-79` formula `[DERIVED]` from the same references |
| Eight stats | Yes | `PlayerGameData+0x34`, 8×u32 (vigor, mind, endurance, str, dex, int, fai, arc) | plus HP/FP/stamina and their maxima at `+0x08`…`+0x2C` |
| Runes held / rune memory | Yes | `PlayerGameData+0x64` / `+0x68` | rune memory only ever grows; usable as a sanity check |
| Starting class / keepsake / voice | Yes | `+0xB7` / `+0xBB` / `+0xBA` | maps to this repo's `CLASSES` ids by index + name `[DERIVED]` |
| Flasks, talisman slots, spirit-ash level | Yes | `+0xF9`, `+0xFA`, `+0xBE`, `+0xBF` | |
| Scadutree / revered-spirit blessing | Yes | `PlayerGameData+0xF4` (scadutree, 0-20) and `+0xF5` (revered spirit, 0-10) | DLC progress that is otherwise hard to observe |
| Total deaths, play time | Yes | `total_deaths_count`; `play_time_ms` | `play_time_ms` also mirrored in `ProfileSummary` |
| In-game timer, world time/weather | Yes | slot tail blocks | |
| `last_rested_grace` | Yes | `BonfireWarpParam.bonfireEntityId + 1000`, 0 = none | gives "where the player last sat", not the full grace list |
| **Inventory (item id + quantity)** | **Yes** | `inventory_held` (3072 slots) and `inventory_storage_box` (2048 slots), 12-byte records `{gaitem_handle, quantity, acquisition_index}` | **The single most valuable signal.** Independent of event flags. |
| **Item history** | **Yes** | `gaitem_game_data` (0x1B588): `int64 count` + records of `{u32 item_id, u8 1, 3 pad}` | "every item type ever acquired", sorted by item id. Survives selling. |
| **Equipment** | **Yes** | three parallel `EquipmentSlots` copies (inventory index / item id / gaitem handle) + `active_weapon_slots` | |
| Quick items, pouch, great rune | Yes | `equipped_items`, `equipped_armaments` | |
| Spells memorised, physick tears | Yes | `equipped_spells`, `equipped_physics` | |
| Gestures unlocked | Yes | 64×u32 table | |
| Regions unlocked | Yes | `unlocked_regions` (PlayRegionParam rows) | coarse area gating |
| **Boss defeat flags** | **Yes** | event-flag bitfield; boss flags are entity ids (e.g. Godrick `10000800`, Margit `10000850`) | flag→(byte,bit) via the block table |
| **Grace discovery flags** | **Yes** | event flags, e.g. Church of Elleh `76100`, Gatefront `76108`, Table of Lost Grace `71190` | |
| **Map markers / beacons / fog of war** | **Yes** | `MenuSaveLoad` v2: 10 beacon records, 100 marker records, 0x1A8 bytes of per-cell fog bits | Fog bits are per 256-unit cell, 41-cell rows |
| **Map fragment reveals** | Yes | `WorldMapPieceParam.openEventFlagId` (62004-62012, 62020-62084) | |
| **"Legendary" trophy progress** | Yes | `trophy_equip_data`, one bit per legendary item ever acquired | directly answers 3 of this repo's achievements |
| **Item pickup flags** | Partly | per-pickup flags in the same bitfield | EldenRingMap joins 864 `MSB` files to `ItemLotParam_map` to get 2,394 per-item pickup flags — but that table is generated from an install and is **not** shipped (`+2,394 item markers, each tracking its own pickup flag`) |
| Existence of a specific quest step | **Only via flags** | no quest/journal structure in the save | quests are emergent from flags + item/state changes |
| NPC dialogue state / dialogue text | **No** | not stored as readable text | dialogue *progress* is flags; the lines themselves are FMG content, not save content |
| What the player is looking at / boss health bar | **No** | not in the save | save only holds the last write |

Field offsets above are from
<https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure> and
<https://github.com/oisis/EldenRing-SaveForge/blob/main/docs/sl2-binary-format-spec.md>; boss and
grace flag ids are from
<https://github.com/ClayAmore/ER-Save-Editor/blob/master/src/db/bosses.rs> and
`…/src/db/graces.rs`.

**Item id shape** (from the same two references): a weapon id is `base + upgrade`, with the
affinity in `(id // 100) % 100`; armor ids carry `0x10000000`, talismans `0x20000000`, goods
`0x40000000`, Ashes of War `0x80000000` where a category tag is used. Gaitem handles are a
*separate* numbering: top nibble 0x8 weapon / 0x9 armor / 0xA accessory / 0xB goods / 0xC Ashes of
War, with a generation counter in bits 16-23. Talismans and goods have no gaitem entry at all —
their handle is the item id with the nibble OR'd in. **Mixing the two numbering schemes is the
classic bug**; the reference is explicit that they are independent.

### 1.5 Refresh cadence and backups

- The game saves "constantly"
  (<https://github.com/egormagurin/EldenRingMap>), but **there is no clean post-write signal**.
  EldenRingMap polls `mtime` at 1 s by default (`--poll 1000`) and then verifies MD5 before
  accepting. That cadence is adequate: the companion's value is "progress within a few seconds",
  not frame accuracy.
- Correct read loop: `stat` → if `mtime`/size changed → read whole file → verify 12 MD5s → on
  mismatch, retry after ~80 ms (bounded) → on persistent mismatch, keep the last good snapshot and
  surface "save busy". Never parse a failed-verification buffer.
- **Backup rule for a read-only feature: copy, never write.** A read-only watcher only ever needs
  to snapshot a *copy* into the app's own data directory (which is already what the desktop build
  does for JSON backups — `src-tauri/src/lib.rs:62` `export_backup`, `:109` `import_backup`,
  `MAX_BACKUP_BYTES` at `:9`). If a future phase ever writes, the mandatory sequence is: verify
  MD5 → write to temp file in the same directory → `rename` over the original
  (<https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure#writing-a-save>),
  having first copied the original to a timestamped backup. That sequence is **out of scope for
  this project** (§5).
- Steam Cloud will also be uploading the same file. Read-only access does not conflict with it;
  the save-manager's own EAC doc notes Steam "does this repeatedly to make cloud backups"
  (<https://github.com/EthanShoeDev/elden-ring-compass> — "Can this get me banned?").

### 1.6 Libraries worth not writing ourselves

| Project | Language | Licence | Maturity | Use |
| --- | --- | --- | --- | --- |
| [ClayAmore/ER-Save-Lib](https://github.com/ClayAmore/ER-Save-Lib) | Rust | none declared in repo/Cargo.toml (`[UNVERIFIED]` legally) | alpha, last push 2026-05-15 | closest fit for a Tauri-side parser; also the source of the event-flag block table |
| [ClayAmore/ER-Save-Editor](https://github.com/ClayAmore/ER-Save-Editor) | Rust, Apache-2.0/MIT | permissive | actively maintained; handles 1.17 regulation growth, `.co2` | reference implementation + **flag/grace/boss/item name tables** (`src/db/*.rs`) |
| [oisis/EldenRing-SaveForge](https://github.com/oisis/EldenRing-SaveForge) | Go + React | permissive-ish | early, self-described "NOT stable" | best *written* format audit; read it, don't depend on it |
| [egormagurin/EldenRingMap](https://github.com/egormagurin/EldenRingMap) | JS/Python | none declared | active | best *live-reading* reference: `slotWalk.js`, `readStable`, polling design, eventflag BST |
| [EthanShoeDev/elden-ring-compass](https://github.com/EthanShoeDev/elden-ring-compass) | TypeScript | none declared in repo | active, 46 stars | **pure-TS parser, ~1.6 ms/save (node) / ~3 ms (Chromium)** vs ~95-99 ms for its old WASM path; emits the raw flag bitfield + `ga_items` + inventory + equipment |
| [zebbedaja/er-save-parser](https://github.com/zebbedaja/er-save-parser) | TypeScript | MIT | small (2 stars), actively pushed 2026-09-27 | MIT-licensed TS option; **README TODO says equipment and inventory are not read yet** |
| [Hapfel1/elden-ring-save-parser-lib](https://github.com/Hapfel1/elden-ring-save-parser-lib) | Python | MIT | new | handy as a *research* oracle, not a runtime dep |

Practical advice: **port the ~600 lines you need** (BND4 walk + slot walk + gaitem + inventory +
equipment + flag bitfield) rather than taking a dependency. The format is documented to the byte,
the walking rules are simple, and every library above has been broken by at least one patch
(see the 1.17 regulation-size crash and the 420 KB-per-character data-loss bug fixed in
<https://github.com/ClayAmore/ER-Save-Editor/pull/100>). Owning the parser means owning the fix.

---

## 2. Process / memory reading

What it would take, for completeness — **not recommended**.

- **Offsets and pointer chains, not fixed addresses.** A reader needs signatures (AOB) for the
  game's global singletons and then a multi-level pointer chase. The best public example chases
  `GameDataMan`, `WorldChrMan`, `EventFlagMan` and `CSMenuManImp` from `mov reg,[rip+rel32]`
  signatures copied from `soarqin/EROverlay`, then reads several competing chains and picks
  whichever is consistent with the map-screen pixel
  (<https://github.com/egormagurin/EldenRingMap> → `tools/live_memory.py`). Its own comment: "patterns
  usually survive a game patch and offsets never do."
- **Privileges.** Elden Ring usually runs elevated, so `OpenProcess` fails with error 5 without
  admin rights — the same is true of FPS unlockers and autosplitters (same file). A desktop
  companion that demands admin is a materially worse product than one that does not.
- **Platform asymmetry.** Windows needs `ReadProcessMemory`; on Linux you read the Proton process's
  `/proc`. Two implementations, two failure modes (same file).
- **Version churn.** Every patch can move the chain. EldenRingMap documents exactly this class of
  breakage: "A patch can move the internal structures the reader looks for… signatures in
  `tools/live_memory.py` need updating for the new version" (README troubleshooting). The current
  game version as of this document is **1.17.2 (2026-10-20)**
  (<https://en.bandainamcoent.eu/elden-ring/news/elden-ring-patch-notes-version-1172>) — so any
  offset table written today is already one patch behind.
- **EAC posture.** Reading another process's memory is the textbook signature anti-cheat looks
  for, regardless of intent. The EldenRingMap README says it plainly: "**Offline play only.**
  Anti-cheat objects to anything reading game memory… Real-time mode is for offline or modded
  setups where EAC isn't running." <https://github.com/Nordgaren/Elden-Ring-Debug-Tool> goes
  further for *writing* tools ("Disable EAC to use this tool… Using this tool to skip around the
  game… will cause you to get banned").
- **What memory buys you that the save does not**: live player position at 20 Hz, live HP/FP,
  current boss health bar. That is a *map dot* and a *HUD*, not progress. Progress is already on
  disk.

**Verdict.** Memory reading trades a documented, checksum-protected, plaintext file for an
undocumented, patch-fragile, privilege-escalating, anti-cheat-adjacent pointer chase — to obtain
data the save already has. **Reject.** Also note this repo's own product claim: no telemetry, no
runtime API calls, offline-first (`README.md`, `docs/DESKTOP.md`). Process injection of any kind
would contradict it.

---

## 3. Event-flag / progress mapping

### 3.1 Flag addressing (fully solved)

```
block = flagId / 1000
index = flagId % 1000
byte  = base + BLOCK_TABLE[block] * 125 + index / 8
bit   = 7 - (index % 8)          // MSB-first within the byte
```

`BLOCK_TABLE` is `eventflag_bst.txt`, 11,919 rows, one `block,position` pair per line, taken from
ER-Save-Lib (`CSFD4VirtualMemoryFlag` tree) — documented in
<https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure#event-flags>
and implemented in <https://github.com/egormagurin/EldenRingMap> (`data/eventflag_bst.txt`, 11,919
entries; 125 bytes = exactly 1000 flags per block) and vendored by compass
(`packages/vendored-data/assets/eventflag-bst.txt`, 153,669 bytes).

The bitfield is **1,833,375 bytes = 14,667,000 bits** `[DERIVED]`. This table is the one piece of
reverse-engineered data the project cannot derive: there is no in-game file that names it, and it
must be re-copied from upstream if a patch reshuffles blocks (compass's own provenance table says
exactly that, and marks the symptom as "Grace/boss/quest flags read from the wrong bit").

### 3.2 What labels exist today

The largest publicly available *labelled* flag set in a redistributable form is
`ER-Save-Editor/src/db/event_flags.rs`: **1,178 rows / 833 distinct flag ids** `[DERIVED]`
(every duplicate is consistent — no id maps to two different `(byte,bit)` pairs `[DERIVED]`).
Grace ids and boss ids are in `src/db/graces.rs` (314 rows, 309 distinct names) and
`src/db/bosses.rs` (157 rows, all unique) `[DERIVED]`.

So: **833 labelled flags out of 14.67 million bits**, i.e. 0.0057 % `[DERIVED]`. That sounds
catastrophic and is not, because the labelled ones are the high-value ones (graces, bosses, major
quest beats). But it does bound what a flag-based progress model can ever see: **it sees the world
state the label table knows about, and nothing else.**

Other labelled-flag sources worth mining (all `[UNVERIFIED]` as to exact counts/licences — none were
downloaded and counted for this document):

- The Grand Archives Cheat Table (`Event Flags by ID`) —
  <https://github.com/The-Grand-Archives/Elden-Ring-CT-TGA>
- EldenRingMap's generated `markers.json` (3,508 markers post-1.1, each with its own pickup flag;
  built from `MSB` + `ItemLotParam_map` against a user's own install)
  <https://github.com/egormagurin/EldenRingMap>
- Compass's install-derived `GRACES`/`BOSSES` datasets with `flagId` / `defeatFlagId`
  (`apps/web/src/lib/vm/events.ts`)
- The save-manager's documented 1,295-flag set with categories Boss/Grace/Quest/Item/Achievement/NPC/
  Area/Misc <https://elden-ring-save-manager.readthedocs.io/en/main/user-guide/event-flags/>

### 3.3 The mapping gap against *this* app's vocabularies

This repo's own data was analysed directly. The relevant structures:

- Route: `src/data/route.full.json` → `steps`, **4,521** entries (3,395 base + 1,126 DLC)
  `[DERIVED]`. Types in `src/lib/types.ts:99` (`RouteStep`), with `autoAcquireItemIds` and
  `autoAcquireBossIds` as the only machine-checkable completion signals.
- Catalog: `src/data/items.full.json` → **2,325** items, `Item` at `src/lib/types.ts:227`.
  **No item in the catalog carries a game/param item id** — ids are synthetic
  (`GKI-PERM-BG-ARM-7DC63D6597FDCD`) `[DERIVED]`.
- Bosses: `src/data/bosses.full.json` → **237** encounters, 187 distinct names, 29 flagged
  `majorBoss` `[DERIVED]`.
- Graces: `src/data/world.objects.json` → 697 entries, **413** `category: "grace"` (308 base,
  105 DLC), `WorldObject` at `src/lib/types.ts` (Beyond-Redmaw block).
- Questlines: 52 / 587 steps; 431 linked to route steps (`src/data/questline-route-map.json`,
  `coverage: {steps:587, linked:431, high:337, medium:67, low:27}`).

**Named-join coverage measured against the save-side tables** `[DERIVED]` (normalised
case/accent/punctuation match; saves-side tables = `weapon_name.rs`, `armor_name.rs`,
`accessory_name.rs`, `aow_name.rs`, `item_name.rs`, `graces.rs`, `bosses.rs`):

| App vocabulary | Joinable to save-side names | Base only | DLC only |
| --- | --- | --- | --- |
| Catalog items (2,325) | **1,706 (73.4 %)** | 1,705 / 1,843 (92.5 %) | **1 / 482 (0.2 %)** |
| ‑ of which auto-acquired items (893 distinct) | 668 (74.8 %) | — | — |
| Graces (413) | **293 (70.9 %)** | 293 / 308 (95.1 %) | **0 / 105 (0 %)** |
| Bosses (237, by base name after stripping `(...)`) | **138 (58.2 %)** | — | — |
| Major bosses (29) | 25 | — | — |

Two conclusions fall out and they are not the same conclusion:

1. **Base game is good.** ~92-95 % of base-game items and graces join on name alone. Adding the
   param-derived set (compass `er-extractor`, `ItemLotParam_map`, `EquipParam*`) would push base
   items to ~100 % — but that requires reading a game install, which is a different product
   constraint (see §8, open question 3).
2. **DLC is at zero in the shipped tables.** The community name tables predate Shadow of the
   Erdtree; the DLC route is **1,126 of the 4,521 steps** and the DLC graces are **105 of 413**.
   Any Phase-2 promise that ignores this is wrong by a quarter of the product. DLC coverage must
   come from install-read param data or from a community table that did not exist at the time of
   writing `[UNVERIFIED]`.

### 3.4 Coverage of the *route*, which is the thing users see

`[DERIVED]` against `src/data/route.full.json`:

| Anchor | Steps | Share of 4,521 |
| --- | --- | --- |
| Step declares `autoAcquireBossIds` | 195 | 4.3 % |
| Step declares `autoAcquireItemIds` | 922 | 20.4 % |
| Either boss or item | 971 | **21.5 %** |
| Step is `WorldObject.routeStepId` of a grace (resolved via `STEP_BY_SOURCE_ID`, `src/lib/data.ts:207`) | 405 | 9.0 % |
| Union (item / boss / grace) | **1,354** | **29.9 %** |
| Neither | 3,167 | 70.1 % |

Of the 3,550 steps with no boss/item anchor, the instruction text mentions grace 631×, a
talk/speak/answer verb 256×, a use/activate/interact verb 201×, and a fight verb 185× `[DERIVED]`
(a step can hit several buckets). In other words **the bulk of the route is dialogue, traversal,
merchant activity and "go here" — none of which is directly a single flag the save exposes under a
name we have.**

Therefore a realistic Phase 2 claim is: *"we can auto-confirm roughly a third of the route, and can
propose the next few steps in an area by inference, but the user still ticks most steps."* That is
useful. It is not "the app follows your playthrough."

An extra nuance that will bite: 26 auto-acquired items and 28 auto-acquired bosses appear on more
than one step `[DERIVED]`, so "flag X is set" is ambiguous about *which* step it satisfies. The
right model is `flag → completionUnit`, then a deterministic policy for picking the earliest
unresolved step in the unit (this repo already has contiguous global order and
`nextRouteStep()` at `src/lib/selectors.ts:125` to build on).

### 3.5 Recommended mapping architecture

Three layers, each independently testable, none requiring the others:

```
 L0  raw flags            flagId -> bool            (BST table; 100% mechanical)
 L1  labelled facts       grace:<graceId> lit
                          boss:<encounterId> defeated
                          itemAcquired:<paramId> xN  (from inventory, not flags)
                          itemEver:<paramId>         (from gaitem_game_data)
                          region:<playRegionId> unlocked
                          lastGrace:<bonfireEntityId>
 L2  app progress         fact -> route step / boss / grace object / questline step
                          via an explicit mapping table, shipped as data
```

L0 and L1 need no per-step knowledge and are cheap to build and to test. **L2 is the entire
research risk** and should be shipped as a *generated data file* with a coverage report (exactly
the pattern already used for `src/data/questline-route-map.json`, which carries
`coverage: {steps, linked, high, medium, low}` and an explicit `gaps` list).

Rules that keep L2 honest, given the measurements above:

- Never invent a mapping from prose. Reuse the existing link machinery
  (`linkedRaw` / `linkedIds`, `questline-route-map.json`'s `confidence` + `method`).
- Ship the unmapped remainder as `unmapped: true` with a reason, exactly as `world.objects.json`
  does with `unresolved` and `docs/audit/BEYOND_REDMAW_RELEASE.md` does in its "Non-claims" section.
- Never let L2 *un*-tick something the user ticked manually. Import is additive; the user is
  authoritative.

---

## 4. Overlay / HUD options

| Option | What it is | Cost | Verdict |
| --- | --- | --- | --- |
| **A. Save watcher + in-app live panel** | Tauri backend watches the save, emits an event, the existing React UI shows "current character / level / runes / last grace / newly acquired items / steps just satisfied" | Low. No new window, no overlay perf risk, works windowed or on a second monitor | **Recommended.** |
| **B. Tauri always-on-top window** | Second window, `alwaysOnTop: true`, `decorations: false`, `skipTaskbar: true`, optional `transparent`. Tauri 2 exposes `alwaysOnTop`, `decorations`, `transparent`, `skipTaskbar` in `WindowConfig` (<https://v2.tauri.app/reference/config/>) and `setAlwaysOnTop()` / `setIgnoreCursorEvents()` in the window API (<https://v2.tauri.app/reference/javascript/api/namespacewindow/>), with permissions `core:window:allow-set-always-on-top` / `allow-set-ignore-cursor-events` (<https://v2.tauri.app/reference/acl/core-permissions/>) | Low-medium. Config + a resize/position policy. Current capabilities file allows only `core:default` + `global-shortcut:default` (`src-tauri/capabilities/default.json:6`), so permissions must be added | Good Phase 3. **Not a true overlay** — it cannot draw over the game in exclusive fullscreen; borderless-windowed only |
| **C. Steam overlay** | `gameoverlayrenderer` hooks the game's present chain | None of it is ours; there is no supported API to draw into Steam's overlay from a third-party app `[UNVERIFIED]` | Not viable |
| **D. Screen OCR** (boss name, area name, item-pickup banner) | Capture region, template/regex match against known strings | Medium-high: platform capture APIs, OCR dependency, localisation (the app ships only English content), spoofable | Only if the user wants *"you just entered X"*. **Reject for v1** |
| **E. Local HTTP / WebSocket bridge** | Native side runs `127.0.0.1:<port>`, serves `GET /state`, pushes SSE/WS | Low. Exactly what EldenRingMap does (HTTP + SSE + file watching, zero dependencies). Lets the *PWA* (not just Tauri) read live state | Useful for PWA, but it is a second surface to secure. **Optional Phase 1b** |
| **F. Direct in-webview polling** | `showOpenFilePicker()` + `getFile()` polling, or a tiny local file server, à la compass (`DEFAULT_LOCAL_URL = 'http://localhost:8080/ER0000.sl2'`) | Low, but browser-only: user must re-grant the handle each session, and `showOpenFilePicker` is Chromium-only and requires transient user activation (<https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker>) | Degraded fallback for the PWA only |

**Recommendation: A, with the IPC surface designed so B is a later add-on.** The current app already
has exactly the right plumbing to copy: `quick_log_shortcut` → `app.emit("er-companion:quick-log")`
in Rust (`src-tauri/src/lib.rs:147`, `:173-181`) → `listen("er-companion:quick-log", …)` in
`src/lib/desktop.ts:47` → a store action in `src/pages/DashboardPage.tsx:266`. A save-watch event is
the same shape:

```rust
app.emit("er-companion:game-state", &snapshot)?;   // Rust
```
```ts
listen<GameSnapshot>("er-companion:game-state", ({ payload }) => …); // desktop.ts
```

Note the one thing that must change in `tauri.conf.json`: the production CSP pins `connect-src ipc:
http://ipc.localhost` (`src-tauri/tauri.conf.json:28`). An HTTP/WS bridge (option E) needs
`connect-src` extended for that origin; an IPC-only design (option A) needs **no CSP change at
all**. Another argument for A.

---

## 5. Legal / safety

**What the documents actually say.**

- The Elden Ring **Terms of Service for Online Services** prohibit, among other things, "playing a
  game using falsified data regardless of the circumstances" and "playing a game in a manner not
  intended by the Company using any function or failure of the Software"
  (<https://www.eldenring.jp/eula/p_en.html>, Article 10). Remedies are at FromSoftware's
  discretion and include deleting recorded data and suspending service. **These are terms for the
  online service** — they bind online play, and the "falsified data" clause is about modified
  state, not about reading a file.
- The Bandai Namco **EULA** restricts use of the Game: you may not "reverse engineer, decompile,
  disassemble, or attempt to discover the source code for the Game", nor "modify, alter, or create
  any derivative works of the Game" (<https://store.steampowered.com/eula/1245620_eula_0>, licence
  restrictions (iii)-(iv)). A separate prohibited-conduct clause bars using "any bots, emulators, or
  other unauthorized third party tools" — but its stated purpose is to prevent "unauthorized access
  to the Game", "an unfair advantage over other players", or cheating. **`[UNVERIFIED]`** which
  regional EULA variant attaches to a given purchase; the fetched text does not itself name Elden
  Ring, so treat the quoted clauses as representative rather than authoritative for every
  territory. Legal reading `[DERIVED]`: parsing a save file you own, read-only and offline, is not
  "access to the Game" nor "an unfair advantage"; but format reverse-engineering is exactly the
  activity clause (iii) names, and that risk is real for a project that ships the parser. It is
  also the risk every save editor, map tool and tracker linked in §9 already carries.
- **Reading a save file is what Steam does.** Steam Cloud uploads it. The maintainer of a
  save-reading web tracker states: "Elden Ring is fine with other programs reading or copying the
  save. Steam does this repeatedly to make cloud backups."
  (<https://github.com/EthanShoeDev/elden-ring-compass>). The save-manager's EAC guidance is
  consistent: modifying a save risks a ban **if you then play online with it**; "There is **no
  risk** if you only play offline with modified saves", and its tool "does not bypass EAC or
  interact with the game process — it only edits the save file on disk"
  (<https://github.com/llmandres/elden-ring-hub/blob/main/docs/user-guide/eac-warning.md>).
- **EAC specifically.** EAC protects the *online* game. Playing offline (start-offline / EAC
  disabled) removes it from the picture. EldenRingMap's read-only save mode is described as
  "completely passive… There is nothing for anti-cheat to see"
  (<https://github.com/egormagurin/EldenRingMap>). That is the posture this feature must stay in.

**Project rules this feature must encode — non-negotiable:**

1. **Read-only, always.** Open with read access; never open for write; never create, delete, rename,
   or restore a save. No file locks held between polls.
2. **No process interaction.** No `ReadProcessMemory`, no DLL injection, no window hooks, no
   keyboard/mouse synthesis, no overlay that injects.
3. **No EAC interaction of any kind.** No toggling, no bypassing, no detecting-and-adapting.
4. **No network.** The parsed state stays in the process. No upload, no telemetry, no analytics —
   consistent with `README.md`'s "makes no runtime API calls, accounts, or telemetry requests".
5. **Backup before any write** — and Phase 1-3 have no writes. If a future phase writes, the rule
   is: copy the original to `<dataDir>/save-backups/<timestamp>/ER0000.sl2.bak`, verify the copy's
   MD5, then temp-file + rename. This mirrors `export_backup`'s existing validate-then-write
   discipline (`src-tauri/src/lib.rs:32` `validate_backup`, `:38` URL scheme allowlist).
6. **Never recompute `player_data_hash` as a validation gate.** It is a write-path field with
   disputed semantics; a read-only reader must ignore it, or it will reject good saves.
7. **Unknown items are not errors.** Seamless Co-op adds ids the game data does not list; the editor
   had to be patched for this (<https://github.com/ClayAmore/ER-Save-Editor/pull/100>). A reader
   must carry unknown ids through as opaque.
8. **Say what you are.** "Reads your local save file only. Does not modify it, does not touch the
   game process, does not connect to the internet." Put it in the UI where the feature is enabled,
   not only in the README.

**Explicit recommendation: read-only monitoring first, and only.** Nothing in Phases 1-3 below
requires a write. Writing a save is the one action that can corrupt a playthrough, invalidate an
online character, or trip server-side checks; it buys nothing the read path does not already give.
Do not ship a write path.

---

## 6. Concrete phased design

### Where the code lands (existing anchors)

| Concern | Existing file / anchor |
| --- | --- |
| Renderer ↔ native bridge | `src/lib/desktop.ts` — `invoke` at `:1`, `listen` at `:2`; commands `desktop_info` `:26`, `export_backup` `:30`, `import_backup` `:34`, `open_external` `:38`, `quick_log_shortcut` `:42`, `onQuickLog` `:47` |
| Native commands | `src-tauri/src/lib.rs` — `desktop_info` `:47`, `export_backup` `:62`, `import_backup` `:109`, `quick_log_shortcut` `:147`, `open_external` `:152`, handler list `:204-210` |
| Event precedent | `lib.rs:173-181` global shortcut → `app.emit("er-companion:quick-log")`; consumer `desktop.ts:47`, `App.tsx:79`, `DashboardPage.tsx:266` |
| Capabilities | `src-tauri/capabilities/default.json:6` — `["core:default", "global-shortcut:default"]` |
| CSP | `src-tauri/tauri.conf.json:28-29` |
| Cargo deps | `src-tauri/Cargo.toml` — currently `tauri`, `tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-global-shortcut`, `serde`, `serde_json`, `url` |
| State model | `src/lib/types.ts:1303` `AppState` (`schemaVersion: 1`), `:1261` `Character`, `:1217` `JourneyState` (`steps`, `bosses`, `worldChecks`, `itemCounts` via Character) |
| Persistence | `src/lib/store.ts` — `STORAGE_KEY = "er-companion.state.v1"` `:28`, `BACKUP_KEY` `:29`, `normalizeState` `:359` (rejects `schemaVersion !== 1`), `persistNow` `:412`, `flushPersistence` `:1100` |
| Import/export | `store.ts:1080` `exportState`, `:1084` `importState` |
| Progress selectors | `src/lib/selectors.ts:101-349` (`areaProgress`, `routeProgress`, `nextRouteStep` `:125`, `bossProgress` `:310`, `worldProgress` `:337`) |
| Auto-acquire machinery | `src/lib/data.ts:253-260` `AUTO_ITEMS_BY_STEP`, `:269-276` `AUTO_BOSSES_BY_STEP`; consumer `store.ts:487` `applyStepCompletion` |
| Data tables to extend | `src/data/world.objects.json` (graces), `src/data/items.full.json` (items), `src/data/route.full.json` (steps), `src/data/questline-route-map.json` (the confidence/gaps precedent) |

### Phase 1 — read-only save watcher + local bridge + import

**Goal:** the app knows which save file is live, who the character is, and what changed since last
poll — without touching the route model.

**Native (Rust, `src-tauri`):**

- New module `src-tauri/src/save/` with: `bnd4.rs` (container + MD5), `slot.rs` (forward walk with
  assertions), `gaitem.rs`, `inventory.rs`, `flags.rs` (BST lookup), `watch.rs` (poll loop).
- New commands:
  - `save_probe(candidates: Vec<String>) -> Vec<SaveCandidate>` — for each path: size, mtime,
    magic, slot count, per-character `{name, level, class, secondsPlayed}`, MD5-verified or not.
  - `save_watch_start(path: String) -> ()` / `save_watch_stop()` — one watcher, newest-wins.
  - `save_snapshot() -> GameSnapshot`.
- Event: `er-companion:game-state` carrying the same `GameSnapshot`.
- Cargo additions (all pure Rust, no C): `md-5` (or the `md5` crate ER-Save-Lib uses),
  `notify` **or** nothing at all — a 1 s `stat` poll is enough and has no platform quirks.
- Permissions: no new capability needed for `invoke`-based commands; **only** add
  `core:window:allow-set-always-on-top` if/when Phase 3 lands.
- **Not** `tauri-plugin-fs`: that plugin exposes arbitrary file reads to the webview and would
  widen the attack surface for no benefit when the Rust side is already reading the file.

**Data contract (the important part).** Versioned, additive, and *not* the app's state shape:

```ts
// src/lib/gamelink.ts  (types only; no runtime import of the parser)
export interface GameSnapshot {
  /** contract version; bump on breaking change */
  v: 1;
  /** ISO timestamp of the poll that produced this */
  readAt: string;
  /** absolute path of the file that was read */
  savePath: string;
  /** "sl2" | "co2" | "err" — extension only; container is identical */
  flavour: "sl2" | "co2" | "err";
  /** MD5 of all 12 entries verified before this snapshot was produced */
  verified: boolean;
  /** account steam id from USER_DATA_10 */
  steamId: string;
  /** patch build the slot was written by, from BaseVersion.is_latest_version */
  baseVersion: number;
  /** one entry per occupied slot; `active` = USER_DATA_10 active_profiles[i] */
  slots: GameSlot[];
  /** which slot the watcher believes is live (see "which character" below) */
  activeSlot?: number;
}

export interface GameSlot {
  index: number;                 // 0..9
  active: boolean;
  version: number;               // 0 => empty
  name: string;                  // UTF-16LE, 16 chars
  level: number;
  /** archetype index; resolve to CLASSES by index + name, never by index alone */
  classIndex: number;
  secondsPlayed: number;
  runes: number;
  runesMemory: number;
  stats: { vig: number; mnd: number; end: number; str: number; dex: number;
           int: number; fai: number; arc: number };
  /** DLC blessing levels; 0 when the character has not entered the DLC */
  scadutree: number;
  reveredSpirit: number;
  totalDeaths: number;
  /** BonfireWarpParam.bonfireEntityId + 1000; 0 = none */
  lastRestedGraceEntityId: number;
  /** PlayRegionParam row ids */
  unlockedRegions: number[];
  /** resolved against the shipped name tables; unknown ids stay opaque */
  inventory: { paramId: number; quantity: number }[];
  /** everything ever acquired (survives selling) — the better "have I ever had it" signal */
  everAcquired: number[];
  equipment: {
    rightHand: number[]; leftHand: number[]; arrows: number[]; bolts: number[];
    head: number; chest: number; arms: number; legs: number;
    talismans: number[]; spells: number[]; physick: number[];
  };
  /** the denormalised bitfield; cheap to ship, and lets Phase 2 change without a re-read */
  flags: Uint8Array;             // 1,833,375 bytes
}

/** The renderer's only input to the state model. Intentionally narrow. */
export interface GameProgressDelta {
  v: 1;
  /** id of the companion Character this delta was applied to */
  characterId: string;
  /** things the user has not seen before, ready for the existing store actions */
  runes: number;
  level: number;
  stats: GameSlot["stats"];
  /** route/collection/atlas ids the delta can prove, with the evidence */
  satisfied: {
    stepIds: string[];            // -> setStepStatus(id, "done")
    bossIds: string[];            // -> setBossStatus(id, "defeated")
    graceObjectIds: string[];     // -> setWorldCheck(id, true)
    itemIds: string[];            // -> setItemCount(id, n) / setItemOwned(id, true)
  };
  /** everything the delta changed, for the "what just happened" panel */
  evidence: { fact: string; source: "inventory" | "flag" | "stat"; detail: string }[];
}
```

**Renderer side, and where it plugs in:**

- New `src/lib/gamelink.ts`: `isGameLinkAvailable()`, `probeSaves()`, `startWatching()`,
  `onGameState(handler)` — same shape as `desktop.ts`, guarded by `isDesktop()`
  (`desktop.ts:12`).
- **First import is a one-shot, reviewable action**, not a background write: "Import from save"
  opens a diff ("this will mark 37 steps done, 12 bosses defeated, 104 items owned") and only then
  calls existing store actions. Fits the app's existing `importState` review posture
  (`store.ts:1084`).
- Apply through the *existing* actions so all downstream selectors keep working unchanged:
  `setStepStatus` (`store.ts:522`), `setBossStatus` (`:621`), `setWorldCheck` (`:795`),
  `bulkSetItems` (`:947`), `setItemCount` (`:928`), `setStat` (`:847`).
- **No `AppState` schema change is required for Phase 1.** The delta is transient; it is applied to
  the current `Character`/`JourneyState`. If provenance ever needs persisting, the safest route is a
  *sibling* localStorage key (e.g. `er-companion.gamelink.v1`) rather than bumping
  `schemaVersion: 1`, because `normalizeState` hard-rejects anything else (`store.ts:361`) and every
  existing export/import would break.
- Settings surface: reuse the "Data & backups" section (`SettingsPage.tsx:508`) rather than adding a
  page.

**"Which character is live?"** The save does **not** record which slot was played last (documented
explicitly in <https://github.com/egormagurin/EldenRingMap/blob/main/docs/HOW-IT-WORKS.md>).
Two workable heuristics, and Phase 1 should use the simple one:

1. **Simple:** the slot whose `play_time_ms` advanced between two polls — the game rewrites only the
   slot being played. This is the same signal er-save-watcher uses ("it's the only slot the game
   rewrites when it saves", <https://github.com/tvhdev/er-save-watcher>).
2. **Better, later:** match the live map pixel against each slot's saved `map_id` + coordinates,
   with hysteresis (EldenRingMap requires three agreeing samples and an 8-px guard). Needs memory
   reading or manual map data — **do not** do this in Phase 1.

Expose the guess in the UI and let the user override it. Never silently pick a slot.

**Acceptance tests for Phase 1** (all runnable without the game, against two saved fixtures):

- T1.1 The bundled fixture parses: 10 slots, expected names/levels, all 12 MD5s verify.
- T1.2 A truncated file (last 4 KB removed) is rejected with a typed error, not a panic.
- T1.3 A file with one digest corrupted is rejected by verification, and the watcher returns the
  previous good snapshot rather than a bad one.
- T1.4 Walking a fixture with a mutated `unlocked_regions` count shifts the flag base by exactly
  4 bytes and the walk still asserts correctly (proves the walk is positional, not hardcoded).
- T1.5 An inventory record with an unknown param id is carried through, not dropped, and does not
  abort the parse.
- T1.6 Idempotence: applying the same `GameProgressDelta` twice produces byte-identical
  `exportState()` output (`store.ts:1080`).
- T1.7 No writes: the test asserts the save file's mtime and MD5 are unchanged after a full watch
  cycle, and that the file is never opened write-only.

**Effort.** Rust parser + watcher + commands: **5-8 focused days** for someone comfortable with
binary formats (BND4 and the slot walk are ~600 lines; the MD5/verify loop is ~30). TS bridge + UI
+ import diff: **3-4 days**. Fixtures and tests: **2 days** — and the fixtures are the long pole,
because they need a second human with the game (§7). Total **~2 weeks**, single developer, no game
install needed for CI.

### Phase 2 — event flags → route / catalog progress

**Goal:** turn `GameSnapshot.flags` + inventory into `GameProgressDelta.satisfied` without
regressing anything.

**Step 2a — fact extraction (mechanical, no judgement):** ship `eventflag_bst.txt` (11,919 rows)
plus a curated `flags.json` of labelled ids. Produce `GraceLit[]`, `BossDefeated[]`,
`MapFragmentRevealed[]`, `ItemPickupFlag[]` where labels exist. Testable against fixtures the same
way Phase 1 is.

**Step 2b — the mapping table (the research):** a generated
`src/data/gamelink-map.json`, built by a `scripts/research/build_gamelink_map.py` in the style of
`build_branch_plan.py`, with this shape:

```jsonc
{
  "generatedAt": "…",
  "coverage": { "routeSteps": 4521, "mapped": 0, "byMethod": {…}, "gaps": 4521 },
  "items":   { "<paramId>": { "catalogId": "GKI-…", "confidence": "high|medium|low" } },
  "graces":  { "<graceObjectId>": { "flagId": 76100, "confidence": "high" } },
  "bosses":  { "<encounterId>": { "flagId": 10000800, "confidence": "high" } },
  "steps":   { "<routeStepId>": { "requires": ["flag:…"], "confidence": "…" } },
  "unmapped": [ { "routeStepId": "RW-D-d1-1", "reason": "dlc-name-table-missing" } ]
}
```

The DLC gap is the dominant term. Phase 2 should either (a) accept ~30 % coverage and say so, or
(b) add an install-reading extractor like compass's `er-extractor` (reads `regulation.bin`,
`MSB`, `ItemLotParam_map` via Oodle) — which changes the product from "one self-contained binary"
to "needs your game install". Compass's own provenance doc shows how much of that data must be
re-derived per patch (<https://github.com/EthanShoeDev/elden-ring-compass/blob/main/packages/vendored-data/README.md>).

**Acceptance tests for Phase 2:**

- T2.1 For every mapped pair, the flag id resolves through the BST table to an in-range
  `(byte, bit)`; no mapping may point outside the 1,833,375-byte bitfield.
- T2.2 Fixture A (fresh character) → zero satisfied. Fixture B (same save, one boss killed and one
  item picked up) → exactly the expected boss and item, and **no** other step.
- T2.3 Diff-stability: over 50 consecutive polls of an idle save, the satisfied set is constant.
- T2.4 Additivity: a mapping that fires must never clear a manually ticked step.
- T2.5 The generated map passes `scripts/verify_release_data.py`-style invariants: every
  `catalogId` exists in `items.full.json`, every `encounterId` in `bosses.full.json`, every
  `graceObjectId` in `world.objects.json`, and `coverage.mapped + coverage.gaps == 4521`.

**Effort.** 2a: **2-3 days**. 2b: **weeks, not days**, and it is data work with a ceiling — the
honest estimate is that a solo effort lands 25-40 % of route steps with high confidence and stalls
on the DLC and on dialogue/traversal steps. Budget **3-4 weeks** for a defensible v1 of the map and
expect it to be the least satisfying part of the project.

### Phase 3 — optional overlay

Only worth doing after Phase 1 ships and the user has used the live panel for a while.

- New Tauri window `overlay`: `alwaysOnTop: true`, `decorations: false`, `skipTaskbar: true`,
  `transparent: true` if the design wants it, `resizable: true`.
- New capability entries: `core:window:allow-set-always-on-top`, and
  `core:window:allow-set-ignore-cursor-events` if click-through is desired
  (<https://v2.tauri.app/reference/acl/core-permissions/>).
- Content: next 1-3 route steps, last grace, runes. **No** boss health, no enemy names.
- Document the hard limit: exclusive-fullscreen games paint over other windows; borderless-windowed
  works. This is the same caveat er-save-watcher documents for its own overlay
  (<https://github.com/tvhdev/er-save-watcher>).
- **Effort: 2-3 days.** Small, but it is cosmetic and does not improve the underlying model.

### What Phase 1 must *not* do

- No `AppState` schema bump.
- No background auto-completion of route steps without a visible, reviewable diff.
- No writes to any save file.
- No new network listener unless it is loopback-only, disabled by default, and behind an explicit
  setting (and then `connect-src` must be narrowed to that exact origin in
  `src-tauri/tauri.conf.json:28`).

---

## 7. Risks, and what to validate before writing code

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | A game patch changes the slot layout / slot version and the walk desynchronises | Medium (1.17 already broke every editor's regulation assumption — <https://github.com/ClayAmore/ER-Save-Editor/pull/100>) | Wrong data silently | Assertion-based walk that **throws**; slot `version` and `base_version` gated; fixture tests pinned to a known version |
| R2 | Event-flag block table goes stale after a patch | Low-medium | Graces/bosses read the wrong bit | Version the BST file; re-verify against an in-game action after each patch; ship the BST file hash in the UI |
| R3 | DLC content unmapped (measured: 0.2 % of DLC items, 0 % of DLC graces) | **Certain** | Phase 2 promise collapses for a quarter of the route | Say so up front; treat install-derived extraction as a separate, explicit decision (§8, question 3) |
| R4 | User points the watcher at a `.co2` and gets mod items the app has never heard of | Medium | Parse abort or garbage | Unknown ids pass through opaque; test T1.5 |
| R5 | Save caught mid-write | Medium | Garbage snapshot | MD5-verify all 12 entries; bounded retry; keep last good snapshot |
| R6 | Two saves (`.sl2` + `.co2`) both live | High for modded users | Wrong progress applied | Newest-mtime wins with a visible, overridable indicator; never blend two files |
| R7 | "Which character" guess is wrong on a shared save | Medium | Progress applied to the wrong companion character | `play_time_ms` delta + explicit user choice, persisted per save path |
| R8 | Users treat auto-confirmed progress as authoritative and miss manual steps | Medium | Silent under-tracking | Show evidence per satisfied step; never hide the manual controls |
| R9 | Scope creep into memory reading "for the map dot" | Medium | EAC posture, admin rights, patch-fragility | Written product rule (§5 rule 2); reject in review |
| R10 | Legal perception ("is this a cheat?") | Medium | Reputational | Read-only disclosure in-app; no EAC interaction; link the EULA/TOS reasoning in the feature's own docs |
| R11 | A future maintainer adds a write path "just to fix one thing" | Low | Corruption, bans | Rule §5 rule 5 encoded as a test: no write syscalls in the save module; grep-level CI guard |

### Validate before writing any code — the fixture protocol

This is the cheapest possible de-risking and it needs **two saves from a real playthrough**. Nothing
below requires writing a parser first; a hex editor and `md5sum` are enough to start.

1. **Capture a baseline.** Copy `ER0000.sl2` (plus `.co2`/`.err` if the player uses them) to
   `fixtures/save-a.sl2`. Record: file size (must be 28,967,888), slot count, each character's
   name, level, runes, play time, and the last grace from the in-game UI.
2. **Do exactly one known thing.** e.g. pick up one specific item with a known name, or kill one
   specific boss, and immediately quit to the menu so the game flushes the save.
3. **Capture again** as `fixtures/save-b.sl2`.
4. **Diff offline** with a throwaway script (not app code):
   - Which slot's bytes changed? (That is the active-character signal, and it validates R7.)
   - Which of the 12 MD5s changed, and does the file size stay identical? (Validates §1.5.)
   - Where did the flag bitfield move? (Quantifies the "2,216 bytes between saves" claim for
     *this* player — it is the number that decides whether a fixed offset could ever be tempting.)
   - Which individual flag bits went 0→1? Compare that set against the BST-resolved flag for the
     known action. **This is the single highest-value experiment in the whole document**: it either
     confirms the BST table and the flag id (great) or it tells you the label tables are stale for
     the current patch (also valuable, and much cheaper to learn now).
   - Did the item appear in `inventory_held` with the expected id and quantity, and in
     `gaitem_game_data`?
5. **Repeat with a DLC action** (one DLC item pickup, one DLC grace). This is the only way to get a
   real DLC flag id without an install extractor, and it directly tests R3.
6. **Repeat with a quest action** (advance one NPC by one step). Quantifies how many bits move for
   a single dialogue-ish step — the number that decides how much of the 70 % unanchored route is
   ever recoverable.
7. **Then and only then** write the Rust walk, test-first against `save-a`/`save-b`.

Secondary validations worth doing at the same time:

- Run an existing parser (compass's TS parser, or ER-Save-Editor) against the fixture and compare
  its output to your own reading of the same file. Cross-checking two independent implementations
  is cheaper than trusting one.
- Confirm the app's `Character` model can express the snapshot: stats fit
  (`types.ts:1` `Stats`), level is derivable, inventory maps to `Character.itemCounts` +
  `Character.items` (`types.ts:1261`), equipment to `EquipmentState` (`types.ts:1250`). **Known
  mismatch:** the declared types are open arrays (`types.ts:1250`) but the *normaliser* coerces them
  to fixed lengths — `armor` 4, `talismans` 4, `spells` 10, `physick` 2 (`store.ts:340-343`) — while
  the save stores 5 talisman slots (the 5th unused) and 14 spell slots. Importing equipment must
  therefore go through the existing `setEquipment` path (`store.ts:896`), not raw assignment.
- Confirm the class mapping: `PlayerGameData.archetype` is an index into `CharaInitParam`, and this
  repo's `CLASSES` (`src/lib/classes.ts`) is ordered by its own notion. Join by **name**, not by
  index `[DERIVED]` risk.

---

## 8. Open questions

1. **Which save flavour is the primary target?** Vanilla `.sl2` only, or `.co2`/`.err` too? The
   container is identical, so support is cheap — but `.co2` brings unknown item ids and a different
   audience.
2. **Is "live" (polling, seconds) enough, or does the product need "now"?** Everything above assumes
   seconds. Frame-accurate "now" is the memory reader, which is rejected.
3. **Is reading the *game install* acceptable?** This is the fork in the road for DLC coverage.
   Compass's extractor reads `regulation.bin`, 864 `MSB` files and `ItemLotParam_map` from the
   player's own install (never shipping FromSoftware art/text). It gives ~100 % item/flag coverage
   and it also means the companion stops being a single self-contained binary. **Decision needed
   before Phase 2, not before Phase 1.**
4. **Which app character owns the imported progress?** The save has up to 10 slots; the companion
   has `Character[]` with `journeys[]` for NG+ cycles. Is the mapping 1 slot → 1 `Character`, and
   `journey.index` ← the save's NG+ counter (`unk_gamedataman_0x120_or_0x130`, documented as
   "NG+ cycle (0 = first playthrough)")?
5. **What is the product promise in one sentence?** Candidates: "the companion shows what your save
   already knows" (defensible today) versus "the companion follows your playthrough" (needs
   Phase 2's mapping to be far better than the measured 29.9 %). Pick the first for the release
   notes and let the second be an aspiration.
6. **Does the DLC blessing level belong in `Character`?** `scadutree`/`reveredSpirit` are readable
   and are the clearest DLC progress signal available, but nothing in the current state model holds
   them (`types.ts:1261`). Adding them is a schema question, i.e. exactly the kind of change that
   must not ride along with Phase 1.
7. **Is `eventflag_bst.txt` redistributable?** It is reverse-engineered from the game's own
   `CSFD4VirtualMemoryFlag` tree and is redistributed by ER-Save-Lib and by compass. The
   *authors'* licence terms are unclear (`[UNVERIFIED]`). Safer alternative: require the user's
   install, or re-derive empirically by save-diffing.
8. **What happens on a `schemaVersion` mismatch two years from now?** Phase 1 deliberately avoids
   touching `AppState`. If provenance data must persist, decide *now* whether it lives in a sibling
   storage key or in a `schemaVersion: 2` migration — because `normalizeState` will otherwise
   reject a v2 file outright (`store.ts:361`).

---

## 9. Source list

**Primary / first-party**

- Elden Ring Terms of Service for Online Services — <https://www.eldenring.jp/eula/p_en.html>
- Bandai Namco EULA (Steam) — <https://store.steampowered.com/eula/1245620_eula_0>
- Patch 1.17.2 notes, 2026-10-20 — <https://en.bandainamcoent.eu/elden-ring/news/elden-ring-patch-notes-version-1172>
- Steam AppID for save paths — `1245620` (as used throughout the community tooling below)

**Format documentation**

- Save File Structure (most complete field list, PC + PS4, write rules) —
  <https://elden-ring-save-manager.readthedocs.io/en/main/technical/save-file-structure>
- Event flags & boss respawner user guide (categories, 1,295 documented flags) —
  <https://elden-ring-save-manager.readthedocs.io/en/main/user-guide/event-flags/>
- EldenRing-SaveForge binary format audit (offsets, GaItems, MD5, AES, slot hash) —
  <https://github.com/oisis/EldenRing-SaveForge/blob/main/docs/sl2-binary-format-spec.md>
- EldenRingMap "How it works" (BND4, plaintext save, forward walk, flag addressing, coordinates) —
  <https://github.com/egormagurin/EldenRingMap/blob/main/docs/HOW-IT-WORKS.md>

**Libraries / implementations**

- ER-Save-Lib (Rust) — <https://github.com/ClayAmore/ER-Save-Lib>
- ER-Save-Editor (Rust; `src/db/event_flags.rs`, `graces.rs`, `bosses.rs`, `*_name.rs`) —
  <https://github.com/ClayAmore/ER-Save-Editor> · 1.17/`.co2` fix PR:
  <https://github.com/ClayAmore/ER-Save-Editor/pull/100>
- Elden Ring Compass (pure-TS parser, ~1.6 ms/save; vendored flag BST; install extractor) —
  <https://github.com/EthanShoeDev/elden-ring-compass> ·
  <https://github.com/EthanShoeDev/elden-ring-compass/blob/main/packages/vendored-data/README.md> ·
  <https://github.com/EthanShoeDev/elden-ring-compass/blob/main/docs/projects/future/save-flag-diff-checkpoints.md>
- er-save-parser (TypeScript, MIT) — <https://github.com/zebbedaja/er-save-parser>
- elden-ring-save-parser-lib (Python, MIT) — <https://github.com/Hapfel1/elden-ring-save-parser-lib>
- EldenRingMap live memory reader (what a memory path costs) —
  <https://github.com/egormagurin/EldenRingMap> (`tools/live_memory.py`)
- er-save-watcher (save-watch + active-slot detection + overlay caveats) —
  <https://github.com/tvhdev/er-save-watcher>
- Elden Ring Save Manager / Hub (Linux compatdata paths, EAC guidance) —
  <https://github.com/llmandres/elden-ring-hub> ·
  <https://github.com/llmandres/elden-ring-hub/blob/main/docs/user-guide/linux-compatdata.md> ·
  <https://github.com/llmandres/elden-ring-hub/blob/main/docs/user-guide/eac-warning.md>
- Save backup tool listing `.sl2` + `.co2` locations —
  <https://github.com/Aznlilly/EldenRingSaveBackupTool>

**Platform / API**

- Tauri 2 configuration reference (`alwaysOnTop`, `decorations`, `transparent`, `skipTaskbar`,
  `focus`, window `label`) — <https://v2.tauri.app/reference/config/>
- Tauri 2 window JS API (`setAlwaysOnTop`, `setIgnoreCursorEvents`) —
  <https://v2.tauri.app/reference/javascript/api/namespacewindow/>
- Tauri 2 core permissions (`core:window:allow-set-always-on-top`,
  `core:window:allow-set-ignore-cursor-events`) —
  <https://v2.tauri.app/reference/acl/core-permissions/>
- Tauri 2 file-system plugin (and why not to expose it to the webview) —
  <https://v2.tauri.app/plugin/file-system/>
- `showOpenFilePicker()` — <https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker>
- Seamless Co-op save extension setting (`save_file_extension = co2`) —
  <https://ersc-docs.github.io/seamless-modding/>

**This repository (measured, not cited)**

- `src/data/route.full.json` (4,521 steps), `src/data/items.full.json` (2,325),
  `src/data/bosses.full.json` (237), `src/data/world.objects.json` (697 / 413 graces),
  `src/data/questline-route-map.json` (587 / 431 linked)
- `src/lib/types.ts:99,227,1217,1250,1261,1303`; `src/lib/store.ts:28,359,487,522,621,795,928,947,1080,1084`;
  `src/lib/selectors.ts:125,310,337`; `src/lib/data.ts:207,253,269`
- `src/lib/desktop.ts:1,2,12,26,30,34,38,42,47`; `src-tauri/src/lib.rs:9,46,47,62,109,147,152,173,204`;
  `src-tauri/capabilities/default.json:6`; `src-tauri/tauri.conf.json:28`

---

## 10. Recommended plan, in one page

**Posture:** read-only, file-only, offline-only, no process contact, no writes, no network. The
manual companion stays the primary product; the live link is an *import and assistance* feature that
degrades to nothing when absent.

| Phase | What ships | Depends on | Effort | Gate to start |
| --- | --- | --- | --- | --- |
| **1. Watch + import** | Rust BND4/slot/GaItem/inventory/equipment/flag reader; MD5-verified poll loop; `save_probe` / `save_watch_start` / `save_snapshot` commands + `er-companion:game-state` event; `src/lib/gamelink.ts`; a reviewable "Import from save" diff applied through existing store actions; a live panel (character, level, runes, last grace, newly acquired items) | Two fixture saves from a real playthrough (§7) | ~2 weeks | §7 fixture protocol steps 1-7 done |
| **2. Flag → progress** | `eventflag_bst.txt` + curated labels (grace/boss/map-fragment/pickup); generated `src/data/gamelink-map.json` with `coverage` + `unmapped` reasons; auto-satisfy ~30 % of route steps, DLC excluded and labelled | Phase 1 landing; a decision on install-derived extraction | 2-3 days (2a) + 3-4 weeks (2b) | §8 question 3 answered; measured coverage acceptable |
| **3. Overlay** | Optional always-on-top Tauri window: next 1-3 steps, last grace, runes. No boss health, no enemy names | Phase 1 used in anger for a while | 2-3 days | Phase 1 shipped; `core:window:allow-set-always-on-top` added to `capabilities/default.json:6` |

**Recommended sequencing:** build Phase 1 only; ship it; measure how much of the route import
actually satisfies against a real save; *then* decide whether Phase 2's mapping work is worth a
month. Do not start Phase 2 before the fixture experiments exist, because the current-patch DLC
label situation (0 % joinable) is the single fact most likely to change the plan.

**Explicitly rejected:** process-memory reading (EAC posture, admin privileges, patch churn, and it
buys only a map dot); screen OCR (localisation, dependencies, spoofable); Steam overlay injection
(no supported API); any write path to a save file (corruption and ban risk for zero gain).

### Open questions that gate the plan

| # | Question | Blocks |
| --- | --- | --- |
| 1 | Vanilla `.sl2` only, or `.co2`/`.err` too? | Phase 1 scope (cheap either way — same container) |
| 2 | Is seconds-latency "live" enough? | Whole design (if not, the answer is memory reading, which is rejected) |
| 3 | Is reading the *game install* acceptable? | Phase 2 DLC coverage |
| 4 | Is the mapping 1 save slot → 1 `Character`, and `journey.index` ← the save's NG+ counter? | Phase 1 import targeting |
| 5 | What is the one-sentence product promise? | Release notes / marketing honesty |
| 6 | Do `scadutree` / `reveredSpirit` belong in `Character`? | Any `schemaVersion` change |
| 7 | Is `eventflag_bst.txt` redistributable? | Phase 2 shipping |
| 8 | Provenance in a sibling storage key or a `schemaVersion: 2` migration? | Any persisted link state |
