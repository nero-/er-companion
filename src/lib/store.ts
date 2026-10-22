import { useSyncExternalStore } from "react";
import type {
  AppState,
  BossStatus,
  Character,
  EndingState,
  EquipmentState,
  JourneyState,
  Settings,
  Stats,
  StepStatus,
} from "./types";
import {
  AUTO_BOSSES_BY_STEP,
  AUTO_ITEMS_BY_STEP,
  ITEMS,
  ITEMS_BY_NAME,
  LOADOUTS_BY_BUILD,
  SPELL_PACKAGE_BY_ID,
  STEP_BY_ID,
  remapStepId,
  LOADOUT_BY_ID,
  PROFILE_BY_ID,
} from "./data";
import { CLASS_BY_ID, STAT_ORDER } from "./classes";

const STORAGE_KEY = "er-companion.state.v1";
const BACKUP_KEY = "er-companion.state.corrupt";

const DEFAULT_SETTINGS: Settings = {
  spoilerMode: "strict",
  density: "comfortable",
  reducedMotion: false,
  hideCompleted: false,
};

const EMPTY_EQUIPMENT: EquipmentState = {
  mainWeapon: "",
  secondaryWeapon: "",
  offhand: "",
  shield: "",
  armor: ["", "", "", ""],
  talismans: ["", "", "", ""],
  spells: ["", "", "", "", "", "", "", "", "", ""],
  physick: ["", ""],
};

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function emptyJourney(index: number, label?: string): JourneyState {
  return {
    id: newId("journey"),
    index,
    label: label ?? `Journey ${index}`,
    createdAt: nowIso(),
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
  };
}

function createCharacter(name = "Tarnished"): Character {
  const base = CLASS_BY_ID.vagabond;
  const journey = emptyJourney(1);
  const owned: Record<string, boolean> = {};
  for (const item of ITEMS) {
    if (item.startingOwned) owned[item.id] = true;
  }
  return {
    id: newId("character"),
    name,
    createdAt: nowIso(),
    classId: base.id,
    stats: { ...base.stats },
    archetypeId: "",
    profileId: "",
    journeyId: journey.id,
    journeys: [journey],
    items: owned,
    farmables: {},
    loreRead: {},
    endings: {},
    achievements: {},
    equipment: {
      ...EMPTY_EQUIPMENT,
      armor: [...EMPTY_EQUIPMENT.armor],
      talismans: [...EMPTY_EQUIPMENT.talismans],
      spells: [...EMPTY_EQUIPMENT.spells],
      physick: [...EMPTY_EQUIPMENT.physick],
    },
    equipmentMode: "signature",
  };
}

function createDefaultState(): AppState {
  const character = createCharacter();
  return {
    schemaVersion: 1,
    characters: [character],
    activeCharacterId: character.id,
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: nowIso(),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boolRecord(value: unknown): Record<string, boolean> {
  const source = asObject(value);
  const output: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (entry === true) output[key] = true;
  }
  return output;
}

function numberRecord(value: unknown): Record<string, number> {
  const source = asObject(value);
  const output: Record<string, number> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === "number" && Number.isFinite(entry)) output[key] = entry;
  }
  return output;
}

function stringRecord(value: unknown): Record<string, string> {
  const source = asObject(value);
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === "string" && entry.length > 0) output[key] = entry;
  }
  return output;
}

function statusRecord(value: unknown, allowed: readonly string[]): Record<string, StepStatus> {
  const source = asObject(value);
  const output: Record<string, StepStatus> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === "string" && allowed.includes(entry)) output[key] = entry as StepStatus;
  }
  return output;
}

function bossStatusRecord(value: unknown): Record<string, BossStatus> {
  const source = asObject(value);
  const output: Record<string, BossStatus> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (entry === "defeated" || entry === "deferred") output[key] = entry;
  }
  return output;
}

