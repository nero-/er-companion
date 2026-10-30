import {
  ACHIEVEMENTS,
  AREA_BY_NAME,
  BOSS_STRATEGY_COUNTS,
  BRANCH_PLAN_DECISION_COUNT,
  BRANCH_PLAN_DECISIONS,
  BRANCH_REWARDS,
  CRAFTING_MATERIALS,
  ENCOUNTERS,
  FARMABLES,
  FINITE_RESOURCES,
  ITEMS,
  ITEMS_BY_NAME,
  LORE,
  MERCHANT_INVENTORY_ID_BY_LEGACY_ID,
  MERCHANT_INVENTORY_ITEMS,
  META,
  NGPLUS_STEPS,
  NPC_WALKTHROUGH_STEPS,
  PROGRESSION_BY_NODE,
  PROFILES_BY_ARCHETYPE,
  QUESTLINE_STEPS,
  ROUTE_AREAS,
  ROUTE_STEPS,
  SCARABS,
  SECTION_BY_NORMALIZED_TITLE,
  STEP_BY_ID,
  STEPS_BY_AREA,
  STEPS_BY_OBJECTIVE,
  SUPPLEMENTAL,
  SUPPLEMENTAL_BY_AREA,
  TECH_NODES,
  TIERS_BY_NAME,
  UPGRADE_ENTRIES,
  WORLD_CATEGORY_STATUS,
  WORLD_OBJECTS,
  ARCHETYPE_BY_ID,
  LOADOUTS_BY_BUILD,
  LOADOUT_BY_ID,
  SPELL_PACKAGE_BY_ID,
  SWEEP_STEPS,
  SWEEP_STEPS_AFTER_STEP,
  SWEEP_STEP_BY_ID,
  normalizeContentKey,
} from "./data";
import type {
  Character,
  JourneyState,
  LoreEntry,
  ProgressionLoadout,
  RouteArea,
  RouteStep,
  SweepStep,
  SweepStepEntry,
  Settings,
  StepStatus,
  Supplemental,
  TechNode,
  TierEntry,
  Item,
} from "./types";

export interface Progress {
  total: number;
  required: number;
  done: number;
  skipped: number;
  deferred: number;
  resolved: number;
  requiredResolved: number;
  percent: number;
  requiredPercent: number;
  complete: boolean;
}

function progressFrom(statuses: Record<string, StepStatus>, steps: { id: string; required?: boolean }[]): Progress {
  let done = 0;
  let skipped = 0;
  let deferred = 0;
  let resolved = 0;
  let required = 0;
  let requiredResolved = 0;
  for (const step of steps) {
    const status = statuses[step.id];
    if (step.required !== false) required += 1;
    if (status === "done") done += 1;
    if (status === "skipped") skipped += 1;
    if (status === "deferred") deferred += 1;
    if (status === "done" || status === "skipped") {
      resolved += 1;
      if (step.required !== false) requiredResolved += 1;
    }
  }
  const percent = steps.length ? Math.round(((done + skipped) / steps.length) * 100) : 0;
  const requiredPercent = required ? Math.round((requiredResolved / required) * 100) : 100;
  return {
    total: steps.length,
    required,
    done,
    skipped,
    deferred,
    resolved,
    requiredResolved,
    percent,
    requiredPercent,
    complete: requiredResolved === required,
  };
}

export function areaProgress(journey: JourneyState, area: string): Progress {
  return progressFrom(journey.steps, STEPS_BY_AREA[area] ?? []);
}

export function objectiveProgress(journey: JourneyState, objectiveId: string): Progress {
  return progressFrom(journey.steps, STEPS_BY_OBJECTIVE[objectiveId] ?? []);
}

export function routeProgress(journey: JourneyState): Progress {
  return progressFrom(journey.steps, ROUTE_STEPS);
}

export function supplementalProgress(journey: JourneyState, actions: Supplemental[] = SUPPLEMENTAL): Progress {
  return progressFrom(journey.supplemental, actions);
}

export function overallJourneyPercent(journey: JourneyState): number {
  const route = routeProgress(journey);
  const supplemental = supplementalProgress(journey);
  const total = route.total + supplemental.total;
  const resolved = route.resolved + supplemental.resolved;
  return total ? Math.round((resolved / total) * 100) : 0;
}

