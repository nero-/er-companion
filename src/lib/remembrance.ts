import {
  BOSS_NAMES,
  ENCOUNTERS,
  META,
  REMEMBRANCE_PLAN_ENTRIES,
  STEP_BY_ID,
  normalizeContentKey,
} from "./data";
import type { Remembrance, RemembrancePlanEntry } from "./types";

/** How a remembrance should be duplicated for a completion-first run. */
export type DuplicateAction = "now" | "defer" | "none" | "unknown";

export interface RemembranceRouteLink {
  stepId: string;
  label: string;
  /** Hash-router href, e.g. `#/journey?step=…&area=…`. */
  href: string;
}

const INTERNAL_CODE = /\b(?:J1|J2)\s+DUP-\d+\b/gi;

/** Strip workbook duplication codes (J1 DUP-07) from reader-facing text. */
export function plainCopy(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(INTERNAL_CODE, "")
    .replace(/\s*—\s*—/g, " — ")
    .replace(/Duplication:\s*—/gi, "Duplicate at:")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/Duplication:\s*(?=Take|Reserve|None)/gi, "Then duplicate: ")
    .trim();
}

export interface RemembrancePlanRow {
  key: string;
  order: number;
  remembranceId: string;
  remembrance: string;
  boss: string;
  bossHref?: string;
  game: string;
  priority: string;
  duplicateAction: DuplicateAction;
  duplicateLabel: string;
  duplicateDetail: string;
  journey1: string;
  journey2: string;
  /** Reward taken first in Journey 1, when it can be derived from the ledger. */
  journey1Pick?: string;
  rewards: string[];
  area: string;
  routeLinks: RemembranceRouteLink[];
  notes: string;
  meta?: Remembrance;
}

const DUPLICATE_LABELS: Record<DuplicateAction, string> = {
  now: "Duplicate now",
  defer: "Defer to Journey 2",
  none: "No duplicate needed",
  unknown: "Review manually",
};

const ENCOUNTER_LINK_BY_KEY: Record<string, string> = {};
for (const encounter of ENCOUNTERS) {
  const key = normalizeContentKey(encounter.name);
  if (!ENCOUNTER_LINK_BY_KEY[key]) {
    ENCOUNTER_LINK_BY_KEY[key] = `#/bosses?encounter=${encodeURIComponent(encounter.id)}`;
  }
}

const BOSS_PREP_LINK_BY_KEY: Record<string, string> = {};
for (const name of BOSS_NAMES) {
  const key = normalizeContentKey(name);
  if (!BOSS_PREP_LINK_BY_KEY[key]) BOSS_PREP_LINK_BY_KEY[key] = `#/bosses?boss=${encodeURIComponent(name)}`;
}

/** Ledger boss names that differ from the encounter/strategy names. */
const BOSS_ALIASES: Record<string, string> = {
  "malenia goddess of rot": "malenia blade of miquella",
  "godfrey first elden lord hoarah loux": "godfrey first elden lord",
  "elden beast": "radagon of the golden order and elden beast",
  "radagon of the golden order and elden beast": "radagon of the golden order and elden beast",
};

/** Resolve a remembrance boss to a boss page link without inventing a match. */
export function bossHref(boss: string | undefined): string | undefined {
  if (!boss) return undefined;
  const key = normalizeContentKey(boss);
  if (!key) return undefined;
  const resolved = BOSS_ALIASES[key] ?? key;
  const direct = ENCOUNTER_LINK_BY_KEY[resolved] ?? BOSS_PREP_LINK_BY_KEY[resolved];
  if (direct) return direct;
  const encounterKey = Object.keys(ENCOUNTER_LINK_BY_KEY).find(
    (candidate) => candidate.includes(resolved) || resolved.includes(candidate),
  );
  if (encounterKey) return ENCOUNTER_LINK_BY_KEY[encounterKey];
  const prepKey = Object.keys(BOSS_PREP_LINK_BY_KEY).find(
    (candidate) => candidate.includes(resolved) || resolved.includes(candidate),
  );
  if (prepKey) return BOSS_PREP_LINK_BY_KEY[prepKey];
  return undefined;
}

const META_BY_ID: Record<string, Remembrance> = Object.fromEntries(
  META.remembrances.map((remembrance) => [remembrance.id, remembrance]),
);
const META_BY_KEY: Record<string, Remembrance> = Object.fromEntries(
  META.remembrances.map((remembrance) => [normalizeContentKey(remembrance.name), remembrance]),
);

function metaForEntry(entry: RemembrancePlanEntry): Remembrance | undefined {
  return (
    META_BY_ID[entry.remembranceId] ??
    META_BY_KEY[normalizeContentKey(entry.remembrance)] ??
    META_BY_KEY[normalizeContentKey(humanizeId(entry.remembranceId))]
  );
}

