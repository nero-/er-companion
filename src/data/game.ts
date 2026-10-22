import type { Encounter, Item } from "../lib/types";

/**
 * Live game metadata verified against official Bandai Namco patch notes on
 * 2026-10-21. This is deliberately separate from the workbook baseline so the
 * app never presents 1.16.1 build data as if it were 1.17-current.
 */
export interface GameVersion {
  app: string;
  regulation: string;
  checkedAt: string;
  titleUpdate: string;
  tarnishedEditionRelease: string;
  sources: { label: string; url: string }[];
}

export interface PatchRelease {
  version: string;
  regulation: string;
  date: string;
  kind: "content" | "balance" | "bugfix" | "release";
  summary: string;
  changes: string[];
  sourceUrl: string;
}

export interface PatchImpact {
  category: string;
  summary: string;
  affected: string[];
}

export const GAME_VERSION: GameVersion = {
  app: "1.17.2",
  regulation: "1.17.3",
  checkedAt: "2026-10-21",
  titleUpdate: "Tarnished Pack / Tarnished Edition",
  tarnishedEditionRelease: "2026-08-28",
  sources: [
    {
      label: "Official Patch 1.17.2 notes (2026-10-20)",
      url: "https://www.bandainamcoent.com/news/elden-ring-tarnished-edition-patch-1-17-2",
    },
    {
      label: "Official Patch 1.17 notes (2026-08-27)",
      url: "https://en.bandainamcoent.eu/elden-ring/news/elden-ring-patch-notes-version-117",
    },
    {
      label: "Official Tarnished Edition page",
      url: "https://en.bandainamcoent.eu/elden-ring/elden-ring-tarnished-edition",
    },
    {
      label: "Tarnished Edition content locations (Nintendo Life, 2026-09-04)",
      url: "https://www.nintendolife.com/guides/elden-ring-tarnished-edition-weapons-armor-npc-invasions-steed-attire-content",
    },
    {
      label: "New class stats (PC Gamer, 2026-07-23)",
      url: "https://www.pcgamer.com/games/rpg/fromsoftware-reveals-final-stats-of-new-elden-ring-classes-and-one-of-them-already-got-a-tiny-nerf/",
    },
  ],
};

export const DATA_BASELINE = {
  regulation: "1.16.1",
  workbookVersion: "12.44",
  note:
    "The certified workbook build, tier, encounter, and balance data was authored against Regulation 1.16.1. It predates the Tarnished Pack and the 1.17 balance pass.",
  staleDomains: [
    "Tier-list rankings",
    "Certified build loadouts and encounter presets",
    "Weapon configuration rankings",
    "Boss strategy assumptions",
    "Upgrade planning where 1.17 changed a weapon or skill",
  ],
  trustRule:
    "Route, collection, quest, and lore structure remain usable. Treat build/tier recommendations as 1.16.1 baseline until each affected entry is re-validated against 1.17.",
};

export const PATCHES: PatchRelease[] = [
  {
    version: "1.17.2",
    regulation: "1.17.3",
    date: "2026-10-20",
    kind: "bugfix",
    summary: "Bugfix-only patch. No additional content is included.",
    changes: [
      "Fixed Gold Tattoo Chest armor rendering with the Hide Helmet option.",
      "Fixed left-hand Repeating Crossbow skill graphics while holding Leontiel's Greatsword in the right hand.",
      "Corrected credits text.",
      "Fixed Piquebone Arrow / Fletched Piquebone Arrow status buildup.",
      "PS4/PS5: enhanced network security.",
    ],
    sourceUrl: "https://www.bandainamcoent.com/news/elden-ring-tarnished-edition-patch-1-17-2",
  },
  {
    version: "1.17.1",
    regulation: "1.17.1",
    date: "2026-09-08",
    kind: "bugfix",
    summary: "Bugfix for a multiplayer glitch involving DLC items.",
    changes: ["Fixed a multiplayer glitch involving Tarnished Pack DLC items."],
    sourceUrl: "https://www.vice.com/en/article/elden-ring-update-today-patch-1-17-1-notes",
  },
  {
    version: "1.17",
    regulation: "1.17",
    date: "2026-08-27",
    kind: "content",
    summary:
      "Tarnished Pack support: two new classes, new weapons/armor, three Spectral Steed attires, two NPC invasions, and a broad balance pass.",
    changes: [
      "Added Idus Knight and Heavy Knight starting classes.",
      "Added Tarnished Pack weapons, armor sets, and merchant/world acquisitions.",
      "Added Tree Sentinel, Carian Silver, and Funereal Night Spectral Steed attire.",
      "Added Knight Leontiel invasion in Caelid's Wailing Dunes.",
      "Added Broken Gold Mask invasion in Leyndell, Royal Capital (Law of Regression at the Radagon statue).",
      "Balance: weapon, skill, sorcery, incantation, and PvP adjustments (see the impact register below).",
    ],
    sourceUrl: "https://en.bandainamcoent.eu/elden-ring/news/elden-ring-patch-notes-version-117",
  },
  {
    version: "Tarnished Edition",
    regulation: "1.17",
    date: "2026-08-28",
    kind: "release",
    summary:
      "Nintendo Switch 2 release including the base game, Shadow of the Erdtree, and the Tarnished Pack content. The Tarnished Pack is sold separately on PC, PS5, and Xbox.",
    changes: [
      "Tarnished Edition includes the base game, Shadow of the Erdtree, and Tarnished Pack content.",
      "On existing platforms, the Tarnished Pack is a paid add-on; the 1.17 patch is required.",
    ],
    sourceUrl: "https://en.bandainamcoent.eu/elden-ring/elden-ring-tarnished-edition",
  },
];