function remapLegacySteps(value: unknown): Record<string, unknown> {
  const source = asObject(value);
  const output: Record<string, unknown> = {};
  // Current step IDs and unknown future keys win over legacy remaps.
  for (const [key, entry] of Object.entries(source)) {
    if (STEP_BY_ID[key]) output[key] = entry;
  }
  for (const [key, entry] of Object.entries(source)) {
    if (STEP_BY_ID[key]) continue;
    const remapped = remapStepId(key);
    if (remapped) {
      if (output[remapped] === undefined) output[remapped] = entry;
      continue;
    }
    // Only pre-integration RTE-* keys are dropped when no confident mapping
    // exists. Unknown future keys survive so a newer save is never truncated.
    if (!key.startsWith("RTE-")) output[key] = entry;
  }
  return output;
}

function statsFrom(value: unknown, fallback: Stats): Stats {
  const source = asObject(value);
  const output = { ...fallback };
  for (const key of STAT_ORDER) {
    const entry = source[key];
    if (typeof entry === "number" && Number.isFinite(entry)) output[key] = entry;
  }
  return output;
}

function tuple(value: unknown, length: number, fallback: string[]): string[] {
  const entries = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => {
    const entry = entries[index];
    return typeof entry === "string" ? entry : fallback[index] ?? "";
  });
}

export function normalizeJourney(value: unknown, index: number): JourneyState {
  const source = asObject(value);
  const id = typeof source.id === "string" ? source.id : newId("journey");
  const label = typeof source.label === "string" ? source.label : `Journey ${index}`;
  const createdAt = typeof source.createdAt === "string" ? source.createdAt : nowIso();
  return {
    id,
    index: typeof source.index === "number" ? source.index : index,
    label,
    createdAt,
    steps: statusRecord(remapLegacySteps(source.steps), ["done", "skipped", "deferred"]),
    stepNotes: stringRecord(remapLegacySteps(source.stepNotes)),
    supplemental: statusRecord(source.supplemental, ["done", "skipped", "deferred"]),
    npcStates: boolRecord(source.npcStates),
    dialogue: boolRecord(source.dialogue),
    decisions: stringRecord(source.decisions),
    bosses: bossStatusRecord(source.bosses),
    farmables: numberRecord(source.farmables),
    materials: boolRecord(source.materials),
    finite: boolRecord(source.finite),
    merchants: boolRecord(source.merchants),
    scarabs: boolRecord(source.scarabs),
    certifications: boolRecord(source.certifications),
    transitionGates: boolRecord(source.transitionGates),
    remembrances: asObject(source.remembrances) as JourneyState["remembrances"],
    zonesRevealed: boolRecord(source.zonesRevealed),
    questlineSteps: boolRecord(source.questlineSteps),
    ngplusChecklist: boolRecord(source.ngplusChecklist),
  };
}

function normalizeEndings(value: unknown): Record<string, EndingState> {
  const source = asObject(value);
  const output: Record<string, EndingState> = {};
  for (const [key, entry] of Object.entries(source)) {
    const state = asObject(entry);
    output[key] = {
      viewed: state.viewed === true,
      earned: state.earned === true,
      completedAt: typeof state.completedAt === "string" ? state.completedAt : undefined,
      journeyIndex: typeof state.journeyIndex === "number" ? state.journeyIndex : undefined,
    };
  }
  return output;
}

function normalizeCharacter(value: unknown): Character | null {
  const source = asObject(value);
  if (typeof source.id !== "string" || typeof source.name !== "string") return null;
  const base = CLASS_BY_ID[typeof source.classId === "string" ? source.classId : "vagabond"] ?? CLASS_BY_ID.vagabond;
  const journeysRaw = Array.isArray(source.journeys) ? source.journeys : [];
  const journeys = journeysRaw.map((entry, index) => normalizeJourney(entry, index + 1));
  if (journeys.length === 0) journeys.push(emptyJourney(1));
  const journeyId =
    typeof source.journeyId === "string" && journeys.some((journey) => journey.id === source.journeyId)
      ? source.journeyId
      : journeys[0].id;
  const equipmentSource = asObject(source.equipment);
  return {
    id: source.id,
    name: source.name,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : nowIso(),
    classId: base.id,
    stats: statsFrom(source.stats, base.stats),
    archetypeId: typeof source.archetypeId === "string" ? source.archetypeId : "",
    profileId: typeof source.profileId === "string" ? source.profileId : "",
    journeyId,
    journeys,
    items: boolRecord(source.items),
    farmables: numberRecord(source.farmables),
    loreRead: boolRecord(source.loreRead),
    endings: normalizeEndings(source.endings),
    achievements: boolRecord(source.achievements),
    equipment: {
      mainWeapon: typeof equipmentSource.mainWeapon === "string" ? equipmentSource.mainWeapon : "",
      secondaryWeapon: typeof equipmentSource.secondaryWeapon === "string" ? equipmentSource.secondaryWeapon : "",
      offhand: typeof equipmentSource.offhand === "string" ? equipmentSource.offhand : "",
      shield: typeof equipmentSource.shield === "string" ? equipmentSource.shield : "",
      armor: tuple(equipmentSource.armor, 4, EMPTY_EQUIPMENT.armor),
      talismans: tuple(equipmentSource.talismans, 4, EMPTY_EQUIPMENT.talismans),
      spells: tuple(equipmentSource.spells, 10, EMPTY_EQUIPMENT.spells),
      physick: tuple(equipmentSource.physick, 2, EMPTY_EQUIPMENT.physick),
    },
    equipmentMode:
      source.equipmentMode === "optimized" ||
      source.equipmentMode === "fashion" ||
      source.equipmentMode === "custom"
        ? source.equipmentMode
        : "signature",
  };
}