export function nextRouteStep(journey: JourneyState): RouteStep | undefined {
  for (const step of ROUTE_STEPS) {
    const status = journey.steps[step.id];
    if (status === "done" || status === "skipped") continue;
    if (step.required) return step;
  }
  return ROUTE_STEPS.find((step) => {
    const status = journey.steps[step.id];
    return status !== "done" && status !== "skipped";
  });
}

export function nextSupplemental(journey: JourneyState): Supplemental | undefined {
  return [...SUPPLEMENTAL]
    .sort((a, b) => a.areaOrder - b.areaOrder)
    .find((action) => {
      const status = journey.supplemental[action.id];
      return status !== "done" && status !== "skipped";
    });
}

export function currentAreaName(journey: JourneyState): string {
  const next = nextRouteStep(journey);
  if (next) return next.area;
  const completedAreas = ROUTE_AREAS.filter((area) => areaProgress(journey, area.name).complete);
  return completedAreas.at(-1)?.name ?? ROUTE_AREAS[0]?.name ?? "Tutorial";
}

export function stepStatusLabel(status: StepStatus | undefined): string {
  if (status === "done") return "Done";
  if (status === "skipped") return "Skipped";
  if (status === "deferred") return "Deferred";
  return "Pending";
}

export function stepStatusTone(status: StepStatus | undefined): "success" | "neutral" | "warning" | "muted" {
  if (status === "done") return "success";
  if (status === "skipped") return "neutral";
  if (status === "deferred") return "warning";
  return "muted";
}

export interface CollectionGroupSummary {
  group: string;
  total: number;
  owned: number;
  percent: number;
}

export interface CollectionSummary {
  total: number;
  owned: number;
  percent: number;
  byGroup: CollectionGroupSummary[];
  baseGame: CollectionGroupSummary;
  dlc: CollectionGroupSummary;
  tarnishedPack: CollectionGroupSummary;
}

