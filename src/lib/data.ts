import metaJson from "../data/meta.json";
import routeJson from "../data/route.full.json";
import itemsJson from "../data/items.full.json";
import worldJson from "../data/world.json";
import buildsCoreJson from "../data/builds-core.json";
import bossIndexJson from "../data/boss-index.json";
import farmsJson from "../data/farms.json";
import merchantsJson from "../data/merchants.full.json";
import loreJson from "../data/lore.json";
import tiersJson from "../data/tiers.json";
import achievementsJson from "../data/achievements.json";
import bossesJson from "../data/bosses.full.json";
import questlinesJson from "../data/questlines.json";
import ngplusJson from "../data/ngplus.json";
import coverageJson from "../data/content-coverage.json";
import legacyStepMapJson from "../data/legacy-step-map.json";
import worldObjectsJson from "../data/world.objects.json";
import upgradesJson from "../data/upgrades.json";
import materialsJson from "../data/materials.full.json";
import resourcesJson from "../data/resources.json";
import npcWalkthroughJson from "../data/npc-walkthrough.json";
import branchPlanJson from "../data/branch-plan.json";
import descriptionsJson from "../data/descriptions.json";
import areaSweepsJson from "../data/area-sweeps.json";
import loreExpandedJson from "../data/lore.expanded.json";
import questlineRouteMapJson from "../data/questline-route-map.json";
import remembrancePlanJson from "../data/remembrance-plan.json";
import sweepStepsJson from "../data/sweep-steps.json";
import type {
  Achievement,
  AchievementRequirementGroup,
  Archetype,
  BranchPlanDecision,
  BranchReward,
  BuildLoadout,
  BuildProfile,
  ContentCoverage,
  CraftingMaterial,
  DialogueEvent,
  Encounter,
  Farmable,
  FiniteResource,
  Item,
  Knowledge,
  LoreEntry,
  Material,
  MerchantRecord,
  MerchantInventory,
  MerchantInventoryItem,
  Meta,
  NgPlusSection,
  NgPlusStep,
  NpcState,
  NpcWalkthroughSection,
  NpcWalkthroughStep,
  Objective,
  PhaseGate,
  ProgressionLoadout,
  Questline,
  QuestlineStep,
  ResourceTable,
  RouteArea,
  RouteChronology,
  RouteStep,
  Scarab,
  SpellPackage,
  Supplemental,
  TechEdge,
  TechNode,
  TierEntry,
  UpgradeEntry,
  WorldObject,
  WorldObjectCategoryStatus,
  WorldObjectGap,
  AreaSweep,
  AreaSweepFile,
  SweepStep,
  DescriptionFile,
  DescriptionEntry,
  LoreExpandedEntry,
  LoreExpandedFile,
  QuestlineRouteLink,
  QuestlineRouteMap,
  RemembrancePlan,
  RemembrancePlanEntry,
} from "./types";

export const META: Meta = metaJson;
export const ROUTE_STEPS: RouteStep[] = routeJson.steps;
export const ROUTE_AREAS: RouteArea[] = routeJson.areas;
export const OBJECTIVES: Objective[] = routeJson.objectives;
export const SUPPLEMENTAL: Supplemental[] = routeJson.supplemental;
export const CHRONOLOGY_AREAS = routeJson.chronologyAreas;
export const PHASE_GATES: PhaseGate[] = routeJson.phaseGates;
export const ROUTE_CHRONOLOGY: RouteChronology = routeJson.chronology;
export const ITEMS: Item[] = itemsJson.items;
export const LORE: LoreEntry[] = loreJson.entries;
export const TIERS: TierEntry[] = tiersJson.entries;
export const ENCOUNTERS: Encounter[] = bossesJson.encounters;
export const ACHIEVEMENTS: Achievement[] = achievementsJson.achievements;
export const REQUIREMENT_GROUPS: AchievementRequirementGroup[] = achievementsJson.requirementGroups;
export const QUESTLINES: Questline[] = questlinesJson.questlines;
export const NGPLUS_SECTIONS: NgPlusSection[] = ngplusJson.sections;
export const CONTENT_COVERAGE: ContentCoverage = coverageJson;
export const LEGACY_STEP_MAP: Record<string, string> = legacyStepMapJson;
export const NPC_STATES: NpcState[] = worldJson.npcStates;
export const DIALOGUE_EVENTS: DialogueEvent[] = worldJson.dialogueEvents;
export const KNOWLEDGE: Knowledge[] = worldJson.knowledge;
export const FARMABLES: Farmable[] = farmsJson.farmables;
export const MATERIALS: Material[] = farmsJson.materials;
export const FINITE_RESOURCES: FiniteResource[] = farmsJson.finiteResources;
export const MERCHANTS: MerchantRecord[] = farmsJson.merchants;
export const MERCHANT_INVENTORIES: MerchantInventory[] = merchantsJson.merchants;
export const MERCHANT_INVENTORY_COUNTS = merchantsJson.counts;
export const SCARABS: Scarab[] = farmsJson.scarabs;

