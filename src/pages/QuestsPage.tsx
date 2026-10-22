import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  EmptyState,
  PageHeader,
  ProgressBar,
  SearchInput,
  Select,
  TabBar,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { DIALOGUE_EVENTS, META, NPC_STATES, STEP_BY_ID } from "../lib/data";
import worldJson from "../data/world.json";
import { decisionsResolved } from "../lib/selectors";
import { navigate, queryString, useRoute } from "../lib/router";
import { setDecision, setDialogue, setNpcState, useActiveJourney } from "../lib/store";
import type { Decision, Dependency, DialogueEvent, Lockout, NpcState } from "../lib/types";
import "./world.css";

const LOCKOUTS: Lockout[] = worldJson.lockouts;
const DEPENDENCIES: Dependency[] = worldJson.dependencies;

type QuestTab = "npcs" | "decisions" | "lockouts" | "dependencies";
type BadgeTone = "default" | "accent" | "success" | "warning" | "danger" | "info";

const SEVERITY_TONE: Record<string, BadgeTone> = {
  Critical: "danger",
  Major: "warning",
  Moderate: "info",
  Minor: "default",
};

const RISK_TONE: Record<string, BadgeTone> = {
  Critical: "danger",
  High: "danger",
  Medium: "warning",
  Low: "info",
  None: "success",
};

const TABS = [
  { id: "npcs", label: "NPCs", count: NPC_STATES.length + DIALOGUE_EVENTS.length },
  { id: "decisions", label: "Decisions", count: META.decisions.length },
  { id: "lockouts", label: "Lockouts", count: LOCKOUTS.length },
  { id: "dependencies", label: "Dependencies", count: DEPENDENCIES.length },
];

function isQuestTab(value: string | null): value is QuestTab {
  return value === "npcs" || value === "decisions" || value === "lockouts" || value === "dependencies";
}

function RouteStepLinks({ ids }: { ids: string[] }) {
  const steps = ids.flatMap((id) => {
    const step = STEP_BY_ID[id];
    return step ? [step] : [];
  });
  if (steps.length === 0) return null;
  return (
    <div className="tag-list">
      {steps.map((step) => (
        <button
          key={step.id}
          className="chip quest-route-chip"
          onClick={() => navigate(`/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`)}
        >
          <Icon name="map" size={12} /> Step {step.order + 1} · {step.area}
        </button>
      ))}
    </div>
  );
}

