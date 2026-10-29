import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  CollapsibleCard,
  Disclosure,
  Drawer,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  SearchInput,
  SectionTitle,
  Select,
  Switch,
  TabBar,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { OrnamentRule } from "../components/Art";
import {
  resolveArea,
  setDecisionCheck,
  setItemOwned,
  setMaterialStock,
  setNpcWalkthroughStep,
  setSettings,
  setStepNote,
  setStepStatus,
  setSupplementalStatus,
  setWorldCheck,
  useActiveCharacter,
  useActiveJourney,
  useAppState,
} from "../lib/store";
import { areaSweep } from "../lib/gameplay";
import {
  areaProgress,
  currentAreaName,
  nextRouteStep,
  npcWalkthroughProgress,
  routeProgress,
  stepStatusLabel,
  stepStatusTone,
  supplementalProgress,
} from "../lib/selectors";
import type { Progress } from "../lib/selectors";
import {
  BRANCH_PLAN_DECISIONS,
  CHRONOLOGY_AREAS,
  CRAFTING_MATERIALS,
  ENCOUNTER_BY_ID,
  ITEM_BY_ID,
  ITEM_BY_NORMALIZED_NAME,
  MATERIAL_BY_ID,
  NPC_WALKTHROUGH_SECTIONS,
  NPC_WALKTHROUGH_SECTION_BY_ID,
  NPC_WALKTHROUGH_STEPS,
  NPC_WALKTHROUGH_STEP_BY_ID,
  NPC_WALKTHROUGH_STEP_SECTION,
  OBJECTIVES,
  PHASE_GATE_BY_ID,
  PHASE_GATES,
  ROUTE_AREAS,
  ROUTE_CHRONOLOGY,
  ROUTE_STEPS,
  STEP_BY_ID,
  STEPS_BY_AREA,
  STEPS_BY_PHASE,
  SUPPLEMENTAL,
  SUPPLEMENTAL_BY_AREA,
  SUPPLEMENTAL_BY_ID,
  WORLD_OBJECTS,
  STEP_BY_SOURCE_ID,
  normalizeContentKey,
} from "../lib/data";
import { formatNumber, itemGroupIcon, titleCase } from "../lib/format";
import { navigate, queryString, useRoute } from "../lib/router";
import type {
  AreaSweep,
  Encounter,
  Item,
  NpcWalkthroughSection,
  NpcWalkthroughStep,
  Objective,
  PhaseGate,
  RouteArea,
  RouteStep,
  StepStatus,
  Supplemental,
} from "../lib/types";
import "./journey.css";

type JourneyTab = "route" | "chronology" | "npc";
type StatusFilter = "all" | "pending" | StepStatus;
type RequirementFilter = "all" | "required" | "optional";
type NpcStatusFilter = "all" | "pending" | "done";

const PHASES = ROUTE_CHRONOLOGY.phases;

function journeyHref(values: Record<string, string | undefined>): string {
  return `/journey${queryString(values)}`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function phaseIdForLabel(label: string | undefined): string {
  return PHASES.find((phase) => phase.label === label)?.id ?? PHASES[0].id;
}

function badgeToneForStatus(status: StepStatus | undefined): "success" | "warning" | "info" | "default" {
  const tone = stepStatusTone(status);
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "neutral") return "info";
  return "default";
}

function progressFor(steps: { id: string; required?: boolean }[], statuses: Record<string, StepStatus>): Progress {
  let total = 0;
  let required = 0;
  let done = 0;
  let skipped = 0;
  let deferred = 0;
  let resolved = 0;
  let requiredResolved = 0;
  for (const step of steps) {
    total += 1;
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
  return {
    total,
    required,
    done,
    skipped,
    deferred,
    resolved,
    requiredResolved,
    percent: total ? Math.round((resolved / total) * 100) : 0,
    requiredPercent: required ? Math.round((requiredResolved / required) * 100) : 100,
    complete: requiredResolved === required,
  };
}

interface MissableStats {
  total: number;
  remaining: number;
  resolved: number;
}

function missableStats(steps: RouteStep[], statuses: Record<string, StepStatus>): MissableStats {
  let total = 0;
  let remaining = 0;
  let resolved = 0;
  for (const step of steps) {
    if (!step.missable) continue;
    total += 1;
    const status = statuses[step.id];
    if (status === "done" || status === "skipped") resolved += 1;
    else remaining += 1;
  }
  return { total, remaining, resolved };
}

const NPC_SECTIONS = [...NPC_WALKTHROUGH_SECTIONS].sort((a, b) => a.order - b.order);

interface NpcCounts {
  total: number;
  done: number;
  remaining: number;
  optional: number;
  missable: number;
  missableRemaining: number;
  dlc: number;
  percent: number;
}

function npcCountsFor(
  steps: NpcWalkthroughStep[],
  checks: Record<string, boolean>,
): NpcCounts {
  let done = 0;
  let optional = 0;
  let missable = 0;
  let missableRemaining = 0;
  let dlc = 0;
  for (const step of steps) {
    const checked = Boolean(checks[step.id]);
    if (checked) done += 1;
    if (step.optional) optional += 1;
    if (step.dlc) dlc += 1;
    if (step.badges.some((badge) => badge.toUpperCase() === "MISSABLE")) {
      missable += 1;
      if (!checked) missableRemaining += 1;
    }
  }
  return {
    total: steps.length,
    done,
    remaining: steps.length - done,
    optional,
    missable,
    missableRemaining,
    dlc,
    percent: steps.length ? Math.round((done / steps.length) * 100) : 0,
  };
}

function npcStepSearchText(step: NpcWalkthroughStep, section: NpcWalkthroughSection): string {
  return [
    step.id,
    step.text,
    section.title,
    section.levelRange,
    section.dlc ? "dlc shadow of the erdtree" : "base game",
    ...step.badges,
    ...step.links.flatMap((link) => [link.label, link.url]),
  ]
    .join(" ")
    .toLowerCase();
}

function areasForGate(gate: PhaseGate): RouteArea[] {
  if (!gate.filter.sections.length) return [];
  return ROUTE_AREAS.filter(
    (area) => area.phase === gate.filter.phase && gate.filter.sections.includes(area.sectionId),
  ).sort((a, b) => a.order - b.order);
}

function stepsForGate(gate: PhaseGate): RouteStep[] {
  const allowed = new Set(areasForGate(gate).map((area) => area.name));
  return (STEPS_BY_PHASE[gate.filter.phase] ?? []).filter(
    (step) => !allowed.size || allowed.has(step.area),
  );
}

/**
 * World objects grouped by the route step that resolves them. The atlas ledger
 * stores the Redmaw source id (`w2-1`), so resolve it to the runtime `RW-*`
 * step before grouping; otherwise step completion can never match.
 */
const WORLD_OBJECT_IDS_BY_STEP: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const object of WORLD_OBJECTS) {
    if (!object.routeStepId) continue;
    const step = STEP_BY_ID[object.routeStepId] ?? STEP_BY_SOURCE_ID[object.routeStepId];
    if (!step) continue;
    (map[step.id] ??= []).push(object.id);
  }
  return map;
})();

const MATERIAL_BY_NORMALIZED_NAME: Record<string, string> = Object.fromEntries(
  CRAFTING_MATERIALS.map((material) => [normalizeContentKey(material.name), material.id]),
);

/** Item ids in the sweep are content-pack ids; fall back to a normalized name lookup. */
function resolveSweepItemId(rawId: string | undefined, name: string): string | undefined {
  if (rawId && ITEM_BY_ID[rawId]) return rawId;
  return ITEM_BY_NORMALIZED_NAME[normalizeContentKey(name)]?.id;
}

function resolveSweepMaterialId(rawId: string, name: string): string | undefined {
  if (MATERIAL_BY_ID[rawId]) return rawId;
  return MATERIAL_BY_NORMALIZED_NAME[normalizeContentKey(name)];
}

interface SweepRow {
  key: string;
  label: string;
  note: string;
  itemId?: string;
  materialId?: string;
  owned: boolean;
}

interface SweepGroup {
  id: string;
  title: string;
  rows: SweepRow[];
}

function buildSweepGroups(
  sweep: AreaSweep | undefined,
  ownedItem: (id: string | undefined) => boolean,
  stockedMaterial: (id: string) => boolean,
): SweepGroup[] {
  if (!sweep) return [];
  const merchantRows: SweepRow[] = [];
  for (const merchant of sweep.merchants) {
    for (const item of merchant.items) {
      const itemId = resolveSweepItemId(item.itemId, item.itemName);
      merchantRows.push({
        key: item.id,
        label: item.itemName,
        note: [merchant.merchant, item.price ? `${formatNumber(item.price)} runes` : "", item.stock ?? ""]
          .filter(Boolean)
          .join(" · "),
        itemId,
        owned: ownedItem(itemId),
      });
    }
  }
  const farmableRows: SweepRow[] = sweep.farmables.map((farm) => {
    const itemId = resolveSweepItemId(farm.itemId, farm.name);
    return {
      key: farm.id,
      label: farm.name,
      note: [farm.source, farm.location, `×${formatNumber(farm.targetQuantity)}`].filter(Boolean).join(" · "),
      itemId,
      owned: ownedItem(itemId),
    };
  });
  const unlinkedRows: SweepRow[] = sweep.unlinkedItems.map((item) => {
    const itemId = resolveSweepItemId(item.itemId, item.name);
    return {
      key: item.id,
      label: item.name,
      note: [item.acquisitionType, item.location].filter(Boolean).join(" · "),
      itemId,
      owned: ownedItem(itemId),
    };
  });
  const materialRows: SweepRow[] = sweep.materials.map((material) => {
    const materialId = resolveSweepMaterialId(material.id, material.name);
    return {
      key: material.id,
      label: material.name,
      note: [material.grace, material.earlySource].filter(Boolean).join(" · "),
      materialId,
      owned: materialId ? stockedMaterial(materialId) : false,
    };
  });
  return [
    { id: "merchants", title: "Merchants", rows: merchantRows },
    { id: "farmables", title: "Farmables", rows: farmableRows },
    { id: "unlinked", title: "Loose pickups", rows: unlinkedRows },
    { id: "materials", title: "Materials", rows: materialRows },
  ].filter((group) => group.rows.length > 0);
}

interface LinkedRecordView {
  id: string;
  name: string;
  kind: "item" | "boss" | "record";
  item?: Item;
  boss?: Encounter;
}

function linkedRecordsFor(step: RouteStep): LinkedRecordView[] {
  const seen = new Set<string>();
  const records: LinkedRecordView[] = [];
  for (const id of step.linkedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = ITEM_BY_ID[id];
    if (item) {
      records.push({ id, name: item.name, kind: "item", item });
      continue;
    }
    const boss = ENCOUNTER_BY_ID[id];
    if (boss) {
      records.push({ id, name: boss.name, kind: "boss", boss });
      continue;
    }
    records.push({ id, name: id, kind: "record" });
  }
  const named = new Set(records.map((record) => record.name.toLowerCase()));
  for (const name of step.linkedItemNames) {
    if (named.has(name.toLowerCase())) continue;
    const item = ITEM_BY_NORMALIZED_NAME[normalizeContentKey(name)];
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    named.add(name.toLowerCase());
    records.push({ id: item.id, name: item.name, kind: "item", item });
  }
  return records;
}

function stepSearchText(step: RouteStep): string {
  return [
    step.id,
    step.type,
    step.instruction,
    step.location,
    step.objectiveName,
    step.area,
    step.sectionTitle,
    step.phase,
    step.game,
    step.levelRange,
    step.warning,
    step.prerequisites,
    step.validation,
    ...step.badges,
    ...step.linkedIds,
    ...step.linkedItemNames,
    ...step.links.flatMap((link) => [link.label, link.url]),
  ]
    .join(" ")
    .toLowerCase();
}

function actionSearchText(action: Supplemental): string {
  return [
    action.id,
    action.kind,
    action.area,
    action.category,
    action.action,
    action.trigger,
    action.coverageNote,
    action.notes,
    action.futureJourney,
  ]
    .join(" ")
    .toLowerCase();
}

interface StepGroup {
  objectiveId: string;
  objective: Objective | undefined;
  steps: RouteStep[];
}

interface MissableSectionGroup {
  area: RouteArea;
  steps: RouteStep[];
}

interface ChronologyGroup {
  name: string;
  order: number;
  actions: Supplemental[];
  total: number;
}

