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
import {
  CHRONOLOGY_AREAS,
  ITEM_BY_ID,
  OBJECTIVES,
  ROUTE_AREAS,
  ROUTE_STEPS,
  STEP_BY_ID,
  STEPS_BY_AREA,
  SUPPLEMENTAL,
  SUPPLEMENTAL_BY_AREA,
  SUPPLEMENTAL_BY_ID,
} from "../lib/data";
import { itemGroupIcon, titleCase } from "../lib/format";
import { navigate, queryString, useRoute } from "../lib/router";
import type { Item, Objective, RouteStep, StepStatus, Supplemental } from "../lib/types";
import "./journey.css";

type JourneyTab = "route" | "chronology";
type StatusFilter = "all" | "pending" | StepStatus;
type RequirementFilter = "all" | "required" | "optional";

function journeyHref(values: Record<string, string | undefined>): string {
  return `/journey${queryString(values)}`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function badgeToneForStatus(status: StepStatus | undefined): "success" | "warning" | "info" | "default" {
  const tone = stepStatusTone(status);
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "neutral") return "info";
  return "default";
}

function linkedItemsFor(step: RouteStep): Item[] {
  const items: Item[] = [];
  for (const id of step.linkedIds) {
    const item: Item | undefined = ITEM_BY_ID[id];
    if (item) items.push(item);
  }
  return items;
}

function otherLinkedIdsFor(step: RouteStep): string[] {
  return step.linkedIds.filter((id) => {
    const item: Item | undefined = ITEM_BY_ID[id];
    return item === undefined;
  });
}