/** `remembrance-of-the-grafted` → `Remembrance of the Grafted`. */
function humanizeId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionFromMeta(meta: Remembrance | undefined): DuplicateAction {
  if (!meta) return "unknown";
  if (/J1\s*DUP/i.test(meta.journey1Duplication)) return "now";
  if (/^(no|not applicable)\b/i.test(meta.duplicateTarget.trim())) return "none";
  if (/journey 2|j2|reserve|second journey/i.test(meta.duplicateTarget)) return "defer";
  return "defer";
}

/** Fallback classification when the ledger row is missing from the bundle. */
function actionFromPlanText(entry: RemembrancePlanEntry): DuplicateAction {
  const text = `${entry.duplicatePlan} ${entry.priority} ${entry.journey2}`;
  if (/j1 dup|duplicate now|immediately|mausoleum in journey 1/i.test(text)) return "now";
  if (/no duplicate|not required|not applicable|no extra copy|no second copy/i.test(text)) return "none";
  if (/defer|journey 2|j2|reserve|second journey/i.test(text)) return "defer";
  return "unknown";
}

function duplicateDetail(action: DuplicateAction, meta: Remembrance | undefined, entry: RemembrancePlanEntry): string {
  if (meta) {
    if (action === "now") return meta.journey1Duplication;
    if (action === "none") return meta.duplicateTarget;
  }
  if (entry.duplicatePlan.trim()) return entry.duplicatePlan;
  if (action === "defer" && meta) return `${meta.duplicateTarget} — take the second reward in Journey 2.`;
  if (action === "defer") return "Take the second reward in Journey 2; reserve duplication capacity.";
  return entry.notes || meta?.notes || "";
}

function journey1Pick(meta: Remembrance | undefined, rewards: string[]): string | undefined {
  if (!meta) return undefined;
  const selection = meta.journey1Selection;
  if (!selection) return undefined;
  const exact = rewards.find((reward) => selection.startsWith(reward) || reward === selection);
  if (exact) return exact;
  return rewards.find((reward) => selection.toLowerCase().includes(reward.toLowerCase()));
}

function routeLinksFor(entry: RemembrancePlanEntry): RemembranceRouteLink[] {
  const links: RemembranceRouteLink[] = [];
  const seen = new Set<string>();
  for (const stepId of entry.routeStepIds ?? []) {
    if (!stepId || seen.has(stepId)) continue;
    seen.add(stepId);
    const step = STEP_BY_ID[stepId];
    const area = entry.area || step?.area || "";
    const params = new URLSearchParams();
    params.set("step", stepId);
    if (area) params.set("area", area);
    links.push({
      stepId,
      label: step?.area ?? (area || "Route step"),
      href: `#/journey?${params.toString()}`,
    });
  }
  return links;
}

function toRow(entry: RemembrancePlanEntry): RemembrancePlanRow {
  const meta = metaForEntry(entry);
  const rewards = (entry.rewards?.length ? entry.rewards : (meta?.rewards ?? [])).filter(
    (reward) => reward && reward !== "—",
  );
  const action = meta ? actionFromMeta(meta) : actionFromPlanText(entry);
  const remembrance =
    entry.remembrance || meta?.name || humanizeId(entry.remembranceId);
  const boss = entry.boss || meta?.boss || "";
  const area = entry.area || meta?.location || "";
  const journey1 = entry.journey1 || meta?.journey1Selection || "";
  const journey2 = entry.journey2 || meta?.journey2Selection || "";
  return {
    key: entry.remembranceId || `${entry.order}-${normalizeContentKey(remembrance)}`,
    order: entry.order,
    remembranceId: entry.remembranceId,
    remembrance,
    boss,
    bossHref: bossHref(boss),
    game: entry.game || meta?.game || "",
    priority: entry.priority || meta?.priority || "",
    duplicateAction: action,
    duplicateLabel: DUPLICATE_LABELS[action],
    duplicateDetail: plainCopy(duplicateDetail(action, meta, entry)),
    journey1: plainCopy(journey1),
    journey2: plainCopy(journey2),
    journey1Pick: journey1Pick(meta, rewards),
    rewards,
    area,
    routeLinks: routeLinksFor(entry),
    notes: plainCopy(entry.notes || meta?.notes || ""),
    meta,
  };
}

let cachedPlanRows: RemembrancePlanRow[] | null = null;

/**
 * The remembrance duplication plan, ordered exactly as recorded: the entries
 * most likely to need a duplicate come first.
 */
export function remembrancePlanRows(): RemembrancePlanRow[] {
  if (cachedPlanRows) return cachedPlanRows;
  cachedPlanRows = [...REMEMBRANCE_PLAN_ENTRIES]
    .sort((a, b) => a.order - b.order)
    .map(toRow);
  return cachedPlanRows;
}

export function remembranceDuplicateCounts(rows: RemembrancePlanRow[]): Record<DuplicateAction, number> {
  const counts: Record<DuplicateAction, number> = { now: 0, defer: 0, none: 0, unknown: 0 };
  for (const row of rows) counts[row.duplicateAction] += 1;
  return counts;
}

export function remembranceRowFor(remembranceId: string): RemembrancePlanRow | undefined {
  return remembrancePlanRows().find((row) => row.remembranceId === remembranceId);
}