interface StepNoteEditorProps {
  savedNote: string;
  onSave: (note: string) => void;
}

function StepNoteEditor({ savedNote, onSave }: StepNoteEditorProps) {
  const [draft, setDraft] = useState(savedNote);
  const dirty = draft !== savedNote;

  const save = () => {
    const normalizedNote = draft.trim() ? draft : "";
    onSave(normalizedNote);
    setDraft(normalizedNote);
  };

  return (
    <div>
      <div className="row-between wrap">
        <span className="field-label">Journey note</span>
        <span className={`tiny ${dirty ? "warning" : "faint"}`}>
          {dirty ? "Unsaved changes" : savedNote ? "Saved to this journey" : "No note saved"}
        </span>
      </div>
      <textarea
        className="textarea"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && dirty) {
            event.preventDefault();
            save();
          }
        }}
        placeholder="Record what happened, a route deviation, or what to check on return."
        aria-label="Journey note for this step"
      />
      <div className="row-between wrap journey-note-actions">
        <span className="tiny faint">Ctrl/Cmd + Enter saves.</span>
        <Button size="sm" icon="check" onClick={save} disabled={!dirty}>
          Save note
        </Button>
      </div>
    </div>
  );
}

export function JourneyPage() {
  const state = useAppState();
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const route = useRoute();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("all");
  const [chronologySearch, setChronologySearch] = useState("");
  const [chronologyStatus, setChronologyStatus] = useState<StatusFilter>("all");
  const [npcSearch, setNpcSearch] = useState("");
  const [npcStatus, setNpcStatus] = useState<NpcStatusFilter>("all");
  const [npcRequirement, setNpcRequirement] = useState<RequirementFilter>("all");
  const [areaSearch, setAreaSearch] = useState("");
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});
  const [resolveOpen, setResolveOpen] = useState(false);
  // The decision ledger only stores explicit "secured" flags, so an unchecked
  // box over an owned reward needs a session-local override to stay unset.
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, boolean>>({});
  const [wideLayout, setWideLayout] = useState(
    () => typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia("(min-width: 1180px)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 1180px)");
    const onChange = () => setWideLayout(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const allAreas = useMemo(
    () => ROUTE_AREAS.filter((area) => area.hasRoute && area.stepCount > 0).sort((a, b) => a.order - b.order),
    [],
  );

  const areasByPhase = useMemo(() => {
    const map = new Map<string, RouteArea[]>();
    for (const phase of PHASES) map.set(phase.label, []);
    for (const area of allAreas) {
      const bucket = map.get(area.phase);
      if (bucket) bucket.push(area);
      else map.set(area.phase, [area]);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [allAreas]);

  const objectiveById = useMemo(
    () => new Map<string, Objective>(OBJECTIVES.map((objective) => [objective.id, objective] as const)),
    [],
  );
  const chronologyOrder = useMemo(
    () => new Map<string, number>(CHRONOLOGY_AREAS.map((area) => [area.name, area.order] as const)),
    [],
  );

  const routeStats = routeProgress(journey);
  const chronologyStats = supplementalProgress(journey);
  const nextStep = nextRouteStep(journey);
  const currentArea = currentAreaName(journey);

  const phaseStats = useMemo(() => {
    const stats: Record<string, Progress> = {};
    for (const phase of PHASES) {
      stats[phase.id] = progressFor(STEPS_BY_PHASE[phase.label] ?? [], journey.steps);
    }
    return stats;
  }, [journey.steps]);

  const phaseMissables = useMemo(() => {
    const stats: Record<string, MissableStats> = {};
    for (const phase of PHASES) {
      stats[phase.id] = missableStats(STEPS_BY_PHASE[phase.label] ?? [], journey.steps);
    }
    return stats;
  }, [journey.steps]);

  const tabParam = route.query.get("tab");
  const actionParam = route.query.get("action");
  const stepParam = route.query.get("step");
  const areaParam = route.query.get("area");
  const phaseParam = route.query.get("phase");
  const gateParam = route.query.get("gate");
  const sectionParam = route.query.get("section");
  const missable = route.query.get("missable") === "1";
  const dlc = route.query.get("dlc") === "1";

  const linkedStep = stepParam ? STEP_BY_ID[stepParam] : undefined;
  const npcLinkedStep = stepParam ? NPC_WALKTHROUGH_STEP_BY_ID[stepParam] : undefined;
  const npcLinkedSection = sectionParam ? NPC_WALKTHROUGH_SECTION_BY_ID[sectionParam] : undefined;
  const matchedArea = areaParam
    ? allAreas.find((area) => area.name === areaParam || area.sectionId === areaParam)
    : undefined;
  const phaseParamMeta = PHASES.find((phase) => phase.id === phaseParam || phase.label === phaseParam);

  const tab: JourneyTab =
    tabParam === "npc" ||
    npcLinkedStep ||
    (npcLinkedSection && !linkedStep && !areaParam && !phaseParam && !gateParam && tabParam !== "route")
      ? "npc"
      : stepParam && linkedStep
        ? "route"
        : tabParam === "chronology"
          ? "chronology"
          : tabParam === "route"
            ? "route"
            : actionParam
              ? "chronology"
              : "route";

  let phaseLabel = linkedStep?.phase ?? matchedArea?.phase ?? phaseParamMeta?.label;
  if (!phaseLabel)
    phaseLabel = nextStep?.phase ?? ROUTE_AREAS.find((area) => area.name === currentArea)?.phase ?? PHASES[0].label;
  const phaseMeta = PHASES.find((phase) => phase.label === phaseLabel) ?? PHASES[0];
  const phaseIndex = PHASES.findIndex((phase) => phase.id === phaseMeta.id);
  const phaseAreas = areasByPhase.get(phaseMeta.label) ?? [];
  const phaseProgress = phaseStats[phaseMeta.id];
  const phaseMissable = phaseMissables[phaseMeta.id];
  const phaseGateCount = PHASE_GATES.filter((gate) => gate.phase === phaseMeta.label).length;

  const fallbackArea = useMemo(() => {
    const currentInPhase = phaseAreas.find((area) => area.name === currentArea);
    if (currentInPhase && !areaProgress(journey, currentInPhase.name).complete) return currentInPhase;
    const nextIncomplete = phaseAreas.find((area) => !areaProgress(journey, area.name).complete);
    return nextIncomplete ?? currentInPhase ?? phaseAreas[phaseAreas.length - 1] ?? allAreas[0];
  }, [allAreas, currentArea, journey, phaseAreas]);

  const activeArea =
    (linkedStep ? phaseAreas.find((area) => area.name === linkedStep.area) : undefined) ??
    (matchedArea && matchedArea.phase === phaseMeta.label ? matchedArea : undefined) ??
    fallbackArea;

  const activeGateFilter = gateParam ? PHASE_GATE_BY_ID[gateParam] : undefined;
  const activeGateSections = useMemo(() => {
    if (!activeGateFilter || !activeGateFilter.filter.sections.length) return undefined;
    return new Set(areasForGate(activeGateFilter).map((area) => area.name));
  }, [activeGateFilter]);

  const phaseMissableMode = missable && !matchedArea && !linkedStep && tab === "route";
  const areaIndex = phaseAreas.findIndex((area) => area.name === activeArea.name);

  const activeProgress = areaProgress(journey, activeArea.name);
  const remainingRequired = activeProgress.required - activeProgress.requiredResolved;
  const pendingSteps = activeProgress.total - activeProgress.done - activeProgress.skipped - activeProgress.deferred;

  const areaSteps = useMemo(
    () => [...(STEPS_BY_AREA[activeArea.name] ?? [])].sort((a, b) => a.order - b.order),
    [activeArea.name],
  );

  const phaseSteps = useMemo(
    () => [...(STEPS_BY_PHASE[phaseMeta.label] ?? [])].sort((a, b) => a.order - b.order),
    [phaseMeta.label],
  );

  const activeAreaMissable = useMemo(() => missableStats(areaSteps, journey.steps), [areaSteps, journey.steps]);

  const activeSweep = useMemo(() => areaSweep(activeArea.name), [activeArea.name]);
  const sweepGroups = useMemo(
    () =>
      buildSweepGroups(
        activeSweep,
        (id) => Boolean(id && character.items[id]),
        (id) => Boolean(journey.materials[id]),
      ),
    [activeSweep, character.items, journey.materials],
  );

  const activeAreaDecisions = useMemo(() => {
    const stepIds = new Set(areaSteps.map((step) => step.id));
    return BRANCH_PLAN_DECISIONS.filter(
      (decision) =>
        decision.area === activeArea.name ||
        (decision.routeStepIds ?? []).some((id) => stepIds.has(id)),
    );
  }, [activeArea.name, areaSteps]);

  const previousJourneys = useMemo(
    () =>
      [...character.journeys]
        .filter((entry) => entry.index < journey.index)
        .sort((a, b) => a.index - b.index)
        .map((entry) => {
          const progress = routeProgress(entry);
          const items = Object.keys(character.itemOrigins).filter(
            (id) => character.itemOrigins[id] === entry.index,
          );
          return {
            journey: entry,
            progress,
            decisionsRecorded: Object.keys(entry.decisions).length,
            decisionsSecured: Object.keys(entry.decisionChecks).length,
            items,
          };
        }),
    [character.itemOrigins, character.journeys, journey.index],
  );

  const scopedSteps = useMemo(() => {
    if (!phaseMissableMode) return areaSteps;
    return phaseSteps.filter((step) => !activeGateSections || activeGateSections.has(step.area));
  }, [activeGateSections, areaSteps, phaseMissableMode, phaseSteps]);

  const filteredSteps = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scopedSteps.filter((step) => {
      const status: StepStatus | undefined = journey.steps[step.id];
      if (missable && !step.missable) return false;
      if (state.settings.hideCompleted && (status === "done" || status === "skipped")) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "pending") {
          if (status !== undefined) return false;
        } else if (status !== statusFilter) {
          return false;
        }
      }
      if (requirementFilter === "required" && !step.required) return false;
      if (requirementFilter === "optional" && step.required) return false;
      if (needle && !stepSearchText(step).includes(needle)) return false;
      return true;
    });
  }, [
    journey.steps,
    missable,
    requirementFilter,
    scopedSteps,
    search,
    state.settings.hideCompleted,
    statusFilter,
  ]);

  const stepGroups = useMemo<StepGroup[]>(() => {
    const grouped = new Map<string, RouteStep[]>();
    for (const step of filteredSteps) {
      const bucket = grouped.get(step.objectiveId);
      if (bucket) bucket.push(step);
      else grouped.set(step.objectiveId, [step]);
    }
    return [...grouped.entries()]
      .map(([objectiveId, steps]) => ({
        objectiveId,
        objective: objectiveById.get(objectiveId),
        steps,
      }))
      .sort((a, b) => (a.steps[0]?.order ?? 0) - (b.steps[0]?.order ?? 0));
  }, [filteredSteps, objectiveById]);

  const missableSectionGroups = useMemo<MissableSectionGroup[]>(() => {
    const grouped = new Map<string, RouteStep[]>();
    for (const step of filteredSteps) {
      const bucket = grouped.get(step.area);
      if (bucket) bucket.push(step);
      else grouped.set(step.area, [step]);
    }
    return [...grouped.entries()]
      .map(([name, steps]) => ({
        area: allAreas.find((area) => area.name === name) ?? {
          name,
          phase: phaseMeta.label,
          levelRange: steps[0]?.levelRange ?? "",
        } as RouteArea,
        steps,
      }))
      .sort((a, b) => a.area.order - b.area.order);
  }, [allAreas, filteredSteps, phaseMeta.label]);

  const chronologyActions = useMemo(
    () => [...SUPPLEMENTAL].sort((a, b) => a.areaOrder - b.areaOrder || a.sourceRow - b.sourceRow),
    [],
  );

  const filteredActions = useMemo(() => {
    const needle = chronologySearch.trim().toLowerCase();
    return chronologyActions.filter((action) => {
      const status: StepStatus | undefined = journey.supplemental[action.id];
      if (chronologyStatus !== "all") {
        if (chronologyStatus === "pending") {
          if (status !== undefined) return false;
        } else if (status !== chronologyStatus) {
          return false;
        }
      }
      if (needle && !actionSearchText(action).includes(needle)) return false;
      return true;
    });
  }, [chronologyActions, chronologySearch, chronologyStatus, journey.supplemental]);

  const chronologyGroups = useMemo<ChronologyGroup[]>(() => {
    const grouped = new Map<string, Supplemental[]>();
    for (const action of filteredActions) {
      const bucket = grouped.get(action.area);
      if (bucket) bucket.push(action);
      else grouped.set(action.area, [action]);
    }
    return [...grouped.entries()]
      .map(([name, actions]) => ({
        name,
        order: chronologyOrder.get(name) ?? 999,
        actions,
        total: (SUPPLEMENTAL_BY_AREA[name] ?? []).length,
      }))
      .sort((a, b) => a.order - b.order);
  }, [chronologyOrder, filteredActions]);

  const npcStats = npcWalkthroughProgress(journey);
  const npcCounts = useMemo(
    () => npcCountsFor(NPC_WALKTHROUGH_STEPS, journey.npcWalkthroughSteps),
    [journey.npcWalkthroughSteps],
  );
  const npcSectionCounts = useMemo(() => {
    const counts: Record<string, NpcCounts> = {};
    for (const section of NPC_SECTIONS) {
      counts[section.id] = npcCountsFor(section.steps, journey.npcWalkthroughSteps);
    }
    return counts;
  }, [journey.npcWalkthroughSteps]);

  const npcDefaultSectionId = NPC_SECTIONS[0]?.id ?? "";
  const npcActiveSection =
    (npcLinkedStep
      ? NPC_WALKTHROUGH_SECTION_BY_ID[NPC_WALKTHROUGH_STEP_SECTION[npcLinkedStep.id] ?? ""]
      : undefined) ??
    npcLinkedSection ??
    NPC_WALKTHROUGH_SECTION_BY_ID[npcDefaultSectionId] ??
    NPC_SECTIONS[0];
  const npcFiltersActive =
    npcSearch.trim().length > 0 || npcStatus !== "all" || npcRequirement !== "all" || missable || dlc;

  const npcFilteredSections = useMemo(() => {
    const needle = npcSearch.trim().toLowerCase();
    return NPC_SECTIONS.map((section) => {
      const steps = [...section.steps]
        .sort((a, b) => a.order - b.order)
        .filter((step) => {
          const checked = Boolean(journey.npcWalkthroughSteps[step.id]);
          const stepMissable = step.badges.some((badge) => badge.toUpperCase() === "MISSABLE");
          if (missable && !stepMissable) return false;
          if (dlc && !step.dlc && !section.dlc) return false;
          if (npcStatus === "pending" && checked) return false;
          if (npcStatus === "done" && !checked) return false;
          if (npcRequirement === "required" && step.optional) return false;
          if (npcRequirement === "optional" && !step.optional) return false;
          if (needle && !npcStepSearchText(step, section).includes(needle)) return false;
          return true;
        });
      return { section, steps };
    }).filter((entry) => entry.steps.length > 0);
  }, [dlc, journey.npcWalkthroughSteps, missable, npcRequirement, npcSearch, npcStatus]);

  const npcMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of npcFilteredSections) counts[entry.section.id] = entry.steps.length;
    return counts;
  }, [npcFilteredSections]);

  const npcDisplaySections =
    npcFiltersActive && !npcLinkedStep && !npcLinkedSection
      ? npcFilteredSections
      : npcFilteredSections.filter((entry) => entry.section.id === npcActiveSection.id);
  const npcVisibleStepCount = npcDisplaySections.reduce((sum, entry) => sum + entry.steps.length, 0);
  const npcBaseSectionCount = NPC_SECTIONS.filter((section) => !section.dlc).length;
  const npcDlcSectionCount = NPC_SECTIONS.length - npcBaseSectionCount;

  const selectedStep = tab === "route" ? linkedStep : undefined;
  const selectedStepStatus: StepStatus | undefined = selectedStep ? journey.steps[selectedStep.id] : undefined;
  const selectedRecords = selectedStep ? linkedRecordsFor(selectedStep) : [];
  const selectedItems = selectedRecords.filter((record) => record.kind === "item");
  const selectedBosses = selectedRecords.filter((record) => record.kind === "boss");
  const selectedOtherRecords = selectedRecords.filter((record) => record.kind === "record");
  const selectedWikiLinks = selectedStep?.links ?? [];
  const selectedActionId = tab === "chronology" ? actionParam : null;
  const selectedAction = selectedActionId ? SUPPLEMENTAL_BY_ID[selectedActionId] : undefined;

  const savedNote = selectedStep ? journey.stepNotes[selectedStep.id] ?? "" : "";

  useEffect(() => {
    if (tab !== "chronology" || !selectedAction) return;
    const element = document.getElementById(`chronology-action-${selectedAction.id}`);
    element?.scrollIntoView({
      block: "center",
      behavior: state.settings.reducedMotion ? "auto" : "smooth",
    });
  }, [selectedAction?.id, state.settings.reducedMotion, tab]);

  useEffect(() => {
    if (!selectedStep) return;
    const element = document.getElementById(`journey-step-${selectedStep.id}`);
    element?.scrollIntoView({
      block: "center",
      behavior: state.settings.reducedMotion ? "auto" : "smooth",
    });
  }, [selectedStep?.id, state.settings.reducedMotion]);

  useEffect(() => {
    if (tab !== "npc" || !npcLinkedStep) return;
    const element = document.getElementById(`npc-step-${npcLinkedStep.id}`);
    element?.scrollIntoView({
      block: "center",
      behavior: state.settings.reducedMotion ? "auto" : "smooth",
    });
  }, [npcLinkedStep?.id, state.settings.reducedMotion, tab]);

  useEffect(() => {
    if (tab !== "npc" || npcLinkedStep || !npcLinkedSection) return;
    const element = document.getElementById(`npc-section-${npcLinkedSection.id}`);
    element?.scrollIntoView({
      block: "start",
      behavior: state.settings.reducedMotion ? "auto" : "smooth",
    });
  }, [npcLinkedSection?.id, npcLinkedStep?.id, state.settings.reducedMotion, tab]);

  const openNextStep = () => {
    if (!nextStep) return;
    navigate(
      journeyHref({
        phase: phaseIdForLabel(nextStep.phase),
        area: nextStep.area,
        step: nextStep.id,
      }),
    );
  };

  const openChronology = () => {
    navigate(journeyHref({ tab: "chronology" }));
  };

  const openNpc = () => {
    navigate(journeyHref({ tab: "npc" }));
  };

  const switchTab = (id: string) => {
    if (id === "npc") openNpc();
    else if (id === "chronology") openChronology();
    else
      navigate(
        journeyHref({
          phase: phaseMeta.id,
          area: phaseMissableMode ? undefined : activeArea.name,
          missable: tab === "route" && missable ? "1" : undefined,
        }),
      );
  };

  const selectPhase = (id: string) => {
    setCollapsedPhases((current) => ({ ...current, [id]: false }));
    navigate(
      journeyHref({
        phase: id,
        missable: missable && !activeGateFilter ? "1" : undefined,
      }),
    );
  };

  const selectNpcSection = (section: NpcWalkthroughSection) => {
    navigate(
      journeyHref({
        tab: "npc",
        section: section.id,
        missable: missable ? "1" : undefined,
        dlc: dlc ? "1" : undefined,
      }),
    );
  };

  const openNpcStep = (step: NpcWalkthroughStep) => {
    navigate(
      journeyHref({
        tab: "npc",
        section: NPC_WALKTHROUGH_STEP_SECTION[step.id],
        step: step.id,
        missable: missable ? "1" : undefined,
        dlc: dlc ? "1" : undefined,
      }),
    );
  };

  const toggleNpcMissable = () => {
    const nextMissable = missable ? undefined : "1";
    const keepDlc = dlc ? "1" : undefined;
    navigate(
      journeyHref({
        tab: "npc",
        section: nextMissable || keepDlc ? undefined : npcActiveSection.id,
        missable: nextMissable,
        dlc: keepDlc,
      }),
    );
  };

  const toggleNpcDlc = () => {
    const nextDlc = dlc ? undefined : "1";
    const keepMissable = missable ? "1" : undefined;
    navigate(
      journeyHref({
        tab: "npc",
        section: nextDlc || keepMissable ? undefined : npcActiveSection.id,
        missable: keepMissable,
        dlc: nextDlc,
      }),
    );
  };

  const resetNpcFilters = () => {
    setNpcSearch("");
    setNpcStatus("all");
    setNpcRequirement("all");
    navigate(journeyHref({ tab: "npc", section: npcActiveSection.id }));
  };

  const selectArea = (area: RouteArea) => {
    navigate(
      journeyHref({
        phase: phaseIdForLabel(area.phase),
        area: area.name,
        missable: missable ? "1" : undefined,
      }),
    );
  };

  const openStep = (step: RouteStep) => {
    navigate(
      journeyHref({
        phase: phaseIdForLabel(step.phase),
        area: step.area,
        step: step.id,
        missable: missable ? "1" : undefined,
      }),
    );
  };

  const closeStep = () => {
    navigate(
      journeyHref({
        phase: phaseMeta.id,
        area: phaseMissableMode ? undefined : activeArea.name,
        missable: missable ? "1" : undefined,
      }),
    );
  };

  const toggleMissable = () => {
    if (missable) {
      navigate(
        journeyHref({
          phase: phaseMeta.id,
          area: phaseMissableMode ? undefined : activeArea.name,
        }),
      );
      return;
    }
    navigate(
      journeyHref({
        phase: phaseMeta.id,
        area: matchedArea ? activeArea.name : undefined,
        missable: "1",
      }),
    );
  };

  const reviewPhaseMissables = () => {
    navigate(journeyHref({ phase: phaseMeta.id, missable: "1" }));
  };

  const reviewGateMissables = (gate: PhaseGate) => {
    navigate(
      journeyHref({
        phase: phaseIdForLabel(gate.filter.phase),
        missable: "1",
        gate: gate.filter.sections.length ? gate.id : undefined,
      }),
    );
  };

  const handleStepStatus = (step: RouteStep, status: StepStatus | null) => {
    const result = setStepStatus(step.id, status);
    if (status === "done") {
      // World objects carry a routeStepId, so a finished route step resolves
      // the matching map entries in the same write. Re-running is a no-op.
      const linkedWorldObjects = (WORLD_OBJECT_IDS_BY_STEP[step.id] ?? []).filter(
        (id) => !journey.worldChecks[id],
      );
      for (const id of linkedWorldObjects) setWorldCheck(id, true);

      const extras: string[] = [];
      if (linkedWorldObjects.length) {
        extras.push(`${plural(linkedWorldObjects.length, "world record")} auto-checked`);
      }
      if (result.acquiredItems.length) extras.push(`${plural(result.acquiredItems.length, "item")} auto-acquired`);
      if (result.defeatedBosses.length) extras.push(`${plural(result.defeatedBosses.length, "boss", "bosses")} auto-recorded`);
      if (result.completedNpcs.length) extras.push(`${plural(result.completedNpcs.length, "NPC")} auto-completed`);
      if (result.pickedUpResources.length) {
        extras.push(`${plural(result.pickedUpResources.length, "resource")} auto-picked up`);
      }
      if (result.scarabs.length) extras.push(`${plural(result.scarabs.length, "scarab")} auto-collected`);
      toast.push(
        [`Step ${step.order} marked done.`, ...(extras.length ? extras : ["No automatic record changes."])].join(" · "),
        "success",
      );
      return;
    }
    if (status === "skipped") {
      toast.push(`Step ${step.order} skipped.`);
      return;
    }
    if (status === "deferred") {
      toast.push(`Step ${step.order} deferred.`);
      return;
    }
    toast.push(`Step ${step.order} reset to pending.`);
  };

  const handleSupplementalStatus = (action: Supplemental, status: StepStatus | null) => {
    setSupplementalStatus(action.id, status);
    if (status === "done") toast.push(`${action.category} recorded as done.`, "success");
    else if (status === "skipped") toast.push(`${action.category} skipped.`);
    else if (status === "deferred") toast.push(`${action.category} deferred.`);
    else toast.push(`${action.category} reset to pending.`);
  };

  const saveArea = () => {
    resolveArea(activeArea.name);
    setResolveOpen(false);
    toast.push(`${activeArea.name}: all ${plural(activeProgress.total, "step")} marked done.`);
  };

  const resetRouteFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRequirementFilter("all");
    if (missable) {
      navigate(
        journeyHref({
          phase: phaseMeta.id,
          area: phaseMissableMode ? undefined : activeArea.name,
        }),
      );
    }
  };

  const resetChronologyFilters = () => {
    setChronologySearch("");
    setChronologyStatus("all");
  };

  const routeFiltersActive = search.trim().length > 0 || statusFilter !== "all" || requirementFilter !== "all" || missable;
  const chronologyFiltersActive = chronologySearch.trim().length > 0 || chronologyStatus !== "all";
  const hideLeaveArea = state.settings.hideCompleted && activeProgress.resolved === activeProgress.total;

  const missableViewGate =
    phaseMeta.id === "base-through-maliketh"
      ? PHASE_GATE_BY_ID["GATE-DLC"]
      : phaseMeta.id === "shadow-of-the-erdtree"
        ? PHASE_GATE_BY_ID["GATE-ASHEN-CAPITAL"]
        : undefined;
  const enterGate = PHASE_GATES.find((gate) => gate.beforeSectionId === activeArea.sectionId);
  const leaveGate = PHASE_GATES.find((gate) => {
    const beforeArea = ROUTE_AREAS.find((area) => area.sectionId === gate.beforeSectionId);
    const beforeIndex = allAreas.findIndex((area) => area.name === beforeArea?.name);
    const activeIndex = allAreas.findIndex((area) => area.name === activeArea.name);
    return beforeIndex === activeIndex + 1;
  });

  const renderFilterCard = (missableView: boolean) => (
    <div className="card card-pad journey-filter-card">
      <div className="journey-filter-row">
        <SearchInput
          className="grow"
          value={search}
          onChange={setSearch}
          placeholder="Search instruction, phase, section, item, boss, wiki link…"
        />
        <Select
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="done">Done</option>
          <option value="skipped">Skipped</option>
          <option value="deferred">Deferred</option>
        </Select>
        <Select
          label="Requirement"
          value={requirementFilter}
          onChange={(event) => setRequirementFilter(event.target.value as RequirementFilter)}
        >
          <option value="all">All steps</option>
          <option value="required">Required only</option>
          <option value="optional">Optional only</option>
        </Select>
      </div>
      <div className="journey-filter-meta">
        <div className="journey-filter-count">
          <span className="small faint">
            {filteredSteps.length} of {scopedSteps.length} steps shown
          </span>
          {missableView ? (
            <span className="journey-missable-toggle is-active" aria-hidden="true">
              <Icon name="alert" size={12} />
              Missables only
              <span className="journey-missable-toggle-count">
                {formatNumber(phaseMissable.remaining)}
              </span>
            </span>
          ) : (
            <button
              type="button"
              className={`journey-missable-toggle${missable ? " is-active" : ""}`}
              aria-pressed={missable}
              onClick={toggleMissable}
            >
              <Icon name="alert" size={12} />
              Missables only
              <span className="journey-missable-toggle-count">
                {formatNumber(phaseMissable.remaining)}
              </span>
            </button>
          )}
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Switch
            checked={state.settings.hideCompleted}
            onChange={(checked) => setSettings({ hideCompleted: checked })}
            label="Hide completed"
          />
          {routeFiltersActive ? (
            <Button variant="ghost" size="sm" icon="x" onClick={resetRouteFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  const renderGate = (gate: PhaseGate) => {
    const gateAreas = areasForGate(gate);
    const stats = missableStats(stepsForGate(gate), journey.steps);
    const severe = gate.severity === "MISSABLE";
    return (
      <section
        key={gate.id}
        className={`card card-pad journey-gate${severe ? " journey-gate--danger" : ""}`}
        aria-label={gate.title}
      >
        <div className="eyebrow">{severe ? "Point of no return" : "Phase gate"}</div>
        <h2 className="journey-gate-title">{gate.title}</h2>
        <p className="journey-gate-message">{gate.message}</p>
        <div className="journey-gate-warning">
          <Icon name="alert" size={14} />
          <span>{gate.warning}</span>
        </div>
        {gateAreas.length ? (
          <div className="journey-gate-sections" aria-label={`${gate.title} affected sections`}>
            {gateAreas.map((area) => {
              const areaMisses = missableStats(STEPS_BY_AREA[area.name] ?? [], journey.steps);
              return (
                <button
                  key={area.name}
                  type="button"
                  className="journey-gate-section"
                  onClick={() =>
                    navigate(
                      journeyHref({
                        phase: phaseIdForLabel(area.phase),
                        area: area.name,
                        missable: "1",
                      }),
                    )
                  }
                >
                  <span className="grow">{area.name}</span>
                  <span className="tiny mono">{areaMisses.remaining} left</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="journey-gate-scope">
            Applies to every flagged step in {gate.filter.phase} ({formatNumber(stats.total)} total).
          </p>
        )}
        <div className="journey-gate-actions">
          <Button variant={severe ? "danger" : "primary"} icon="alert" onClick={() => reviewGateMissables(gate)}>
            Review {formatNumber(stats.remaining)} missable steps
          </Button>
          <Button variant="ghost" icon="map" onClick={() => navigate(journeyHref({ phase: phaseIdForLabel(gate.filter.phase) }))}>
            Open phase
          </Button>
        </div>
      </section>
    );
  };

  const renderStepCard = (step: RouteStep) => {
    const status: StepStatus | undefined = journey.steps[step.id];
    const isCurrent = step.id === nextStep?.id;
    const records = linkedRecordsFor(step);
    const items = records.filter((record) => record.kind === "item");
    const bosses = records.filter((record) => record.kind === "boss");
    const otherRecords = records.filter((record) => record.kind === "record");
    const wikiLinks = step.links;
    const note = journey.stepNotes[step.id];
    const visibleBadges = step.badges.filter((badge) => badge.toUpperCase() !== "MISSABLE");

    return (
      <article
        key={step.id}
        id={`journey-step-${step.id}`}
        className={`step-card journey-step${status === "done" ? " is-done" : ""}${isCurrent ? " is-current" : ""}${
          step.missable ? " is-missable" : ""
        }${selectedStep?.id === step.id ? " is-selected" : ""}`}
      >
        <div className="step-num" aria-hidden="true">
          {formatNumber(step.order)}
        </div>
        <div className="journey-step-body">
          <div className="journey-step-badges">
            <Badge tone="accent">{step.type}</Badge>
            <Badge tone={step.required ? "warning" : "default"}>{step.required ? "Required" : "Optional"}</Badge>
            <Badge tone={badgeToneForStatus(status)}>{stepStatusLabel(status)}</Badge>
            {step.missable ? (
              <Badge tone="danger" className="journey-missable-badge">
                <Icon name="alert" size={10} /> Missable
              </Badge>
            ) : null}
            {visibleBadges.map((badge) => (
              <Badge key={badge} tone={badge === "🏆" ? "accent" : "default"}>
                {badge}
              </Badge>
            ))}
            {isCurrent ? <Badge tone="accent">Next up</Badge> : null}
          </div>

          <div className="journey-step-context">
            <span className="journey-step-phase">{step.phase}</span>
            <span>{step.sectionTitle}</span>
            {step.levelRange ? <span>{step.levelRange}</span> : null}
            <span>{step.game}</span>
            <span className="mono">#{formatNumber(step.order)}</span>
          </div>

          <p className="step-instruction">{step.instruction}</p>

          <div className="step-meta">
            {step.location ? (
              <span>
                <Icon name="map" size={11} /> {step.location}
              </span>
            ) : null}
            {step.estimatedTime ? (
              <span>
                <Icon name="clock" size={11} /> {step.estimatedTime}
              </span>
            ) : null}
          </div>

          {step.missable ? (
            <div className="journey-step-warning journey-step-warning--danger">
              <Icon name="alert" size={13} />
              <span>
                <strong>MISSABLE.</strong>{" "}
                {step.warning ||
                  "This step is flagged as missable by the route source. Resolve it before advancing the phase."}
              </span>
            </div>
          ) : step.warning ? (
            <div className="step-warning">
              <Icon name="alert" size={12} />
              <span>{step.warning}</span>
            </div>
          ) : null}

          {step.prerequisites ? (
            <div className="journey-prereq tiny faint">
              <Icon name="lock" size={11} />
              <span>Prerequisite: {step.prerequisites}</span>
            </div>
          ) : null}

          {records.length || wikiLinks.length ? (
            <div className="tag-list journey-step-links">
              {items.slice(0, 3).map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="chip"
                  onClick={() => navigate(`/collection?item=${encodeURIComponent(record.id)}`)}
                  title={record.name}
                >
                  <Icon name={itemGroupIcon(record.item?.group ?? "Tool")} size={11} />
                  {record.name}
                </button>
              ))}
              {items.length > 3 ? <span className="chip">+{items.length - 3} items</span> : null}
              {bosses.length ? (
                <button
                  type="button"
                  className="chip"
                  onClick={() => navigate(`/bosses?encounter=${encodeURIComponent(bosses[0].id)}`)}
                  title={bosses.map((boss) => boss.name).join(", ")}
                >
                  <Icon name="skull" size={11} />
                  {plural(bosses.length, "linked boss", "linked bosses")}
                </button>
              ) : null}
              {otherRecords.length ? (
                <span className="chip" title={otherRecords.map((record) => record.id).join(", ")}>
                  <Icon name="layers" size={11} />
                  {plural(otherRecords.length, "other record")}
                </span>
              ) : null}
              {wikiLinks.slice(0, 2).map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  className="chip journey-wiki-chip"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.url}
                >
                  <Icon name="external" size={11} />
                  {link.label}
                </a>
              ))}
              {wikiLinks.length > 2 ? (
                <button type="button" className="chip" onClick={() => openStep(step)}>
                  +{wikiLinks.length - 2} wiki links
                </button>
              ) : null}
            </div>
          ) : null}

          {note ? (
            <div className="journey-step-note">
              <Icon name="scroll" size={11} />
              <span className="truncate">{note}</span>
            </div>
          ) : null}
        </div>
        <div className="step-actions journey-step-actions">
          <button
            type="button"
            className={`journey-step-btn${status === "done" ? " is-done" : ""}`}
            aria-label={`Mark step ${step.order} done`}
            title="Mark done"
            onClick={() => handleStepStatus(step, "done")}
          >
            <Icon name="check" size={15} />
          </button>
          <button
            type="button"
            className={`journey-step-btn${status === "skipped" ? " is-active" : ""}`}
            aria-label={`Skip step ${step.order}`}
            title="Skip"
            onClick={() => handleStepStatus(step, "skipped")}
          >
            <Icon name="x" size={15} />
          </button>
          <button
            type="button"
            className={`journey-step-btn${status === "deferred" ? " is-active" : ""}`}
            aria-label={`Defer step ${step.order}`}
            title="Defer"
            onClick={() => handleStepStatus(step, "deferred")}
          >
            <Icon name="clock" size={15} />
          </button>
          <button
            type="button"
            className="journey-step-btn"
            aria-label={`Undo step ${step.order}`}
            title="Undo"
            disabled={status === undefined}
            onClick={() => handleStepStatus(step, null)}
          >
            <Icon name="refresh" size={15} />
          </button>
          <Button
            variant="ghost"
            size="sm"
            icon="eye"
            aria-label={`Open details for step ${step.order}`}
            onClick={() => openStep(step)}
          >
            Details
          </Button>
        </div>
      </article>
    );
  };

  const renderNpcStepCard = (step: NpcWalkthroughStep, section: NpcWalkthroughSection) => {
    const checked = Boolean(journey.npcWalkthroughSteps[step.id]);
    const stepMissable = step.badges.some((badge) => badge.toUpperCase() === "MISSABLE");
    return (
      <article
        key={step.id}
        id={`npc-step-${step.id}`}
        className={`step-card journey-step journey-npc-step${checked ? " is-done" : ""}${
          stepMissable ? " is-missable" : ""
        }${npcLinkedStep?.id === step.id ? " is-selected" : ""}`}
      >
        <Checkbox
          className="journey-npc-check"
          checked={checked}
          onChange={(value) => setNpcWalkthroughStep(step.id, value)}
          label={
            <span className="sr-only">
              Mark {section.title} step {step.order} {checked ? "pending" : "done"}
            </span>
          }
        />
        <div className="journey-step-body">
          <div className="journey-step-badges">
            <Badge tone="accent">{section.title}</Badge>
            <Badge tone={step.optional ? "default" : "warning"}>
              {step.optional ? "Optional" : "Required"}
            </Badge>
            {stepMissable ? (
              <Badge tone="danger">
                <Icon name="alert" size={10} /> Missable
              </Badge>
            ) : null}
            {step.dlc ? <Badge tone="info">DLC</Badge> : null}
            {checked ? <Badge tone="success">Checked</Badge> : null}
          </div>
          <p className="step-instruction">{step.text}</p>
          <div className="journey-step-context">
            <span>
              Step {step.order} of {section.steps.length}
            </span>
            <span>{section.levelRange || "Level range not recorded"}</span>
            <span>{section.dlc ? "Shadow of the Erdtree" : "Base game"}</span>
          </div>
          {step.links.length ? (
            <div className="tag-list journey-step-links">
              {step.links.map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  className="chip journey-wiki-chip"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.url}
                >
                  <Icon name="external" size={11} />
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="journey-npc-step-actions">
          <span className="journey-npc-step-order mono">
            {section.order}.{step.order}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon="target"
            aria-label={`Focus ${section.title} step ${step.order}`}
            onClick={() => openNpcStep(step)}
          >
            Focus
          </Button>
        </div>
      </article>
    );
  };

  const stepGroupsContent = stepGroups.map((group) => (
    <section className="journey-objective" key={group.objectiveId}>
      <div className="journey-objective-head">
        <div className="grow">
          <div className="eyebrow">
            {phaseMeta.label} · Objective {group.objective?.order ?? group.steps[0]?.objectiveOrder ?? ""}
          </div>
          <h3 className="journey-objective-title">
            {group.objective?.name ?? group.steps[0]?.objectiveName ?? group.objectiveId}
          </h3>
          {group.objective?.requirement ? <p className="journey-objective-note">{group.objective.requirement}</p> : null}
        </div>
        <Badge>{plural(group.steps.length, "step")}</Badge>
      </div>
      <div className="step-list">{group.steps.map((step) => renderStepCard(step))}</div>
    </section>
  ));

  const missableGroupsContent = missableSectionGroups.map((group) => {
    const sectionStats = missableStats(STEPS_BY_AREA[group.area.name] ?? [], journey.steps);
    return (
      <section className="journey-missable-section" key={group.area.name}>
        <div className="journey-missable-section-head">
          <div className="grow">
            <div className="eyebrow">{group.area.phase}</div>
            <h3 className="journey-objective-title">{group.area.name}</h3>
            <p className="journey-objective-note">
              {sectionStats.remaining} of {sectionStats.total} missables still unresolved
              {group.area.levelRange ? ` · ${group.area.levelRange}` : ""}
            </p>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <Badge tone={sectionStats.remaining ? "danger" : "success"}>
              {sectionStats.remaining ? `${sectionStats.remaining} remaining` : "Clear"}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              icon="map"
              onClick={() => {
                navigate(
                  journeyHref({
                    phase: phaseIdForLabel(group.area.phase),
                    area: group.area.name,
                    missable: "1",
                  }),
                );
              }}
            >
              Open section
            </Button>
          </div>
        </div>
        <div className="step-list">{group.steps.map((step) => renderStepCard(step))}</div>
      </section>
    );
  });

  const npcSectionsContent = npcDisplaySections.map(({ section, steps }) => {
    const counts = npcSectionCounts[section.id];
    return (
      <section
        className="journey-npc-section"
        id={`npc-section-${section.id}`}
        key={section.id}
      >
        <div className="journey-npc-section-head">
          <div className="grow">
            <div className="eyebrow">
              Section {section.order} of {NPC_SECTIONS.length} ·{" "}
              {section.dlc ? "Shadow of the Erdtree" : "Base game"}
            </div>
            <h2 className="journey-objective-title">{section.title}</h2>
            <p className="journey-objective-note">
              {section.levelRange || "Level range not recorded"} · {plural(counts.total, "step")} ·{" "}
              {counts.optional} optional · {counts.missable} missable
            </p>
          </div>
          <div className="journey-npc-section-progress">
            <Badge tone={counts.remaining ? "default" : "success"}>
              {counts.done} / {counts.total} checked
            </Badge>
            <ProgressBar
              value={counts.percent}
              label={`${counts.done} of ${counts.total} steps checked`}
            />
          </div>
        </div>
        {section.notes?.length ? (
          <div className="journey-npc-notes">
            {section.notes.map((note, index) => (
              <p className="step-warning journey-npc-note" key={`${section.id}-note-${index}`}>
                <Icon name="alert" size={12} />
                <span>{note}</span>
              </p>
            ))}
          </div>
        ) : null}
        <div className="step-list">{steps.map((step) => renderNpcStepCard(step, section))}</div>
      </section>
    );
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Guided journey`}
        title="Journey"
        description={`${formatNumber(routeStats.total)} route steps in three phases. Use the tabs to switch route, chronology, or NPC walkthrough.`}
        actions={
          <Button variant="primary" icon="target" onClick={openNextStep} disabled={!nextStep}>
            {nextStep ? "Continue route" : "Route complete"}
          </Button>
        }
      />

      <div className="journey-shell">
        <div className="journey-tabbar">
          <TabBar
            items={[
              { id: "route", label: "Full route", count: routeStats.total },
              { id: "chronology", label: "Companion chronology", count: chronologyStats.total },
              { id: "npc", label: "NPC walkthrough", count: npcStats.total },
            ]}
            value={tab}
            onChange={switchTab}
          />
        </div>

        {tab === "route" ? (
          <>
            <section className="card card-pad journey-phase-tabs" aria-label="Route phases">
              <div className="row-between wrap">
                <div className="eyebrow">Route phases</div>
                <Badge tone={nextStep ? "info" : "success"}>
                  {nextStep ? `Next · ${nextStep.phase}` : "Full route closed"}
                </Badge>
              </div>
              <Disclosure title="How this view works" tone="muted" icon="book">
                <p className="journey-disclosure-copy">
                  {formatNumber(routeStats.total)} steps in three canonical phases: base game through Maliketh, the
                  entire Shadow of the Erdtree, then the base-game endgame. Maliketh closes the pre-DLC phase, so the
                  DLC plays in full before the Ashen Capital.{" "}
                  {formatNumber(
                    Object.values(phaseMissables).reduce((sum, stats) => sum + stats.total, 0),
                  )}{" "}
                  steps are flagged missable. Area sweeps and route decisions sit under each section; the companion
                  chronology and NPC walkthrough stay separate tracking layers.
                </p>
              </Disclosure>
              <div className="journey-phase-tab-row" role="tablist" aria-label="Select route phase">
                {PHASES.map((phase, index) => {
                  const stats = phaseStats[phase.id];
                  const misses = phaseMissables[phase.id];
                  const selected = phase.id === phaseMeta.id;
                  const isCurrent = nextStep ? phase.label === nextStep.phase : index === PHASES.length - 1;
                  return (
                    <button
                      key={phase.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`journey-phase-tab${selected ? " is-selected" : ""}${isCurrent ? " is-current" : ""}`}
                      onClick={() => selectPhase(phase.id)}
                    >
                      <span className="journey-phase-tab-head">
                        <span className="journey-phase-tab-index">Phase {index + 1}</span>
                        {stats.complete ? (
                          <Badge tone="success">Complete</Badge>
                        ) : isCurrent ? (
                          <Badge tone="accent">Current</Badge>
                        ) : (
                          <Badge>Upcoming</Badge>
                        )}
                      </span>
                      <span className="journey-phase-tab-label">{phase.label}</span>
                      <span className="journey-phase-tab-meta">
                        {formatNumber(stats.resolved)} / {formatNumber(stats.total)} steps ·{" "}
                        {(areasByPhase.get(phase.label) ?? []).length} sections
                      </span>
                      <ProgressBar value={stats.requiredPercent} />
                      <span className={`journey-phase-tab-missable${misses.remaining ? " has-missables" : ""}`}>
                        <Icon name={misses.remaining ? "alert" : "check"} size={11} />
                        {misses.remaining
                          ? `${formatNumber(misses.remaining)} missable steps remaining`
                          : misses.total
                            ? "All missables resolved"
                            : "No missables flagged"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="journey-layout">
              <aside className="journey-side">
                {/* Remount on breakpoint changes so the rail's open state follows the layout width. */}
                <CollapsibleCard
                  key={`route-rail-${wideLayout}`}
                  title="Route sections"
                  note={`${allAreas.length} sections · ${formatNumber(routeStats.total)} steps`}
                  defaultOpen={wideLayout}
                  className="journey-rail-card"
                >
                  <div className="journey-rail-search">
                    <SearchInput
                      value={areaSearch}
                      onChange={setAreaSearch}
                      placeholder="Find a section…"
                    />
                  </div>
                  <div className="journey-rail-scroll">
                    {PHASES.map((phase) => {
                      const areas = (areasByPhase.get(phase.label) ?? []).filter((area) =>
                        `${area.name} ${area.levelRange} ${area.game}`
                          .toLowerCase()
                          .includes(areaSearch.trim().toLowerCase()),
                      );
                      if (!areas.length) return null;
                      const stats = phaseStats[phase.id];
                      const misses = phaseMissables[phase.id];
                      const collapseState = collapsedPhases[phase.id];
                      const open =
                        Boolean(areaSearch.trim()) ||
                        (collapseState === undefined ? phase.id === phaseMeta.id : !collapseState);
                      return (
                        <section className="journey-rail-phase" key={phase.id}>
                          <button
                            type="button"
                            className={`journey-rail-phase-head${open ? " is-open" : ""}`}
                            aria-expanded={open}
                            onClick={() =>
                              setCollapsedPhases((current) => ({ ...current, [phase.id]: open }))
                            }
                          >
                            <span className="grow">
                              <span className="journey-rail-phase-label">{phase.label}</span>
                              <span className="journey-rail-phase-meta">
                                {formatNumber(stats.resolved)}/{formatNumber(stats.total)} ·{" "}
                                {misses.remaining ? `${formatNumber(misses.remaining)} missable` : "no missables left"}
                              </span>
                            </span>
                            <Icon name="chevronDown" size={13} />
                          </button>
                          {open ? (
                            <div className="journey-rail-phase-body">
                              {areas.map((area) => {
                                const progress = areaProgress(journey, area.name);
                                const areaMisses = missableStats(STEPS_BY_AREA[area.name] ?? [], journey.steps);
                                const isActive = !phaseMissableMode && area.name === activeArea.name;
                                const isCurrent = area.name === currentArea;
                                return (
                                  <button
                                    key={area.name}
                                    type="button"
                                    className={`area-row journey-area-item${isActive ? " current" : ""}${
                                      areaMisses.remaining ? " has-missables" : ""
                                    }`}
                                    aria-current={isActive ? "page" : undefined}
                                    onClick={() => selectArea(area)}
                                  >
                                    <span className="journey-area-main">
                                      <span className="journey-area-top">
                                        <span className="area-name grow">{area.name}</span>
                                        {isCurrent ? (
                                          <>
                                            <span className="journey-current-dot" aria-hidden="true" />
                                            <span className="sr-only">Current journey section</span>
                                          </>
                                        ) : null}
                                        <span className="tiny faint mono">
                                          {progress.requiredResolved}/{progress.required}
                                        </span>
                                      </span>
                                      <span className="journey-area-sub tiny faint">
                                        {area.levelRange || area.game} · {progress.resolved}/{progress.total} resolved
                                      </span>
                                      <ProgressBar value={progress.requiredPercent} />
                                      {areaMisses.remaining ? (
                                        <span className="journey-area-missable">
                                          <Icon name="alert" size={10} /> {areaMisses.remaining} missable
                                        </span>
                                      ) : null}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                  <div className="journey-rail-foot tiny faint">
                    <span className="journey-current-dot" aria-hidden="true" />
                    Current journey section
                  </div>
                  {activeArea.name !== currentArea ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="target"
                      className="journey-jump-button"
                      onClick={() =>
                        navigate(
                          journeyHref({
                            phase: phaseIdForLabel(nextStep?.phase ?? phaseMeta.label),
                            area: currentArea,
                          }),
                        )
                      }
                    >
                      Jump to {currentArea}
                    </Button>
                  ) : null}
                </CollapsibleCard>
              </aside>

              <div className="journey-main">
                <section
                  className={`card card-pad journey-phase-head${
                    phaseMeta.id === "base-endgame" ? " journey-phase-head--danger" : ""
                  }`}
                  aria-label={`Phase ${phaseIndex + 1}: ${phaseMeta.label}`}
                >
                  <div className="journey-phase-head-top">
                    <div className="grow">
                      <div className="eyebrow">
                        Phase {phaseIndex + 1} of {PHASES.length} · {phaseAreas.length} sections
                      </div>
                      <h2 className="journey-phase-title">{phaseMeta.label}</h2>
                    </div>
                    {phaseMeta.id === "base-endgame" ? <Badge tone="danger">Point of no return</Badge> : null}
                  </div>

                  <div className="journey-phase-stats">
                    <span>
                      <strong>{formatNumber(phaseProgress.resolved)}</strong> / {formatNumber(phaseProgress.total)} steps
                    </span>
                    <span className={phaseMissable.remaining ? "danger" : ""}>
                      <Icon name={phaseMissable.remaining ? "alert" : "check"} size={12} />
                      {phaseMissable.remaining
                        ? `${formatNumber(phaseMissable.remaining)} missable left`
                        : "No unresolved missables"}
                    </span>
                    <span>
                      <Icon name="lock" size={12} />
                      {plural(phaseGateCount, "phase gate")}
                    </span>
                  </div>

                  <ProgressBar
                    value={phaseProgress.requiredPercent}
                    label={`${phaseProgress.requiredResolved} / ${phaseProgress.required} required steps`}
                    detail={`${phaseProgress.done} done · ${phaseProgress.skipped} skipped · ${phaseProgress.deferred} deferred`}
                  />

                  {phaseMeta.id === "base-endgame" ? (
                    <div className="journey-phase-warning">
                      <Icon name="alert" size={14} />
                      <span>
                        Endgame phase. The capital is already ash: pre-DLC missables can no longer be recovered once
                        this phase begins.
                      </span>
                    </div>
                  ) : null}
                </section>

                {activeGateFilter && phaseMissableMode ? renderGate(activeGateFilter) : null}
                {phaseMissableMode && !activeGateFilter && missableViewGate
                  ? renderGate(missableViewGate)
                  : null}
                {enterGate && !phaseMissableMode ? renderGate(enterGate) : null}

                {phaseMissableMode ? (
                  <>
                  <section className="card card-pad journey-missables-head">
                    <div className="row-between wrap">
                      <div>
                        <div className="eyebrow">Missable filter · {phaseMeta.label}</div>
                        <h2 className="journey-area-title">Missables in this phase</h2>
                        <p className="journey-area-description">
                          {formatNumber(phaseMissable.remaining)} unresolved of{" "}
                          {formatNumber(phaseMissable.total)} flagged steps
                          {activeGateFilter ? ` · restricted to ${activeGateFilter.title}` : ""}. Mark each one done or
                          skipped before crossing the phase gate.
                        </p>
                      </div>
                      <div className="journey-missables-actions">
                        <Badge tone={phaseMissable.remaining ? "danger" : "success"}>
                          {formatNumber(phaseMissable.remaining)} remaining
                        </Badge>
                        <Button
                          variant="ghost"
                          icon="map"
                          onClick={() => navigate(journeyHref({ phase: phaseMeta.id }))}
                        >
                          Leave missable view
                        </Button>
                      </div>
                    </div>
                    <div className="journey-missables-meter">
                      <ProgressBar
                        value={
                          phaseMissable.total
                            ? Math.round((phaseMissable.resolved / phaseMissable.total) * 100)
                            : 100
                        }
                        tone={phaseMissable.remaining ? "accent" : "success"}
                        className={phaseMissable.remaining ? "journey-missable-progress" : undefined}
                        label={`${phaseMissable.resolved} of ${phaseMissable.total} flagged missables resolved`}
                      />
                    </div>
                    {activeGateFilter ? (
                      <div className="journey-gate-filter-note">
                        <Icon name="filter" size={12} />
                        Gate filter active: {activeGateFilter.filter.sectionTitles.join(" · ") || phaseMeta.label}
                      </div>
                    ) : null}
                  </section>
                  {renderFilterCard(true)}
                  </>
                ) : (
                  <>
                    <section className="card card-pad journey-area-head">
                      <OrnamentRule label={`Phase ${phaseIndex + 1} · Section ${areaIndex + 1} of ${phaseAreas.length}`} />
                      <div className="journey-area-title-row">
                        <div className="grow">
                          <div className="eyebrow">
                            {phaseMeta.label}
                            {activeArea.name === currentArea ? " · Current section" : ""}
                          </div>
                          <h2 className="journey-area-title">{activeArea.name}</h2>
                        </div>
                        <Button
                          variant="danger"
                          icon="check"
                          disabled={activeProgress.done === activeProgress.total}
                          onClick={() => setResolveOpen(true)}
                        >
                          {remainingRequired > 0 ? "Resolve remaining required steps" : "Resolve remaining steps"}
                        </Button>
                      </div>

                      <dl className="journey-level-guide">
                        <div>
                          <dt>Recommended level</dt>
                          <dd>{activeArea.levelRange || activeArea.game}</dd>
                        </div>
                        <div>
                          <dt>Required steps</dt>
                          <dd>
                            {activeProgress.requiredResolved} / {activeProgress.required}
                          </dd>
                        </div>
                        <div>
                          <dt>Steps</dt>
                          <dd>
                            {activeProgress.resolved} / {activeProgress.total}
                          </dd>
                        </div>
                        <div>
                          <dt>Missables left</dt>
                          <dd className={activeAreaMissable.remaining ? "danger" : undefined}>
                            {activeAreaMissable.total
                              ? `${activeAreaMissable.remaining} of ${activeAreaMissable.total}`
                              : "None recorded"}
                          </dd>
                        </div>
                      </dl>

                      <div className="journey-area-badges">
                        <Badge tone={activeProgress.complete ? "success" : "warning"}>
                          {activeProgress.complete
                            ? "Required steps complete"
                            : `${remainingRequired} required step${remainingRequired === 1 ? "" : "s"} left`}
                        </Badge>
                        <Badge tone={activeArea.dlc ? "info" : "default"}>{activeArea.game}</Badge>
                        {pendingSteps ? <Badge tone="info">{pendingSteps} pending</Badge> : null}
                      </div>

                      <ProgressBar
                        value={activeProgress.requiredPercent}
                        label={`${activeProgress.requiredResolved} / ${activeProgress.required} required steps`}
                        detail={`${activeProgress.done} done · ${activeProgress.skipped} skipped · ${activeProgress.deferred} deferred`}
                      />

                      <Disclosure
                        title="Section notes"
                        icon="scroll"
                        summary={activeArea.description || activeArea.validation ? "Summary and validation" : undefined}
                      >
                        <p className="journey-area-description">
                          {activeArea.description ||
                            activeArea.levelRange ||
                            "No area summary is recorded in the content pack."}
                        </p>
                        <div className="journey-validation">
                          <Icon name="scroll" size={12} />
                          <span>
                            {activeArea.validation || "No separate area validation is recorded in the content pack."}
                          </span>
                        </div>
                      </Disclosure>
                    </section>

                    {renderFilterCard(false)}
                  </>
                )}

                {phaseMissableMode ? (
                  filteredSteps.length ? (
                    <div className="journey-missable-sections">{missableGroupsContent}</div>
                  ) : (
                    <EmptyState
                      icon={phaseMissable.remaining ? "search" : "check"}
                      title={
                        phaseMissable.remaining
                          ? "No missable steps match these filters"
                          : "No unresolved missables in this phase"
                      }
                      description={
                        phaseMissable.remaining
                          ? "Adjust the search, status, or requirement filter, or open a specific section from the rail."
                          : "Every flagged missable in this phase is resolved. Continue the route or review the phase gate."
                      }
                      action={
                        <div className="row wrap" style={{ justifyContent: "center", gap: 8 }}>
                          <Button icon="refresh" onClick={resetRouteFilters}>
                            Clear filters
                          </Button>
                          <Button variant="ghost" icon="map" onClick={() => selectPhase(phaseMeta.id)}>
                            Return to sections
                          </Button>
                        </div>
                      }
                    />
                  )
                ) : stepGroups.length ? (
                  <div className="journey-objectives">{stepGroupsContent}</div>
                ) : (
                  <EmptyState
                    icon={hideLeaveArea ? "check" : "search"}
                    title={hideLeaveArea ? "All steps in this section are resolved" : "No steps match these filters"}
                    description={
                      hideLeaveArea
                        ? "Turn off Hide completed to review the steps in this section."
                        : "Adjust the search, status, or requirement filter to bring steps back into view."
                    }
                    action={
                      <div className="row wrap" style={{ justifyContent: "center", gap: 8 }}>
                        <Button
                          icon="refresh"
                          onClick={() => {
                            resetRouteFilters();
                            if (state.settings.hideCompleted) setSettings({ hideCompleted: false });
                          }}
                        >
                          Clear filters and show completed
                        </Button>
                      </div>
                    }
                  />
                )}

                {!phaseMissableMode ? (
                  <>
                    <section className="card card-pad journey-sweep" aria-label={`${activeArea.name} area sweep`}>
                      <SectionTitle
                        title="Area sweep"
                        note={
                          sweepGroups.length
                            ? `${sweepGroups.reduce((sum, group) => sum + group.rows.length, 0)} pickups and purchases`
                            : "No sweep recorded"
                        }
                      />
                      {activeSweep ? (
                        <div className="journey-counts">
                          <span>
                            <strong>{activeSweep.counts.merchants}</strong> merchants
                          </span>
                          <span>
                            <strong>{activeSweep.counts.merchantItems}</strong> merchant items
                          </span>
                          <span>
                            <strong>{activeSweep.counts.farmables}</strong> farmables
                          </span>
                          <span>
                            <strong>{activeSweep.counts.unlinkedItems}</strong> loose pickups
                          </span>
                          <span>
                            <strong>{activeSweep.counts.materials}</strong> materials
                          </span>
                        </div>
                      ) : null}
                      {sweepGroups.length ? (
                        <div className="journey-sweep-groups">
                          {sweepGroups.map((group) => {
                            const owned = group.rows.filter((row) => row.owned).length;
                            return (
                              <Disclosure
                                key={group.id}
                                title={group.title}
                                icon="bag"
                                summary={`${owned} / ${group.rows.length} owned`}
                              >
                                <ul className="journey-sweep-list">
                                  {group.rows.map((row) => (
                                    <li key={row.key} className={`journey-sweep-row${row.owned ? " is-owned" : ""}`}>
                                      {row.materialId || row.itemId ? (
                                        <Checkbox
                                          checked={row.owned}
                                          onChange={(value) => {
                                            if (row.materialId) setMaterialStock(row.materialId, value);
                                            else if (row.itemId) setItemOwned(row.itemId, value);
                                          }}
                                          label={
                                            <span className="journey-sweep-label">
                                              <span className="journey-sweep-name">{row.label}</span>
                                              {row.note ? <span className="tiny faint">{row.note}</span> : null}
                                            </span>
                                          }
                                        />
                                      ) : (
                                        <span className="journey-sweep-label">
                                          <span className="journey-sweep-name">{row.label}</span>
                                          {row.note ? <span className="tiny faint">{row.note}</span> : null}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </Disclosure>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="journey-quiet-note">
                            No merchant, farmable, pickup, or material sweep is recorded for this section yet.
                          </p>
                        )}
                      </section>

                      <section className="card card-pad journey-decisions" aria-label={`${activeArea.name} decisions`}>
                        <SectionTitle
                          title="Route decisions"
                          note={
                            activeAreaDecisions.length
                              ? `${activeAreaDecisions.length} tied to this section`
                              : "None tied to this section"
                          }
                        />
                        {activeAreaDecisions.length ? (
                          <div className="journey-decision-list">
                            {activeAreaDecisions.map((decision) => {
                              const ownedReward = decision.rewards.some(
                                (reward) => Boolean(reward.itemId) && Boolean(character.items[reward.itemId]),
                              );
                              const checked =
                                decisionOverrides[decision.decisionId] ??
                                journey.decisionChecks[decision.decisionId] ??
                                ownedReward;
                              return (
                                <article className="journey-decision" key={decision.decisionId}>
                                  <div className="row-between wrap" style={{ gap: 8 }}>
                                    <div className="grow">
                                      <div className="eyebrow mono">{decision.decisionId}</div>
                                      <h3 className="journey-decision-title">{decision.title}</h3>
                                    </div>
                                    <Checkbox
                                      checked={checked}
                                      onChange={(value) => {
                                        setDecisionCheck(decision.decisionId, value);
                                        setDecisionOverrides((current) => ({
                                          ...current,
                                          [decision.decisionId]: value,
                                        }));
                                      }}
                                      label={<span className="tiny">Secured</span>}
                                    />
                                  </div>
                                  <p className="journey-decision-line">
                                    <strong>Journey 1:</strong> {decision.journey1Result || decision.journey1}
                                  </p>
                                  {decision.rewards.length ? (
                                    <div className="journey-decision-rewards">
                                      {decision.rewards.map((reward, index) => (
                                        <span
                                          key={`${decision.decisionId}-${reward.itemId || reward.name}-${index}`}
                                          className={`chip${reward.itemId && character.items[reward.itemId] ? " is-owned" : ""}`}
                                        >
                                          {reward.itemId && character.items[reward.itemId] ? (
                                            <Icon name="check" size={11} />
                                          ) : null}
                                          {reward.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    icon="external"
                                    onClick={() =>
                                      navigate(
                                        `/completion?tab=branch&decision=${encodeURIComponent(decision.decisionId)}`,
                                      )
                                    }
                                  >
                                    Open decision
                                  </Button>
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="journey-quiet-note">
                            No branch-plan decision is anchored to this section. Open the completion branch tab for the
                            full decision ledger.
                          </p>
                        )}
                      </section>

                      <Disclosure
                        title="Previous journey carryover"
                        icon="layers"
                        className="journey-carryover-card"
                        summary={
                          previousJourneys.length
                            ? `${plural(previousJourneys.length, "earlier journey")}`
                            : "No earlier journeys"
                        }
                      >
                        {previousJourneys.length ? (
                          <div className="journey-carryover-list">
                            {previousJourneys.map((entry) => {
                              const originItems = entry.items
                                .map((id) => ITEM_BY_ID[id]?.name ?? id)
                                .slice(0, 8);
                              return (
                                <article className="journey-carryover" key={entry.journey.id}>
                                  <div className="row-between wrap" style={{ gap: 8 }}>
                                    <strong>{entry.journey.label}</strong>
                                    <span className="tiny faint">
                                      {entry.progress.resolved} / {entry.progress.total} route steps ·{" "}
                                      {entry.progress.percent}%
                                    </span>
                                  </div>
                                  <div className="journey-counts">
                                    <span>
                                      <strong>{entry.decisionsRecorded}</strong> decisions recorded
                                    </span>
                                    <span>
                                      <strong>{entry.decisionsSecured}</strong> decisions secured
                                    </span>
                                    <span>
                                      <strong>{entry.items.length}</strong> items acquired
                                    </span>
                                  </div>
                                  {originItems.length ? (
                                    <div className="tag-list">
                                      {originItems.map((name) => (
                                        <span className="chip" key={`${entry.journey.id}-${name}`}>
                                          {name}
                                        </span>
                                      ))}
                                      {entry.items.length > originItems.length ? (
                                        <span className="chip">+{entry.items.length - originItems.length} more</span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <p className="tiny faint">No item is recorded as acquired in this journey.</p>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="journey-quiet-note">
                            This is the first journey: there is no earlier run to carry records from.
                          </p>
                        )}
                      </Disclosure>
                  </>
                ) : null}

                {!phaseMissableMode && leaveGate ? renderGate(leaveGate) : null}
              </div>
            </div>
          </>
        ) : tab === "npc" ? (
          <div className="journey-npc">
            <div className="journey-layout">
              <aside className="journey-side">
                <div className="card card-pad journey-rail journey-npc-rail">
                  <SectionTitle
                    title="NPC sections"
                    note={`${NPC_SECTIONS.length} sections · ${formatNumber(npcStats.total)} steps`}
                  />
                  <div className="journey-npc-rail-summary">
                    <ProgressBar
                      value={npcStats.percent}
                      label={`${npcStats.done} of ${npcStats.total} NPC steps checked`}
                      detail={`Area and level order · ${npcBaseSectionCount} base-game · ${npcDlcSectionCount} DLC sections`}
                    />
                  </div>
                  <div className="journey-rail-scroll journey-npc-rail-scroll">
                    {NPC_SECTIONS.map((section) => {
                      const counts = npcSectionCounts[section.id];
                      const matching = npcMatchCounts[section.id] ?? 0;
                      const isActive =
                        section.id === npcActiveSection.id &&
                        (!npcFiltersActive || Boolean(npcLinkedSection) || Boolean(npcLinkedStep));
                      return (
                        <button
                          key={section.id}
                          type="button"
                          className={`area-row journey-area-item journey-npc-section-item${
                            isActive ? " current" : ""
                          }${npcFiltersActive && matching === 0 ? " is-muted" : ""}`}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => selectNpcSection(section)}
                        >
                          <span className="journey-area-main">
                            <span className="journey-area-top">
                              <span className="area-name grow">{section.title}</span>
                              {section.dlc ? <Badge tone="info">DLC</Badge> : null}
                              <span className="tiny faint mono">
                                {counts.done}/{counts.total}
                              </span>
                            </span>
                            <span className="journey-area-sub tiny faint">
                              {section.levelRange || "Level range not recorded"} ·{" "}
                              {npcFiltersActive ? `${matching} matching` : `${counts.remaining} open`}
                            </span>
                            <ProgressBar value={counts.percent} />
                            {counts.missableRemaining ? (
                              <span className="journey-area-missable">
                                <Icon name="alert" size={10} /> {counts.missableRemaining} missable
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="journey-rail-foot tiny faint">
                    <Icon name="layers" size={11} /> Area and level order · {npcBaseSectionCount} base ·{" "}
                    {npcDlcSectionCount} DLC
                  </div>
                </div>
              </aside>

              <div className="journey-main journey-npc-main">
                <section className="card card-pad journey-npc-head">
                  <div className="row-between wrap">
                    <div className="grow">
                      <div className="eyebrow">Alternate walkthrough · area and level order</div>
                      <h2 className="journey-phase-title">NPC walkthrough</h2>
                    </div>
                    <Badge tone={npcStats.complete ? "success" : "accent"}>
                      {npcStats.done} / {npcStats.total} checked
                    </Badge>
                  </div>
                  <div className="journey-phase-stats">
                    <span>
                      <strong>{formatNumber(npcStats.done)}</strong> checked ·{" "}
                      <strong>{formatNumber(npcStats.total - npcStats.done)}</strong> open
                    </span>
                    <span className={npcCounts.missableRemaining ? "danger" : ""}>
                      <Icon name={npcCounts.missableRemaining ? "alert" : "check"} size={12} />
                      {npcCounts.missableRemaining
                        ? `${formatNumber(npcCounts.missableRemaining)} missable left`
                        : "No unresolved missables"}
                    </span>
                    <span>
                      <Icon name="layers" size={12} />
                      {plural(NPC_SECTIONS.length, "section")}
                    </span>
                  </div>
                  <ProgressBar
                    value={npcStats.percent}
                    label={`${npcStats.done} / ${npcStats.total} NPC steps`}
                    detail={`${npcCounts.optional} optional · ${npcCounts.dlc} DLC steps · ${npcCounts.missable} flagged missable`}
                  />
                  <Disclosure title="How this view works" tone="muted" icon="book">
                    <p className="journey-disclosure-copy">
                      {formatNumber(npcStats.total)} NPC conversation and quest steps across {NPC_SECTIONS.length}{" "}
                      areas, ordered by area and recommended level. This is an alternate companion list: it is not a
                      replacement for the {formatNumber(routeStats.total)}-step full route, and it does not include
                      achievements or non-quest content. Those remain in their own ledgers.
                    </p>
                    <div className="journey-counts journey-npc-counts">
                      <span>
                        <strong>{NPC_SECTIONS.length}</strong> sections
                      </span>
                      <span>
                        <strong>{npcBaseSectionCount}</strong> base game
                      </span>
                      <span>
                        <strong>{npcDlcSectionCount}</strong> DLC
                      </span>
                      <span>
                        <strong>{npcCounts.optional}</strong> optional
                      </span>
                      <span>
                        <strong>{npcCounts.missable}</strong> missable
                      </span>
                    </div>
                  </Disclosure>
                </section>

                <div className="card card-pad journey-filter-card">
                  <div className="journey-filter-row journey-filter-row--npc">
                    <SearchInput
                      className="grow"
                      value={npcSearch}
                      onChange={setNpcSearch}
                      placeholder="Search NPC step, section, level, link, badge…"
                    />
                    <Select
                      label="Status"
                      value={npcStatus}
                      onChange={(event) => setNpcStatus(event.target.value as NpcStatusFilter)}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="done">Checked</option>
                    </Select>
                    <Select
                      label="Step type"
                      value={npcRequirement}
                      onChange={(event) => setNpcRequirement(event.target.value as RequirementFilter)}
                    >
                      <option value="all">All steps</option>
                      <option value="required">Required only</option>
                      <option value="optional">Optional only</option>
                    </Select>
                  </div>
                  <div className="journey-filter-meta">
                    <div className="journey-filter-count">
                      <span className="small faint">
                        {npcVisibleStepCount} of {formatNumber(npcStats.total)} steps shown
                      </span>
                      <button
                        type="button"
                        className={`journey-missable-toggle${missable ? " is-active" : ""}`}
                        aria-pressed={missable}
                        onClick={toggleNpcMissable}
                      >
                        <Icon name="alert" size={12} />
                        Missables only
                        <span className="journey-missable-toggle-count">
                          {formatNumber(npcCounts.missableRemaining)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`journey-npc-flag${dlc ? " is-active" : ""}`}
                        aria-pressed={dlc}
                        onClick={toggleNpcDlc}
                      >
                        <Icon name="spark" size={12} />
                        DLC only
                        <span className="journey-missable-toggle-count">{npcCounts.dlc}</span>
                      </button>
                    </div>
                    {npcFiltersActive ? (
                      <div className="row wrap" style={{ gap: 8 }}>
                        {npcLinkedSection || npcLinkedStep ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="layers"
                            onClick={() =>
                              navigate(
                                journeyHref({
                                  tab: "npc",
                                  missable: missable ? "1" : undefined,
                                  dlc: dlc ? "1" : undefined,
                                }),
                              )
                            }
                          >
                            All matching sections
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" icon="x" onClick={resetNpcFilters}>
                          Clear filters
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {npcDisplaySections.length ? (
                  <div className="journey-npc-sections">{npcSectionsContent}</div>
                ) : (
                  <EmptyState
                    icon="search"
                    title="No NPC steps match these filters"
                    description="Adjust the search, status, step type, missable, or DLC filter, or pick another section from the rail."
                    action={
                      <div className="row wrap" style={{ justifyContent: "center", gap: 8 }}>
                        <Button icon="refresh" onClick={resetNpcFilters}>
                          Clear filters
                        </Button>
                        <Button variant="ghost" icon="map" onClick={() => selectNpcSection(npcActiveSection)}>
                          Back to {npcActiveSection.title}
                        </Button>
                      </div>
                    }
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="journey-chronology">
            <section className="card card-pad journey-chronology-head">
              <div className="row-between wrap">
                <div className="grow">
                  <div className="eyebrow">Companion chronology · separate from the full route</div>
                  <h2 className="journey-phase-title">Cross-game companion actions</h2>
                </div>
                <Badge tone="accent">
                  {chronologyStats.resolved} / {chronologyStats.total} resolved
                </Badge>
              </div>
              <div className="journey-progress-block">
                <ProgressBar
                  value={chronologyStats.percent}
                  label={`${chronologyStats.resolved} of ${chronologyStats.total} actions resolved`}
                  detail={`${chronologyStats.done} done · ${chronologyStats.skipped} skipped · ${chronologyStats.deferred} deferred`}
                />
                <div className="journey-counts">
                  <span>
                    <strong>{chronologyStats.done}</strong> done
                  </span>
                  <span>
                    <strong>{chronologyStats.skipped}</strong> skipped
                  </span>
                  <span>
                    <strong>{chronologyStats.deferred}</strong> deferred
                  </span>
                  <span>
                    <strong>
                      {chronologyStats.total -
                        chronologyStats.done -
                        chronologyStats.skipped -
                        chronologyStats.deferred}
                    </strong>{" "}
                    pending
                  </span>
                </div>
              </div>
              <Disclosure title="How this view works" tone="muted" icon="book">
                <p className="journey-disclosure-copy">
                  This chronology collects {chronologyStats.total} companion, certification, and ending actions across{" "}
                  {CHRONOLOGY_AREAS.length} areas. It is not the {formatNumber(routeStats.total)}-step route or a
                  complete pickup checklist; each action records its trigger, coverage, and source. Missable actions
                  are flagged so a missed companion beat is visible before it becomes unrecoverable.
                </p>
              </Disclosure>
            </section>

            <div className="card card-pad">
              <Disclosure
                title="Filter chronology"
                icon="filter"
                defaultOpen={chronologyFiltersActive}
                summary={`${filteredActions.length} of ${chronologyStats.total} actions shown`}
              >
                <div className="journey-filter-row journey-filter-row--chronology">
                  <SearchInput
                    className="grow"
                    value={chronologySearch}
                    onChange={setChronologySearch}
                    placeholder="Search action, trigger, area, category, coverage…"
                  />
                  <Select
                    label="Status"
                    value={chronologyStatus}
                    onChange={(event) => setChronologyStatus(event.target.value as StatusFilter)}
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="done">Done</option>
                    <option value="skipped">Skipped</option>
                    <option value="deferred">Deferred</option>
                  </Select>
                </div>
                <div className="journey-filter-meta">
                  <span className="small faint">
                    {filteredActions.length} of {chronologyStats.total} actions shown
                  </span>
                  {chronologyFiltersActive ? (
                    <Button variant="ghost" size="sm" icon="x" onClick={resetChronologyFilters}>
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </Disclosure>
            </div>

            {chronologyGroups.length ? (
              <div className="journey-chronology-groups">
                {chronologyGroups.map((group) => (
                  <section className="journey-group" key={group.name}>
                    <div className="journey-group-head">
                      <div>
                        <div className="eyebrow">Area order {group.order}</div>
                        <h3 className="journey-group-title">{group.name}</h3>
                      </div>
                      <span className="small faint">
                        {group.actions.length} of {group.total} actions shown
                      </span>
                    </div>
                    <div className="journey-action-list">
                      {group.actions.map((action) => {
                        const status: StepStatus | undefined = journey.supplemental[action.id];
                        return (
                          <article
                            key={action.id}
                            id={`chronology-action-${action.id}`}
                            className={`card journey-action${selectedAction?.id === action.id ? " is-selected" : ""}`}
                          >
                            <div className="journey-action-head">
                              <div className="journey-action-badges">
                                <Badge tone="accent">{titleCase(action.kind)}</Badge>
                                <Badge>{action.category}</Badge>
                                {action.missable ? <Badge tone="danger">Missable</Badge> : null}
                              </div>
                              <Badge tone={badgeToneForStatus(status)}>{stepStatusLabel(status)}</Badge>
                            </div>
                            <h4 className="journey-action-title">{action.action}</h4>
                            <div className="journey-action-meta">
                              <span>
                                <Icon name="map" size={11} /> {action.area}
                              </span>
                            </div>
                            <p className="journey-action-field">
                              <strong>Trigger:</strong> {action.trigger}
                            </p>
                            <p className="journey-action-field">
                              <strong>Coverage:</strong> {action.coverageNote}
                            </p>
                            {action.notes ? <p className="journey-action-field faint">{action.notes}</p> : null}
                            <div className="journey-action-foot">
                              <a
                                className="journey-source"
                                href={action.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={action.sourceUrl}
                                aria-label={`Open source for ${action.category} in ${action.area}`}
                              >
                                Source <Icon name="external" size={11} />
                              </a>
                              <div className="journey-action-actions">
                                <Button
                                  size="sm"
                                  variant={status === "done" ? "primary" : "default"}
                                  icon="check"
                                  onClick={() => handleSupplementalStatus(action, "done")}
                                >
                                  Done
                                </Button>
                                <Button
                                  size="sm"
                                  variant={status === "skipped" ? "default" : "ghost"}
                                  icon="x"
                                  onClick={() => handleSupplementalStatus(action, "skipped")}
                                >
                                  Skip
                                </Button>
                                <Button
                                  size="sm"
                                  variant={status === "deferred" ? "default" : "ghost"}
                                  icon="clock"
                                  onClick={() => handleSupplementalStatus(action, "deferred")}
                                >
                                  Defer
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon="refresh"
                                  disabled={status === undefined}
                                  onClick={() => handleSupplementalStatus(action, null)}
                                >
                                  Undo
                                </Button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="search"
                title="No chronology actions match"
                description="Adjust the search or status filter to bring companion actions back into view."
                action={
                  <Button icon="refresh" onClick={resetChronologyFilters}>
                    Clear chronology filters
                  </Button>
                }
              />
            )}
          </div>
        )}
      </div>

      <Modal
        open={resolveOpen}
        title={`Resolve ${activeArea.name}?`}
        onClose={() => setResolveOpen(false)}
        actions={
          <div className="journey-modal-actions">
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon="check" onClick={saveArea}>
              Mark all {activeProgress.total} steps done
            </Button>
          </div>
        }
      >
        <div className="journey-modal-copy">
          <p>
            This marks <strong>every step in {activeArea.name}</strong> done: all {activeProgress.total} steps, including
            optional steps and any steps currently skipped or deferred.
          </p>
          <Callout tone="warning" icon="alert">
            The area resolver only writes step status. It does not award linked items, record bosses or NPCs, collect
            scarabs, or mark finite resources. Complete individual steps when those records need to follow the route.
          </Callout>
          <p className="small muted">
            Individual steps can still be reset to pending afterwards; there is no bulk undo for the area.
          </p>
        </div>
      </Modal>

      <Drawer
        open={Boolean(selectedStep)}
        title={selectedStep ? `Step ${formatNumber(selectedStep.order)} · ${selectedStep.sectionTitle}` : "Step details"}
        subtitle={selectedStep ? `${selectedStep.phase} · ${selectedStep.area} · ${selectedStep.objectiveName}` : undefined}
        onClose={closeStep}
        footer={
          selectedStep ? (
            <div className="journey-drawer-actions">
              <Button
                variant={selectedStepStatus === "done" ? "primary" : "default"}
                icon="check"
                onClick={() => handleStepStatus(selectedStep, "done")}
              >
                Done
              </Button>
              <Button icon="x" onClick={() => handleStepStatus(selectedStep, "skipped")}>
                Skip
              </Button>
              <Button icon="clock" onClick={() => handleStepStatus(selectedStep, "deferred")}>
                Defer
              </Button>
              <Button
                variant="ghost"
                icon="refresh"
                disabled={selectedStepStatus === undefined}
                onClick={() => handleStepStatus(selectedStep, null)}
              >
                Undo
              </Button>
              <Button variant="ghost" onClick={closeStep}>
                Close
              </Button>
            </div>
          ) : null
        }
      >
        {selectedStep ? (
          <div className="journey-drawer-section">
            <div className="journey-drawer-badges">
              <Badge tone="accent">{selectedStep.type}</Badge>
              <Badge tone={selectedStep.required ? "warning" : "default"}>
                {selectedStep.required ? "Required" : "Optional"}
              </Badge>
              <Badge tone={badgeToneForStatus(selectedStepStatus)}>{stepStatusLabel(selectedStepStatus)}</Badge>
              {selectedStep.missable ? (
                <Badge tone="danger">
                  <Icon name="alert" size={10} /> Missable
                </Badge>
              ) : null}
              {selectedStep.badges
                .filter((badge) => badge.toUpperCase() !== "MISSABLE")
                .map((badge) => (
                  <Badge key={badge} tone={badge === "🏆" ? "accent" : "default"}>
                    {badge}
                  </Badge>
                ))}
              {selectedStep.id === nextStep?.id ? <Badge tone="accent">Next up</Badge> : null}
            </div>

            <div className="journey-drawer-context">
              <span>{selectedStep.phase}</span>
              <span>{selectedStep.sectionTitle}</span>
              {selectedStep.levelRange ? <span>{selectedStep.levelRange}</span> : null}
              <span>{selectedStep.game}</span>
            </div>

            <p className="journey-drawer-instruction">{selectedStep.instruction}</p>

            {selectedStep.missable ? (
              <Callout tone="danger" icon="alert">
                <strong>MISSABLE.</strong>{" "}
                {selectedStep.warning ||
                  "Flagged as missable by the route source. Resolve it before the phase gate closes."}
              </Callout>
            ) : selectedStep.warning ? (
              <Callout tone="warning" icon="alert">
                {selectedStep.warning}
              </Callout>
            ) : null}

            <dl className="kv journey-kv">
              <dt>Step</dt>
              <dd>
                {formatNumber(selectedStep.order)} of {formatNumber(ROUTE_STEPS.length)} in the full route
              </dd>
              <dt>Phase</dt>
              <dd>{selectedStep.phase}</dd>
              <dt>Section</dt>
              <dd>{selectedStep.sectionTitle}</dd>
              <dt>Area</dt>
              <dd>{selectedStep.area}</dd>
              <dt>Level range</dt>
              <dd>{selectedStep.levelRange || "Not recorded"}</dd>
              <dt>Game</dt>
              <dd>{selectedStep.game}</dd>
              <dt>Objective</dt>
              <dd>{selectedStep.objectiveName}</dd>
              <dt>Type</dt>
              <dd>{selectedStep.type}</dd>
              <dt>Location</dt>
              <dd>{selectedStep.location || "Not recorded"}</dd>
              <dt>Estimated time</dt>
              <dd>{selectedStep.estimatedTime || "Not recorded"}</dd>
              <dt>Prerequisites</dt>
              <dd>{selectedStep.prerequisites || "None recorded"}</dd>
              <dt>Validation</dt>
              <dd>{selectedStep.validation || "Not recorded"}</dd>
              <dt>Route decision</dt>
              <dd>{selectedStep.routeDecision || "Not recorded"}</dd>
              <dt>Skip allowed</dt>
              <dd>{selectedStep.skipAllowed ? "Yes" : "No"}</dd>
              <dt>Return window</dt>
              <dd>{selectedStep.returnWindow || "Not recorded"}</dd>
              <dt>Lockout risk</dt>
              <dd>{selectedStep.lockoutRisk || "Not recorded"}</dd>
              <dt>Source row</dt>
              <dd className="mono">{selectedStep.sourceRow}</dd>
            </dl>

            {selectedRecords.length ? (
              <div>
                <div className="field-label">Linked records</div>
                <div className="tag-list journey-linked-records">
                  {selectedItems.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      className="chip"
                      onClick={() => navigate(`/collection?item=${encodeURIComponent(record.id)}`)}
                    >
                      <Icon name={itemGroupIcon(record.item?.group ?? "Tool")} size={11} />
                      {record.name}
                    </button>
                  ))}
                  {selectedBosses.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      className="chip"
                      onClick={() => navigate(`/bosses?encounter=${encodeURIComponent(record.id)}`)}
                    >
                      <Icon name="skull" size={11} />
                      {record.name}
                    </button>
                  ))}
                  {selectedOtherRecords.map((record) => (
                    <span key={record.id} className="chip mono">
                      {record.id}
                    </span>
                  ))}
                </div>
                <p className="tiny faint journey-linked-note">
                  {selectedItems.length} item{selectedItems.length === 1 ? "" : "s"} · {selectedBosses.length} boss
                  {selectedBosses.length === 1 ? "" : "es"} · {selectedOtherRecords.length} other record
                  {selectedOtherRecords.length === 1 ? "" : "s"} linked.
                </p>
              </div>
            ) : (
              <p className="small faint">No linked records are attached to this step in the content pack.</p>
            )}

            {selectedWikiLinks.length ? (
              <div>
                <div className="field-label">Wiki links</div>
                <div className="tag-list journey-wiki-links">
                  {selectedWikiLinks.map((link) => (
                    <a
                      key={`${link.label}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="chip journey-wiki-chip"
                    >
                      <Icon name="external" size={11} />
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="divider" />

            <StepNoteEditor
              key={`${journey.id}-${selectedStep.id}`}
              savedNote={savedNote}
              onSave={(note) => {
                setStepNote(selectedStep.id, note);
                toast.push(note ? "Journey note saved." : "Journey note cleared.", "success");
              }}
            />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