function normalizeState(value: unknown): AppState | null {
  const source = asObject(value);
  if (source.schemaVersion !== 1 || !Array.isArray(source.characters)) return null;
  const characters = source.characters
    .map(normalizeCharacter)
    .filter((character): character is Character => character !== null);
  if (characters.length === 0) return null;
  const activeCharacterId =
    typeof source.activeCharacterId === "string" &&
    characters.some((character) => character.id === source.activeCharacterId)
      ? source.activeCharacterId
      : characters[0].id;
  const settingsSource = asObject(source.settings);
  const settings: Settings = {
    spoilerMode: settingsSource.spoilerMode === "reveal-all" ? "reveal-all" : "strict",
    density: settingsSource.density === "compact" ? "compact" : "comfortable",
    reducedMotion: settingsSource.reducedMotion === true,
    hideCompleted: settingsSource.hideCompleted === true,
  };
  return {
    schemaVersion: 1,
    characters,
    activeCharacterId,
    settings,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : nowIso(),
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed: unknown = JSON.parse(raw);
    const normalized = normalizeState(parsed);
    if (normalized) return normalized;
    localStorage.setItem(BACKUP_KEY, raw);
  } catch {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(BACKUP_KEY, raw);
  }
  return createDefaultState();
}

let state: AppState = loadState();
const listeners = new Set<() => void>();
let persistTimer: number | undefined;

function persistNow(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage full or unavailable: the in-memory session remains usable. */
  }
}