export const PATCH_IMPACTS: PatchImpact[] = [
  {
    category: "Weapons — buffed",
    summary: "Critical, throwing, scaling, range, or attack-power improvements.",
    affected: [
      "Smithscript Dagger",
      "Rellana's Twin Blades",
      "Smithscript Axe",
      "Smithscript Spear",
      "Spear of the Impaler",
      "Carian Sorcery Sword",
      "Smithscript Greathammer",
      "Golem Fist",
      "Firespark Perfume Bottle",
      "Lightning Perfume Bottle",
      "Chilling Perfume Bottle",
      "Frenzyflame Perfume Bottle",
      "Deadly Poison Perfume Bottle",
    ],
  },
  {
    category: "Shields — guard boost / weight",
    summary: "Guard boost increased; several weights reduced.",
    affected: [
      "Lordsworn's Shield",
      "Briar Greatshield",
      "Spiked Palisade Shield",
      "Icon Shield",
      "Golden Beast Crest Shield",
      "Manor Towershield",
      "Crossed-Tree Towershield",
      "Inverted Hawk Towershield",
      "Dragon Towershield",
      "Distinguished Greatshield",
      "Gilded Greatshield",
      "Black Steel Greatshield",
      "Ant's Skull Plate",
      "Erdtree Greatshield",
      "Wooden Greatshield",
      "Cuckoo Greatshield",
      "Redmane Greatshield",
      "Golden Greatshield",
      "Crucible Hornshield",
      "Dragonclaw Shield",
      "Eclipse Crest Greatshield",
      "Jellyfish Shield",
      "One-Eyed Shield",
      "Haligtree Crest Greatshield",
    ],
  },
  {
    category: "Weapons — PvP adjustment",
    summary: "Rakshasa's Great Katana takes more damage while attacking in PvP; great-katana critical and jump-attack bugs fixed.",
    affected: ["Rakshasa's Great Katana"],
  },
  {
    category: "Skills",
    summary: "Parry performance improved; Storm Wall no longer consumes FP.",
    affected: ["Parry", "Storm Wall", "Thops's Barrier"],
  },
  {
    category: "Sorceries",
    summary: "Power, cast-time, or projectile-behavior improvements.",
    affected: [
      "Founding Rain of Stars",
      "Carian Retaliation",
      "Meteorite",
      "Meteorite of Astel",
      "Gravitational Missile",
    ],
  },
  {
    category: "Incantations",
    summary: "Power/range improvements; PvP hit-reaction reductions for breath incantations.",
    affected: [
      "Feather of the Divine Bird",
      "O, Flame!",
      "Rain of Fire",
      "Rugalea's Roar",
      "Rotten Breath",
      "Ekzykes's Decay",
    ],
  },
  {
    category: "Field / enemy rewards",
    summary: "Some Realm of Shadow field and powerful-enemy rewards now give higher-tier items or other treasures. Already-collected items are unchanged.",
    affected: ["Realm of Shadow field rewards"],
  },
];

const PACK_GAME = "Tarnished Pack";
const PACK_SOURCE =
  "https://www.nintendolife.com/guides/elden-ring-tarnished-edition-weapons-armor-npc-invasions-steed-attire-content";

