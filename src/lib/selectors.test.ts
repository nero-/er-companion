import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ARCHETYPES,
  AUTO_BOSSES_BY_STEP,
  AUTO_ITEMS_BY_STEP,
  BOSS_STRATEGIES,
  CONTENT_COVERAGE,
  ENCOUNTERS,
  ITEMS,
  LEGACY_STEP_MAP,
  LORE,
  LOADOUTS,
  META,
  NGPLUS_SECTIONS,
  NGPLUS_STEPS,
  OBJECTIVES,
  PHASE_GATES,
  PROGRESSION_LOADOUTS,
  PROFILES,
  QUESTLINES,
  QUESTLINE_STEPS,
  ROUTE_AREAS,
  ROUTE_STEPS,
  STEP_BY_ID,
  remapStepId,
  TECH_EDGES,
  TECH_NODES,
  TIERS,
  TIERS_BY_LIST,
} from "./data";
import { CLASSES, levelFromStats } from "./classes";
import { GAME_VERSION, TARNISHED_ITEMS } from "../data/game";
import legacyItemsJson from "../data/items.json";
import {
  achievementProgress,
  areaProgress,
  bossProgress,
  collectionCompletion,
  collectionSummary,
  completionScopes,
  isEquipmentOwned,
  itemForEquipmentName,
  loreAccess,
  nextRouteStep,
  ngplusProgress,
  questlineProgress,
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
    questlineSteps: {},
    ngplusChecklist: {},
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
    expect(TIERS.length).toBe(866);
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
    const settings = { spoilerMode: "strict" as const, density: "comfortable" as const, reducedMotion: false, hideCompleted: false };
    expect(loreAccess(journey(), settings, entry).unlocked).toBe(false);
    const done: Record<string, "done"> = {};
    for (const step of ROUTE_STEPS.filter((row) => row.sectionId === "starting-out")) done[step.id] = "done";
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