export const WORLD_OBJECTS: WorldObject[] = worldObjectsJson.entries;
export const WORLD_CATEGORY_STATUS: Record<string, WorldObjectCategoryStatus> =
  worldObjectsJson.categoryStatus;
export const WORLD_GAPS: WorldObjectGap[] = worldObjectsJson.gaps;
export const WORLD_COUNTS: Record<string, number> = worldObjectsJson.counts;
export const UPGRADE_ENTRIES: UpgradeEntry[] = upgradesJson.entries;
export const UPGRADE_DROP_SOURCES: UpgradeEntry[] = upgradesJson.dropSources;
export const UPGRADE_COUNTS: Record<string, number> = upgradesJson.counts;
export const UPGRADE_STATED_TOTALS: Record<string, number> = upgradesJson.statedTotals;
export const UPGRADE_QUANTITY_TOTALS: Record<string, number> = (() => {
  const totals: Record<string, number> = {};
  for (const entry of UPGRADE_ENTRIES) {
    totals[entry.category] = (totals[entry.category] ?? 0) + (entry.quantity ?? 0);
  }
  return totals;
})();
export const CRAFTING_MATERIALS: CraftingMaterial[] = materialsJson.entries;
export const CRAFTING_MATERIAL_COUNTS = materialsJson.counts;
export const RESOURCE_TABLES: ResourceTable[] = resourcesJson.tables;
export const RESOURCE_TABLE_COUNTS = resourcesJson.counts;
export const NPC_WALKTHROUGH_SECTIONS: NpcWalkthroughSection[] = npcWalkthroughJson.sections;
export const NPC_WALKTHROUGH_STEPS: NpcWalkthroughStep[] = NPC_WALKTHROUGH_SECTIONS.flatMap(
  (section) => section.steps,
);
export const NPC_WALKTHROUGH_COUNTS = npcWalkthroughJson.counts;
export const BRANCH_PLAN_DECISIONS: BranchPlanDecision[] = branchPlanJson.decisions;
export const BRANCH_REWARDS: BranchReward[] = BRANCH_PLAN_DECISIONS.flatMap(
  (decision) => decision.rewards,
);
export const BRANCH_PLAN_COUNTS = branchPlanJson.counts;