function packItem(
  id: string,
  name: string,
  category: string,
  group: string,
  region: string,
  location: string,
  acquisitionType: string,
  notes: string,
  missable = "",
): Item {
  return {
    id,
    name,
    category,
    group,
    region,
    location,
    acquisitionType,
    startingOwned: false,
    objectiveId: "",
    linkedRouteRaw: "",
    missable,
    validation: "Verified — official patch 1.17 and Tarnished Edition content guides",
    sourceUrl: PACK_SOURCE,
    notes,
    game: PACK_GAME,
    sourceRow: 0,
    routeStepIds: [],
    autoStepId: null,
  };
}

export const TARNISHED_ITEMS: Item[] = [
  packItem(
    "TP-COL-IDUS-SWORD",
    "Idus Sword",
    "Weapon",
    "Weapon",
    "Liurnia of the Lakes",
    "South Liurnia — Liurnia Lake Shore grace, north-west by a tree near some ruins",
    "Fixed pickup",
    "From Liurnia Lake Shore, ride north-west to the tree beside the ruins.",
  ),
  packItem(
    "TP-COL-HEFTY-SCIMITAR",
    "Hefty Scimitar",
    "Weapon",
    "Weapon",
    "Limgrave",
    "Southern Limgrave — Nomadic Merchant north of Fort Haight West",
    "Merchant purchase",
    "Sold by the Nomadic Merchant north of the Fort Haight West grace. Also a Heavy Knight starting weapon.",
  ),
  packItem(
    "TP-COL-REED-GREAT-KATANA",
    "Reed Great Katana",
    "Weapon",
    "Weapon",
    "Caelid",
    "Fort Faroth — tall grey mound just to the north, north side corpse",
    "Fixed pickup",
    "Scale the grey mound north of Fort Faroth with Torrent; the corpse is on its north side.",
  ),
  packItem(
    "TP-COL-REVERSE-BLADED-SWORD",
    "Reverse-Bladed Sword",
    "Weapon",
    "Weapon",
    "Roundtable Hold",
    "Twin Maiden Husks",
    "Merchant purchase",
    "Sold by the Twin Maiden Husks; available from the start of the game.",
  ),
  packItem(
    "TP-COL-LEONTIELS-GREATSWORD",
    "Leontiel's Greatsword",
    "Weapon",
    "Weapon",
    "Caelid",
    "Wailing Dunes — go directly north from the Radahn arena",
    "NPC invasion reward",
    "Defeat Knight Leontiel during the Wailing Dunes invasion.",
    "Timing-sensitive: Wailing Dunes invasion",
  ),
  packItem(
    "TP-COL-GOLDEN-ORDER-FLAIL",
    "Golden Order Flail",
    "Weapon",
    "Weapon",
    "Leyndell, Royal Capital",
    "Radagon statue — cast Law of Regression during the Goldmask questline",
    "NPC invasion reward",
    "Defeat Broken Gold Mask after casting Law of Regression in front of the Radagon statue. Unavailable after Leyndell becomes the Ashen Capital, and cannot be triggered again if the spell was already cast there.",
    "Missable: before Ashen Capital; one-time statue interaction",
  ),
  packItem(
    "TP-COL-SILVER-GROOVED-SHIELD",
    "Silver Grooved Shield",
    "Shield",
    "Shield",
    "Liurnia of the Lakes",
    "Nomadic Merchant north of Bellum Church",
    "Merchant purchase",
    "Sold with the Silver Grooved armor set.",
  ),
  packItem(
    "TP-COL-RITUAL-THRUSTING-SHIELD",
    "Ritual Thrusting Shield",
    "Shield",
    "Shield",
    "Caelid",
    "Caelid Colosseum, north Caelid",
    "Fixed pickup",
    "Reach the colosseum via the Siofra River lift north of the Worshippers' Woods grace.",
  ),
  packItem(
    "TP-COL-SILVER-GROOVED-HELM",
    "Silver Grooved Helm",
    "Armor",
    "Armor",
    "Liurnia of the Lakes",
    "Nomadic Merchant north of Bellum Church",
    "Merchant purchase",
    "Idus Knight / Silver Grooved set.",
  ),
  packItem(
    "TP-COL-SILVER-GROOVED-ARMOR",
    "Silver Grooved Armor",
    "Armor",
    "Armor",
    "Liurnia of the Lakes",
    "Nomadic Merchant north of Bellum Church",
    "Merchant purchase",
    "Idus Knight / Silver Grooved set.",
  ),
  packItem(
    "TP-COL-SILVER-GROOVED-GAUNTLETS",
    "Silver Grooved Gauntlets",
    "Armor",
    "Armor",
    "Liurnia of the Lakes",
    "Nomadic Merchant north of Bellum Church",
    "Merchant purchase",
    "Idus Knight / Silver Grooved set.",
  ),
  packItem(
    "TP-COL-SILVER-GROOVED-GREAVES",
    "Silver Grooved Greaves",
    "Armor",
    "Armor",
    "Liurnia of the Lakes",
    "Nomadic Merchant north of Bellum Church",
    "Merchant purchase",
    "Idus Knight / Silver Grooved set.",
  ),
  packItem(
    "TP-COL-STEEL-HELM",
    "Steel Helm",
    "Armor",
    "Armor",
    "Weeping Peninsula",
    "Isolated Merchant's Shack",
    "Merchant purchase",
    "Heavy Knight / Steel set.",
  ),
  packItem(
    "TP-COL-STEEL-ARMOR",
    "Steel Armor",
    "Armor",
    "Armor",
    "Weeping Peninsula",
    "Isolated Merchant's Shack",
    "Merchant purchase",
    "Heavy Knight / Steel set.",
  ),
  packItem(
    "TP-COL-STEEL-GAUNTLETS",
    "Steel Gauntlets",
    "Armor",
    "Armor",
    "Weeping Peninsula",
    "Isolated Merchant's Shack",
    "Merchant purchase",
    "Heavy Knight / Steel set.",
  ),
  packItem(
    "TP-COL-STEEL-GREAVES",
    "Steel Greaves",
    "Armor",
    "Armor",
    "Weeping Peninsula",
    "Isolated Merchant's Shack",
    "Merchant purchase",
    "Heavy Knight / Steel set.",
  ),
  packItem(
    "TP-COL-LEONTIELS-HAT",
    "Leontiel's Hat",
    "Armor",
    "Armor",
    "Caelid",
    "Wailing Dunes — Knight Leontiel invasion",
    "NPC invasion reward",
    "Defeat Knight Leontiel north of the Radahn arena.",
    "Timing-sensitive: Wailing Dunes invasion",
  ),
  packItem(
    "TP-COL-LEONTIELS-ARMOR",
    "Leontiel's Armor",
    "Armor",
    "Armor",
    "Caelid",
    "Wailing Dunes — Knight Leontiel invasion",
    "NPC invasion reward",
    "Defeat Knight Leontiel north of the Radahn arena.",
    "Timing-sensitive: Wailing Dunes invasion",
  ),
  packItem(
    "TP-COL-LEONTIELS-GLOVES",
    "Leontiel's Leather Gloves",
    "Armor",
    "Armor",
    "Caelid",
    "Wailing Dunes — Knight Leontiel invasion",
    "NPC invasion reward",
    "Defeat Knight Leontiel north of the Radahn arena.",
    "Timing-sensitive: Wailing Dunes invasion",
  ),
  packItem(
    "TP-COL-LEONTIELS-BOOTS",
    "Leontiel's Boots",
    "Armor",
    "Armor",
    "Caelid",
    "Wailing Dunes — Knight Leontiel invasion",
    "NPC invasion reward",
    "Defeat Knight Leontiel north of the Radahn arena.",
    "Timing-sensitive: Wailing Dunes invasion",
  ),
  packItem(
    "TP-COL-BROKEN-GOLD-MASK",
    "Broken Gold Mask",
    "Armor",
    "Armor",
    "Leyndell, Royal Capital",
    "Radagon statue — Broken Gold Mask invasion",
    "NPC invasion reward",
    "Defeat Broken Gold Mask after casting Law of Regression in front of the Radagon statue.",
    "Missable: before Ashen Capital; one-time statue interaction",
  ),
  packItem(
    "TP-COL-GOLD-TATTOO-CHEST",
    "Gold Tattoo (Chest)",
    "Armor",
    "Armor",
    "Leyndell, Royal Capital",
    "Radagon statue — Broken Gold Mask invasion",
    "NPC invasion reward",
    "Defeat Broken Gold Mask after casting Law of Regression in front of the Radagon statue.",
    "Missable: before Ashen Capital; one-time statue interaction",
  ),
  packItem(
    "TP-COL-GOLD-TATTOO-ARM",
    "Gold Tattoo (Arm)",
    "Armor",
    "Armor",
    "Leyndell, Royal Capital",
    "Radagon statue — Broken Gold Mask invasion",
    "NPC invasion reward",
    "Defeat Broken Gold Mask after casting Law of Regression in front of the Radagon statue.",
    "Missable: before Ashen Capital; one-time statue interaction",
  ),
  packItem(
    "TP-COL-GOLD-TATTOO-LEG",
    "Gold Tattoo (Leg)",
    "Armor",
    "Armor",
    "Leyndell, Royal Capital",
    "Radagon statue — Broken Gold Mask invasion",
    "NPC invasion reward",
    "Defeat Broken Gold Mask after casting Law of Regression in front of the Radagon statue.",
    "Missable: before Ashen Capital; one-time statue interaction",
  ),
  packItem(
    "TP-COL-REGALIA-TREE-SENTINEL",
    "Spectral Steed Regalia: Tree Sentinel",
    "Steed Attire",
    "Steed Attire",
    "Limgrave",
    "Stormveil Castle — after Godrick, throne room chest",
    "Chest",
    "From the Godrick the Grafted grace, proceed to the throne room, take a right then a left; the chest holds the attire.",
  ),
  packItem(
    "TP-COL-REGALIA-CARIAN-SILVER",
    "Spectral Steed Regalia: Carian Silver",
    "Steed Attire",
    "Steed Attire",
    "Liurnia of the Lakes",
    "Ranni's Rise — chest behind the desk",
    "Chest",
    "Behind the desk in the room with the Ranni's Rise grace.",
  ),
  packItem(
    "TP-COL-REGALIA-FUNEREAL-NIGHT",
    "Spectral Steed Regalia: Funereal Night",
    "Steed Attire",
    "Steed Attire",
    "Altus Plateau",
    "Clifftop south-east of the Hermit Merchant's Shack / Outer Wall Battleground",
    "Fixed pickup",
    "Follow the clifftop swords; the attire is next to the southernmost blade.",
  ),
];

