import type { StatKey, Stats } from "./types";

export interface CharacterClass {
  id: string;
  name: string;
  level: number;
  stats: Stats;
  blurb: string;
}

export const STAT_ORDER: StatKey[] = ["vig", "mnd", "end", "str", "dex", "int", "fai", "arc"];

export const STAT_LABELS: Record<StatKey, string> = {
  vig: "Vigor",
  mnd: "Mind",
  end: "Endurance",
  str: "Strength",
  dex: "Dexterity",
  int: "Intelligence",
  fai: "Faith",
  arc: "Arcane",
};

export const STAT_SHORT: Record<StatKey, string> = {
  vig: "VIG",
  mnd: "MND",
  end: "END",
  str: "STR",
  dex: "DEX",
  int: "INT",
  fai: "FAI",
  arc: "ARC",
};

export const CLASSES: CharacterClass[] = [
  {
    id: "vagabond",
    name: "Vagabond",
    level: 9,
    stats: { vig: 15, mnd: 10, end: 11, str: 14, dex: 13, int: 9, fai: 9, arc: 7 },
    blurb: "The certified default. Strong Vigor and quality-stat spread; the anchor class for most parent builds.",
  },
  {
    id: "warrior",
    name: "Warrior",
    level: 8,
    stats: { vig: 11, mnd: 12, end: 11, str: 10, dex: 16, int: 10, fai: 8, arc: 9 },
    blurb: "Dexterity-first duelist with a strong starting curve for curved swords and twinblades.",
  },
  {
    id: "hero",
    name: "Hero",
    level: 7,
    stats: { vig: 14, mnd: 9, end: 12, str: 16, dex: 9, int: 7, fai: 8, arc: 11 },
    blurb: "Strength and Arcane lean. Excellent for heavy weapons and early bleed/occult pivots.",
  },
  {
    id: "bandit",
    name: "Bandit",
    level: 5,
    stats: { vig: 10, mnd: 11, end: 10, str: 9, dex: 13, int: 9, fai: 8, arc: 14 },
    blurb: "Lowest starting level and the strongest Arcane start for status and Dragon Communion paths.",
  },
  {
    id: "astrologer",
    name: "Astrologer",
    level: 6,
    stats: { vig: 9, mnd: 15, end: 9, str: 8, dex: 12, int: 16, fai: 7, arc: 9 },
    blurb: "Pure Intelligence caster start; the natural route into Primeval Archmage and Carian Spellblade.",
  },
  {
    id: "prophet",
    name: "Prophet",
    level: 7,
    stats: { vig: 10, mnd: 14, end: 8, str: 11, dex: 10, int: 7, fai: 16, arc: 10 },
    blurb: "Faith-first caster start for Erdtree Templar and Dragon Cult packages.",
  },
  {
    id: "confessor",
    name: "Confessor",
    level: 10,
    stats: { vig: 10, mnd: 13, end: 10, str: 12, dex: 12, int: 9, fai: 14, arc: 9 },
    blurb: "Balanced Faith hybrid with the highest starting level and flexible martial casting.",
  },
  {
    id: "prisoner",
    name: "Prisoner",
    level: 9,
    stats: { vig: 11, mnd: 12, end: 11, str: 11, dex: 14, int: 14, fai: 6, arc: 9 },
    blurb: "Dexterity/Intelligence spellblade start with excellent melee-sorcery symmetry.",
  },
  {
    id: "samurai",
    name: "Samurai",
    level: 9,
    stats: { vig: 12, mnd: 11, end: 13, str: 12, dex: 15, int: 9, fai: 8, arc: 8 },
    blurb: "Dexterity-first samurai start with strong Endurance and a clean katana progression.",
  },
  {
    id: "wretch",
    name: "Wretch",
    level: 1,
    stats: { vig: 10, mnd: 10, end: 10, str: 10, dex: 10, int: 10, fai: 10, arc: 10 },
    blurb: "Blank slate. Maximum respec freedom and the lowest investment cost in any stat.",
  },
];

export const CLASS_BY_ID: Record<string, CharacterClass> = Object.fromEntries(
  CLASSES.map((entry) => [entry.id, entry]),
);

export function levelFromStats(stats: Stats): number {
  return STAT_ORDER.reduce((total, key) => total + (Number(stats[key]) || 0), 0) - 79;
}

