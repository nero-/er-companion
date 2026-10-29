import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ARCHETYPES,
  AUTO_BOSSES_BY_STEP,
  AUTO_ITEMS_BY_STEP,
  BOSS_STRATEGIES,
  BRANCH_PLAN_DECISIONS,
  BRANCH_REWARDS,
  BRANCH_REWARD_RESOLVED_COUNT,
  BRANCH_REWARD_UNRESOLVED_COUNT,
  CONTENT_COVERAGE,
  CRAFTING_MATERIALS,
  ENCOUNTERS,
  ITEMS,
  LEGACY_STEP_MAP,
  LORE,
  LOADOUTS,
  MERCHANT_INVENTORIES,
  MERCHANT_INVENTORY_ITEM_COUNT,
  META,
  NGPLUS_SECTIONS,
  NGPLUS_STEPS,
  NPC_WALKTHROUGH_SECTIONS,
  NPC_WALKTHROUGH_STEPS,
  OBJECTIVES,
  PHASE_GATES,
  PROGRESSION_LOADOUTS,
  PROFILES,
  QUESTLINES,
  QUESTLINE_STEPS,
  RESOURCE_TABLES,
  ROUTE_AREAS,
  ROUTE_STEPS,
  STEP_BY_ID,
  STEP_BY_SOURCE_ID,
  remapStepId,
  TECH_EDGES,
  TECH_NODES,
  TIERS,
  TIERS_BY_LIST,
  UPGRADE_ENTRIES,
  UPGRADE_QUANTITY_TOTALS,
  WORLD_BY_CATEGORY,
  WORLD_OBJECTS,
} from "./data";
import { CLASSES, levelFromStats } from "./classes";
import { GAME_VERSION, TARNISHED_ITEMS } from "../data/game";
import legacyItemsJson from "../data/items.json";
import { normalizeJourney } from "./store";
import {
  achievementProgress,
  areaProgress,
  bossProgress,
  branchRewardProgress,
  collectionCompletion,
  collectionSummary,
  completionScopes,
  farmSummary,
  isEquipmentOwned,
  itemForEquipmentName,
  loreAccess,
  materialProgress,
  merchantInventoryProgress,
  nextRouteStep,
  ngplusProgress,
  npcWalkthroughProgress,
  questlineProgress,
  routeProgress,
  upgradeProgress,
  worldProgress,
} from "./selectors";
import type { Character, JourneyState, Stats } from "./types";

const STATS: Stats = { vig: 15, mnd: 10, end: 11, str: 14, dex: 13, int: 9, fai: 9, arc: 7 };

function journey(overrides: Partial<JourneyState> = {}): JourneyState {
  return {
    id: "test-journey",
    index: 1,
    label: "Journey 1",
    createdAt: "2026-01-01T00:00:00.000Z",
    steps: {},
    stepNotes: {},
    supplemental: {},
    npcStates: {},
    dialogue: {},
    decisions: {},
    bosses: {},
    farmables: {},
    materials: {},
    materialCounts: {},
    finite: {},
    merchants: {},
    scarabs: {},
    certifications: {},
    transitionGates: {},
    remembrances: {},
    zonesRevealed: {},
    questlineSteps: {},
    ngplusChecklist: {},
    worldChecks: {},
    upgradeCounts: {},
    npcWalkthroughSteps: {},
    bossReveals: {},
    decisionChecks: {},
    ...overrides,
  };
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: "test-character",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    classId: "vagabond",
    stats: STATS,
    archetypeId: "",
    profileId: "",
    journeyId: "test-journey",
    journeys: [journey()],
    items: {},
    farmables: {},
    loreRead: {},
    endings: {},
    achievements: {},
    equipment: {
      mainWeapon: "",
      secondaryWeapon: "",
      offhand: "",
      shield: "",
      armor: ["", "", "", ""],
      talismans: ["", "", "", ""],
      spells: ["", "", "", "", "", "", "", "", "", ""],
      physick: ["", ""],
    },
    equipmentMode: "signature",
    itemCounts: {},
    itemOrigins: {},
    statSnapshots: [],
    progressionChecks: {},
    bossReveals: {},
    ...overrides,
  };
}