function schedulePersist(): void {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistNow, 180);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function commit(next: AppState): void {
  state = { ...next, updatedAt: nowIso() };
  schedulePersist();
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): AppState {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useActiveCharacter(): Character {
  const snapshot = useAppState();
  return snapshot.characters.find((character) => character.id === snapshot.activeCharacterId) ?? snapshot.characters[0];
}

export function useActiveJourney(): JourneyState {
  const character = useActiveCharacter();
  return character.journeys.find((journey) => journey.id === character.journeyId) ?? character.journeys[0];
}

function updateCharacter(update: (character: Character) => Character): void {
  commit({
    ...state,
    characters: state.characters.map((character) =>
      character.id === state.activeCharacterId ? update(character) : character,
    ),
  });
}

function updateJourney(update: (journey: JourneyState, character: Character) => JourneyState): void {
  updateCharacter((character) => ({
    ...character,
    journeys: character.journeys.map((journey) =>
      journey.id === character.journeyId ? update(journey, character) : journey,
    ),
  }));
}

export interface StepActionResult {
  acquiredItems: string[];
  defeatedBosses: string[];
  completedNpcs: string[];
  pickedUpResources: string[];
  scarabs: string[];
}

function applyStepCompletion(
  journey: JourneyState,
  stepId: string,
  result: StepActionResult,
  sourceItems: Record<string, boolean>,
): { items: Record<string, boolean>; journey: JourneyState } {
  const items = { ...sourceItems };
  for (const item of AUTO_ITEMS_BY_STEP[stepId] ?? []) {
    if (!items[item.id]) {
      items[item.id] = true;
      result.acquiredItems.push(item.name);
    }
  }

  const bosses = { ...journey.bosses };
  for (const encounter of AUTO_BOSSES_BY_STEP[stepId] ?? []) {
    if (bosses[encounter.id] !== "defeated") {
      bosses[encounter.id] = "defeated";
      result.defeatedBosses.push(encounter.name);
    }
  }
  return { items, journey: { ...journey, bosses } };
}

export function setStepStatus(stepId: string, status: StepStatus | null): StepActionResult {
  const result: StepActionResult = {
    acquiredItems: [],
    defeatedBosses: [],
    completedNpcs: [],
    pickedUpResources: [],
    scarabs: [],
  };
  updateCharacter((character) => {
    const current = character.journeys.find((entry) => entry.id === character.journeyId);
    if (!current) return character;
    const steps = { ...current.steps };
    if (status === null) delete steps[stepId];
    else steps[stepId] = status;
    let journey = { ...current, steps };
    let items = character.items;
    if (status === "done") {
      const completion = applyStepCompletion(journey, stepId, result, items);
      journey = completion.journey;
      items = completion.items;
    }
    return {
      ...character,
      items,
      journeys: character.journeys.map((entry) => (entry.id === journey.id ? journey : entry)),
    };
  });
  return result;
}

export function setSupplementalStatus(id: string, status: StepStatus | null): void {
  updateJourney((journey) => {
    const supplemental = { ...journey.supplemental };
    if (status === null) delete supplemental[id];
    else supplemental[id] = status;
    return { ...journey, supplemental };
  });
}

export function setStepNote(stepId: string, note: string): void {
  updateJourney((journey) => {
    const stepNotes = { ...journey.stepNotes };
    if (note.trim()) stepNotes[stepId] = note;
    else delete stepNotes[stepId];
    return { ...journey, stepNotes };
  });
}

export function resolveArea(area: string): StepActionResult {
  const result: StepActionResult = {
    acquiredItems: [],
    defeatedBosses: [],
    completedNpcs: [],
    pickedUpResources: [],
    scarabs: [],
  };
  updateCharacter((character) => {
    const current = character.journeys.find((entry) => entry.id === character.journeyId);
    if (!current) return character;
    const steps = { ...current.steps };
    let journey = current;
    let items = character.items;
    for (const step of Object.values(STEP_BY_ID)) {
      if (step.area !== area) continue;
      steps[step.id] = "done";
      const completion = applyStepCompletion(journey, step.id, result, items);
      journey = completion.journey;
      items = completion.items;
    }
    journey = { ...journey, steps };
    return {
      ...character,
      items,
      journeys: character.journeys.map((entry) => (entry.id === journey.id ? journey : entry)),
    };
  });
  return result;
}

export function setNpcState(id: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, npcStates: { ...journey.npcStates, [id]: value } }));
}

export function setDialogue(id: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, dialogue: { ...journey.dialogue, [id]: value } }));
}

export function setBossStatus(id: string, status: BossStatus | null): void {
  updateJourney((journey) => {
    const bosses = { ...journey.bosses };
    if (status === null) delete bosses[id];
    else bosses[id] = status;
    return { ...journey, bosses };
  });
}

export function setDecision(id: string, value: string): void {
  updateJourney((journey) => {
    const decisions = { ...journey.decisions };
    if (value) decisions[id] = value;
    else delete decisions[id];
    return { ...journey, decisions };
  });
}

export function setFarmable(id: string, quantity: number, target: number, itemName: string): string[] {
  const acquired: string[] = [];
  updateCharacter((character) => {
    const value = Math.max(0, Math.floor(quantity));
    const farmables = { ...character.farmables, [id]: value };
    const items = { ...character.items };
    if (value >= target && target > 0) {
      const matches = ITEMS_BY_NAME[itemName] ?? [];
      const match = matches.find((item) => !items[item.id]);
      if (match) {
        items[match.id] = true;
        acquired.push(match.name);
      }
    }
    return { ...character, farmables, items };
  });
  return acquired;
}

export function setMaterialStock(id: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, materials: { ...journey.materials, [id]: value } }));
}

export function setFiniteAcquired(id: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, finite: { ...journey.finite, [id]: value } }));
}

