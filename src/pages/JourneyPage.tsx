import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
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
import { ART, ArtBanner, OrnamentRule } from "../components/Art";
import {
  resolveArea,
  setSettings,
  setStepNote,
  setStepStatus,
  setSupplementalStatus,
  useActiveJourney,
  useAppState,
} from "../lib/store";
import {
  areaProgress,
  currentAreaName,
  nextRouteStep,
  routeProgress,
  stepStatusLabel,
  stepStatusTone,
  supplementalProgress,
} from "../lib/selectors";
import type { Progress } from "../lib/selectors";
import {
  CHRONOLOGY_AREAS,
  ENCOUNTER_BY_ID,
  ITEM_BY_ID,
  ITEM_BY_NORMALIZED_NAME,
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
  normalizeContentKey,
} from "../lib/data";
import { formatNumber, itemGroupIcon, titleCase } from "../lib/format";
import { navigate, queryString, useRoute } from "../lib/router";
import type {
  Encounter,
  Item,
  Objective,
  PhaseGate,
  RouteArea,
  RouteStep,
  StepStatus,
  Supplemental,
} from "../lib/types";
import "./journey.css";

type JourneyTab = "route" | "chronology";
type StatusFilter = "all" | "pending" | StepStatus;
type RequirementFilter = "all" | "required" | "optional";

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
  const journey = useActiveJourney();
  const route = useRoute();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("all");
  const [chronologySearch, setChronologySearch] = useState("");
  const [chronologyStatus, setChronologyStatus] = useState<StatusFilter>("all");
  const [areaSearch, setAreaSearch] = useState("");
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});
  const [resolveOpen, setResolveOpen] = useState(false);

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
  const missable = route.query.get("missable") === "1";

  const linkedStep = stepParam ? STEP_BY_ID[stepParam] : undefined;
  const matchedArea = areaParam
    ? allAreas.find((area) => area.name === areaParam || area.sectionId === areaParam)
    : undefined;
  const phaseParamMeta = PHASES.find((phase) => phase.id === phaseParam || phase.label === phaseParam);

  const tab: JourneyTab =
    stepParam && linkedStep
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

  const switchTab = (id: string) => {
    if (id === "chronology") openChronology();
    else
      navigate(
        journeyHref({
          phase: phaseMeta.id,
          area: phaseMissableMode ? undefined : activeArea.name,
          missable: missable ? "1" : undefined,
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
      const extras: string[] = [];
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

  const phaseArt =
    phaseMeta.id === "shadow-of-the-erdtree"
      ? { image: ART.heroSote, variant: "sote" as const }
      : { image: ART.heroErdtree, variant: "erdtree" as const };

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
    const image = gate.id === "GATE-DLC" ? ART.heroSote : ART.heroErdtree;
    const variant = gate.id === "GATE-DLC" ? "sote" : "erdtree";
    return (
      <ArtBanner
        key={gate.id}
        image={image}
        variant={variant}
        className={`journey-gate${severe ? " journey-gate--danger" : ""}`}
        caption={severe ? "Point of no return" : "Phase gate"}
        title={gate.title}
      >
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
      </ArtBanner>
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

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Guided journey`}
        title="Journey"
        description={
          <>
            The full {formatNumber(routeStats.total)}-step route in three canonical phases: base game through Maliketh, the
            entire Shadow of the Erdtree, then the base-game endgame.{" "}
            {formatNumber(
              Object.values(phaseMissables).reduce((sum, stats) => sum + stats.total, 0),
            )}{" "}
            steps are flagged missable; the {chronologyStats.total}-action companion chronology remains a separate
            cross-game tracking layer.
          </>
        }
        actions={
          <>
            <Button variant="primary" icon="target" onClick={openNextStep} disabled={!nextStep}>
              {nextStep ? "Continue route" : "Route complete"}
            </Button>
            <Button icon="list" onClick={openChronology}>
              Companion chronology
            </Button>
          </>
        }
      />

      <div className="journey-shell">
        <div className="journey-tabbar">
          <TabBar
            items={[
              { id: "route", label: "Full route", count: routeStats.total },
              { id: "chronology", label: "Companion chronology", count: chronologyStats.total },
            ]}
            value={tab}
            onChange={switchTab}
          />
        </div>

        {tab === "route" ? (
          <>
            <section className="card card-pad journey-phase-tabs" aria-label="Route phases">
              <div className="row-between wrap">
                <div>
                  <div className="eyebrow">Route phases</div>
                  <p className="small muted journey-phase-tabs-note">
                    Maliketh closes the pre-DLC phase; Shadow of the Erdtree plays in full before the Ashen Capital.
                  </p>
                </div>
                <Badge tone={nextStep ? "info" : "success"}>
                  {nextStep ? `Next · ${nextStep.phase}` : "Full route closed"}
                </Badge>
              </div>
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
                <div className="card card-pad journey-rail">
                  <SectionTitle
                    title="Route sections"
                    note={`${allAreas.length} sections · ${formatNumber(routeStats.total)} steps`}
                  />
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
                </div>
              </aside>

              <div className="journey-main">
                <ArtBanner
                  image={phaseArt.image}
                  variant={phaseArt.variant}
                  className={`journey-phase-banner${
                    phaseMeta.id === "base-endgame" ? " journey-phase-banner--danger" : ""
                  }`}
                  caption={`Phase ${phaseIndex + 1} of ${PHASES.length} · ${phaseAreas.length} sections · ${formatNumber(
                    phaseProgress.total,
                  )} steps`}
                  title={phaseMeta.label}
                >
                  <div className="journey-phase-banner-body">
                    <div className="journey-phase-banner-meta">
                      <span>
                        <strong>{formatNumber(phaseProgress.resolved)}</strong> resolved ·{" "}
                        <strong>{formatNumber(phaseProgress.total - phaseProgress.resolved)}</strong> open
                      </span>
                      <span className={phaseMissable.remaining ? "danger" : ""}>
                        <Icon name={phaseMissable.remaining ? "alert" : "check"} size={12} />
                        {phaseMissable.remaining
                          ? `${formatNumber(phaseMissable.remaining)} missable steps remaining`
                          : "No unresolved missables"}
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
                  </div>
                </ArtBanner>

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

                      <div className="journey-area-badges">
                        <Badge tone={activeProgress.complete ? "success" : "warning"}>
                          {activeProgress.complete
                            ? "Required steps complete"
                            : `${remainingRequired} required step${remainingRequired === 1 ? "" : "s"} left`}
                        </Badge>
                        <Badge>
                          {activeProgress.total} steps · {activeProgress.required} required
                        </Badge>
                        <Badge tone={activeArea.dlc ? "info" : "default"}>{activeArea.game}</Badge>
                        {activeArea.levelRange ? <Badge>{activeArea.levelRange}</Badge> : null}
                        {pendingSteps ? <Badge tone="info">{pendingSteps} pending</Badge> : null}
                        {(() => {
                          const areaMisses = missableStats(STEPS_BY_AREA[activeArea.name] ?? [], journey.steps);
                          return areaMisses.total ? (
                            <Badge tone={areaMisses.remaining ? "danger" : "success"}>
                              {areaMisses.remaining} of {areaMisses.total} missables left
                            </Badge>
                          ) : null;
                        })()}
                      </div>

                      <p className="journey-area-description">
                        {activeArea.description || activeArea.levelRange || "No area summary is recorded in the content pack."}
                      </p>
                      <div className="journey-validation">
                        <Icon name="scroll" size={12} />
                        <span>
                          {activeArea.validation || "No separate area validation is recorded in the content pack."}
                        </span>
                      </div>

                      <div className="journey-progress-block">
                        <ProgressBar
                          value={activeProgress.requiredPercent}
                          label={`${activeProgress.requiredResolved} / ${activeProgress.required} required steps`}
                          detail={`${activeProgress.done} done · ${activeProgress.skipped} skipped · ${activeProgress.deferred} deferred`}
                        />
                        <div className="journey-counts">
                          <span>
                            <strong>{activeProgress.resolved}</strong> resolved
                          </span>
                          <span>
                            <strong>{pendingSteps}</strong> pending
                          </span>
                          <span>
                            <strong>{activeProgress.percent}%</strong> of all steps resolved
                          </span>
                          <span>
                            <strong>{formatNumber(activeArea.order)}</strong> global section order
                          </span>
                        </div>
                      </div>
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
                        ? "Turn off Hide completed to review the steps in this section, or open the companion chronology for cross-game actions."
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
                        <Button variant="ghost" icon="list" onClick={openChronology}>
                          Open companion chronology
                        </Button>
                      </div>
                    }
                  />
                )}

                {!phaseMissableMode && leaveGate ? renderGate(leaveGate) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="journey-chronology">
            <section className="card card-pad journey-chronology-head">
              <div className="row-between wrap">
                <div className="grow">
                  <div className="eyebrow">Companion chronology · separate from the full route</div>
                  <h2 className="journey-area-title">Cross-game companion actions</h2>
                  <p className="small muted journey-chronology-intro">
                    This chronology collects {chronologyStats.total} companion, certification, and ending actions across{" "}
                    {CHRONOLOGY_AREAS.length} areas. It is not the {formatNumber(routeStats.total)}-step route or a
                    complete pickup checklist; each action records its trigger, coverage, and source.
                  </p>
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
              <Callout icon="alert" tone="warning">
                Missable actions are flagged. Coverage notes describe what the source walkthrough routes and what it
                leaves implicit, so a missed companion beat is visible before it becomes unrecoverable.
              </Callout>
            </section>

            <div className="card card-pad journey-filter-card">
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
