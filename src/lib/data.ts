import metaJson from "../data/meta.json";
import routeJson from "../data/route.json";
import itemsJson from "../data/items.json";
import worldJson from "../data/world.json";
import buildsJson from "../data/builds.json";
import farmsJson from "../data/farms.json";
import loreJson from "../data/lore.json";
import tiersJson from "../data/tiers.json";
import type {
  Archetype,
  BossStrategy,
  BuildLoadout,
  BuildProfile,
  DialogueEvent,
  Encounter,
  EncounterPreset,
  Farmable,
  FiniteResource,
  Item,
  Knowledge,
  LoreEntry,
  Material,
  MerchantRecord,
  Meta,
  NpcState,
  Objective,
  ProgressionLoadout,
  ResourcePreset,
  RouteArea,
  RouteStep,
  Scarab,
  SpellPackage,
  Supplemental,
  TechEdge,
  TechNode,
  TierEntry,
  UpgradePlan,
  WeaponConfig,
} from "./types";

export const META: Meta = metaJson;
export const ROUTE_STEPS: RouteStep[] = routeJson.steps;
export const ROUTE_AREAS: RouteArea[] = routeJson.areas;
export const OBJECTIVES: Objective[] = routeJson.objectives;
export const SUPPLEMENTAL: Supplemental[] = routeJson.supplemental;
export const CHRONOLOGY_AREAS = routeJson.chronologyAreas;
export const ITEMS: Item[] = itemsJson.items;
export const LORE: LoreEntry[] = loreJson.entries;
export const TIERS: TierEntry[] = tiersJson.entries;
export const ENCOUNTERS: Encounter[] = worldJson.encounters;
export const NPC_STATES: NpcState[] = worldJson.npcStates;
export const DIALOGUE_EVENTS: DialogueEvent[] = worldJson.dialogueEvents;
export const KNOWLEDGE: Knowledge[] = worldJson.knowledge;
export const FARMABLES: Farmable[] = farmsJson.farmables;
export const MATERIALS: Material[] = farmsJson.materials;
export const FINITE_RESOURCES: FiniteResource[] = farmsJson.finiteResources;
export const MERCHANTS: MerchantRecord[] = farmsJson.merchants;
export const SCARABS: Scarab[] = farmsJson.scarabs;

export const ARCHETYPES: Archetype[] = buildsJson.archetypes;
export const PROFILES: BuildProfile[] = buildsJson.profiles;
export const LOADOUTS: BuildLoadout[] = buildsJson.loadouts;
export const TECH_NODES: TechNode[] = buildsJson.techNodes;
export const TECH_EDGES: TechEdge[] = buildsJson.techEdges;
export const PROGRESSION_LOADOUTS: ProgressionLoadout[] = buildsJson.progressionLoadouts;
export const WEAPON_CONFIGS: WeaponConfig[] = buildsJson.weaponConfigs;
export const UPGRADE_PLANS: UpgradePlan[] = buildsJson.upgradePlans;
export const ENCOUNTER_PRESETS: EncounterPreset[] = buildsJson.encounterPresets;
export const BOSS_STRATEGIES: BossStrategy[] = buildsJson.bossStrategies;
export const SPELL_PACKAGES: SpellPackage[] = buildsJson.spellPackages;
export const RESOURCE_PRESETS: ResourcePreset[] = buildsJson.resourcePresets;

function groupBy<T>(rows: T[], key: (row: T) => string): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) {
    const value = key(row);
    (grouped[value] ??= []).push(row);
  }
  return grouped;
}

export const STEP_BY_ID: Record<string, RouteStep> = Object.fromEntries(
  ROUTE_STEPS.map((step) => [step.id, step]),
);
export const STEP_INDEX: Record<string, number> = Object.fromEntries(
  ROUTE_STEPS.map((step) => [step.id, step.order]),
);
export const STEPS_BY_AREA = groupBy(ROUTE_STEPS, (step) => step.area);
export const STEPS_BY_OBJECTIVE = groupBy(ROUTE_STEPS, (step) => step.objectiveId);
export const OBJECTIVE_BY_ID: Record<string, Objective> = Object.fromEntries(
  OBJECTIVES.map((objective) => [objective.id, objective]),
);
export const AREA_BY_NAME: Record<string, RouteArea> = Object.fromEntries(
  ROUTE_AREAS.map((area) => [area.name, area]),
);
export const SUPPLEMENTAL_BY_ID: Record<string, Supplemental> = Object.fromEntries(
  SUPPLEMENTAL.map((action) => [action.id, action]),
);
export const SUPPLEMENTAL_BY_AREA = groupBy(SUPPLEMENTAL, (action) => action.area);

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
for (const item of ITEMS) {
  if (item.autoStepId) (AUTO_ITEMS_BY_STEP[item.autoStepId] ??= []).push(item);
}
export { AUTO_ITEMS_BY_STEP };

export const ENCOUNTER_BY_ID: Record<string, Encounter> = Object.fromEntries(
  ENCOUNTERS.map((encounter) => [encounter.id, encounter]),
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

export const BOSS_STRATEGIES_BY_BOSS = groupBy(BOSS_STRATEGIES, (strategy) => strategy.boss);
export const BOSS_STRATEGIES_BY_BUILD = groupBy(BOSS_STRATEGIES, (strategy) => strategy.buildId);
export const BOSS_NAMES = Object.keys(BOSS_STRATEGIES_BY_BOSS).sort((a, b) => a.localeCompare(b));
export const ENCOUNTER_PRESETS_BY_BUILD = groupBy(ENCOUNTER_PRESETS, (preset) => preset.buildId);
export const SPELL_PACKAGES_BY_BUILD = groupBy(SPELL_PACKAGES, (pkg) => pkg.buildId);
export const RESOURCE_PRESETS_BY_BUILD = groupBy(RESOURCE_PRESETS, (preset) => preset.buildId);
export const SPELL_PACKAGE_BY_ID: Record<string, SpellPackage> = Object.fromEntries(
  SPELL_PACKAGES.map((pkg) => [pkg.id, pkg]),
);
export const RESOURCE_PRESET_BY_ID: Record<string, ResourcePreset> = Object.fromEntries(
  RESOURCE_PRESETS.map((preset) => [preset.id, preset]),
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
export const UPGRADES_BY_NODE = groupBy(UPGRADE_PLANS, (plan) => plan.nodeId);
export const WEAPON_CONFIG_BY_ID: Record<string, WeaponConfig> = Object.fromEntries(
  WEAPON_CONFIGS.map((config) => [config.id, config]),
);

export const TIERS_BY_LIST = groupBy(TIERS, (entry) => entry.list);
export const TIERS_BY_NAME = groupBy(TIERS, (entry) => entry.name);
export const LORE_BY_AREA = groupBy(LORE, (entry) => entry.area);

export const ROUTE_STEP_COUNT = ROUTE_STEPS.length;
export const ROUTE_REQUIRED_COUNT = ROUTE_STEPS.filter((step) => step.required).length;
export const ITEM_COUNT = ITEMS.length;
export const SUPPLEMENTAL_COUNT = SUPPLEMENTAL.length;
export const ENCOUNTER_COUNT = ENCOUNTERS.length;
export const LORE_COUNT = LORE.length;