export function setMerchant(id: string, purchased: boolean, itemName: string): string[] {
  const acquired: string[] = [];
  updateCharacter((character) => {
    const journey = character.journeys.find((entry) => entry.id === character.journeyId);
    if (!journey) return character;
    const merchants = { ...journey.merchants, [id]: purchased };
    const items = { ...character.items };
    if (purchased) {
      const matches = ITEMS_BY_NAME[itemName] ?? [];
      const match = matches.find((item) => !items[item.id]);
      if (match) {
        items[match.id] = true;
        acquired.push(match.name);
      }
    }
    return {
      ...character,
      items,
      journeys: character.journeys.map((entry) =>
        entry.id === journey.id ? { ...entry, merchants } : entry,
      ),
    };
  });
  return acquired;
}

export function setScarabCollected(id: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, scarabs: { ...journey.scarabs, [id]: value } }));
}

export function setCertification(id: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, certifications: { ...journey.certifications, [id]: value } }));
}

export function setTransitionGate(id: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, transitionGates: { ...journey.transitionGates, [id]: value } }));
}

export function setRemembrance(
  id: string,
  patch: { selectedReward?: string; duplicated?: boolean; consumed?: boolean },
): void {
  updateJourney((journey) => ({
    ...journey,
    remembrances: {
      ...journey.remembrances,
      [id]: { ...journey.remembrances[id], ...patch },
    },
  }));
}

export function setEnding(id: string, patch: Partial<EndingState>): void {
  updateCharacter((character) => ({
    ...character,
    endings: {
      ...character.endings,
      [id]: {
        ...character.endings[id],
        ...patch,
        completedAt: patch.viewed ? nowIso() : character.endings[id]?.completedAt,
        journeyIndex: character.journeys.find((journey) => journey.id === character.journeyId)?.index,
      },
    },
  }));
}

export function setLoreRead(id: string, value: boolean): void {
  updateCharacter((character) => {
    const loreRead = { ...character.loreRead };
    if (value) loreRead[id] = true;
    else delete loreRead[id];
    return { ...character, loreRead };
  });
}

export function setAchievement(id: string, value: boolean): void {
  updateCharacter((character) => {
    const achievements = { ...character.achievements };
    if (value) achievements[id] = true;
    else delete achievements[id];
    return { ...character, achievements };
  });
}

export function setQuestlineStep(id: string, value: boolean): void {
  updateJourney((journey) => {
    const questlineSteps = { ...journey.questlineSteps };
    if (value) questlineSteps[id] = true;
    else delete questlineSteps[id];
    return { ...journey, questlineSteps };
  });
}

export function setNgPlusItem(id: string, value: boolean): void {
  updateJourney((journey) => {
    const ngplusChecklist = { ...journey.ngplusChecklist };
    if (value) ngplusChecklist[id] = true;
    else delete ngplusChecklist[id];
    return { ...journey, ngplusChecklist };
  });
}

export function revealZone(zone: string, value: boolean): void {
  updateJourney((journey) => ({ ...journey, zonesRevealed: { ...journey.zonesRevealed, [zone]: value } }));
}

export function setSpoilerMode(mode: Settings["spoilerMode"]): void {
  commit({ ...state, settings: { ...state.settings, spoilerMode: mode } });
}

export function setSettings(patch: Partial<Settings>): void {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}

export function setClass(classId: string): void {
  const entry = CLASS_BY_ID[classId];
  if (!entry) return;
  updateCharacter((character) => ({
    ...character,
    classId,
    stats: { ...entry.stats },
    archetypeId: "",
    profileId: "",
  }));
}

export function setStat(key: keyof Stats, value: number): void {
  updateCharacter((character) => ({
    ...character,
    stats: { ...character.stats, [key]: Math.max(1, Math.min(99, Math.floor(value))) },
    profileId: "",
  }));
}

export function applyProfile(profileId: string): void {
  const profile = PROFILE_BY_ID[profileId];
  if (!profile) return;
  const loadout = LOADOUTS_BY_BUILD[profile.id]?.find((entry) => entry.type === "Signature") ??
    LOADOUTS_BY_BUILD[profile.id]?.[0];
  updateCharacter((character) => ({
    ...character,
    archetypeId: profile.archetypeId,
    profileId: profile.id,
    stats: { ...profile.stats },
    equipment: loadout ? equipmentFromLoadout(loadout) : character.equipment,
    equipmentMode: loadout?.type === "Optimized" ? "optimized" : loadout?.type === "Fashion" ? "fashion" : "signature",
  }));
}