export const DESCRIPTIONS: DescriptionFile = descriptionsJson as DescriptionFile;
export const ITEM_DESCRIPTIONS: Record<string, DescriptionEntry> = DESCRIPTIONS.items;
export const BOSS_DESCRIPTIONS: Record<string, DescriptionEntry> = DESCRIPTIONS.bosses;
export const NPC_DESCRIPTIONS: Record<string, DescriptionEntry> = DESCRIPTIONS.npcs;
export const AREA_DESCRIPTIONS: Record<string, DescriptionEntry> = DESCRIPTIONS.areas;
export const SWEEP_STEPS: SweepStep[] = sweepStepsJson.steps;
export const SWEEP_STEP_BY_ID: Record<string, SweepStep> = Object.fromEntries(
  SWEEP_STEPS.map((step) => [step.id, step]),
);
export const SWEEP_STEPS_BY_AREA: Record<string, SweepStep[]> = (() => {
  const grouped: Record<string, SweepStep[]> = {};
  for (const step of SWEEP_STEPS) {
    (grouped[step.area] ??= []).push(step);
  }
  for (const steps of Object.values(grouped)) steps.sort((a, b) => a.order - b.order);
  return grouped;
})();
/** Sweep steps keyed by the route step they render after. */
export const SWEEP_STEPS_AFTER_STEP: Record<string, SweepStep[]> = (() => {
  const grouped: Record<string, SweepStep[]> = {};
  for (const step of SWEEP_STEPS) {
    (grouped[step.afterStepId] ??= []).push(step);
  }
  for (const steps of Object.values(grouped)) steps.sort((a, b) => a.order - b.order);
  return grouped;
})();
export const SWEEP_STEP_COUNTS = sweepStepsJson.counts;
export const AREA_SWEEPS: AreaSweep[] = (areaSweepsJson as AreaSweepFile).areas;
export const AREA_SWEEP_FILE: AreaSweepFile = areaSweepsJson as AreaSweepFile;
export const AREA_SWEEP_BY_AREA: Record<string, AreaSweep> = Object.fromEntries(
  AREA_SWEEPS.map((sweep) => [sweep.area, sweep]),
);
export const LORE_EXPANDED: Record<string, LoreExpandedEntry> = (loreExpandedJson as LoreExpandedFile).entries;
export const LORE_EXPANDED_FILE: LoreExpandedFile = loreExpandedJson as LoreExpandedFile;
export const QUESTLINE_ROUTE_LINKS: Record<string, QuestlineRouteLink> = (questlineRouteMapJson as QuestlineRouteMap).links;
export const QUESTLINE_ROUTE_MAP: QuestlineRouteMap = questlineRouteMapJson as QuestlineRouteMap;
export const REMEMBRANCE_PLAN: RemembrancePlan = remembrancePlanJson as RemembrancePlan;
export const REMEMBRANCE_PLAN_ENTRIES: RemembrancePlanEntry[] = REMEMBRANCE_PLAN.entries;
export const REMEMBRANCE_PLAN_ORDER: Record<string, number> = Object.fromEntries(
  REMEMBRANCE_PLAN_ENTRIES.map((entry) => [entry.remembranceId, entry.order]),
);

export const ARCHETYPES: Archetype[] = buildsCoreJson.archetypes;
export const PROFILES: BuildProfile[] = buildsCoreJson.profiles;
export const LOADOUTS: BuildLoadout[] = buildsCoreJson.loadouts;
export const TECH_NODES: TechNode[] = buildsCoreJson.techNodes;
export const TECH_EDGES: TechEdge[] = buildsCoreJson.techEdges;
export const PROGRESSION_LOADOUTS: ProgressionLoadout[] = buildsCoreJson.progressionLoadouts;
export const SPELL_PACKAGES: SpellPackage[] = buildsCoreJson.spellPackages;

/**
 * Boss names and per-boss strategy counts ship in a 1.7 KiB index. The strategy
 * rows themselves (2.5 MiB) live in the lazily loaded reference pack, so the
 * shell, search and remembrance links never pull them in.
 */
export const BOSS_NAMES: string[] = bossIndexJson.names;
export const BOSS_STRATEGY_COUNTS: Record<string, number> = bossIndexJson.strategyCounts;

function groupBy<T>(rows: T[], key: (row: T) => string): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) {
    const value = key(row);
    (grouped[value] ??= []).push(row);
  }
  return grouped;
}

