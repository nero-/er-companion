import { CLASSES } from "./classes";
import {
  ACHIEVEMENTS,
  ARCHETYPES,
  BOSS_NAMES,
  ENCOUNTERS,
  FARMABLES,
  ITEMS,
  LORE,
  MATERIALS,
  MERCHANTS,
  META,
  NPC_STATES,
  PROFILES,
  QUESTLINES,
  ROUTE_STEPS,
  SCARABS,
  TIERS,
} from "./data";

export interface SearchEntry {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  path: string;
  haystack: string;
}

function entry(
  id: string,
  type: string,
  title: string,
  subtitle: string,
  path: string,
  extra = "",
): SearchEntry {
  return {
    id,
    type,
    title,
    subtitle,
    path,
    haystack: `${title} ${subtitle} ${extra} ${id}`.toLowerCase(),
  };
}

const INDEX: SearchEntry[] = [];

for (const step of ROUTE_STEPS) {
  INDEX.push(
    entry(
      step.id,
      "Route step",
      step.instruction,
      `${step.area}${step.levelRange ? ` · ${step.levelRange}` : ""} · ${step.phase}`,
      `/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`,
      `${step.location} ${step.warning} ${step.id}`,
    ),
  );
}

for (const item of ITEMS) {
  INDEX.push(
    entry(
      item.id,
      "Item",
      item.name,
      `${item.group} · ${item.region}`,
      `/collection?item=${encodeURIComponent(item.id)}`,
      `${item.category} ${item.location} ${item.acquisitionType}`,
    ),
  );
}

for (const boss of BOSS_NAMES) {
  INDEX.push(entry(`boss:${boss}`, "Boss", boss, "Build strategy library", `/bosses?boss=${encodeURIComponent(boss)}`));
}

for (const encounter of ENCOUNTERS) {
  INDEX.push(
    entry(
      encounter.id,
      "Encounter",
      encounter.name,
      `${encounter.type} · ${encounter.location}`,
      `/bosses?encounter=${encodeURIComponent(encounter.id)}`,
      `${encounter.region} ${encounter.notes}`,
    ),
  );
}

for (const achievement of ACHIEVEMENTS) {
  INDEX.push(
    entry(
      achievement.id,
      "Achievement",
      achievement.name,
      `${achievement.section} · ${achievement.missable ? "Missable" : "Trophy"}`,
      `/completion?achievement=${encodeURIComponent(achievement.id)}`,
      `${achievement.description} ${achievement.wikiUrl}`,
    ),
  );
}

for (const questline of QUESTLINES) {
  INDEX.push(
    entry(
      questline.id,
      "Questline",
      questline.npc,
      `${questline.game} · ${questline.stepCount} steps · ${questline.missableCount} missable`,
      `/quests?questline=${encodeURIComponent(questline.id)}`,
      questline.steps.map((step) => step.text).join(" "),
    ),
  );
}

for (const classEntry of CLASSES) {
  INDEX.push(
    entry(
      `class:${classEntry.id}`,
      "Class",
      classEntry.name,
      `Starting class · Level ${classEntry.level}`,
      "/character",
      classEntry.blurb,
    ),
  );
}

for (const archetype of ARCHETYPES) {
  INDEX.push(
    entry(
      archetype.id,
      "Build",
      archetype.name,
      `${archetype.familyRole} · ${archetype.priorityStats}`,
      `/builds?archetype=${encodeURIComponent(archetype.id)}`,
      `${archetype.fantasy} ${archetype.family}`,
    ),
  );
}

for (const profile of PROFILES) {
  INDEX.push(
    entry(
      profile.id,
      "Build profile",
      `${profile.archetype} — Level ${profile.level}`,
      `${profile.primaryStat} / ${profile.secondaryStat} · ${profile.role}`,
      `/builds?archetype=${encodeURIComponent(profile.archetypeId)}&level=${profile.level}`,
      profile.id,
    ),
  );
}

for (const lore of LORE) {
  INDEX.push(
    entry(
      lore.id,
      "Lore",
      lore.area,
      `Spoiler-gated journal · area order ${lore.areaOrder}`,
      `/lore?entry=${encodeURIComponent(lore.id)}`,
      lore.rawSummary,
    ),
  );
}

for (const decision of META.decisions) {
  INDEX.push(
    entry(
      decision.id,
      "Decision",
      decision.title,
      `${decision.game} · ${decision.category}`,
      `/quests?decision=${encodeURIComponent(decision.id)}`,
      `${decision.decisionPoint} ${decision.outcomes}`,
    ),
  );
}