describe("canonical content integrity", () => {
  it("keeps route IDs unique and globally ordered", () => {
    expect(new Set(ROUTE_STEPS.map((step) => step.id)).size).toBe(ROUTE_STEPS.length);
    expect(ROUTE_STEPS.map((step) => step.order)).toEqual(
      Array.from({ length: ROUTE_STEPS.length }, (_, index) => index + 1),
    );
    expect(ROUTE_STEPS).toHaveLength(4521);
    expect(ROUTE_AREAS).toHaveLength(70);
    expect(CONTENT_COVERAGE.route.preDlcSteps).toBe(3303);
    expect(CONTENT_COVERAGE.route.dlcSteps).toBe(1126);
    expect(CONTENT_COVERAGE.route.endgameSteps).toBe(92);
  });

  it("places the DLC after the Maliketh split and before Ashen Capital", () => {
    const maliketh = ROUTE_STEPS.findIndex((step) => step.sourceStepId === "w46-96");
    const firstDlc = ROUTE_STEPS.findIndex((step) => step.phase === "Shadow of the Erdtree");
    const lastDlc = ROUTE_STEPS.reduce(
      (last, step, index) => (step.phase === "Shadow of the Erdtree" ? index : last),
      -1,
    );
    const aftermath = ROUTE_STEPS.findIndex((step) => step.sectionId === "farum-azula-aftermath");
    const ashen = ROUTE_STEPS.findIndex((step) => step.sectionId === "ashen-leyndell");
    expect(maliketh).toBeGreaterThan(-1);
    expect(firstDlc).toBeGreaterThan(maliketh);
    expect(lastDlc).toBeLessThan(aftermath);
    expect(aftermath).toBeLessThan(ashen);
    expect(ROUTE_STEPS[firstDlc].order).toBe(3304);
    expect(ROUTE_STEPS[ashen].order).toBe(4433);
    expect(PHASE_GATES.map((gate) => gate.id)).toEqual(["GATE-DLC", "GATE-ASHEN-CAPITAL"]);
    const ashenGate = PHASE_GATES.find((gate) => gate.id === "GATE-ASHEN-CAPITAL");
    expect(ashenGate?.filter.missableOnly).toBe(true);
    expect(ashenGate?.filter.sections).toEqual(["capital-outskirts", "leyndell", "forbidden-lands"]);
    expect(PHASE_GATES[0].message).toContain("167 missable");
    expect(PHASE_GATES[1].message).toContain("168 missables");
  });

  it("preserves missable route warnings in both games", () => {
    const base = ROUTE_STEPS.filter((step) => step.game === "Base Game" && step.missable);
    const dlc = ROUTE_STEPS.filter((step) => step.game === "Shadow of the Erdtree" && step.missable);
    expect(base).toHaveLength(168);
    expect(dlc).toHaveLength(38);
    expect(base.every((step) => step.warning.length > 0)).toBe(true);
    expect(base.every((step) => step.lockoutRisk === "MISSABLE")).toBe(true);
  });

  it("only auto-acquires explicit route acquisitions", () => {
    const keepsakes = STEP_BY_ID["RW-B-w1-2"];
    expect(keepsakes).toBeDefined();
    expect(keepsakes.autoAcquireItemIds).toEqual([]);
    expect(keepsakes.autoAcquireBossIds).toEqual([]);
    expect(AUTO_ITEMS_BY_STEP["RW-B-w1-2"]).toBeUndefined();

    const beastman = STEP_BY_ID["RW-B-w4-14"];
    const flamedrake = ITEMS.find((item) => item.name === "Flamedrake Talisman");
    expect(flamedrake).toBeDefined();
    if (!flamedrake) return;
    expect(beastman.autoAcquireItemIds).toEqual([flamedrake.id]);
    expect(beastman.autoAcquireBossIds).toHaveLength(1);
    expect(beastman.autoAcquireItemIds).not.toContain(beastman.autoAcquireBossIds[0]);
    expect(AUTO_ITEMS_BY_STEP["RW-B-w4-14"].map((item) => item.name)).toEqual([
      "Flamedrake Talisman",
    ]);

    const bloodhound = STEP_BY_ID["RW-B-w2-140"];
    expect(AUTO_ITEMS_BY_STEP["RW-B-w2-140"].map((item) => item.name)).toContain(
      "Bloodhound's Fang",
    );
    expect(bloodhound.autoAcquireBossIds).toHaveLength(1);
  });

  it("keeps every route step attached to a real objective", () => {
    const objectiveIds = new Set(OBJECTIVES.map((objective) => objective.id));
    for (const step of ROUTE_STEPS) expect(objectiveIds.has(step.objectiveId)).toBe(true);
  });

  it("keeps item route links resolvable", () => {
    for (const item of ITEMS) {
      for (const stepId of item.routeStepIds) expect(STEP_BY_ID[stepId]).toBeDefined();
    }
  });

  it("keeps build references resolvable", () => {
    const archetypeIds = new Set(ARCHETYPES.map((archetype) => archetype.id));
    const profileIds = new Set(PROFILES.map((profile) => profile.id));
    const nodeIds = new Set(TECH_NODES.map((node) => node.id));
    for (const profile of PROFILES) expect(archetypeIds.has(profile.archetypeId)).toBe(true);
    for (const loadout of LOADOUTS) expect(profileIds.has(loadout.buildId)).toBe(true);
    for (const loadout of PROGRESSION_LOADOUTS) expect(nodeIds.has(loadout.nodeId)).toBe(true);
    for (const edge of TECH_EDGES) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
    for (const strategy of BOSS_STRATEGIES) expect(profileIds.has(strategy.buildId)).toBe(true);
  });

  it("keeps encounter route links resolvable", () => {
    for (const encounter of ENCOUNTERS) {
      for (const stepId of encounter.routeStepIds) expect(STEP_BY_ID[stepId]).toBeDefined();
    }
  });

  it("pins the verified live version and class base levels", () => {
    expect(GAME_VERSION.app).toBe("1.17.2");
    expect(GAME_VERSION.regulation).toBe("1.17.3");
    for (const entry of CLASSES) expect(levelFromStats(entry.stats)).toBe(entry.level);
    expect(TARNISHED_ITEMS).toHaveLength(27);
  });

  it("keeps the corrected progression prompt fields aligned", () => {
    const prompt = PROGRESSION_LOADOUTS.find((row) => row.id === "PLOAD-P0-MELEE");
    expect(prompt).toBeDefined();
    if (!prompt) return;
    expect(prompt.physick).toEqual(["Crimson Crystal Tear", "Greenspill Crystal Tear"]);
    expect(prompt.upgradePlanId).toBe("UPG-21F-P0MELEE-PRI-REC");
    expect(prompt.status).toContain("EXACT CANONICAL PROGRESSION");
  });

  it("keeps the workbook denominator columns aligned", () => {
    const armor = META.categoryDenominators.find((row) => row.category === "Armor");
    expect(armor?.total).toBe(704);
    expect(armor?.baseGame).toBe(559);
    expect(armor?.dlc).toBe(145);
    expect(META.remembrances).toHaveLength(25);
    expect(META.remembrances.some((row) => row.name === "Elden Remembrance")).toBe(true);
  });

  it("integrates the live Tarnished Pack content without duplicating IDs", () => {
    const packItems = ITEMS.filter((item) => item.game === "Tarnished Pack");
    expect(packItems).toHaveLength(27);
    expect(new Set(packItems.map((item) => item.id)).size).toBe(27);
    expect(ENCOUNTERS.filter((encounter) => encounter.game === "Tarnished Pack")).toHaveLength(2);
    expect(CLASSES.some((entry) => entry.id === "idus-knight")).toBe(true);
    expect(CLASSES.some((entry) => entry.id === "heavy-knight")).toBe(true);
    expect(CLASSES).toHaveLength(12);
  });

  it("keeps tier ranks sorted and source-authored ties intact", () => {
    for (const [list, entries] of Object.entries(TIERS_BY_LIST)) {
      const ranks = entries.map((entry) => entry.rank);
      expect(ranks, `${list} rank order`).toEqual([...ranks].sort((a, b) => a - b));
      expect(Math.min(...ranks), `${list} rank floor`).toBeGreaterThan(0);
    }
    // 866 workbook rows + the six user-specified 1.17 weapon entries.
    expect(TIERS.length).toBe(872);
    const required = {
      "Leontiel's Greatsword": "broken",
      "Reed Great Katana": "s",
      "Reverse Bladed Swords (Lightning)": "a",
      "Itinerant Sword": "a",
      "Hefty Scimitar": "b",
      "Golden Order Flail": "b",
    };
    for (const [name, tier] of Object.entries(required)) {
      const row = TIERS.find((entry) => entry.list === "Weapons" && entry.name === name);
      expect(row, name).toBeDefined();
      expect(row?.tier.toLowerCase().replace(/-tier$/, "")).toBe(tier);
      expect(row?.wikiUrl, `${name} wiki link`).toMatch(/^https:\/\/eldenring\.wiki\.gg\/wiki\//);
    }
  });
});

describe("progress selectors", () => {
  it("counts required route steps", () => {
    const progress = routeProgress(journey());
    expect(progress.total).toBe(4521);
    expect(progress.required).toBe(4307);
    expect(progress.requiredPercent).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it("advances the next action when a step is resolved", () => {
    const first = ROUTE_STEPS[0];
    const second = ROUTE_STEPS[1];
    expect(nextRouteStep(journey())?.id).toBe(first.id);
    expect(nextRouteStep(journey({ steps: { [first.id]: "done" } }))?.id).toBe(second.id);
    expect(nextRouteStep(journey({ steps: { [first.id]: "skipped" } }))?.id).toBe(second.id);
  });

  it("tracks area completion from resolved required steps", () => {
    const steps = ROUTE_STEPS.filter((step) => step.area === "West Limgrave");
    const done: Record<string, "done"> = {};
    for (const step of steps) if (step.required) done[step.id] = "done";
    const progress = areaProgress(journey({ steps: done }), "West Limgrave");
    expect(progress.complete).toBe(true);
    expect(progress.requiredPercent).toBe(100);
    expect(progress.done).toBe(progress.required);
  });

  it("maps the Tutorial lore journal to the Starting Out section", () => {
    const entry = LORE.find((row) => row.area === "Tutorial");
    expect(entry).toBeDefined();
    if (!entry) return;
    const settings = { spoilerMode: "strict" as const, density: "comfortable" as const, reducedMotion: false, hideCompleted: false, disclosure: "progressive" as const, interfaceScale: "auto" as const, bossSpoilerMode: "hide-until-defeated" as const };
    expect(loreAccess(journey(), settings, entry).unlocked).toBe(false);
    const done: Record<string, "done"> = {};
    for (const step of ROUTE_STEPS.filter((row) => row.sectionId === "starting-out")) done[step.id] = "done";
    expect(loreAccess(journey({ steps: done }), settings, entry).unlocked).toBe(true);
  });

  it("reveals lore when the setting bypasses gating", () => {
    const entry = LORE.find((row) => row.area === "Enir-Ilim & DLC Finale");
    expect(entry).toBeDefined();
    if (!entry) return;
    const settings = { spoilerMode: "reveal-all" as const, density: "comfortable" as const, reducedMotion: false, hideCompleted: false, disclosure: "progressive" as const, interfaceScale: "auto" as const, bossSpoilerMode: "hide-until-defeated" as const };
    expect(loreAccess(journey(), settings, entry).unlocked).toBe(true);
  });
});

describe("full content catalogs", () => {
  it("merges the full item catalog without losing workbook IDs", () => {
    expect(CONTENT_COVERAGE.items.final).toBe(ITEMS.length);
    expect(ITEMS.length).toBeGreaterThan(2100);
    const ids = new Set(ITEMS.map((item) => item.id));
    for (const legacy of legacyItemsJson.items) expect(ids.has(legacy.id)).toBe(true);
    expect(ITEMS.filter((item) => item.game === "Tarnished Pack")).toHaveLength(27);
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    expect(ITEMS.some((item) => item.id.startsWith("RW-ITEM-"))).toBe(true);
    expect(ITEMS.every((item) => item.routeStepIds.every((stepId) => STEP_BY_ID[stepId]))).toBe(true);
    for (const item of ITEMS) {
      expect(item.location).not.toMatch(/^(Head|Chest|Arms|Legs)( \(\d+\))?$/);
      expect(item.location).not.toBe("Redmaw catalog");
      if (item.location) {
        expect(item.location).not.toBe(item.section);
        expect(item.location).not.toBe(item.category);
      }
      if (!item.location && item.routeStepIds.length > 0) {
        throw new Error(`Route-linked item without a location: ${item.id}`);
      }
    }
  });

  it("merges the boss ledger", () => {
    expect(ENCOUNTERS.length).toBeGreaterThanOrEqual(207);
    expect(ENCOUNTERS.length).toBe(CONTENT_COVERAGE.bosses.final);
    expect(ENCOUNTERS.filter((encounter) => encounter.game === "Tarnished Pack")).toHaveLength(2);
    expect(ENCOUNTERS.some((encounter) => encounter.id.startsWith("ENC-"))).toBe(true);
    expect(ENCOUNTERS.some((encounter) => encounter.id.startsWith("RW-BOSS-"))).toBe(true);
    expect(ENCOUNTERS.every((encounter) => encounter.routeStepIds.every((stepId) => STEP_BY_ID[stepId]))).toBe(true);
  });

  it("ships 42 achievements with the four requirement groups attached", () => {
    expect(ACHIEVEMENTS).toHaveLength(42);
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size).toBe(42);
    const grouped = ACHIEVEMENTS.filter((achievement) => achievement.requirementGroupIds.length > 0);
    expect(grouped).toHaveLength(4);
    for (const achievement of grouped) {
      expect(achievement.requirementGroupIds).toContain(achievement.id);
      expect(achievement.itemIds.length).toBeGreaterThan(0);
    }
  });

  it("ships 52 questlines and 68 NG+ checklist items", () => {
    expect(QUESTLINES).toHaveLength(52);
    expect(QUESTLINE_STEPS).toHaveLength(587);
    expect(new Set(QUESTLINE_STEPS.map((step) => step.id)).size).toBe(587);
    expect(QUESTLINE_STEPS[0].id).toBe("Q-melina-1");
    expect(QUESTLINE_STEPS.every((step) => step.id === `Q-${step.questlineId}-${step.order}`)).toBe(true);
    expect(NGPLUS_SECTIONS).toHaveLength(12);
    expect(NGPLUS_STEPS).toHaveLength(68);
  });

  it("remaps legacy RTE step IDs through the generated map", () => {
    const seeded = Object.keys(LEGACY_STEP_MAP)[0];
    const mapped = LEGACY_STEP_MAP[seeded];
    expect(remapStepId(seeded)).toBe(mapped);
    expect(STEP_BY_ID[mapped]).toBeDefined();
    expect(remapStepId("RW-B-w1-1")).toBe("RW-B-w1-1");
    expect(remapStepId("RTE-A1-WL-0001")).toBeNull();
    expect(remapStepId("future-key")).toBeNull();
    expect(Object.keys(LEGACY_STEP_MAP).length).toBeGreaterThan(30);
  });
});

describe("beyond Redmaw ledgers", () => {
  it("resolves atlas step links through the Redmaw source-step id", () => {
    const linked = WORLD_OBJECTS.filter((object) => object.routeStepId);
    expect(linked.length).toBeGreaterThan(0);
    const resolved = linked.filter(
      (object) => STEP_BY_ID[object.routeStepId] || STEP_BY_SOURCE_ID[object.routeStepId],
    );
    expect(resolved.length).toBe(linked.length);
  });

  it("ships 697 world objects with resolved category counts", () => {
    expect(WORLD_OBJECTS).toHaveLength(697);
    expect(new Set(WORLD_OBJECTS.map((object) => object.id)).size).toBe(697);
    expect(WORLD_BY_CATEGORY.grace).toHaveLength(413);
    expect(WORLD_BY_CATEGORY["finger-reader"]).toHaveLength(9);
    expect(WORLD_BY_CATEGORY["stranded-soul"]).toHaveLength(44);
    expect(WORLD_BY_CATEGORY["sword-monument"]).toHaveLength(14);
    expect(WORLD_BY_CATEGORY["martyr-effigy"]).toHaveLength(213);
    expect(WORLD_BY_CATEGORY["birdseye-telescope"]).toHaveLength(4);
    expect(WORLD_BY_CATEGORY["stake-of-marika"]).toBeUndefined();
    expect(WORLD_BY_CATEGORY["gatekeeper-statue"]).toBeUndefined();
  });

  it("ships 725 upgrade pickups with quantity-preserving totals", () => {
    expect(UPGRADE_ENTRIES).toHaveLength(725);
    expect(new Set(UPGRADE_ENTRIES.map((entry) => entry.id)).size).toBe(725);
    expect(UPGRADE_QUANTITY_TOTALS["scadutree-fragment"]).toBe(50);
    expect(UPGRADE_QUANTITY_TOTALS["revered-spirit-ash"]).toBe(25);
    expect(UPGRADE_QUANTITY_TOTALS["golden-seed"]).toBe(45);
    expect(UPGRADE_QUANTITY_TOTALS["sacred-tear"]).toBe(12);
    expect(UPGRADE_ENTRIES.filter((entry) => entry.category === "smithing-stone")).toHaveLength(267);
    expect(UPGRADE_ENTRIES.filter((entry) => entry.category === "somber-smithing-stone")).toHaveLength(155);
    expect(UPGRADE_ENTRIES.filter((entry) => entry.category === "glovewort")).toHaveLength(165);
    expect(UPGRADE_ENTRIES.filter((entry) => entry.category === "great-glovewort")).toHaveLength(18);
    expect(Object.values(UPGRADE_QUANTITY_TOTALS).reduce((total, quantity) => total + quantity, 0)).toBe(993);
  });

  it("ships 108 crafting materials, 11 resource tables and the 604-step NPC walkthrough", () => {
    expect(CRAFTING_MATERIALS).toHaveLength(108);
    expect(new Set(CRAFTING_MATERIALS.map((material) => material.id)).size).toBe(108);
    expect(RESOURCE_TABLES).toHaveLength(11);
    expect(RESOURCE_TABLES.reduce((total, table) => total + table.rows.length, 0)).toBe(138);
    expect(new Set(RESOURCE_TABLES.map((table) => table.id)).size).toBe(11);
    expect(NPC_WALKTHROUGH_SECTIONS).toHaveLength(36);
    expect(NPC_WALKTHROUGH_STEPS).toHaveLength(604);
    expect(new Set(NPC_WALKTHROUGH_STEPS.map((step) => step.id)).size).toBe(604);
  });

  it("ships 27 branch decisions with 36 resolved and 7 unresolved rewards", () => {
    expect(BRANCH_PLAN_DECISIONS).toHaveLength(27);
    expect(new Set(BRANCH_PLAN_DECISIONS.map((decision) => decision.decisionId)).size).toBe(27);
    expect(BRANCH_REWARDS).toHaveLength(43);
    expect(BRANCH_REWARD_RESOLVED_COUNT).toBe(36);
    expect(BRANCH_REWARD_UNRESOLVED_COUNT).toBe(7);
    const itemIds = new Set(ITEMS.map((item) => item.id));
    const resolved = BRANCH_REWARDS.filter((reward) => !reward.unresolved);
    expect(resolved.every((reward) => reward.itemId.length > 0)).toBe(true);
    for (const reward of resolved) expect(itemIds.has(reward.itemId)).toBe(true);
    for (const reward of BRANCH_REWARDS.filter((entry) => entry.unresolved)) {
      expect(reward.itemId).toBe("");
    }
  });

  it("defaults new journey ledgers when loading an older save", () => {
    const normalized = normalizeJourney({ id: "legacy", steps: {} }, 1);
    expect(normalized.worldChecks).toEqual({});
    expect(normalized.upgradeCounts).toEqual({});
    expect(normalized.npcWalkthroughSteps).toEqual({});
    const populated = normalizeJourney(
      {
        id: "newer",
        worldChecks: { "grace-a": true, "grace-b": false },
        upgradeCounts: { "upgrade-a": 3, "upgrade-b": "4" },
        npcWalkthroughSteps: { "n1-1": true },
      },
      2,
    );
    expect(populated.worldChecks).toEqual({ "grace-a": true });
    expect(populated.upgradeCounts).toEqual({ "upgrade-a": 3 });
    expect(populated.npcWalkthroughSteps).toEqual({ "n1-1": true });
  });

  it("tracks world, upgrade, material, merchant, NPC and branch progress", () => {
    const grace = WORLD_BY_CATEGORY.grace[0];
    const nonGrace = WORLD_OBJECTS.find((object) => object.category !== "grace");
    expect(grace).toBeDefined();
    expect(nonGrace).toBeDefined();
    if (!grace || !nonGrace) return;
    const worldJourney = journey({
      worldChecks: { [grace.id]: true, [nonGrace.id]: true },
    });
    const world = worldProgress(worldJourney);
    expect(world.done).toBe(2);
    expect(world.total).toBe(697);
    expect(world.byCategory.grace.done).toBe(1);
    expect(world.byCategory["stake-of-marika"].total).toBe(0);
    expect(world.byCategory["gatekeeper-statue"].total).toBe(0);
    expect(worldProgress(worldJourney, "grace").done).toBe(1);

    const upgrade = UPGRADE_ENTRIES[0];
    const upgrades = upgradeProgress(journey({ upgradeCounts: { [upgrade.id]: 1 } }));
    expect(upgrades.done).toBe(1);
    expect(upgrades.acquired).toBe(1);
    expect(upgrades.total).toBe(993);
    expect(upgrades.entriesTouched).toBe(1);
    expect(upgrades.entriesTotal).toBe(725);

    const material = CRAFTING_MATERIALS[0];
    expect(materialProgress(journey({ materials: { [material.id]: true } })).done).toBe(1);
    expect(materialProgress(journey()).total).toBe(108);

    const inventoryItem = MERCHANT_INVENTORIES[0].items[0];
    const merchantProgress = merchantInventoryProgress(
      journey({ merchants: { [inventoryItem.id]: true } }),
    );
    expect(merchantProgress.done).toBe(1);
    expect(merchantProgress.total).toBe(627);
    expect(MERCHANT_INVENTORIES).toHaveLength(40);
    expect(MERCHANT_INVENTORY_ITEM_COUNT).toBe(627);
    const farms = farmSummary(character(), journey());
    expect(farms.merchantsTotal).toBe(627);
    expect(farms.materialsTotal).toBe(108);

    const npcStep = NPC_WALKTHROUGH_STEPS[0];
    expect(npcWalkthroughProgress(journey({ npcWalkthroughSteps: { [npcStep.id]: true } })).done).toBe(1);
    expect(npcWalkthroughProgress(journey()).total).toBe(604);

    const resolvedReward = BRANCH_REWARDS.find((reward) => !reward.unresolved);
    expect(resolvedReward).toBeDefined();
    if (!resolvedReward) return;
    const branch = branchRewardProgress(character({ items: { [resolvedReward.itemId]: true } }));
    expect(branch.done).toBe(1);
    expect(branch.acquired).toBe(1);
    expect(branch.total).toBe(36);
    expect(branch.resolved).toBe(36);
    expect(branch.unresolved).toBe(7);
  });
});

describe("completion scopes", () => {
  it("reports every scope with a real denominator", () => {
    const scopes = completionScopes(character(), journey());
    expect(scopes.map((scope) => scope.id)).toEqual([
      "route",
      "collection",
      "achievements",
      "bosses",
      "quests",
      "lore",
      "endings",
      "remembrances",
      "ngplus",
      "graces",
      "world",
      "upgrades",
      "materials",
      "merchants",
      "npc-walkthrough",
      "branch-rewards",
    ]);
    const byId = Object.fromEntries(scopes.map((scope) => [scope.id, scope]));
    expect(byId.route.denominator).toBe(4521);
    expect(byId.collection.denominator).toBe(ITEMS.length);
    expect(byId.achievements.denominator).toBe(42);
    expect(byId.bosses.denominator).toBe(ENCOUNTERS.length);
    expect(byId.quests.denominator).toBe(587);
    expect(byId.lore.denominator).toBe(LORE.length);
    expect(byId.endings.denominator).toBe(META.endings.length);
    expect(byId.remembrances.denominator).toBe(META.remembrances.length);
    expect(byId.ngplus.denominator).toBe(68);
    expect(byId.graces.denominator).toBe(413);
    expect(byId.world.denominator).toBe(284);
    expect(byId.upgrades.denominator).toBe(993);
    expect(byId.materials.denominator).toBe(108);
    expect(byId.merchants.denominator).toBe(627);
    expect(byId["npc-walkthrough"].denominator).toBe(604);
    expect(byId["branch-rewards"].denominator).toBe(36);
    for (const scope of scopes) {
      expect(scope.percent).toBeGreaterThanOrEqual(0);
      expect(scope.percent).toBeLessThanOrEqual(100);
    }
  });

  it("advances each domain selector from its own state", () => {
    expect(achievementProgress(character()).done).toBe(0);
    expect(achievementProgress(character({ achievements: { "roundtable-hold": true } })).done).toBe(1);
    const boss = ENCOUNTERS[0];
    expect(bossProgress(journey({ bosses: { [boss.id]: "defeated" } })).done).toBe(1);
    const questStep = QUESTLINE_STEPS[0];
    expect(questlineProgress(journey({ questlineSteps: { [questStep.id]: true } })).done).toBe(1);
    const ngpStep = NGPLUS_STEPS[0];
    expect(ngplusProgress(journey({ ngplusChecklist: { [ngpStep.id]: true } })).done).toBe(1);
    expect(collectionCompletion(character()).total).toBe(ITEMS.length);
  });
});

describe("collection selectors", () => {
  it("counts starting-class ownership", () => {
    const owned = Object.fromEntries(ITEMS.filter((item) => item.startingOwned).map((item) => [item.id, true]));
    const summary = collectionSummary(character({ items: owned }));
    expect(summary.owned).toBe(Object.keys(owned).length);
    expect(summary.owned).toBeGreaterThan(0);
  });

  it("normalizes loadout gear names to catalog items", () => {
    const greatsword = itemForEquipmentName("Greatsword +25 (Heavy affinity)");
    expect(greatsword?.name.toLowerCase()).toContain("greatsword");
    const seal = itemForEquipmentName("Clawmark Seal +25; Gravel Stone Seal");
    expect(seal?.name).toContain("Clawmark Seal");
  });

  it("checks ownership through the normalized gear index", () => {
    const item = ITEMS.find((entry) => entry.name === "Greatsword");
    expect(item).toBeDefined();
    if (!item) return;
    const characterWithItem = character({ items: { [item.id]: true } });
    expect(isEquipmentOwned(characterWithItem, "Greatsword +25 (Heavy affinity)")).toBe(true);
    expect(isEquipmentOwned(characterWithItem, "Ordovis's Greatsword +10")).toBe(false);
  });
});