export function normalizeContentKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const STEP_BY_ID: Record<string, RouteStep> = Object.fromEntries(
  ROUTE_STEPS.map((step) => [step.id, step]),
);
/** World-object ledgers reference the Redmaw source step id (w2-1), not RW-*. */
export const STEP_BY_SOURCE_ID: Record<string, RouteStep> = Object.fromEntries(
  ROUTE_STEPS.filter((step) => step.sourceStepId).map((step) => [step.sourceStepId, step]),
);
export const STEP_INDEX: Record<string, number> = Object.fromEntries(
  ROUTE_STEPS.map((step) => [step.id, step.order]),
);
export const STEPS_BY_AREA = groupBy(ROUTE_STEPS, (step) => step.area);
export const STEPS_BY_SECTION = groupBy(ROUTE_STEPS, (step) => step.sectionId);
export const STEPS_BY_PHASE = groupBy(ROUTE_STEPS, (step) => step.phase);
export const STEPS_BY_OBJECTIVE = groupBy(ROUTE_STEPS, (step) => step.objectiveId);
export const OBJECTIVE_BY_ID: Record<string, Objective> = Object.fromEntries(
  OBJECTIVES.map((objective) => [objective.id, objective]),
);
export const AREA_BY_NAME: Record<string, RouteArea> = Object.fromEntries(
  ROUTE_AREAS.map((area) => [area.name, area]),
);
export const AREA_BY_SECTION_ID: Record<string, RouteArea> = Object.fromEntries(
  ROUTE_AREAS.map((area) => [area.sectionId, area]),
);
export const SECTION_BY_NORMALIZED_TITLE = groupBy(ROUTE_AREAS, (area) =>
  normalizeContentKey(area.name),
);
export const SUPPLEMENTAL_BY_ID: Record<string, Supplemental> = Object.fromEntries(
  SUPPLEMENTAL.map((action) => [action.id, action]),
);
export const SUPPLEMENTAL_BY_AREA = groupBy(SUPPLEMENTAL, (action) => action.area);
export const PHASE_GATE_BY_ID: Record<string, PhaseGate> = Object.fromEntries(
  PHASE_GATES.map((gate) => [gate.id, gate]),
);

export function remapStepId(stepId: string): string | null {
  if (STEP_BY_ID[stepId]) return stepId;
  return LEGACY_STEP_MAP[stepId] ?? null;
}

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(
  ITEMS.map((item) => [item.id, item]),
);
export const ITEMS_BY_NAME = groupBy(ITEMS, (item) => item.name);
export const ITEMS_BY_GROUP = groupBy(ITEMS, (item) => item.group);
export const ITEMS_BY_CATEGORY = groupBy(ITEMS, (item) => item.category);
export const ITEMS_BY_REGION = groupBy(ITEMS, (item) => item.region);
export const ITEMS_BY_STEP = groupBy(
  ITEMS.filter((item) => item.routeStepIds.length > 0),
  (item) => item.routeStepIds[0],
);
const AUTO_ITEMS_BY_STEP: Record<string, Item[]> = {};
for (const step of ROUTE_STEPS) {
  for (const itemId of step.autoAcquireItemIds) {
    const item = ITEM_BY_ID[itemId];
    if (item) (AUTO_ITEMS_BY_STEP[step.id] ??= []).push(item);
  }
}
export { AUTO_ITEMS_BY_STEP };

export const ITEM_BY_NORMALIZED_NAME: Record<string, Item> = Object.fromEntries(
  ITEMS.map((item) => [normalizeContentKey(item.name), item]),
);

export const ENCOUNTER_BY_ID: Record<string, Encounter> = Object.fromEntries(
  ENCOUNTERS.map((encounter) => [encounter.id, encounter]),
);
const AUTO_BOSSES_BY_STEP: Record<string, Encounter[]> = {};
for (const step of ROUTE_STEPS) {
  for (const bossId of step.autoAcquireBossIds) {
    const encounter = ENCOUNTER_BY_ID[bossId];
    if (encounter) (AUTO_BOSSES_BY_STEP[step.id] ??= []).push(encounter);
  }
}
export { AUTO_BOSSES_BY_STEP };

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]),
);
export const REQUIREMENT_GROUP_BY_ID: Record<string, AchievementRequirementGroup> = Object.fromEntries(
  REQUIREMENT_GROUPS.map((group) => [group.id, group]),
);
export const ACHIEVEMENTS_BY_SECTION = groupBy(ACHIEVEMENTS, (achievement) => achievement.section);

