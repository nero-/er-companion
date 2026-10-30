import referenceJson from "../data/builds-reference.json";
import type {
  BossStrategy,
  EncounterPreset,
  ResourcePreset,
  UpgradePlan,
  WeaponConfig,
} from "./types";

/**
 * The build reference pack: encounter presets, boss strategies, weapon
 * configurations, upgrade plans and resource presets.
 *
 * Import this module only from a dynamic `import()` or from a chunk that is
 * itself lazy; `useReferencePack` is the supported entry point.
 *
 * These six ledgers are 6.9 MiB of the 7.7 MiB build content pack and are only
 * read by the Builds and Bosses surfaces. Importing them here — instead of in
 * `data.ts` — keeps them out of the initial bundle and out of every page that
 * never opens a build detail. Two surfaces import this module dynamically; see
 * `useReferencePack`.
 *
 * `boss-index.json` still provides boss names and strategy counts at startup, so
 * navigation and search never need this module.
 */
export const WEAPON_CONFIGS: WeaponConfig[] = referenceJson.weaponConfigs;
export const UPGRADE_PLANS: UpgradePlan[] = referenceJson.upgradePlans;
export const ENCOUNTER_PRESETS: EncounterPreset[] = referenceJson.encounterPresets;
export const BOSS_STRATEGIES: BossStrategy[] = referenceJson.bossStrategies;
export const RESOURCE_PRESETS: ResourcePreset[] = referenceJson.resourcePresets;

export interface ReferencePack {
  WEAPON_CONFIGS: WeaponConfig[];
  UPGRADE_PLANS: UpgradePlan[];
  ENCOUNTER_PRESETS: EncounterPreset[];
  BOSS_STRATEGIES: BossStrategy[];
  RESOURCE_PRESETS: ResourcePreset[];
  BOSS_STRATEGIES_BY_BOSS: Record<string, BossStrategy[]>;
  BOSS_STRATEGIES_BY_BUILD: Record<string, BossStrategy[]>;
  ENCOUNTER_PRESETS_BY_BUILD: Record<string, EncounterPreset[]>;
  RESOURCE_PRESETS_BY_BUILD: Record<string, ResourcePreset[]>;
  UPGRADES_BY_NODE: Record<string, UpgradePlan[]>;
  WEAPON_CONFIG_BY_ID: Record<string, WeaponConfig>;
  RESOURCE_PRESET_BY_ID: Record<string, ResourcePreset>;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const row of rows) (grouped[key(row)] ??= []).push(row);
  return grouped;
}

export const BOSS_STRATEGIES_BY_BOSS: Record<string, BossStrategy[]> = groupBy(
  BOSS_STRATEGIES,
  (strategy) => strategy.boss,
);
export const BOSS_STRATEGIES_BY_BUILD: Record<string, BossStrategy[]> = groupBy(
  BOSS_STRATEGIES,
  (strategy) => strategy.buildId,
);
export const ENCOUNTER_PRESETS_BY_BUILD: Record<string, EncounterPreset[]> = groupBy(
  ENCOUNTER_PRESETS,
  (preset) => preset.buildId,
);
export const RESOURCE_PRESETS_BY_BUILD: Record<string, ResourcePreset[]> = groupBy(
  RESOURCE_PRESETS,
  (preset) => preset.buildId,
);
export const UPGRADES_BY_NODE: Record<string, UpgradePlan[]> = groupBy(
  UPGRADE_PLANS,
  (plan) => plan.nodeId,
);
export const WEAPON_CONFIG_BY_ID: Record<string, WeaponConfig> = Object.fromEntries(
  WEAPON_CONFIGS.map((config) => [config.id, config]),
);
export const RESOURCE_PRESET_BY_ID: Record<string, ResourcePreset> = Object.fromEntries(
  RESOURCE_PRESETS.map((preset) => [preset.id, preset]),
);