for (const npc of NPC_STATES) {
  INDEX.push(
    entry(
      npc.id,
      "NPC",
      npc.npc,
      `${npc.region} · ${npc.milestone}`,
      `/quests?npc=${encodeURIComponent(npc.id)}`,
      npc.warning,
    ),
  );
}

for (const farmable of FARMABLES) {
  INDEX.push(
    entry(
      farmable.id,
      "Farmable",
      farmable.item,
      `${farmable.category} · ${farmable.location}`,
      `/farms?tab=farmables&id=${encodeURIComponent(farmable.id)}`,
      `${farmable.source} ${farmable.grace} ${farmable.notes}`,
    ),
  );
}

for (const material of MATERIALS) {
  INDEX.push(
    entry(
      material.id,
      "Material",
      material.name,
      `${material.category} · ${material.renewability}`,
      `/farms?tab=materials&id=${encodeURIComponent(material.id)}`,
      `${material.earlySource} ${material.lateSource}`,
    ),
  );
}

for (const merchant of MERCHANTS) {
  INDEX.push(
    entry(
      merchant.id,
      "Merchant",
      merchant.item,
      `${merchant.merchant} · ${merchant.cost} runes`,
      `/farms?tab=merchants&id=${encodeURIComponent(merchant.id)}`,
      merchant.notes,
    ),
  );
}

for (const scarab of SCARABS) {
  INDEX.push(
    entry(
      scarab.id,
      "Scarab",
      scarab.reward,
      `${scarab.rewardType} · ${scarab.region}`,
      `/farms?tab=scarabs&id=${encodeURIComponent(scarab.id)}`,
      `${scarab.location} ${scarab.behavior}`,
    ),
  );
}

for (const tier of TIERS) {
  INDEX.push(
    entry(
      `tier:${tier.list}:${tier.rank}`,
      "Tier entry",
      tier.name,
      `${tier.list} · #${tier.rank} · ${tier.tier}`,
      `/tiers?list=${encodeURIComponent(tier.list)}&q=${encodeURIComponent(tier.name)}`,
      `${tier.className ?? ""} ${tier.notes ?? ""}`,
    ),
  );
}

export const QUICK_LINKS: SearchEntry[] = [
  entry("nav:dashboard", "Page", "Dashboard", "Next action, journey state, closeout", "/"),
  entry("nav:journey", "Page", "Journey", "Act I route and whole-game chronology", "/journey"),
  entry("nav:collection", "Page", "Collection", "Master armory and ownership", "/collection"),
  entry("nav:builds", "Page", "Builds", "Certified archetypes, loadouts, boss presets", "/builds"),
  entry("nav:character", "Page", "Character", "Plan stats and equipment", "/character"),
  entry("nav:quests", "Page", "Quests", "NPC states, decisions, lockouts", "/quests"),
  entry("nav:lore", "Page", "Lore", "Spoiler-controlled journal", "/lore"),
  entry("nav:farms", "Page", "Farms", "Farmables, materials, merchants, scarabs", "/farms"),
  entry("nav:tiers", "Page", "Tier lists", "Weapons, spells, ashes, talismans", "/tiers"),
  entry("nav:bosses", "Page", "Bosses", "Merged boss ledger and strategy library", "/bosses"),
  entry("nav:completion", "Page", "Completion", "Endings, achievements, NG+ readiness", "/completion"),
  entry("nav:patch", "Page", "Patch & DLC", "Live game version, Tarnished Pack, 1.17 balance changes", "/patch"),
];

export function searchEntries(query: string, limit = 30): SearchEntry[] {
  const text = query.trim().toLowerCase();
  if (!text) return QUICK_LINKS;
  const tokens = text.split(/\s+/).filter(Boolean);
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const candidate of INDEX) {
    let score = 0;
    let matched = true;
    for (const token of tokens) {
      if (!candidate.haystack.includes(token)) {
        matched = false;
        break;
      }
      if (candidate.title.toLowerCase().startsWith(token)) score += 80;
      else if (candidate.title.toLowerCase().includes(token)) score += 40;
      else score += 8;
    }
    if (!matched) continue;
    if (candidate.title.toLowerCase() === text) score += 200;
    if (candidate.type === "Route step") score += 4;
    scored.push({ entry: candidate, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
  return scored.slice(0, limit).map((row) => row.entry);
}