export const QUESTLINE_BY_ID: Record<string, Questline> = Object.fromEntries(
  QUESTLINES.map((questline) => [questline.id, questline]),
);
export const QUESTLINE_STEPS: QuestlineStep[] = QUESTLINES.flatMap((questline) => questline.steps);
export const QUESTLINE_STEP_BY_ID: Record<string, QuestlineStep> = Object.fromEntries(
  QUESTLINE_STEPS.map((step) => [step.id, step]),
);
export const QUESTLINE_STEPS_BY_QUESTLINE = groupBy(QUESTLINE_STEPS, (step) => step.questlineId);

export const NGPLUS_STEPS: NgPlusStep[] = NGPLUS_SECTIONS.flatMap((section) => section.steps);
export const NGP_STEP_BY_ID: Record<string, NgPlusStep> = Object.fromEntries(
  NGPLUS_STEPS.map((step) => [step.id, step]),
);
export const NGP_SECTION_BY_ID: Record<string, NgPlusSection> = Object.fromEntries(
  NGPLUS_SECTIONS.map((section) => [section.id, section]),
);
export const NPC_BY_ID: Record<string, NpcState> = Object.fromEntries(
  NPC_STATES.map((state) => [state.id, state]),
);
export const DIALOGUE_BY_ID: Record<string, DialogueEvent> = Object.fromEntries(
  DIALOGUE_EVENTS.map((event) => [event.id, event]),
);
export const FINITE_BY_ID: Record<string, FiniteResource> = Object.fromEntries(
  FINITE_RESOURCES.map((resource) => [resource.id, resource]),
);
export const MERCHANT_BY_ID: Record<string, MerchantRecord> = Object.fromEntries(
  MERCHANTS.map((record) => [record.id, record]),
);
export const SCARAB_BY_ID: Record<string, Scarab> = Object.fromEntries(
  SCARABS.map((scarab) => [scarab.id, scarab]),
);
export const KNOWLEDGE_BY_ID: Record<string, Knowledge> = Object.fromEntries(
  KNOWLEDGE.map((entry) => [entry.id, entry]),
);

export const SPELL_PACKAGES_BY_BUILD = groupBy(SPELL_PACKAGES, (pkg) => pkg.buildId);
export const SPELL_PACKAGE_BY_ID: Record<string, SpellPackage> = Object.fromEntries(
  SPELL_PACKAGES.map((pkg) => [pkg.id, pkg]),
);

export const ARCHETYPE_BY_ID: Record<string, Archetype> = Object.fromEntries(
  ARCHETYPES.map((archetype) => [archetype.id, archetype]),
);
export const PROFILE_BY_ID: Record<string, BuildProfile> = Object.fromEntries(
  PROFILES.map((profile) => [profile.id, profile]),
);
export const PROFILES_BY_ARCHETYPE = groupBy(PROFILES, (profile) => profile.archetypeId);
export const LOADOUT_BY_ID: Record<string, BuildLoadout> = Object.fromEntries(
  LOADOUTS.map((loadout) => [loadout.id, loadout]),
);
export const LOADOUTS_BY_BUILD = groupBy(LOADOUTS, (loadout) => loadout.buildId);
export const TECH_NODE_BY_ID: Record<string, TechNode> = Object.fromEntries(
  TECH_NODES.map((node) => [node.id, node]),
);
export const PROGRESSION_BY_NODE: Record<string, ProgressionLoadout> = Object.fromEntries(
  PROGRESSION_LOADOUTS.map((loadout) => [loadout.nodeId, loadout]),
);
export const PROGRESSION_BY_ID: Record<string, ProgressionLoadout> = Object.fromEntries(
  PROGRESSION_LOADOUTS.map((loadout) => [loadout.id, loadout]),
);