function packEncounter(
  id: string,
  name: string,
  region: string,
  location: string,
  notes: string,
  missable: boolean,
): Encounter {
  return {
    id,
    name,
    region,
    location,
    type: "NPC Invasion",
    required: "Tarnished Pack",
    notes,
    validation: "Verified — official patch 1.17 and Tarnished Edition content guides",
    linkedRouteRaw: "",
    sourceRow: 0,
    act: "Tarnished Pack",
    completionUnit: region,
    majorBoss: false,
    optional: true,
    respawns: false,
    achievement: "",
    questRelated: false,
    missable,
    multiplayer: "No",
    timeLock: "None",
    tags: ["Tarnished Pack", "NPC Invasion", region],
    notes2: notes,
    recommendedLevel: "Mid-to-late game",
    standardWeapon: "",
    somberWeapon: "",
    flaskCharges: "",
    flaskDistribution: "",
    spiritAsh: "",
    npcSummon: "",
    consumables: "",
    strategyNotes: "NPC invasion; use the new weapon/armor drops to verify acquisition.",
    difficulty: "NPC invasion",
    defaultRoute: "Complete",
    returnObjective: "",
    runeRisk: "Medium",
    scadutree: "",
    confidence: "Official patch + guide",
    routeStepIds: [],
    autoStepId: null,
    game: PACK_GAME,
  };
}

