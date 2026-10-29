import {
  AREA_SWEEP_BY_AREA,
  AREA_SWEEPS,
  BOSS_DESCRIPTIONS,
  ITEM_BY_ID,
  ITEM_DESCRIPTIONS,
  RESOURCE_TABLE_BY_ID,
  STEP_BY_ID,
} from "./data";
import type { AreaSweep, Stats } from "./types";
import { STAT_ORDER } from "./classes";

export interface SoftCapRow {
  key: keyof Stats;
  label: string;
  cap: number;
  caps: number[];
}

const STAT_LABELS: Record<keyof Stats, string> = {
  vig: "Vigor",
  mnd: "Mind",
  end: "Endurance",
  str: "Strength",
  dex: "Dexterity",
  int: "Intelligence",
  fai: "Faith",
  arc: "Arcane",
};

/**
 * Soft caps from the bundled Redmaw resource table. Vigor/Mind/Endurance and
 * the four damage stats use the first cap that maps to the stat key; the full
 * ladder stays available for display.
 */
export const SOFT_CAPS: SoftCapRow[] = (() => {
  const table = RESOURCE_TABLE_BY_ID["soft-caps"];
  const byLabel: Record<string, number[]> = {};
  for (const row of table?.rows ?? []) {
    const label = String(row.stat ?? "");
    const caps = [row.softCap1, row.softCap2, row.softCap3, row.softCap4]
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);
    if (label && caps.length) byLabel[label] = caps;
  }
  const map: Array<[keyof Stats, string]> = [
    ["vig", "Vigor"],
    ["mnd", "Mind"],
    ["end", "Endurance"],
    ["str", "Strength"],
    ["dex", "Dexterity"],
    ["int", "Intelligence (Weapon)"],
    ["fai", "Faith (Weapon)"],
    ["arc", "Arcane (Weapon)"],
  ];
  return map.map(([key, label]) => {
    const caps = byLabel[label] ?? [];
    return { key, label: STAT_LABELS[key], cap: caps[0] ?? 0, caps };
  });
})();

export function softCapFor(key: keyof Stats): number {
  return SOFT_CAPS.find((row) => row.key === key)?.cap ?? 0;
}

/**
 * A reference spread that reaches the first soft cap in every stat. This is a
 * stress-test ceiling, not a legal level-150 build; the UI labels it that way.
 */
export const ALL_SOFTCAP_STATS: Stats = (() => {
  const stats = { vig: 1, mnd: 1, end: 1, str: 1, dex: 1, int: 1, fai: 1, arc: 1 } as Stats;
  for (const row of SOFT_CAPS) {
    if (row.cap > 0) stats[row.key] = row.cap;
  }
  return stats;
})();

export function softcapCount(stats: Stats): number {
  return STAT_ORDER.filter((key) => {
    const cap = softCapFor(key);
    return cap > 0 && stats[key] >= cap;
  }).length;
}

export function areaSweep(area: string | undefined): AreaSweep | undefined {
  return area ? AREA_SWEEP_BY_AREA[area] : undefined;
}

export function hasAreaSweep(area: string | undefined): boolean {
  const sweep = areaSweep(area);
  if (!sweep) return false;
  const { counts } = sweep;
  return Boolean(
    counts.merchants || counts.farmables || counts.unlinkedItems || counts.materials,
  );
}

export function itemDescription(itemId: string): string {
  return ITEM_DESCRIPTIONS[itemId]?.text ?? "";
}

export function bossDescription(bossId: string): string {
  return BOSS_DESCRIPTIONS[bossId]?.text ?? "";
}

export interface SweepItemRow {
  id: string;
  name: string;
  note: string;
  owned: boolean;
  sourceUrl?: string;
}

/** Flatten a sweep into one checklist for the journey area panel. */
export function sweepChecklist(area: string): SweepItemRow[] {
  const sweep = AREA_SWEEP_BY_AREA[area];
  if (!sweep) return [];
  const rows: SweepItemRow[] = [];
  for (const merch of sweep.merchants) {
    for (const item of merch.items) {
      rows.push({
        id: item.id,
        name: item.itemName,
        note: `${merch.merchant}${item.price ? ` · ${item.price} runes` : ""}`,
        owned: false,
        sourceUrl: item.wikiUrl,
      });
    }
  }
  for (const farm of sweep.farmables) {
    rows.push({
      id: farm.id,
      name: farm.name,
      note: `${farm.source} · ${farm.location}`,
      owned: false,
    });
  }
  for (const item of sweep.unlinkedItems) {
    const catalog = ITEM_BY_ID[item.itemId];
    rows.push({
      id: item.id,
      name: item.name,
      note: item.acquisitionType || item.location,
      owned: false,
      sourceUrl: catalog?.wikiUrl,
    });
  }
  for (const material of sweep.materials) {
    rows.push({
      id: material.id,
      name: material.name,
      note: material.grace || material.earlySource,
      owned: false,
      sourceUrl: material.sourceUrl,
    });
  }
  return rows;
}

export function stepArea(stepId: string | undefined): string | undefined {
  return stepId ? STEP_BY_ID[stepId]?.area : undefined;
}

export const SWEEP_AREA_COUNT = AREA_SWEEPS.length;
