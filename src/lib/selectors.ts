import {
  AREA_BY_NAME,
  BOSS_STRATEGIES_BY_BOSS,
  ENCOUNTERS,
  ITEMS,
  ITEMS_BY_NAME,
  LORE,
  PROGRESSION_BY_NODE,
  PROFILES_BY_ARCHETYPE,
  ROUTE_AREAS,
  ROUTE_STEPS,
  STEP_BY_ID,
  STEPS_BY_AREA,
  STEPS_BY_OBJECTIVE,
  SUPPLEMENTAL,
  SUPPLEMENTAL_BY_AREA,
  TECH_NODES,
  TIERS_BY_NAME,
  ARCHETYPE_BY_ID,
  LOADOUTS_BY_BUILD,
  LOADOUT_BY_ID,
  SPELL_PACKAGE_BY_ID,
} from "./data";
import type {
  Character,
  JourneyState,
  LoreEntry,
  ProgressionLoadout,
  RouteArea,
  RouteStep,
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
  return {
    farmablesOwned,
    farmablesTotal: 318,
    materialsStocked: Object.values(journey.materials).filter(Boolean).length,
    materialsTotal: 107,
    finiteCollected: Object.values(journey.finite).filter(Boolean).length,
    finiteTotal: 318,
    merchantsPurchased: Object.values(journey.merchants).filter(Boolean).length,
    merchantsTotal: 167,
    scarabsCollected: Object.values(journey.scarabs).filter(Boolean).length,
    scarabsTotal: 107,
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
    total: 6,
    permanent: character.endings["age-of-stars"]?.viewed ? "Age of Stars" : "Pending",
  };
}

export function decisionsResolved(journey: JourneyState, total: number): number {
  return Object.values(journey.decisions).filter(Boolean).length;
}

export interface LoreAccess {
  unlocked: boolean;
  reason: string;
  progress: Progress | null;
}

const LORE_ROUTE_RULES: Record<string, { area?: string; objective?: string; maxObjectiveOrder?: number; actOne?: boolean }> = {
  Tutorial: { objective: "OBJ-A1-WL-001" },
  "First steps in Limgrave": { area: "West Limgrave", maxObjectiveOrder: 3 },
  "West Limgrave": { area: "West Limgrave" },
  "North Limgrave": { area: "Stormhill" },
  "Weeping Peninsula": { area: "Weeping Peninsula" },
  "Castle Morne": { area: "Castle Morne" },
  "Stormveil Castle": { area: "Stormveil Castle" },
  "Fringefolk Hero's Grave": { actOne: true },
};

export function loreAccess(
  journey: JourneyState,
  settings: Settings,
  entry: LoreEntry,
): LoreAccess {
  if (settings.spoilerMode === "reveal-all" || journey.zonesRevealed[entry.area]) {
    return { unlocked: true, reason: "Revealed manually", progress: null };
  }
  const rule = LORE_ROUTE_RULES[entry.area];
  if (rule?.objective) {
    const progress = objectiveProgress(journey, rule.objective);
    return {
      unlocked: progress.complete,
      reason: progress.complete ? "Route section complete" : "Complete this route section",
      progress,
    };
  }
  if (rule?.area) {
    const maxObjectiveOrder = rule.maxObjectiveOrder;
    if (maxObjectiveOrder) {
      const steps = (STEPS_BY_AREA[rule.area] ?? []).filter((step) => step.objectiveOrder <= maxObjectiveOrder);
      const progress = progressFrom(journey.steps, steps);
      return {
        unlocked: progress.complete,
        reason: progress.complete ? "Opening route complete" : "Finish the opening route objectives",
        progress,
      };
    }
    const progress = areaProgress(journey, rule.area);
    return {
      unlocked: progress.complete,
      reason: progress.complete ? "Area complete" : "Complete this area",
      progress,
    };
  }
  if (rule?.actOne) {
    const progress = routeProgress(journey);
    return {
      unlocked: progress.complete,
      reason: progress.complete ? "Act I complete" : "Complete Act I",
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

export function bossStrategyCount(boss: string): number {
  return BOSS_STRATEGIES_BY_BOSS[boss]?.length ?? 0;
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