export const TIERS_BY_LIST = groupBy(TIERS, (entry) => entry.list);
export const TIERS_BY_NAME = groupBy(TIERS, (entry) => entry.name);
export const LORE_BY_AREA = groupBy(LORE, (entry) => entry.area);

export const ROUTE_STEP_COUNT = ROUTE_STEPS.length;
export const ROUTE_REQUIRED_COUNT = ROUTE_STEPS.filter((step) => step.required).length;
export const ROUTE_AREA_COUNT = ROUTE_AREAS.length;
export const ROUTE_MISSABLE_COUNT = ROUTE_STEPS.filter((step) => step.missable).length;
export const ITEM_COUNT = ITEMS.length;
export const SUPPLEMENTAL_COUNT = SUPPLEMENTAL.length;
export const ENCOUNTER_COUNT = ENCOUNTERS.length;
export const LORE_COUNT = LORE.length;
export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;
export const QUESTLINE_COUNT = QUESTLINES.length;
export const QUESTLINE_STEP_COUNT = QUESTLINE_STEPS.length;
export const NGPLUS_STEP_COUNT = NGPLUS_STEPS.length;

export const WORLD_BY_ID: Record<string, WorldObject> = Object.fromEntries(
  WORLD_OBJECTS.map((object) => [object.id, object]),
);
export const WORLD_BY_CATEGORY = groupBy(WORLD_OBJECTS, (object) => object.category);
export const WORLD_BY_REGION = groupBy(WORLD_OBJECTS, (object) => object.region);
export const WORLD_BY_ROUTE_STEP = groupBy(
  WORLD_OBJECTS.filter((object) => object.routeStepId.length > 0),
  (object) => object.routeStepId,
);

export const UPGRADE_BY_ID: Record<string, UpgradeEntry> = Object.fromEntries(
  UPGRADE_ENTRIES.map((entry) => [entry.id, entry]),
);
export const UPGRADES_BY_CATEGORY = groupBy(UPGRADE_ENTRIES, (entry) => entry.category);
export const UPGRADE_DROP_SOURCES_BY_CATEGORY = groupBy(
  UPGRADE_DROP_SOURCES,
  (entry) => entry.category,
);
export const UPGRADE_COUNT = UPGRADE_ENTRIES.length;

export const MATERIAL_BY_ID: Record<string, CraftingMaterial> = Object.fromEntries(
  CRAFTING_MATERIALS.map((material) => [material.id, material]),
);
export const MATERIALS_BY_CATEGORY = groupBy(CRAFTING_MATERIALS, (material) => material.category);
export const CRAFTING_MATERIAL_COUNT = CRAFTING_MATERIALS.length;

export const RESOURCE_TABLE_BY_ID: Record<string, ResourceTable> = Object.fromEntries(
  RESOURCE_TABLES.map((table) => [table.id, table]),
);
export const RESOURCE_TABLE_COUNT = RESOURCE_TABLES.length;
export const RESOURCE_ROW_COUNT = RESOURCE_TABLES.reduce(
  (total, table) => total + table.rows.length,
  0,
);

export const NPC_WALKTHROUGH_SECTION_BY_ID: Record<string, NpcWalkthroughSection> =
  Object.fromEntries(NPC_WALKTHROUGH_SECTIONS.map((section) => [section.id, section]));
export const NPC_WALKTHROUGH_STEP_BY_ID: Record<string, NpcWalkthroughStep> =
  Object.fromEntries(NPC_WALKTHROUGH_STEPS.map((step) => [step.id, step]));
export const NPC_WALKTHROUGH_STEP_SECTION: Record<string, string> = Object.fromEntries(
  NPC_WALKTHROUGH_SECTIONS.flatMap((section) =>
    section.steps.map((step) => [step.id, section.id] as const),
  ),
);
export const NPC_WALKTHROUGH_STEPS_BY_SECTION = groupBy(
  NPC_WALKTHROUGH_STEPS,
  (step) => NPC_WALKTHROUGH_STEP_SECTION[step.id] ?? "",
);
export const NPC_WALKTHROUGH_SECTION_COUNT = NPC_WALKTHROUGH_SECTIONS.length;
export const NPC_WALKTHROUGH_STEP_COUNT = NPC_WALKTHROUGH_STEPS.length;