export function collectionSummary(character: Character): CollectionSummary {
  const owned = character.items;
  const groups = new Map<string, CollectionGroupSummary>();
  let total = 0;
  let ownedCount = 0;
  for (const item of ITEMS) {
    total += 1;
    if (owned[item.id]) ownedCount += 1;
    const entry = groups.get(item.group) ?? { group: item.group, total: 0, owned: 0, percent: 0 };
    entry.total += 1;
    if (owned[item.id]) entry.owned += 1;
    groups.set(item.group, entry);
  }
  const byGroup = [...groups.values()]
    .map((entry) => ({ ...entry, percent: entry.total ? Math.round((entry.owned / entry.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
  const baseItems = ITEMS.filter((item) => item.game === "Base Game");
  const dlcItems = ITEMS.filter((item) => item.game === "Shadow of the Erdtree");
  const packItems = ITEMS.filter((item) => item.game === "Tarnished Pack");
  return {
    total,
    owned: ownedCount,
    percent: total ? Math.round((ownedCount / total) * 100) : 0,
    byGroup,
    baseGame: {
      group: "Base Game",
      total: baseItems.length,
      owned: baseItems.filter((item) => owned[item.id]).length,
      percent: baseItems.length
        ? Math.round((baseItems.filter((item) => owned[item.id]).length / baseItems.length) * 100)
        : 0,
    },
    dlc: {
      group: "Shadow of the Erdtree",
      total: dlcItems.length,
      owned: dlcItems.filter((item) => owned[item.id]).length,
      percent: dlcItems.length
        ? Math.round((dlcItems.filter((item) => owned[item.id]).length / dlcItems.length) * 100)
        : 0,
    },
    tarnishedPack: {
      group: "Tarnished Pack",
      total: packItems.length,
      owned: packItems.filter((item) => owned[item.id]).length,
      percent: packItems.length
        ? Math.round((packItems.filter((item) => owned[item.id]).length / packItems.length) * 100)
        : 0,
    },
  };
}

export interface FarmSummary {
  farmablesOwned: number;
  farmablesTotal: number;
  materialsStocked: number;
  materialsTotal: number;
  finiteCollected: number;
  finiteTotal: number;
  merchantsPurchased: number;
  merchantsTotal: number;
  scarabsCollected: number;
  scarabsTotal: number;
}

export function farmSummary(character: Character, journey: JourneyState): FarmSummary {
  const farmablesOwned = Object.values(character.farmables).filter((value) => value > 0).length;
  const materials = materialProgress(journey);
  const merchants = merchantInventoryProgress(journey);
  return {
    farmablesOwned,
    farmablesTotal: FARMABLES.length,
    materialsStocked: materials.done,
    materialsTotal: materials.total,
    finiteCollected: Object.values(journey.finite).filter(Boolean).length,
    finiteTotal: FINITE_RESOURCES.length,
    merchantsPurchased: merchants.done,
    merchantsTotal: merchants.total,
    scarabsCollected: Object.values(journey.scarabs).filter(Boolean).length,
    scarabsTotal: SCARABS.length,
  };
}

export interface EndingSummary {
  viewed: number;
  earned: number;
  total: number;
  permanent: string;
}

export function endingSummary(character: Character): EndingSummary {
  const endings = Object.values(character.endings);
  return {
    viewed: endings.filter((entry) => entry.viewed).length,
    earned: endings.filter((entry) => entry.earned).length,
    total: META.endings.length,
    permanent: character.endings["age-of-stars"]?.viewed ? "Age of Stars" : "Pending",
  };
}

export interface CountProgress {
  done: number;
  total: number;
  percent: number;
  complete: boolean;
}

function countProgress(done: number, total: number): CountProgress {
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    complete: total > 0 && done >= total,
  };
}

export function collectionCompletion(character: Character): CountProgress {
  return countProgress(ITEMS.filter((item) => character.items[item.id]).length, ITEMS.length);
}

export function achievementProgress(character: Character): CountProgress {
  return countProgress(
    ACHIEVEMENTS.filter((achievement) => character.achievements[achievement.id]).length,
    ACHIEVEMENTS.length,
  );
}

export function bossProgress(journey: JourneyState): CountProgress {
  return countProgress(
    ENCOUNTERS.filter((encounter) => journey.bosses[encounter.id] === "defeated").length,
    ENCOUNTERS.length,
  );
}

export function questlineProgress(journey: JourneyState): CountProgress {
  return countProgress(
    QUESTLINE_STEPS.filter((step) => journey.questlineSteps[step.id]).length,
    QUESTLINE_STEPS.length,
  );
}

export function ngplusProgress(journey: JourneyState): CountProgress {
  return countProgress(
    NGPLUS_STEPS.filter((step) => journey.ngplusChecklist[step.id]).length,
    NGPLUS_STEPS.length,
  );
}

export interface WorldProgress extends CountProgress {
  byCategory: Record<string, CountProgress>;
}

const WORLD_CATEGORIES = Object.keys(WORLD_CATEGORY_STATUS);

export function worldProgress(journey: JourneyState, category?: string): WorldProgress {
  const byCategory: Record<string, CountProgress> = {};
  for (const key of WORLD_CATEGORIES) {
    const objects = WORLD_OBJECTS.filter((object) => object.category === key);
    byCategory[key] = countProgress(
      objects.filter((object) => journey.worldChecks[object.id]).length,
      objects.length,
    );
  }
  const objects = category
    ? WORLD_OBJECTS.filter((object) => object.category === category)
    : WORLD_OBJECTS;
  const done = objects.filter((object) => journey.worldChecks[object.id]).length;
  return { ...countProgress(done, objects.length), byCategory };
}

export interface UpgradeProgress extends CountProgress {
  acquired: number;
  entriesTouched: number;
  entriesTotal: number;
  byCategory: Record<string, UpgradeCategoryProgress>;
}

export interface UpgradeCategoryProgress extends CountProgress {
  entriesTouched: number;
  entriesTotal: number;
}

export function upgradeProgress(journey: JourneyState): UpgradeProgress {
  const byCategory: Record<string, UpgradeCategoryProgress> = {};
  let acquired = 0;
  let total = 0;
  let entriesTouched = 0;
  for (const entry of UPGRADE_ENTRIES) {
    const quantity = entry.quantity ?? 0;
    const raw = journey.upgradeCounts[entry.id] ?? 0;
    const count = Math.min(Math.max(0, raw), quantity);
    const category = (byCategory[entry.category] ??= {
      ...countProgress(0, 0),
      entriesTouched: 0,
      entriesTotal: 0,
    });
    category.done += count;
    category.total += quantity;
    category.entriesTotal += 1;
    if (raw > 0) {
      category.entriesTouched += 1;
      entriesTouched += 1;
    }
    acquired += count;
    total += quantity;
  }
  for (const category of Object.values(byCategory)) {
    category.percent = category.total ? Math.round((category.done / category.total) * 100) : 0;
    category.complete = category.total > 0 && category.done >= category.total;
  }
  const progress = countProgress(acquired, total);
  return {
    ...progress,
    acquired,
    entriesTouched,
    entriesTotal: UPGRADE_ENTRIES.length,
    byCategory,
  };
}

export function materialProgress(journey: JourneyState): CountProgress {
  return countProgress(
    CRAFTING_MATERIALS.filter((material) => journey.materials[material.id]).length,
    CRAFTING_MATERIALS.length,
  );
}

export function merchantInventoryProgress(journey: JourneyState): CountProgress {
  const purchased = new Set<string>();
  for (const item of MERCHANT_INVENTORY_ITEMS) {
    if (journey.merchants[item.id]) purchased.add(item.id);
  }
  for (const [legacyId, itemId] of Object.entries(MERCHANT_INVENTORY_ID_BY_LEGACY_ID)) {
    if (journey.merchants[legacyId]) purchased.add(itemId);
  }
  return countProgress(purchased.size, MERCHANT_INVENTORY_ITEMS.length);
}

export function npcWalkthroughProgress(journey: JourneyState): CountProgress {
  return countProgress(
    NPC_WALKTHROUGH_STEPS.filter((step) => journey.npcWalkthroughSteps[step.id]).length,
    NPC_WALKTHROUGH_STEPS.length,
  );
}

export interface BranchRewardProgress extends CountProgress {
  acquired: number;
  resolved: number;
  unresolved: number;
  decisions: number;
  distinctAcquired: number;
  distinctResolved: number;
}

export function branchRewardProgress(character: Character): BranchRewardProgress {
  const resolved = BRANCH_REWARDS.filter((reward) => !reward.unresolved);
  const unresolved = BRANCH_REWARDS.length - resolved.length;
  const acquired = resolved.filter(
    (reward) => reward.itemId.length > 0 && Boolean(character.items[reward.itemId]),
  ).length;
  const acquiredIds = new Set(
    resolved
      .filter((reward) => reward.itemId.length > 0 && Boolean(character.items[reward.itemId]))
      .map((reward) => reward.itemId),
  );
  const resolvedIds = new Set(
    resolved.filter((reward) => reward.itemId.length > 0).map((reward) => reward.itemId),
  );
  return {
    ...countProgress(acquired, resolved.length),
    acquired,
    resolved: resolved.length,
    unresolved,
    decisions: BRANCH_PLAN_DECISION_COUNT,
    distinctAcquired: acquiredIds.size,
    distinctResolved: resolvedIds.size,
  };
}

export interface CompletionScope {
  id: string;
  label: string;
  numerator: number;
  denominator: number;
  percent: number;
  complete: boolean;
}

function scope(
  id: string,
  label: string,
  numerator: number,
  denominator: number,
): CompletionScope {
  return {
    id,
    label,
    numerator,
    denominator,
    percent: denominator ? Math.round((numerator / denominator) * 100) : 0,
    complete: denominator > 0 && numerator >= denominator,
  };
}

export function completionScopes(character: Character, journey: JourneyState): CompletionScope[] {
  const route = routeProgress(journey);
  const collection = collectionCompletion(character);
  const achievements = achievementProgress(character);
  const bosses = bossProgress(journey);
  const quests = questlineProgress(journey);
  const ngplus = ngplusProgress(journey);
  const loreRead = LORE.filter((entry) => character.loreRead[entry.id]).length;
  const endingsViewed = META.endings.filter((ending) => character.endings[ending.id]?.viewed).length;
  const remembrancesResolved = Object.values(journey.remembrances).filter(
    (state) => Boolean(state.selectedReward || state.duplicated || state.consumed),
  ).length;
  const world = worldProgress(journey);
  const graces = worldProgress(journey, "grace");
  const upgrades = upgradeProgress(journey);
  const materials = materialProgress(journey);
  const merchants = merchantInventoryProgress(journey);
  const npcWalkthrough = npcWalkthroughProgress(journey);
  const branchRewards = branchRewardProgress(character);
  return [
    scope("route", "Route", route.resolved, route.total),
    scope("collection", "Collection", collection.done, collection.total),
    scope("achievements", "Achievements", achievements.done, achievements.total),
    scope("bosses", "Bosses", bosses.done, bosses.total),
    scope("quests", "Quests", quests.done, quests.total),
    scope("lore", "Lore", loreRead, LORE.length),
    scope("endings", "Endings", endingsViewed, META.endings.length),
    scope("remembrances", "Remembrances", remembrancesResolved, META.remembrances.length),
    scope("ngplus", "NG+", ngplus.done, ngplus.total),
    scope("graces", "Graces", graces.done, graces.total),
    scope("world", "World (non-grace)", world.done - graces.done, world.total - graces.total),
    scope("upgrades", "Upgrades", upgrades.done, upgrades.total),
    scope("materials", "Materials", materials.done, materials.total),
    scope("merchants", "Merchants", merchants.done, merchants.total),
    scope("npc-walkthrough", "NPC walkthrough", npcWalkthrough.done, npcWalkthrough.total),
    scope("branch-rewards", "Branch rewards", branchRewards.done, branchRewards.total),
  ];
}

export function decisionsResolved(journey: JourneyState, total: number): number {
  const known = new Set(BRANCH_PLAN_DECISIONS.map((decision) => decision.decisionId));
  const recorded = Object.entries(journey.decisions).filter(
    ([id, value]) => Boolean(value) && known.has(id),
  ).length;
  return total > 0 ? Math.min(recorded, total) : recorded;
}

export interface LoreAccess {
  unlocked: boolean;
  reason: string;
  progress: Progress | null;
}

const LORE_SECTION_ALIASES: Record<string, string> = {
  tutorial: "Starting Out",
  "enir ilim and dlc finale": "Enir-Ilim",
};

export function loreAccess(
  journey: JourneyState,
  settings: Settings,
  entry: LoreEntry,
): LoreAccess {
  if (settings.spoilerMode === "reveal-all" || journey.zonesRevealed[entry.area]) {
    return { unlocked: true, reason: "Revealed manually", progress: null };
  }
  const key = normalizeContentKey(entry.area);
  const alias = LORE_SECTION_ALIASES[key];
  const section = alias
    ? AREA_BY_NAME[alias]
    : SECTION_BY_NORMALIZED_TITLE[key]?.[0];
  if (section) {
    const progress = areaProgress(journey, section.name);
    return {
      unlocked: progress.complete,
      reason: progress.complete
        ? `Route section complete — ${section.name}`
        : `Complete the ${section.name} route section`,
      progress,
    };
  }
  const actions = SUPPLEMENTAL_BY_AREA[entry.area] ?? [];
  if (actions.length > 0) {
    const progress = supplementalProgress(journey, actions);
    return {
      unlocked: progress.complete,
      reason: progress.complete
        ? "Chronology section complete"
        : `${progress.resolved}/${progress.total} chronology actions complete`,
      progress,
    };
  }
  return {
    unlocked: false,
    reason: "No route section in this content set — reveal manually when reached in game",
    progress: null,
  };
}

export function loreByArea(area: string): LoreEntry[] {
  return LORE.filter((entry) => entry.area === area).sort((a, b) => a.areaOrder - b.areaOrder);
}

export function tierForName(name: string): TierEntry | undefined {
  return TIERS_BY_NAME[name]?.[0];
}

/** Strategy rows ship in the lazy reference pack; the count ships here. */
export function bossStrategyCount(boss: string): number {
  return BOSS_STRATEGY_COUNTS[boss] ?? 0;
}

export function archetypeForId(id: string) {
  return ARCHETYPE_BY_ID[id];
}

export function profilesForArchetype(archetypeId: string) {
  return (PROFILES_BY_ARCHETYPE[archetypeId] ?? []).sort((a, b) => a.level - b.level);
}

export function loadoutsForProfile(profileId: string) {
  return (LOADOUTS_BY_BUILD[profileId] ?? []).sort((a, b) => a.type.localeCompare(b.type));
}

export interface TechProgressionRow {
  node: TechNode;
  loadout: ProgressionLoadout | undefined;
}

export function progressionForNode(nodeId: string): ProgressionLoadout | undefined {
  return PROGRESSION_BY_NODE[nodeId];
}

export function techProgressionForArchetype(archetypeId: string): TechProgressionRow[] {
  const archetype = ARCHETYPE_BY_ID[archetypeId];
  if (!archetype) return [];
  const destinations = TECH_NODES.filter(
    (node) =>
      (node.type === "Certified Parent Destination" || node.type === "Certified NG+ Destination") &&
      node.destinationIds.includes(archetypeId),
  );
  const destinationIds = destinations.map((node) => node.id);
  const specific = TECH_NODES.filter(
    (node) =>
      node.destinationIds.includes(archetypeId) ||
      destinationIds.some((id) => node.destinationIds.includes(id)) ||
      node.name.startsWith(archetype.name),
  );
  const generic = TECH_NODES.filter(
    (node) => node.stage.startsWith("P0") || node.stage.startsWith("P1"),
  );
  const unique = new Map<string, TechNode>();
  for (const node of [...specific, ...destinations, ...generic]) unique.set(node.id, node);
  return [...unique.values()]
    .sort((a, b) => (a.levelTarget ?? 0) - (b.levelTarget ?? 0))
    .map((node) => ({ node, loadout: progressionForNode(node.id) }));
}

export function nearestTechNode(archetypeId: string, level: number): TechProgressionRow | undefined {
  const rows = techProgressionForArchetype(archetypeId).filter((row) => row.loadout);
  if (rows.length === 0) return undefined;
  const eligible = rows.filter((row) => (row.node.levelTarget ?? 0) <= level);
  return eligible.at(-1) ?? rows[0];
}

export function spellPackageForLoadout(loadoutId: string) {
  const loadout = LOADOUT_BY_ID[loadoutId];
  if (!loadout) return undefined;
  return SPELL_PACKAGE_BY_ID[loadout.packageId];
}

const ITEM_BY_BASE_NAME: Record<string, Item[]> = {};
function baseEquipmentName(name: string): string {
  return name
    .split(/\s*(?:;|\||\bor\b|—)\s*/i)[0]
    .replace(/\s*\+\d+.*$/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

for (const item of ITEMS) {
  const key = baseEquipmentName(item.name);
  (ITEM_BY_BASE_NAME[key] ??= []).push(item);
}

export function itemForEquipmentName(name: string): Item | undefined {
  const key = baseEquipmentName(name);
  return ITEM_BY_BASE_NAME[key]?.[0] ?? ITEMS_BY_NAME[name]?.[0];
}

export function isEquipmentOwned(character: Character, name: string): boolean {
  if (!name || name.toLowerCase().startsWith("empty") || name === "—") return true;
  const item = itemForEquipmentName(name);
  return item ? character.items[item.id] === true : false;
}

export function equipmentOwnedCount(character: Character, names: string[]): { owned: number; total: number } {
  const relevant = names.filter((name) => name && !name.toLowerCase().startsWith("empty") && name !== "—");
  return {
    owned: relevant.filter((name) => isEquipmentOwned(character, name)).length,
    total: relevant.length,
  };
}

export function areaByName(name: string): RouteArea | undefined {
  return AREA_BY_NAME[name];
}

export function stepById(id: string): RouteStep | undefined {
  return STEP_BY_ID[id];
}

export function allBossNamesFromEncounters(): string[] {
  return [...new Set(ENCOUNTERS.map((encounter) => encounter.name))].sort((a, b) => a.localeCompare(b));
}

/* ---------------------------------------------------------------------------
 * Sweep steps: the per-area merchant, farm and pickup checklists that give
 * every catalogue item an actionable step.
 * ------------------------------------------------------------------------- */

export interface SweepEntryState {
  entry: SweepStepEntry;
  /** True once the character owns the item (itemId) or it is otherwise covered. */
  acquired: boolean;
}

export interface SweepStepState {
  step: SweepStep;
  entries: SweepEntryState[];
  acquired: number;
  total: number;
  complete: boolean;
  /** Items this step covers that the character already owned before the sweep. */
  ownedElsewhere: boolean;
}

export function sweepEntryAcquired(
  entry: SweepStepEntry,
  character: Character,
  journey: JourneyState,
): boolean {
  // Catalogue ownership wins whenever the row resolves to a record, so buying
  // or farming it in one area clears every other area that lists it. The
  // ledger keys are fallbacks for rows with no catalogue record (ammo,
  // consumables, a few DLC drops).
  if (entry.itemId) return Boolean(character.items[entry.itemId]);
  if (entry.materialId) return Boolean(journey.materials[entry.materialId]);
  if (entry.purchaseId) return Boolean(journey.merchants[entry.purchaseId]);
  if (entry.farmId) return (journey.farmables[entry.farmId] ?? 0) > 0;
  return false;
  // Unresolved merchant rows still resolve by name to a catalog record that a
  // different area already tracks, so one purchase clears every copy.
  const matches = ITEMS_BY_NAME[entry.name] ?? [];
  return matches.some((item) => Boolean(character.items[item.id]));
}

export function sweepStepState(
  stepId: string,
  character: Character,
  journey: JourneyState,
): SweepStepState | undefined {
  const step = SWEEP_STEP_BY_ID[stepId];
  if (!step) return undefined;
  const entries = step.entries.map((entry) => ({
    entry,
    acquired: sweepEntryAcquired(entry, character, journey),
  }));
  const acquired = entries.filter((row) => row.acquired).length;
  return {
    step,
    entries,
    acquired,
    total: entries.length,
    complete: entries.length > 0 && acquired === entries.length,
    ownedElsewhere: acquired > 0 && !journey.steps[stepId],
  };
}

export function sweepStepsForArea(area: string): SweepStep[] {
  return SWEEP_STEPS.filter((step) => step.area === area).sort((a, b) => a.order - b.order);
}

export function sweepStepsAfterStep(stepId: string): SweepStep[] {
  return SWEEP_STEPS_AFTER_STEP[stepId] ?? [];
}

export function sweepStepsForPhase(phase: string): SweepStep[] {
  return SWEEP_STEPS.filter((step) => step.phase === phase).sort((a, b) => a.order - b.order);
}

export interface SweepProgress {
  total: number;
  complete: number;
  entries: number;
  entriesAcquired: number;
  percent: number;
}

export function sweepProgress(character: Character, journey: JourneyState): SweepProgress {
  let complete = 0;
  let entries = 0;
  let entriesAcquired = 0;
  for (const step of SWEEP_STEPS) {
    const state = sweepStepState(step.id, character, journey);
    if (!state) continue;
    entries += state.total;
    entriesAcquired += state.acquired;
    if (state.complete) complete += 1;
  }
  return {
    total: SWEEP_STEPS.length,
    complete,
    entries,
    entriesAcquired,
    percent: entries ? Math.round((entriesAcquired / entries) * 100) : 0,
  };
}

/** Sweep steps that cover this item, in route order. */
export function sweepStepsForItem(itemId: string): SweepStep[] {
  return SWEEP_STEPS.filter((step) =>
    step.entries.some((entry) => entry.itemId === itemId),
  ).sort((a, b) => a.order - b.order);
}

/**
 * The actionable step a player should open to obtain an item: its first route
 * step when one exists, else the first sweep step that lists it.
 */
export function collectionStepFor(
  itemId: string,
): { kind: "route" | "sweep"; stepId: string; label: string } | undefined {
  const item = ITEMS.find((entry) => entry.id === itemId);
  if (item) {
    const auto = ROUTE_STEPS.find((step) => step.autoAcquireItemIds.includes(itemId));
    if (auto) {
      return { kind: "route", stepId: auto.id, label: auto.area };
    }
  }
  const sweep = sweepStepsForItem(itemId)[0];
  if (sweep) return { kind: "sweep", stepId: sweep.id, label: sweep.title };
  return undefined;
}