function stepSearchText(step: RouteStep): string {
  const items = linkedItemsFor(step);
  return [
    step.id,
    step.type,
    step.instruction,
    step.location,
    step.objectiveName,
    step.area,
    step.warning,
    step.prerequisites,
    step.validation,
    ...step.linkedIds,
    ...items.flatMap((item) => [item.name, item.group, item.category]),
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
  const [resolveOpen, setResolveOpen] = useState(false);

  const routeAreas = useMemo(
    () => ROUTE_AREAS.filter((area) => area.stepCount > 0).sort((a, b) => a.order - b.order),
    [],
  );
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

  const tabParam = route.query.get("tab");
  const actionParam = route.query.get("action");
  const stepParam = route.query.get("step");
  const areaParam = route.query.get("area");
  const linkedStep = stepParam ? STEP_BY_ID[stepParam] : undefined;
  const tab: JourneyTab =
    tabParam === "route"
      ? "route"
      : tabParam === "chronology"
        ? "chronology"
        : actionParam && !linkedStep
          ? "chronology"
          : "route";

  const fallbackArea = routeAreas.find((area) => area.name === currentArea) ?? routeAreas[0];
  const matchedArea = areaParam ? routeAreas.find((area) => area.name === areaParam) : undefined;
  const activeAreaName = linkedStep?.area ?? matchedArea?.name ?? fallbackArea.name;
  const activeArea = routeAreas.find((area) => area.name === activeAreaName) ?? routeAreas[0];
  const areaIndex = routeAreas.findIndex((area) => area.name === activeArea.name);

  const activeProgress = areaProgress(journey, activeArea.name);
  const remainingRequired = activeProgress.required - activeProgress.requiredResolved;
  const pendingSteps = activeProgress.total - activeProgress.done - activeProgress.skipped - activeProgress.deferred;

  const areaSteps = useMemo(
    () => [...(STEPS_BY_AREA[activeArea.name] ?? [])].sort((a, b) => a.order - b.order),
    [activeArea.name],
  );

  const filteredSteps = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return areaSteps.filter((step) => {
      const status: StepStatus | undefined = journey.steps[step.id];
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
    areaSteps,
    journey.steps,
    requirementFilter,
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
  const selectedItems = selectedStep ? linkedItemsFor(selectedStep) : [];
  const selectedOtherIds = selectedStep ? otherLinkedIdsFor(selectedStep) : [];
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

  const openNextStep = () => {
    if (!nextStep) return;
    navigate(journeyHref({ area: nextStep.area, step: nextStep.id }));
  };

  const openChronology = () => {
    navigate("/journey?tab=chronology");
  };

  const switchTab = (id: string) => {
    if (id === "chronology") openChronology();
    else navigate(journeyHref({ area: activeArea.name }));
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
        [`Step ${step.order + 1} marked done.`, ...(extras.length ? extras : ["No automatic record changes."])].join(" · "),
        "success",
      );
      return;
    }
    if (status === "skipped") {
      toast.push(`Step ${step.order + 1} skipped.`);
      return;
    }
    if (status === "deferred") {
      toast.push(`Step ${step.order + 1} deferred.`);
      return;
    }
    toast.push(`Step ${step.order + 1} reset to pending.`);
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
  };

  const resetChronologyFilters = () => {
    setChronologySearch("");
    setChronologyStatus("all");
  };

  const routeFiltersActive = search.trim().length > 0 || statusFilter !== "all" || requirementFilter !== "all";
  const chronologyFiltersActive = chronologySearch.trim().length > 0 || chronologyStatus !== "all";
  const hideLeaveArea = state.settings.hideCompleted && activeProgress.resolved === activeProgress.total;

  const stepGroupsContent = stepGroups.map((group) => {
    return (
      <section className="journey-objective" key={group.objectiveId}>
        <div className="journey-objective-head">
          <div className="grow">
            <div className="eyebrow">Objective {group.objective?.order ?? group.steps[0]?.objectiveOrder ?? ""}</div>
            <h3 className="journey-objective-title">
              {group.objective?.name ?? group.steps[0]?.objectiveName ?? group.objectiveId}
            </h3>
            {group.objective?.requirement ? (
              <p className="journey-objective-note">{group.objective.requirement}</p>
            ) : null}
          </div>
          <Badge>{plural(group.steps.length, "step")}</Badge>
        </div>
        <div className="step-list">
          {group.steps.map((step) => {
            const status: StepStatus | undefined = journey.steps[step.id];
            const isCurrent = step.id === nextStep?.id;
            const items = linkedItemsFor(step);
            const otherIds = otherLinkedIdsFor(step);
            const note = journey.stepNotes[step.id];
            return (
              <article
                key={step.id}
                className={`step-card journey-step${status === "done" ? " is-done" : ""}${isCurrent ? " is-current" : ""}${
                  selectedStep?.id === step.id ? " is-selected" : ""
                }`}
              >
                <div className="step-num" aria-hidden="true">
                  {String(step.order + 1).padStart(2, "0")}
                </div>
                <div className="journey-step-body">
                  <div className="journey-step-badges">
                    <Badge tone="accent">{step.type}</Badge>
                    <Badge tone={step.required ? "warning" : "default"}>{step.required ? "Required" : "Optional"}</Badge>
                    <Badge tone={badgeToneForStatus(status)}>{stepStatusLabel(status)}</Badge>
                    {isCurrent ? <Badge tone="accent">Next up</Badge> : null}
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
                  {step.warning ? (
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
                  {step.validation ? (
                    <div className="journey-validation">
                      <Icon name="scroll" size={11} />
                      <span>{step.validation}</span>
                    </div>
                  ) : null}
                  {items.length > 0 || otherIds.length > 0 ? (
                    <div className="tag-list journey-step-links">
                      {items.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="chip"
                          onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
                        >
                          <Icon name={itemGroupIcon(item.group)} size={11} />
                          {item.name}
                        </button>
                      ))}
                      {items.length > 3 ? <span className="chip">+{items.length - 3} items</span> : null}
                      {otherIds.length ? (
                        <span className="chip" title={otherIds.join(", ")}>
                          <Icon name="layers" size={11} />
                          {plural(otherIds.length, "other record")}
                        </span>
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
                    aria-label={`Mark step ${step.order + 1} done`}
                    title="Mark done"
                    onClick={() => handleStepStatus(step, "done")}
                  >
                    <Icon name="check" size={15} />
                  </button>
                  <button
                    type="button"
                    className={`journey-step-btn${status === "skipped" ? " is-active" : ""}`}
                    aria-label={`Skip step ${step.order + 1}`}
                    title="Skip"
                    onClick={() => handleStepStatus(step, "skipped")}
                  >
                    <Icon name="x" size={15} />
                  </button>
                  <button
                    type="button"
                    className={`journey-step-btn${status === "deferred" ? " is-active" : ""}`}
                    aria-label={`Defer step ${step.order + 1}`}
                    title="Defer"
                    onClick={() => handleStepStatus(step, "deferred")}
                  >
                    <Icon name="clock" size={15} />
                  </button>
                  <button
                    type="button"
                    className="journey-step-btn"
                    aria-label={`Undo step ${step.order + 1}`}
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
                    aria-label={`Open details for step ${step.order + 1}`}
                    onClick={() => navigate(journeyHref({ area: step.area, step: step.id }))}
                  >
                    Details
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
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
            Follow the {routeStats.total}-step Act I route area by area, or track the {chronologyStats.total} companion
            actions that span the full game. Route progress, chronology status, and notes are stored per journey.
          </>
        }
        actions={
          <>
            <Button variant="primary" icon="target" onClick={openNextStep} disabled={!nextStep}>
              {nextStep ? "Continue route" : "Route complete"}
            </Button>
            <Button icon="list" onClick={openChronology}>
              Chronology
            </Button>
          </>
        }
      />

      <div className="journey-shell">
        <div className="journey-tabbar">
          <TabBar
            items={[
              { id: "route", label: "Act I route", count: routeStats.total },
              { id: "chronology", label: "Whole-game chronology", count: chronologyStats.total },
            ]}
            value={tab}
            onChange={switchTab}
          />
        </div>

        {tab === "route" ? (
          <div className="journey-layout">
            <aside className="journey-side">
              <div className="card card-pad">
                <SectionTitle title="Route areas" note={`${routeAreas.length} areas`} />
                <div className="journey-area-list">
                  {routeAreas.map((area) => {
                    const progress = areaProgress(journey, area.name);
                    const isActive = area.name === activeArea.name;
                    const isCurrent = area.name === currentArea;
                    return (
                      <button
                        key={area.name}
                        type="button"
                        className={`area-row journey-area-item${isActive ? " current" : ""}`}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => navigate(journeyHref({ area: area.name }))}
                      >
                        <span className="journey-area-main">
                          <span className="journey-area-top">
                            <span className="area-name grow">{area.name}</span>
                            {isCurrent ? (
                              <>
                                <span className="journey-current-dot" aria-hidden="true" />
                                <span className="sr-only">Current journey area</span>
                              </>
                            ) : null}
                            <span className="tiny faint mono">
                              {progress.requiredResolved}/{progress.required}
                            </span>
                          </span>
                          <span className="journey-area-sub tiny faint">
                            {progress.resolved} of {progress.total} steps resolved · {progress.percent}%
                          </span>
                          <ProgressBar value={progress.requiredPercent} />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="journey-rail-foot tiny faint">
                  <span className="journey-current-dot" aria-hidden="true" />
                  Current journey area
                </div>
                {activeArea.name !== currentArea ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="target"
                    className="journey-jump-button"
                    onClick={() => navigate(journeyHref({ area: currentArea }))}
                  >
                    Jump to {currentArea}
                  </Button>
                ) : null}
              </div>
            </aside>

            <div className="journey-main">
              <section className="card card-pad journey-area-head">
                <div className="journey-area-title-row">
                  <div className="grow">
                    <div className="eyebrow">
                      Area {areaIndex + 1} of {routeAreas.length}
                      {activeArea.name === currentArea ? " · Current area" : ""}
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
                  {pendingSteps ? <Badge tone="info">{pendingSteps} pending</Badge> : null}
                </div>

                <p className="journey-area-description">
                  {activeArea.description || "No area summary is recorded in the content pack."}
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
                  </div>
                </div>
              </section>

              <div className="card card-pad journey-filter-card">
                <div className="journey-filter-row">
                  <SearchInput
                    className="grow"
                    value={search}
                    onChange={setSearch}
                    placeholder="Search instruction, location, objective, item…"
                  />
                  <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
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
                  <span className="small faint">
                    {filteredSteps.length} of {areaSteps.length} steps shown
                  </span>
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

              {stepGroups.length ? (
                <div className="journey-objectives">{stepGroupsContent}</div>
              ) : (
                <EmptyState
                  icon={hideLeaveArea ? "check" : "search"}
                  title={hideLeaveArea ? "All steps in this area are resolved" : "No steps match these filters"}
                  description={
                    hideLeaveArea
                      ? "Turn off Hide completed to review the steps in this area, or open the chronology for cross-game actions."
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
                        Open chronology
                      </Button>
                    </div>
                  }
                />
              )}
            </div>
          </div>
        ) : (
          <div className="journey-chronology">
            <section className="card card-pad journey-chronology-head">
              <div className="row-between wrap">
                <div className="grow">
                  <div className="eyebrow">Whole-game chronology</div>
                  <h2 className="journey-area-title">Companion actions across the full game</h2>
                  <p className="small muted journey-chronology-intro">
                    This chronology collects {chronologyStats.total} companion, certification, and ending actions across{" "}
                    {CHRONOLOGY_AREAS.length} areas. It is not a spatial walkthrough of every route or a complete pickup
                    checklist; each action records its trigger, coverage, and source.
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
        title={
          selectedStep
            ? `Step ${selectedStep.order + 1} · ${selectedStep.type}`
            : "Step details"
        }
        subtitle={selectedStep ? `${selectedStep.area} · ${selectedStep.objectiveName}` : undefined}
        onClose={() => navigate(journeyHref({ area: activeArea.name }))}
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
              <Button
                variant="ghost"
                onClick={() => navigate(journeyHref({ area: activeArea.name }))}
              >
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
              <Badge tone={badgeToneForStatus(selectedStepStatus)}>
                {stepStatusLabel(selectedStepStatus)}
              </Badge>
              {selectedStep.id === nextStep?.id ? <Badge tone="accent">Next up</Badge> : null}
            </div>

            <p className="journey-drawer-instruction">{selectedStep.instruction}</p>

            {selectedStep.warning ? (
              <Callout tone="warning" icon="alert">
                {selectedStep.warning}
              </Callout>
            ) : null}

            <dl className="kv journey-kv">
              <dt>Step</dt>
              <dd>
                {selectedStep.order + 1} of {ROUTE_STEPS.length} in the Act I route
              </dd>
              <dt>Area</dt>
              <dd>{selectedStep.area}</dd>
              <dt>Act</dt>
              <dd>{selectedStep.act}</dd>
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

            {selectedStep.linkedIds.length ? (
              <div>
                <div className="field-label">Linked records</div>
                <div className="tag-list journey-linked-records">
                  {selectedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="chip"
                      onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
                    >
                      <Icon name={itemGroupIcon(item.group)} size={11} />
                      {item.name}
                    </button>
                  ))}
                  {selectedOtherIds.map((id) => (
                    <span key={id} className="chip mono">
                      {id}
                    </span>
                  ))}
                </div>
                {selectedOtherIds.length ? (
                  <p className="tiny faint journey-linked-note">
                    Boss, NPC, dialogue, and world record IDs are shown verbatim; their display names are not part of
                    this module.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="small faint">No linked records are attached to this step in the content pack.</p>
            )}

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