export const BRANCH_PLAN_BY_DECISION: Record<string, BranchPlanDecision> = Object.fromEntries(
  BRANCH_PLAN_DECISIONS.map((decision) => [decision.decisionId, decision]),
);
export const BRANCH_REWARDS_BY_DECISION = groupBy(
  BRANCH_PLAN_DECISIONS.flatMap((decision) =>
    decision.rewards.map((reward) => ({ ...reward, decisionId: decision.decisionId })),
  ),
  (reward) => reward.decisionId,
);
export const BRANCH_REWARD_BY_ITEM = groupBy(
  BRANCH_REWARDS.filter((reward) => reward.itemId.length > 0),
  (reward) => reward.itemId,
);
export const BRANCH_REWARD_ITEM_IDS: string[] = [
  ...new Set(
    BRANCH_REWARDS.filter((reward) => reward.itemId.length > 0).map((reward) => reward.itemId),
  ),
];
export const BRANCH_PLAN_DECISION_COUNT = BRANCH_PLAN_DECISIONS.length;
export const BRANCH_REWARD_COUNT = BRANCH_REWARDS.length;
export const BRANCH_REWARD_RESOLVED_COUNT = BRANCH_REWARDS.filter(
  (reward) => !reward.unresolved,
).length;
export const BRANCH_REWARD_UNRESOLVED_COUNT = BRANCH_REWARDS.filter(
  (reward) => reward.unresolved,
).length;

export const MERCHANT_INVENTORY_ITEMS: MerchantInventoryItem[] = MERCHANT_INVENTORIES.flatMap(
  (inventory) => inventory.items,
);
export const MERCHANT_INVENTORY_ITEM_COUNT = MERCHANT_INVENTORY_ITEMS.length;
export const MERCHANT_INVENTORY_ITEM_BY_ID: Record<string, MerchantInventoryItem> =
  Object.fromEntries(MERCHANT_INVENTORY_ITEMS.map((item) => [item.id, item]));

const INVENTORY_ID_BY_MERCHANT_ITEM: Record<string, string> = {};
for (const inventory of MERCHANT_INVENTORIES) {
  for (const item of inventory.items) {
    const key = `${normalizeContentKey(inventory.name)}|${normalizeContentKey(item.name)}`;
    INVENTORY_ID_BY_MERCHANT_ITEM[key] ??= item.id;
  }
}
export const MERCHANT_INVENTORY_ID_BY_LEGACY_ID: Record<string, string> = Object.fromEntries(
  MERCHANTS.map((record) => {
    const key = `${normalizeContentKey(record.merchant)}|${normalizeContentKey(record.item)}`;
    return [record.id, INVENTORY_ID_BY_MERCHANT_ITEM[key] ?? ""] as const;
  }).filter(([, itemId]) => itemId.length > 0),
);

export const WORLD_OBJECT_COUNT = WORLD_OBJECTS.length;
export const WORLD_GRACE_COUNT = WORLD_OBJECTS.filter((object) => object.category === "grace").length;
export const WORLD_NON_GRACE_COUNT = WORLD_OBJECT_COUNT - WORLD_GRACE_COUNT;
export const WORLD_UNRESOLVED_COUNT = WORLD_OBJECTS.filter((object) => object.unresolved).length;
export const WORLD_CATEGORY_COUNTS: Record<string, number> = Object.fromEntries(
  Object.entries(WORLD_BY_CATEGORY).map(([category, objects]) => [category, objects.length]),
);
export const UPGRADE_TOTAL_QUANTITY = Object.values(UPGRADE_QUANTITY_TOTALS).reduce(
  (total, quantity) => total + quantity,
  0,
);