function equipmentFromLoadout(loadoutIdOrObject: string | { mainWeapon: string; secondaryWeapon: string; offhand: string; shield: string; armor: string[]; talismans: string[]; physick: string[]; packageId: string }): EquipmentState {
  const loadout = typeof loadoutIdOrObject === "string" ? LOADOUT_BY_ID[loadoutIdOrObject] : loadoutIdOrObject;
  if (!loadout) return { ...EMPTY_EQUIPMENT };
  const pkg = SPELL_PACKAGE_BY_ID[loadout.packageId];
  return {
    mainWeapon: loadout.mainWeapon,
    secondaryWeapon: loadout.secondaryWeapon,
    offhand: loadout.offhand,
    shield: loadout.shield,
    armor: tuple(loadout.armor, 4, EMPTY_EQUIPMENT.armor),
    talismans: tuple(loadout.talismans, 4, EMPTY_EQUIPMENT.talismans),
    spells: pkg ? tuple(pkg.slots, 10, EMPTY_EQUIPMENT.spells) : [...EMPTY_EQUIPMENT.spells],
    physick: tuple(loadout.physick, 2, EMPTY_EQUIPMENT.physick),
  };
}

export function applyLoadout(loadoutId: string): void {
  const loadout = LOADOUT_BY_ID[loadoutId];
  if (!loadout) return;
  updateCharacter((character) => ({
    ...character,
    equipment: equipmentFromLoadout(loadout),
    equipmentMode: loadout.type === "Optimized" ? "optimized" : loadout.type === "Fashion" ? "fashion" : "signature",
  }));
}

export function setEquipment(patch: Partial<EquipmentState>): void {
  updateCharacter((character) => ({
    ...character,
    equipment: { ...character.equipment, ...patch },
    equipmentMode: "custom",
  }));
}

export function renameCharacter(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  updateCharacter((character) => ({ ...character, name: trimmed }));
}

export function setItemOwned(id: string, owned: boolean): void {
  updateCharacter((character) => {
    const items = { ...character.items };
    if (owned) items[id] = true;
    else delete items[id];
    return { ...character, items };
  });
}

export function bulkSetItems(ids: string[], owned: boolean): void {
  updateCharacter((character) => {
    const items = { ...character.items };
    for (const id of ids) {
      if (owned) items[id] = true;
      else delete items[id];
    }
    return { ...character, items };
  });
}

export function newJourney(): JourneyState {
  const character = state.characters.find((entry) => entry.id === state.activeCharacterId);
  const nextIndex = Math.max(...(character?.journeys.map((journey) => journey.index) ?? [0])) + 1;
  const journey = emptyJourney(nextIndex);
  if (character) {
    updateCharacter((entry) => ({ ...entry, journeyId: journey.id, journeys: [...entry.journeys, journey] }));
  }
  return journey;
}

export function switchJourney(id: string): void {
  updateCharacter((character) =>
    character.journeys.some((journey) => journey.id === id)
      ? { ...character, journeyId: id }
      : character,
  );
}

export function resetJourney(): void {
  updateCharacter((character) => ({
    ...character,
    journeys: character.journeys.map((journey) =>
      journey.id === character.journeyId
        ? { ...emptyJourney(journey.index, journey.label), id: journey.id, createdAt: journey.createdAt }
        : journey,
    ),
  }));
}

export function addCharacter(name: string): void {
  const character = createCharacter(name.trim() || "Tarnished");
  commit({
    ...state,
    characters: [...state.characters, character],
    activeCharacterId: character.id,
  });
}

export function switchCharacter(id: string): void {
  if (!state.characters.some((character) => character.id === id)) return;
  commit({ ...state, activeCharacterId: id });
}

export function exportState(): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const normalized = normalizeState(parsed);
  if (!normalized) throw new Error("That file is not a compatible companion save.");
  commit(normalized);
}

export function resetAll(): void {
  commit(createDefaultState());
}

export function flushPersistence(): void {
  clearTimeout(persistTimer);
  persistNow();
}