export const TARNISHED_ENCOUNTERS: Encounter[] = [
  packEncounter(
    "TP-ENC-LEONTIEL",
    "Knight Leontiel",
    "Caelid",
    "Wailing Dunes — north of the Starscourge Radahn arena",
    "Invasion added in patch 1.17. Drops Leontiel's Greatsword and the Leontiel's armor set.",
    true,
  ),
  packEncounter(
    "TP-ENC-BROKEN-GOLD-MASK",
    "Broken Gold Mask",
    "Leyndell, Royal Capital",
    "Radagon statue — cast Law of Regression during the Goldmask questline",
    "Invasion added in patch 1.17. Drops the Golden Order Flail and the Broken Gold Mask / Gold Tattoo set. Unavailable after Leyndell becomes the Ashen Capital; the statue interaction is one-time.",
    true,
  ),
];

export const PACK_HIGHLIGHTS = [
  {
    title: "Two starting classes",
    detail: "Idus Knight (Level 7, Dexterity/Faith lean) and Heavy Knight (Level 10, Strength/Endurance lean).",
  },
  {
    title: "Seven new weapons",
    detail: "Idus Sword, Hefty Scimitar, Reed Great Katana, Reverse-Bladed Sword, Ritual Thrusting Shield, Leontiel's Greatsword, Golden Order Flail.",
  },
  {
    title: "Four new armor sets",
    detail: "Silver Grooved, Steel, Leontiel's, and Broken Gold Mask / Gold Tattoo.",
  },
  {
    title: "Three Spectral Steed attires",
    detail: "Tree Sentinel (Stormveil), Carian Silver (Ranni's Rise), Funereal Night (Altus Plateau).",
  },
  {
    title: "Two NPC invasions",
    detail: "Knight Leontiel in the Wailing Dunes and Broken Gold Mask at the Radagon statue in Leyndell.",
  },
];