function QuestField({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={`quest-field ${wide ? "wide" : ""}`.trim()}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

interface NpcStateCardProps {
  state: NpcState;
  done: boolean;
  onToggle: (value: boolean) => void;
  showNpc: boolean;
}

function NpcStateCard({ state, done, onToggle, showNpc }: NpcStateCardProps) {
  return (
    <article className={`card card-pad quest-card ${done ? "is-done" : ""}`.trim()}>
      <div className="row-between wrap" style={{ gap: 6 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Checkbox
            checked={done}
            onChange={onToggle}
            label={
              <>
                {done ? "Milestone done" : "Mark milestone done"}
                <span className="sr-only"> — {state.npc}, {state.region}</span>
              </>
            }
          />
          {showNpc ? <Badge tone="accent">{state.npc}</Badge> : <Badge>{state.region}</Badge>}
        </div>
        <span className="tiny faint mono">{state.id}</span>
      </div>
      <p className="quest-text">{state.milestone}</p>
      {state.warning ? (
        <Callout tone="warning" icon="alert">
          {state.warning}
        </Callout>
      ) : null}
      <RouteStepLinks ids={state.routeStepIds} />
    </article>
  );
}

interface DialogueCardProps {
  event: DialogueEvent;
  done: boolean;
  onToggle: (value: boolean) => void;
}

function DialogueCard({ event, done, onToggle }: DialogueCardProps) {
  return (
    <article className={`card card-pad quest-card ${done ? "is-done" : ""}`.trim()}>
      <div className="row-between wrap" style={{ gap: 6 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Checkbox
            checked={done}
            onChange={onToggle}
            label={
              <>
                {done ? "Dialogue heard" : "Mark dialogue heard"}
                <span className="sr-only"> — {event.npc}, {event.location}</span>
              </>
            }
          />
          <Badge tone="info">{event.location}</Badge>
        </div>
        <span className="tiny faint mono">{event.id}</span>
      </div>
      <h4 className="quest-card-title">{event.npc}</h4>
      <p className="quest-text">{event.trigger}</p>
      {event.warning ? (
        <Callout tone="warning" icon="alert">
          {event.warning}
        </Callout>
      ) : null}
      {event.notes ? <p className="small muted">{event.notes}</p> : null}
      <RouteStepLinks ids={event.routeStepIds} />
    </article>
  );
}

function outcomesFor(decision: Decision): string[] {
  return decision.outcomes
    .split(/\s*\/\s*/)
    .map((outcome) => outcome.trim())
    .filter(Boolean);
}

function reversibleTone(value: string): BadgeTone {
  const normalized = value.toLowerCase();
  if (normalized.startsWith("yes")) return "success";
  if (normalized.startsWith("partially")) return "warning";
  if (normalized.startsWith("no")) return "danger";
  return "info";
}

interface DecisionCardProps {
  decision: Decision;
  chosen?: string;
  focused: boolean;
  onChoose: (value: string) => void;
}

function DecisionCard({ decision, chosen, focused, onChoose }: DecisionCardProps) {
  const options = outcomesFor(decision);
  return (
    <article
      id={`decision-${decision.id}`}
      className={`card card-pad quest-card ${focused ? "is-focus" : ""}`.trim()}
    >
      <div className="row-between wrap" style={{ gap: 6 }}>
        <div className="world-badges">
          <Badge tone={decision.game === "DLC" ? "info" : "default"}>{decision.game}</Badge>
          <Badge tone="accent">{decision.category}</Badge>
          <Badge tone={chosen ? "success" : "warning"}>{chosen ? "Resolved" : "Unresolved"}</Badge>
        </div>
        <span className="tiny faint mono">{decision.id}</span>
      </div>

      <h3 className="quest-decision-title">{decision.title}</h3>
      <p className="quest-text">{decision.decisionPoint}</p>

      <Callout tone="warning" icon="clock">
        <strong>Deadline:</strong> {decision.deadline}
      </Callout>

      <div className="quest-field-grid">
        <QuestField label="Possible outcomes" value={decision.outcomes} wide />
        <QuestField label="Journey 1 plan" value={decision.journey1} />
        <QuestField label="Journey 1 result" value={decision.journey1Result} />
        <QuestField label="Future outcome" value={decision.futureOutcome} />
        <QuestField label="Future journey" value={decision.futureJourney} />
        <QuestField label="Completion requirement" value={decision.completionRequirement} wide />
      </div>

      <div className="quest-decision-actions">
        <Select
          label="Chosen outcome for this journey"
          value={chosen ?? ""}
          onChange={(event) => onChoose(event.target.value)}
        >
          <option value="">Not recorded yet</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {chosen && !options.includes(chosen) ? <option value={chosen}>{chosen}</option> : null}
        </Select>
        {chosen ? (
          <Button size="sm" variant="ghost" icon="x" onClick={() => onChoose("")}>
            Clear
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function LockoutCard({ lockout }: { lockout: Lockout }) {
  return (
    <article
      className={`card card-pad quest-card quest-lockout severity-${lockout.severity.toLowerCase()}`}
    >
      <div className="row-between wrap" style={{ gap: 6 }}>
        <div className="world-badges">
          <Badge tone={SEVERITY_TONE[lockout.severity] ?? "default"}>{lockout.severity}</Badge>
          <Badge>{lockout.triggerType}</Badge>
          <Badge tone={reversibleTone(lockout.reversible)}>Reversible: {lockout.reversible}</Badge>
        </div>
        <span className="tiny faint mono">{lockout.id}</span>
      </div>

      <h3 className="quest-card-title">{lockout.trigger}</h3>
      <div className="small muted">
        {lockout.act} · {lockout.area}
      </div>

      <div className="quest-field-grid">
        <QuestField label="What changes" value={lockout.changes} wide />
        <QuestField label="Safe window" value={lockout.safeWindow} />
        <QuestField label="Pre-checks" value={lockout.preChecks} />
        <QuestField label="Objective" value={lockout.objectiveId} />
        <QuestField label="Current status" value={lockout.status} />
        <QuestField label="Notes" value={lockout.notes} wide />
      </div>

      <RouteStepLinks ids={lockout.routeStepIds} />
    </article>
  );
}

function DependencyCard({ dependency }: { dependency: Dependency }) {
  return (
    <article className="card card-pad quest-card">
      <div className="row-between wrap" style={{ gap: 6 }}>
        <div className="world-badges">
          <Badge tone={RISK_TONE[dependency.lockoutRisk] ?? "default"}>
            Lockout risk: {dependency.lockoutRisk}
          </Badge>
          <Badge>{dependency.timing}</Badge>
        </div>
        <span className="tiny faint mono">{dependency.id}</span>
      </div>

      <h3 className="quest-card-title">{dependency.event}</h3>
      <div className="small muted">
        {dependency.act} · {dependency.area}
      </div>

      <div className="quest-field-grid">
        <QuestField label="Depends on" value={dependency.dependsOn} />
        <QuestField label="Unlocks" value={dependency.unlocks} />
        <QuestField label="What changes" value={dependency.changes} wide />
        <QuestField label="Timing" value={dependency.timing} />
        <QuestField label="Objective" value={dependency.objectiveId} />
        <QuestField label="Rationale" value={dependency.rationale} wide />
      </div>

      <RouteStepLinks ids={dependency.routeStepIds} />
    </article>
  );
}

export function QuestsPage() {
  const route = useRoute();
  const journey = useActiveJourney();
  const toast = useToast();

  const tabParam = route.query.get("tab");
  const npcParam = route.query.get("npc");
  const decisionParam = route.query.get("decision");
  const tab: QuestTab = isQuestTab(tabParam) ? tabParam : decisionParam ? "decisions" : "npcs";

  const [npcQuery, setNpcQuery] = useState("");
  const [groupMode, setGroupMode] = useState<"npc" | "region">("npc");
  const [decisionQuery, setDecisionQuery] = useState("");
  const [gameFilter, setGameFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lockQuery, setLockQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [dependencyQuery, setDependencyQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

  const focusedState = NPC_STATES.find((state) => state.id === npcParam || state.npc === npcParam);
  const focusedDialogue = DIALOGUE_EVENTS.find(
    (event) => event.id === npcParam || event.npc === npcParam,
  );
  const focusedNpc = focusedState?.npc ?? focusedDialogue?.npc;

  const npcDone = NPC_STATES.filter((state) => journey.npcStates[state.id]).length;
  const dialogueDone = DIALOGUE_EVENTS.filter((event) => journey.dialogue[event.id]).length;
  const resolvedDecisions = decisionsResolved(journey, META.decisions.length);

  const filteredNpcStates = useMemo(() => {
    const q = npcQuery.trim().toLowerCase();
    return NPC_STATES.filter((state) => {
      if (focusedNpc && state.npc !== focusedNpc) return false;
      if (!q) return true;
      return [state.npc, state.region, state.milestone, state.warning, state.validation]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [npcQuery, focusedNpc]);

  const filteredDialogues = useMemo(() => {
    const q = npcQuery.trim().toLowerCase();
    return DIALOGUE_EVENTS.filter((event) => {
      if (focusedNpc && event.npc !== focusedNpc) return false;
      if (!q) return true;
      return [event.npc, event.location, event.trigger, event.warning, event.notes, event.validation]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [npcQuery, focusedNpc]);

  const groupedNpcStates = useMemo(() => {
    const groups = new Map<string, NpcState[]>();
    for (const state of filteredNpcStates) {
      const key = groupMode === "npc" ? state.npc : state.region;
      const bucket = groups.get(key);
      if (bucket) bucket.push(state);
      else groups.set(key, [state]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredNpcStates, groupMode]);

  const groupedDialogues = useMemo(() => {
    const groups = new Map<string, DialogueEvent[]>();
    for (const event of filteredDialogues) {
      const bucket = groups.get(event.npc);
      if (bucket) bucket.push(event);
      else groups.set(event.npc, [event]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredDialogues]);

  const categories = useMemo(
    () => [...new Set(META.decisions.map((decision) => decision.category))].sort((a, b) => a.localeCompare(b)),
    [],
  );

  const filteredDecisions = useMemo(() => {
    const q = decisionQuery.trim().toLowerCase();
    const rows = META.decisions.filter((decision) => {
      if (gameFilter !== "all" && decision.game !== gameFilter) return false;
      if (categoryFilter !== "all" && decision.category !== categoryFilter) return false;
      if (!q) return true;
      return [
        decision.title,
        decision.game,
        decision.category,
        decision.decisionPoint,
        decision.deadline,
        decision.outcomes,
        decision.journey1,
        decision.journey1Result,
        decision.futureOutcome,
        decision.futureJourney,
        decision.completionRequirement,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    if (!decisionParam) return rows;
    return [...rows].sort(
      (a, b) => Number(b.id === decisionParam) - Number(a.id === decisionParam),
    );
  }, [decisionQuery, gameFilter, categoryFilter, decisionParam]);

  const severities = useMemo(
    () => [...new Set(LOCKOUTS.map((lockout) => lockout.severity))].sort((a, b) => a.localeCompare(b)),
    [],
  );

  const filteredLockouts = useMemo(() => {
    const q = lockQuery.trim().toLowerCase();
    return LOCKOUTS.filter((lockout) => {
      if (severityFilter !== "all" && lockout.severity !== severityFilter) return false;
      if (!q) return true;
      return [
        lockout.trigger,
        lockout.triggerType,
        lockout.area,
        lockout.act,
        lockout.changes,
        lockout.reversible,
        lockout.safeWindow,
        lockout.preChecks,
        lockout.notes,
        lockout.validation,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [lockQuery, severityFilter]);

  const riskLevels = useMemo(
    () => [...new Set(DEPENDENCIES.map((dependency) => dependency.lockoutRisk))].sort((a, b) => a.localeCompare(b)),
    [],
  );

  const filteredDependencies = useMemo(() => {
    const q = dependencyQuery.trim().toLowerCase();
    return DEPENDENCIES.filter((dependency) => {
      if (riskFilter !== "all" && dependency.lockoutRisk !== riskFilter) return false;
      if (!q) return true;
      return [
        dependency.event,
        dependency.dependsOn,
        dependency.unlocks,
        dependency.changes,
        dependency.lockoutRisk,
        dependency.timing,
        dependency.rationale,
        dependency.act,
        dependency.area,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [dependencyQuery, riskFilter]);

  useEffect(() => {
    if (!decisionParam || tab !== "decisions") return;
    const element = document.getElementById(`decision-${decisionParam}`);
    element?.scrollIntoView({ block: "center" });
  }, [decisionParam, tab]);

  const goTab = (id: string) => {
    navigate(`/quests${queryString({ tab: id === "npcs" ? undefined : id })}`);
  };

  const chooseDecision = (decision: Decision, value: string) => {
    setDecision(decision.id, value);
    toast.push(
      value ? `Outcome recorded for ${decision.title}.` : `Decision cleared for ${decision.title}.`,
      "success",
    );
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · World state`}
        title="Quests"
        description={
          <>
            {NPC_STATES.length} NPC milestones and {DIALOGUE_EVENTS.length} dialogue events,{" "}
            {META.decisions.length} tracked decisions, {LOCKOUTS.length} lockout warnings, and{" "}
            {DEPENDENCIES.length} dependency chains. Every linked record jumps to its exact Act I route step.
          </>
        }
        actions={
          <>
            <Button icon="map" onClick={() => navigate("/journey")}>
              Open journey
            </Button>
            <Button variant="ghost" icon="skull" onClick={() => navigate("/bosses")}>
              Bosses
            </Button>
          </>
        }
      />

      <TabBar items={TABS} value={tab} onChange={goTab} />

      {tab === "npcs" ? (
        <div style={{ marginTop: 16 }}>
          <section className="card card-pad">
            <div className="quest-toolbar">
              <SearchInput
                className="world-filter-search"
                value={npcQuery}
                onChange={setNpcQuery}
                placeholder="Search NPCs, milestones, warnings, dialogue…"
              />
              <Select
                label="Group milestones"
                className="world-filter-field"
                value={groupMode}
                onChange={(event) => setGroupMode(event.target.value === "region" ? "region" : "npc")}
              >
                <option value="npc">By NPC</option>
                <option value="region">By region</option>
              </Select>
              <div className="quest-counts">
                <Badge tone={npcDone === NPC_STATES.length ? "success" : "default"}>
                  {npcDone} / {NPC_STATES.length} milestones
                </Badge>
                <Badge tone={dialogueDone === DIALOGUE_EVENTS.length ? "success" : "default"}>
                  {dialogueDone} / {DIALOGUE_EVENTS.length} dialogue
                </Badge>
              </div>
            </div>
            <div style={{ marginTop: 13 }}>
              <ProgressBar
                value={
                  NPC_STATES.length + DIALOGUE_EVENTS.length > 0
                    ? ((npcDone + dialogueDone) / (NPC_STATES.length + DIALOGUE_EVENTS.length)) * 100
                    : 0
                }
                label={`${npcDone} milestones · ${dialogueDone} dialogue events resolved`}
                detail={`${filteredNpcStates.length} milestones / ${filteredDialogues.length} dialogue shown`}
              />
            </div>
          </section>

          {focusedNpc ? (
            <div className="quest-focus">
              <Badge tone="accent">NPC focus</Badge>
              <span className="quest-focus-label">{focusedNpc}</span>
              <Button
                size="sm"
                variant="ghost"
                icon="x"
                onClick={() => {
                  setNpcQuery("");
                  navigate("/quests");
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}

          {groupedNpcStates.length ? (
            groupedNpcStates.map(([groupName, states]) => (
              <section className="quest-group" key={groupName}>
                <div className="quest-group-head">
                  <h3>{groupName}</h3>
                  <span className="meta">
                    {states.length} milestone{states.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {states.map((state) => (
                    <NpcStateCard
                      key={state.id}
                      state={state}
                      done={Boolean(journey.npcStates[state.id])}
                      showNpc={groupMode === "region"}
                      onToggle={(value) => {
                        setNpcState(state.id, value);
                        toast.push(
                          value
                            ? `${state.npc} milestone marked done.`
                            : `${state.npc} milestone reopened.`,
                          "success",
                        );
                      }}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div style={{ marginTop: 14 }}>
              <EmptyState
                title="No NPC milestones match"
                description="Try a different name, region, or milestone keyword."
                icon="users"
                action={
                  <Button
                    variant="primary"
                    icon="refresh"
                    onClick={() => {
                      setNpcQuery("");
                      navigate("/quests");
                    }}
                  >
                    Clear search
                  </Button>
                }
              />
            </div>
          )}

          <section className="quest-group">
            <div className="quest-group-head">
              <h3>Dialogue events</h3>
              <span className="meta">
                {filteredDialogues.length} of {DIALOGUE_EVENTS.length}
              </span>
            </div>
            {groupedDialogues.length ? (
              groupedDialogues.map(([npc, events]) => (
                <div className="stack" style={{ gap: 8, marginBottom: 14 }} key={npc}>
                  <div className="row-between">
                    <span className="small accent">{npc}</span>
                    <span className="tiny faint">
                      {events.length} trigger{events.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {events.map((event) => (
                    <DialogueCard
                      key={event.id}
                      event={event}
                      done={Boolean(journey.dialogue[event.id])}
                      onToggle={(value) => {
                        setDialogue(event.id, value);
                        toast.push(
                          value
                            ? `Dialogue recorded for ${event.npc}.`
                            : `Dialogue record cleared for ${event.npc}.`,
                          "success",
                        );
                      }}
                    />
                  ))}
                </div>
              ))
            ) : (
              <p className="small faint">No dialogue events match this search.</p>
            )}
          </section>
        </div>
      ) : null}

      {tab === "decisions" ? (
        <div style={{ marginTop: 16 }}>
          <section className="card card-pad">
            <div className="quest-toolbar">
              <SearchInput
                className="world-filter-search"
                value={decisionQuery}
                onChange={setDecisionQuery}
                placeholder="Search decisions, outcomes, deadlines…"
              />
              <Select
                label="Game"
                className="world-filter-field"
                value={gameFilter}
                onChange={(event) => setGameFilter(event.target.value)}
              >
                <option value="all">Base + DLC</option>
                <option value="Base Game">Base Game</option>
                <option value="DLC">DLC</option>
              </Select>
              <Select
                label="Category"
                className="world-filter-field"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
              <div className="quest-counts">
                <Badge tone="success">{resolvedDecisions} resolved</Badge>
                <Badge tone="warning">{META.decisions.length - resolvedDecisions} unresolved</Badge>
              </div>
            </div>
            <div style={{ marginTop: 13 }}>
              <ProgressBar
                value={META.decisions.length ? (resolvedDecisions / META.decisions.length) * 100 : 0}
                label={`${resolvedDecisions} of ${META.decisions.length} decisions recorded`}
                detail={`${filteredDecisions.length} shown`}
              />
            </div>
          </section>

          {filteredDecisions.length ? (
            <div className="stack" style={{ marginTop: 14 }}>
              {filteredDecisions.map((decision) => (
                <DecisionCard
                  key={decision.id}
                  decision={decision}
                  chosen={journey.decisions[decision.id]}
                  focused={decision.id === decisionParam}
                  onChoose={(value) => chooseDecision(decision, value)}
                />
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <EmptyState
                title="No decisions match"
                description="Clear the game/category filter or widen the search."
                icon="scroll"
                action={
                  <Button
                    variant="primary"
                    icon="refresh"
                    onClick={() => {
                      setDecisionQuery("");
                      setGameFilter("all");
                      setCategoryFilter("all");
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === "lockouts" ? (
        <div style={{ marginTop: 16 }}>
          <Callout tone="warning" icon="lock">
            Lockouts are read-only route warnings. They describe permanent or partially reversible state changes;
            confirm the safe window and pre-checks before advancing the linked step.
          </Callout>

          <section className="card card-pad" style={{ marginTop: 12 }}>
            <div className="quest-toolbar">
              <SearchInput
                className="world-filter-search"
                value={lockQuery}
                onChange={setLockQuery}
                placeholder="Search triggers, areas, changes, pre-checks…"
              />
              <Select
                label="Severity"
                className="world-filter-field"
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
              >
                <option value="all">All severities</option>
                {severities.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </Select>
              <div className="quest-counts">
                <Badge>
                  {filteredLockouts.length} / {LOCKOUTS.length}
                </Badge>
                <Badge tone="danger">
                  {LOCKOUTS.filter((lockout) => lockout.severity === "Critical").length} critical
                </Badge>
              </div>
            </div>
          </section>

          {filteredLockouts.length ? (
            <div className="stack" style={{ marginTop: 14 }}>
              {filteredLockouts.map((lockout) => (
                <LockoutCard key={lockout.id} lockout={lockout} />
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <EmptyState
                title="No lockouts match"
                description="Try another severity or keyword."
                icon="shieldOff"
                action={
                  <Button
                    variant="primary"
                    icon="refresh"
                    onClick={() => {
                      setLockQuery("");
                      setSeverityFilter("all");
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === "dependencies" ? (
        <div style={{ marginTop: 16 }}>
          <section className="card card-pad">
            <div className="quest-toolbar">
              <SearchInput
                className="world-filter-search"
                value={dependencyQuery}
                onChange={setDependencyQuery}
                placeholder="Search events, prerequisites, unlocks…"
              />
              <Select
                label="Lockout risk"
                className="world-filter-field"
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value)}
              >
                <option value="all">Any risk</option>
                {riskLevels.map((risk) => (
                  <option key={risk} value={risk}>
                    {risk}
                  </option>
                ))}
              </Select>
              <div className="quest-counts">
                <Badge>
                  {filteredDependencies.length} / {DEPENDENCIES.length}
                </Badge>
                <Badge tone="danger">
                  {DEPENDENCIES.filter((dependency) => dependency.lockoutRisk === "Critical").length} critical
                </Badge>
              </div>
            </div>
          </section>

          {filteredDependencies.length ? (
            <div className="stack" style={{ marginTop: 14 }}>
              {filteredDependencies.map((dependency) => (
                <DependencyCard key={dependency.id} dependency={dependency} />
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <EmptyState
                title="No dependencies match"
                description="Try another risk level or keyword."
                icon="layers"
                action={
                  <Button
                    variant="primary"
                    icon="refresh"
                    onClick={() => {
                      setDependencyQuery("");
                      setRiskFilter("all");
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
