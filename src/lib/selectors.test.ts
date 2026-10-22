import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  BOSS_STRATEGIES,
  ENCOUNTERS,
  ITEMS,
  LORE,
  LOADOUTS,
  META,
  OBJECTIVES,
  PROGRESSION_LOADOUTS,
  PROFILES,
  ROUTE_STEPS,
  STEP_BY_ID,
  STEPS_BY_OBJECTIVE,
  TECH_EDGES,
  TECH_NODES,
  TIERS,
  TIERS_BY_LIST,
} from "./data";
import { CLASSES, levelFromStats } from "./classes";
import { GAME_VERSION, TARNISHED_ITEMS } from "../data/game";
import {
  areaProgress,
  collectionSummary,
  isEquipmentOwned,
  itemForEquipmentName,
  loreAccess,
  nextRouteStep,
  routeProgress,
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
    finite: {},
    merchants: {},
    scarabs: {},
    certifications: {},
    transitionGates: {},
    remembrances: {},
    zonesRevealed: {},
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
    ...overrides,
  };
}

describe("canonical content integrity", () => {
  it("keeps route IDs unique and ordered", () => {
    expect(new Set(ROUTE_STEPS.map((step) => step.id)).size).toBe(ROUTE_STEPS.length);
    expect(ROUTE_STEPS.map((step) => step.order)).toEqual(ROUTE_STEPS.map((_, index) => index));
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
    expect(TIERS.length).toBe(866);
  });
});

describe("progress selectors", () => {
  it("counts required route steps", () => {
    const progress = routeProgress(journey());
    expect(progress.total).toBe(994);
    expect(progress.required).toBe(992);
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

  it("unlocks the Tutorial lore journal only when its objective is complete", () => {
    const entry = LORE.find((row) => row.area === "Tutorial");
    expect(entry).toBeDefined();
    if (!entry) return;
    const settings = { spoilerMode: "strict" as const, density: "comfortable" as const, reducedMotion: false, hideCompleted: false };
    expect(loreAccess(journey(), settings, entry).unlocked).toBe(false);
    const done: Record<string, "done"> = {};
    for (const step of STEPS_BY_OBJECTIVE["OBJ-A1-WL-001"] ?? []) done[step.id] = "done";
    expect(loreAccess(journey({ steps: done }), settings, entry).unlocked).toBe(true);
  });

  it("reveals lore when the setting bypasses gating", () => {
    const entry = LORE.find((row) => row.area === "Enir-Ilim & DLC Finale");
    expect(entry).toBeDefined();
    if (!entry) return;
    const settings = { spoilerMode: "reveal-all" as const, density: "comfortable" as const, reducedMotion: false, hideCompleted: false };
    expect(loreAccess(journey(), settings, entry).unlocked).toBe(true);
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
