import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Disclosure,
  Modal,
  PageHeader,
  ProgressBar,
  Ring,
  SectionTitle,
  StatCompare,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { ART, ArtHero } from "../components/Art";
import {
  applyProfile,
  resetAll,
  setStepStatus,
  useActiveCharacter,
  useActiveJourney,
  useAppState,
} from "../lib/store";
import { isDesktop } from "../lib/desktop";
import {
  areaProgress,
  collectionSummary,
  completionScopes,
  currentAreaName,
  endingSummary,
  nextRouteStep,
  nextSupplemental,
  routeProgress,
  supplementalProgress,
} from "../lib/selectors";
import type { CompletionScope, Progress } from "../lib/selectors";
import {
  ENCOUNTER_BY_ID,
  ITEM_BY_ID,
  LOADOUTS_BY_BUILD,
  PHASE_GATES,
  PROFILE_BY_ID,
  QUESTLINES,
  ROUTE_AREAS,
  ROUTE_CHRONOLOGY,
  STEPS_BY_PHASE,
  PROFILES_BY_ARCHETYPE,
} from "../lib/data";
import { formatNumber, itemGroupIcon } from "../lib/format";
import { navigate } from "../lib/router";
import { STAT_LABELS, STAT_ORDER, levelFromStats } from "../lib/classes";
import { DATA_BASELINE, GAME_VERSION } from "../data/game";
import type { PhaseGate, RouteArea, RouteStep, StepStatus } from "../lib/types";
import "./dashboard.css";

const PHASES = ROUTE_CHRONOLOGY.phases;

interface MissableStats {
  total: number;
  remaining: number;
  resolved: number;
}

interface PhaseRow {
  id: string;
  label: string;
  index: number;
  progress: Progress;
  areas: RouteArea[];
  currentArea: RouteArea | undefined;
  nextArea: RouteArea | undefined;
  missables: MissableStats;
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

function phaseIdForLabel(label: string | undefined): string {
  return PHASES.find((phase) => phase.label === label)?.id ?? PHASES[0].id;
}

function gateScopeSteps(gate: PhaseGate): RouteStep[] {
  if (!gate.filter.sections.length) return STEPS_BY_PHASE[gate.filter.phase] ?? [];
  const allowed = new Set(
    ROUTE_AREAS.filter((area) => gate.filter.sections.includes(area.sectionId)).map((area) => area.name),
  );
  return (STEPS_BY_PHASE[gate.filter.phase] ?? []).filter((step) => allowed.has(step.area));
}

const SCOPE_HREF: Record<string, string> = {
  route: "/journey",
  collection: "/collection",
  achievements: "/completion?tab=endings",
  bosses: "/bosses",
  quests: "/quests",
  lore: "/lore",
  endings: "/completion?tab=endings",
  remembrances: "/completion?tab=remembrances",
  ngplus: "/completion?tab=readiness",
  graces: "/atlas",
  world: "/atlas",
  upgrades: "/materials?tab=upgrades",
  materials: "/materials?tab=materials",
  merchants: "/farms?tab=merchants",
  "npc-walkthrough": "/journey?tab=npc",
  "branch-rewards": "/completion?tab=branch",
};

export function DashboardPage() {
  const state = useAppState();
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const route = routeProgress(journey);
  const chronology = supplementalProgress(journey);
  const collection = collectionSummary(character);
  const ending = endingSummary(character);
  const next = nextRouteStep(journey);
  const nextAction = nextSupplemental(journey);
  const area = next?.area ?? currentAreaName(journey);
  const level = levelFromStats(character.stats);
  const profile = character.profileId ? PROFILE_BY_ID[character.profileId] : undefined;
  const loadout = profile ? LOADOUTS_BY_BUILD[profile.id]?.find((entry) => entry.type === "Signature") : undefined;
  const scopes = completionScopes(character, journey);
  const scopesById = Object.fromEntries(scopes.map((scope) => [scope.id, scope])) as Record<string, CompletionScope>;
  const linkedItems = next
    ? next.linkedIds
        .map((id) => ITEM_BY_ID[id])
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .slice(0, 4)
    : [];
  const linkedBosses = next
    ? next.linkedIds
        .map((id) => ENCOUNTER_BY_ID[id])
        .filter((boss): boss is NonNullable<typeof boss> => Boolean(boss))
    : [];
  const otherLinkedCount = next
    ? next.linkedIds.filter((id) => !ITEM_BY_ID[id] && !ENCOUNTER_BY_ID[id]).length
    : 0;
  const phaseRows = useMemo<PhaseRow[]>(
    () =>
      PHASES.map((phase, index) => {
        const steps = STEPS_BY_PHASE[phase.label] ?? [];
        const progress = progressFor(steps, journey.steps);
        const areas = ROUTE_AREAS.filter((entry) => entry.hasRoute && entry.phase === phase.label).sort(
          (a, b) => a.order - b.order,
        );
        const nextAreaHere = next?.phase === phase.label ? areas.find((entry) => entry.name === next.area) : undefined;
        const firstUnresolvedArea = areas.find((entry) => {
          const areaStats = areaProgress(journey, entry.name);
          return areaStats.resolved < areaStats.total;
        });
        const currentArea =
          nextAreaHere ??
          (progress.complete ? undefined : (firstUnresolvedArea ?? areas.at(-1)));
        const currentIndex = currentArea ? areas.indexOf(currentArea) : -1;
        return {
          id: phase.id,
          label: phase.label,
          index,
          progress,
          areas,
          currentArea,
          nextArea: currentIndex >= 0 ? areas[currentIndex + 1] : undefined,
          missables: missableStats(steps, journey.steps),
        };
      }),
    [journey, next],
  );

  const focusPhase = next
    ? phaseRows.find((phase) => phase.label === next.phase) ?? phaseRows[phaseRows.length - 1]
    : phaseRows[phaseRows.length - 1];
  const upcomingGate = next
    ? PHASE_GATES.find((gate) => gate.order >= next.order && gate.order - next.order <= 180)
    : undefined;
  const nextGate = next ? PHASE_GATES.find((gate) => gate.order >= next.order) : undefined;
  const upcomingGateMissables = upcomingGate
    ? missableStats(gateScopeSteps(upcomingGate), journey.steps)
    : undefined;
  const heroImage =
    next?.phase === "Shadow of the Erdtree"
      ? ART.heroSote
      : next?.phase === "Base Game — endgame"
        ? ART.erdtreeShots[4]
        : ART.erdtreeShots[2];

  const nextMissable = next
    ? [...(STEPS_BY_PHASE[next.phase] ?? [])]
        .filter((step) => step.missable && journey.steps[step.id] !== "done" && journey.steps[step.id] !== "skipped")
        .sort((a, b) => a.order - b.order)[0]
    : undefined;

  const level150 = character.archetypeId
    ? PROFILES_BY_ARCHETYPE[character.archetypeId]?.find((entry) => entry.level === 150)
    : undefined;
  const level200 = character.archetypeId
    ? PROFILES_BY_ARCHETYPE[character.archetypeId]?.find((entry) => entry.level === 200)
    : undefined;
  const currentScopedProfile = profile ?? level150;
  const showLevel200 = level > 150 && Boolean(level200);
  const [resetOpen, setResetOpen] = useState(false);

  const completeNext = () => {
    if (!next) return;
    const result = setStepStatus(next.id, "done");
    const parts = ["Step marked done."];
    if (result.acquiredItems.length) parts.push(`${result.acquiredItems.length} item${result.acquiredItems.length === 1 ? "" : "s"} acquired`);
    if (result.defeatedBosses.length) parts.push(`${result.defeatedBosses.length} boss${result.defeatedBosses.length === 1 ? "" : "es"} recorded`);
    if (result.scarabs.length) parts.push(`${result.scarabs.length} scarab${result.scarabs.length === 1 ? "" : "s"} collected`);
    toast.push(parts.join(" · "), "success");
  };

  const openCommandSearch = () => {
    window.dispatchEvent(new Event("er-companion:search"));
  };

  useEffect(() => {
    const onQuickLog = () => {
      if (next) completeNext();
    };
    window.addEventListener("er-companion:quick-log", onQuickLog);
    return () => window.removeEventListener("er-companion:quick-log", onQuickLog);
  });

  const heroKicker = next ? `Next action · ${next.phase}` : "Full route · complete";
  const heroTitle = next?.instruction ?? "The full route is closed.";
  const heroDescription = next
    ? `${next.sectionTitle} · ${next.game}${next.levelRange ? ` · ${next.levelRange}` : ""}`
    : `All ${formatNumber(route.total)} route steps are resolved across the base game, Shadow of the Erdtree, and the endgame.`;
  const heroActions = next ? (
    <>
      <Button variant="primary" icon="check" onClick={completeNext}>
        Mark step done
      </Button>
      <Button
        icon="eye"
        onClick={() =>
          navigate(
            `/journey?phase=${encodeURIComponent(phaseIdForLabel(next.phase))}&area=${encodeURIComponent(
              next.area,
            )}&step=${next.id}`,
          )
        }
      >
        Inspect in journey
      </Button>
      {next.missable ? (
        <Button
          variant="danger"
          icon="alert"
          onClick={() =>
            navigate(`/journey?phase=${encodeURIComponent(phaseIdForLabel(next.phase))}&missable=1`)
          }
        >
          Review missables
        </Button>
      ) : null}
    </>
  ) : (
    <>
      <Button variant="primary" icon="list" onClick={() => navigate("/journey?tab=chronology")}>
        Companion chronology
      </Button>
      <Button icon="trophy" onClick={() => navigate("/completion")}>
        Completion
      </Button>
    </>
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Three-phase route`}
        title="Continue the journey"
        description={
          <>
            Base game through Maliketh, the entire Shadow of the Erdtree, then the base-game endgame. The dashboard follows
            the same canonical order as the {formatNumber(route.total)}-step Journey route.
          </>
        }
        actions={
          <>
            <Button variant="primary" icon="map" onClick={() => navigate("/journey")}>
              Open journey
            </Button>
            <Button variant="ghost" icon="refresh" onClick={() => setResetOpen(true)}>
              Reset progress
            </Button>
          </>
        }
      />

      <div className="hero-grid">
        <ArtHero
          image={heroImage}
          kicker={heroKicker}
          title={heroTitle}
          description={heroDescription}
          actions={heroActions}
          className="dashboard-hero"
        >
          {next ? (
            <>
              <div className="dashboard-hero-chips">
                <Badge tone="accent">{next.phase}</Badge>
                <Badge>{next.game}</Badge>
                <Badge tone={next.required ? "warning" : "default"}>{next.required ? "Required" : "Optional"}</Badge>
                {next.missable ? (
                  <Badge tone="danger">
                    <Icon name="alert" size={10} /> Missable
                  </Badge>
                ) : null}
                <span className="tiny faint mono">
                  Step {formatNumber(next.order)} / {formatNumber(route.total)}
                </span>
              </div>

              <div className="dashboard-hero-meta">
                <span>
                  <Icon name="map" size={12} /> {next.sectionTitle}
                </span>
                {next.levelRange ? <span>{next.levelRange}</span> : null}
                <span>
                  <Icon name="layers" size={12} /> {next.objectiveName}
                </span>
                {next.estimatedTime ? (
                  <span>
                    <Icon name="clock" size={12} /> {next.estimatedTime}
                  </span>
                ) : null}
              </div>

              {next.warning || next.missable ? (
                <div className={`dashboard-hero-warning${next.missable ? " is-danger" : ""}`}>
                  <Icon name="alert" size={14} />
                  <span>
                    {next.missable ? <strong>MISSABLE. </strong> : null}
                    {next.warning || "Flagged missable by the route source. Resolve it before the phase gate."}
                  </span>
                </div>
              ) : null}

              {next.prerequisites ? (
                <div className="dashboard-hero-prereq">
                  <Icon name="lock" size={12} /> Prerequisite: {next.prerequisites}
                </div>
              ) : null}

              {linkedItems.length || linkedBosses.length || otherLinkedCount ? (
                <div className="tag-list dashboard-hero-links">
                  {linkedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="chip"
                      onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
                    >
                      <Icon name={itemGroupIcon(item.group)} size={12} />
                      {item.name}
                    </button>
                  ))}
                  {linkedBosses.length ? (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => navigate(`/bosses?encounter=${encodeURIComponent(linkedBosses[0].id)}`)}
                      title={linkedBosses.map((boss) => boss.name).join(", ")}
                    >
                      <Icon name="skull" size={12} />
                      {linkedBosses.length} boss{linkedBosses.length === 1 ? "" : "es"} linked
                    </button>
                  ) : null}
                  {otherLinkedCount ? (
                    <span className="chip">
                      <Icon name="layers" size={12} />
                      {otherLinkedCount} other record{otherLinkedCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="dashboard-hero-progress">
                <ProgressBar
                  value={route.requiredPercent}
                  label={`${route.requiredResolved} / ${route.required} required steps`}
                  detail={`${route.done} done · ${route.skipped} skipped · Phase: ${next.phase}`}
                />
              </div>
            </>
          ) : (
            <>
              <p className="dashboard-hero-complete">
                The full route is closed. All {formatNumber(route.total)} steps are resolved across the three phases.
              </p>
              <div className="dashboard-hero-progress">
                <ProgressBar value={100} label={`${formatNumber(route.total)} of ${formatNumber(route.total)} steps`} />
              </div>
            </>
          )}
        </ArtHero>

        <section className="card card-pad dashboard-pulse">
          <div className="row-between">
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                Journey pulse
              </div>
              <h2 className="card-title">{journey.label}</h2>
            </div>
            <Ring value={route.requiredPercent} size={84} stroke={5} />
          </div>
          <div className="pulse-grid">
            <div>
              <div className="stat-label">Route</div>
              <div className="pulse-value">{route.requiredPercent}%</div>
              <div className="tiny faint">
                {formatNumber(route.resolved)} / {formatNumber(route.total)} resolved
              </div>
            </div>
            <div>
              <div className="stat-label">Collection</div>
              <div className="pulse-value">{collection.percent}%</div>
              <div className="tiny faint">
                {formatNumber(collection.owned)} / {formatNumber(collection.total)}
              </div>
            </div>
            <div>
              <div className="stat-label">Bosses</div>
              <div className="pulse-value">
                {formatNumber(scopesById.bosses.numerator)}
              </div>
              <div className="tiny faint">of {formatNumber(scopesById.bosses.denominator)} recorded</div>
            </div>
            <div>
              <div className="stat-label">Achievements</div>
              <div className="pulse-value">
                {formatNumber(scopesById.achievements.numerator)}
              </div>
              <div className="tiny faint">of {formatNumber(scopesById.achievements.denominator)} earned</div>
            </div>
          </div>
          <div className="divider" />
          <div className="row-between">
            <div className="small muted">Next companion action</div>
            <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate("/journey?tab=chronology")}>
              View
            </Button>
          </div>
          {nextAction ? (
            <button
              className="pulse-action"
              onClick={() => navigate(`/journey?tab=chronology&action=${encodeURIComponent(nextAction.id)}`)}
            >
              <Icon name="list" size={15} />
              <span className="grow">
                <span className="pulse-action-title">{nextAction.action}</span>
                <span className="pulse-action-sub">
                  {nextAction.area} · {nextAction.category}
                </span>
              </span>
              <Icon name="chevronRight" size={14} />
            </button>
          ) : (
            <p className="small faint">All companion chronology actions are resolved.</p>
          )}
        </section>
      </div>

      <div className="grid-4" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="stat-label">Full route</div>
          <div className="stat-value">
            {formatNumber(route.resolved)} <small>/ {formatNumber(route.total)}</small>
          </div>
          <div className="stat-delta">
            {route.requiredPercent}% required · {formatNumber(route.total - route.resolved)} open
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Master collection</div>
          <div className="stat-value">
            {formatNumber(collection.owned)} <small>/ {formatNumber(collection.total)}</small>
          </div>
          <div className="stat-delta">
            {collection.baseGame.owned} base · {collection.dlc.owned} DLC owned
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Missables · {focusPhase.label}</div>
          <div className="stat-value">
            {formatNumber(focusPhase.missables.remaining)} <small>remaining</small>
          </div>
          <div className="stat-delta">
            {formatNumber(focusPhase.missables.total)} flagged in this phase
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Achievements</div>
          <div className="stat-value">
            {formatNumber(scopesById.achievements.numerator)} <small>/ {formatNumber(scopesById.achievements.denominator)}</small>
          </div>
          <div className="stat-delta">
            Endings viewed: {ending.viewed} / {ending.total}
          </div>
        </div>
      </div>

      <Disclosure
        title="Route phases"
        summary="Canonical order: Maliketh → Shadow of the Erdtree → Ashen Capital"
        tone="accent"
        icon="map"
      >
        <div className="dashboard-phase-grid" style={{ marginTop: 12 }}>
          {phaseRows.map((phase) => {
            const isCurrent = next ? phase.label === next.phase : phase.index === phaseRows.length - 1;
            return (
              <button
                key={phase.id}
                type="button"
                className={`dashboard-phase${isCurrent ? " is-current" : ""}${
                  phase.progress.complete ? " is-complete" : ""
                }`}
                onClick={() => navigate(`/journey?phase=${encodeURIComponent(phase.id)}`)}
              >
                <span className="dashboard-phase-head">
                  <span className="dashboard-phase-index">Phase {phase.index + 1}</span>
                  {phase.progress.complete ? (
                    <Badge tone="success">Complete</Badge>
                  ) : isCurrent ? (
                    <Badge tone="accent">Current</Badge>
                  ) : (
                    <Badge>Upcoming</Badge>
                  )}
                </span>
                <span className="dashboard-phase-title">{phase.label}</span>
                <span className="dashboard-phase-meta">
                  {phase.areas.length} sections · {formatNumber(phase.progress.total)} steps
                  {phase.missables.remaining ? (
                    <span className="dashboard-phase-missable">
                      <Icon name="alert" size={11} /> {formatNumber(phase.missables.remaining)} missable left
                    </span>
                  ) : (
                    <span className="dashboard-phase-missable is-clear">
                      <Icon name="check" size={11} /> no missables left
                    </span>
                  )}
                </span>
                <ProgressBar value={phase.progress.requiredPercent} tone={phase.progress.complete ? "success" : "accent"} />
                <span className="dashboard-phase-sections">
                  <span>
                    <Icon name="target" size={11} /> Now: {phase.currentArea?.name ?? "—"}
                  </span>
                  <span>
                    <Icon name="chevronRight" size={11} /> Next: {phase.nextArea?.name ?? "Phase complete"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Disclosure>

      <div className={`dashboard-alert-grid${upcomingGate ? "" : " dashboard-alert-grid--single"}`}>
        <section className={`card card-pad dashboard-missables${focusPhase.missables.remaining ? "" : " is-clear"}`}>
          <div className="row-between wrap">
            <div className="dashboard-missables-head">
              <span className="dashboard-missables-icon">
                <Icon name={focusPhase.missables.remaining ? "alert" : "check"} size={20} />
              </span>
              <div>
                <div className="eyebrow">Missable watch</div>
                <h3 className="dashboard-missables-title">
                  {focusPhase.missables.remaining
                    ? `${formatNumber(focusPhase.missables.remaining)} missable steps remain in ${focusPhase.label}`
                    : `No unresolved missables in ${focusPhase.label}`}
                </h3>
              </div>
            </div>
            <Badge tone={focusPhase.missables.remaining ? "danger" : "success"}>
              {formatNumber(focusPhase.missables.resolved)} / {formatNumber(focusPhase.missables.total)} resolved
            </Badge>
          </div>
          <p className="dashboard-missables-copy">
            {focusPhase.missables.remaining
              ? "These steps can be lost permanently. Resolve them or consciously skip them before crossing the phase gate."
              : "Every flagged missable in this phase is resolved. Continue when the surrounding collection and quest state is ready."}
          </p>
          {nextMissable ? (
            <button
              type="button"
              className="dashboard-next-missable"
              onClick={() =>
                navigate(
                  `/journey?phase=${encodeURIComponent(phaseIdForLabel(nextMissable.phase))}&area=${encodeURIComponent(
                    nextMissable.area,
                  )}&step=${nextMissable.id}`,
                )
              }
            >
              <Icon name="alert" size={14} />
              <span className="grow">
                <span className="dashboard-next-missable-title">
                  Next missable · #{formatNumber(nextMissable.order)} · {nextMissable.area}
                </span>
                <span className="dashboard-next-missable-copy">{nextMissable.instruction}</span>
                {nextMissable.warning ? (
                  <span className="dashboard-next-missable-warning">{nextMissable.warning}</span>
                ) : null}
              </span>
              <Icon name="chevronRight" size={14} />
            </button>
          ) : null}
          <ProgressBar
            value={
              focusPhase.missables.total
                ? Math.round((focusPhase.missables.resolved / focusPhase.missables.total) * 100)
                : 100
            }
            tone={focusPhase.missables.remaining ? "accent" : "success"}
            className={focusPhase.missables.remaining ? "dashboard-missable-progress" : undefined}
          />
          <div className="row wrap dashboard-missables-actions">
            <Button
              variant={focusPhase.missables.remaining ? "danger" : "default"}
              icon="alert"
              onClick={() => navigate(`/journey?phase=${encodeURIComponent(focusPhase.id)}&missable=1`)}
            >
              Review missables in this phase
            </Button>
            {upcomingGate ? (
              <Button
                variant="ghost"
                icon="map"
                onClick={() =>
                  navigate(
                    `/journey?phase=${encodeURIComponent(phaseIdForLabel(upcomingGate.filter.phase))}&missable=1${
                      upcomingGate.filter.sections.length ? `&gate=${upcomingGate.id}` : ""
                    }`,
                  )
                }
              >
                Gate sections
              </Button>
            ) : null}
          </div>
        </section>

        {upcomingGate ? (
          <section className={`card card-pad dashboard-gate${upcomingGate.severity === "MISSABLE" ? " dashboard-gate--danger" : ""}`}>
            <div className="eyebrow">Phase gate · {upcomingGate.severity}</div>
            <h3 className="dashboard-gate-next-title">{upcomingGate.title}</h3>
            <p className="dashboard-gate-copy">{upcomingGate.warning}</p>
            {upcomingGateMissables ? (
              <p className="dashboard-gate-count">
                {formatNumber(upcomingGateMissables.remaining)} missable step
                {upcomingGateMissables.remaining === 1 ? "" : "s"} still unresolved in this gate's scope.
              </p>
            ) : null}
            <div className="row wrap dashboard-gate-actions">
              <Button
                variant={upcomingGate.severity === "MISSABLE" ? "danger" : "primary"}
                icon="alert"
                onClick={() =>
                  navigate(
                    `/journey?phase=${encodeURIComponent(phaseIdForLabel(upcomingGate.filter.phase))}&missable=1${
                      upcomingGate.filter.sections.length ? `&gate=${upcomingGate.id}` : ""
                    }`,
                  )
                }
              >
                Review gate missables
              </Button>
            </div>
          </section>
        ) : nextGate ? (
          <section className="card card-pad dashboard-gate-next">
            <div className="eyebrow">Next phase gate</div>
            <h3 className="dashboard-gate-next-title">{nextGate.title}</h3>
            <p className="small muted">
              {next ? `${formatNumber(nextGate.order - next.order)} route steps ahead.` : "Ahead in the route."}{" "}
              {nextGate.message}
            </p>
            <div className="row wrap">
              <Button
                variant="ghost"
                icon="map"
                onClick={() => navigate(`/journey?phase=${encodeURIComponent(phaseIdForLabel(nextGate.filter.phase))}`)}
              >
                Open gate phase
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      <section className="card card-pad dashboard-build-stats" style={{ marginTop: 22 }}>
        <SectionTitle
          title="Build stats"
          note={profile ? `${profile.archetype} · level ${profile.level}` : "No certified profile selected"}
          actions={
            <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate("/builds")}>
              Builds
            </Button>
          }
        />
        {currentScopedProfile ? (
          <>
            <div className="dashboard-build-stats-grid">
              <div>
                <div className="stat-label">Current</div>
                <div className="pulse-value">{level}</div>
                <div className="tiny faint">{character.name}</div>
              </div>
              <div>
                <div className="stat-label">Level 150 target</div>
                <div className="pulse-value">{level150 ? level150.level : "—"}</div>
                <div className="tiny faint">{level150 ? level150.archetype : "No level-150 profile"}</div>
              </div>
              <div>
                <div className="stat-label">Level 200 target</div>
                <div className="pulse-value">{showLevel200 && level200 ? level200.level : "Locked"}</div>
                <div className="tiny faint">
                  {showLevel200 && level200 ? level200.archetype : "Unlocks above level 150"}
                </div>
              </div>
            </div>
            <StatCompare
              rows={STAT_ORDER.map((key) => ({
                key,
                label: STAT_LABELS[key],
                current: character.stats[key],
                target: currentScopedProfile.stats[key],
              }))}
            />
            <div className="row wrap" style={{ marginTop: 10 }}>
              {level150 ? (
                <Button size="sm" variant="primary" icon="check" onClick={() => applyProfile(level150.id)}>
                  Apply level 150
                </Button>
              ) : null}
              {showLevel200 && level200 ? (
                <Button size="sm" icon="check" onClick={() => applyProfile(level200.id)}>
                  Apply level 200
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" icon="helmet" onClick={() => navigate("/character")}>
                Open character
              </Button>
            </div>
          </>
        ) : (
          <Callout tone="warning" icon="spark">
            Pick a certified archetype to compare your current spread with the level 150 and 200 targets.{" "}
            <button className="btn btn-sm btn-ghost" onClick={() => navigate("/builds")}>
              Open builds
            </button>
          </Callout>
        )}
      </section>

      <section style={{ marginTop: 22 }}>
        <SectionTitle
          title="Completion scopes"
          note="Separate denominators — no blended percentage"
          actions={
            <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate("/completion")}>
              Completion
            </Button>
          }
        />
        <div className="dashboard-scopes">
          {scopes.map((scope) => (
            <button
              key={scope.id}
              type="button"
              className={`dashboard-scope${scope.complete ? " is-complete" : ""}`}
              onClick={() => navigate(SCOPE_HREF[scope.id] ?? "/completion")}
            >
              <span className="dashboard-scope-head">
                <span className="dashboard-scope-label">{scope.label}</span>
                <span className="dashboard-scope-value">
                  {formatNumber(scope.numerator)} / {formatNumber(scope.denominator)}
                </span>
              </span>
              <ProgressBar value={scope.percent} tone={scope.complete ? "success" : "accent"} />
              <span className="dashboard-scope-meta">
                {scope.percent}%{scope.complete ? " · complete" : ""}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="dashboard-columns" style={{ marginTop: 22 }}>
        <section className="card card-pad">
          <SectionTitle
            title="Build at a glance"
            actions={
              <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate("/builds")}>
                Builds
              </Button>
            }
          />
          {profile ? (
            <>
              <div className="row-between">
                <div>
                  <div className="card-title">{profile.archetype}</div>
                  <div className="small muted">
                    Level {profile.level} · {profile.primaryStat} / {profile.secondaryStat}
                  </div>
                </div>
                <Badge tone="accent">{loadout?.type ?? "Certified"}</Badge>
              </div>
              <div className="stat-grid" style={{ marginTop: 14 }}>
                {Object.entries(profile.stats).map(([key, value]) => (
                  <div className="stat-cell" key={key}>
                    <div className="k">{key.toUpperCase()}</div>
                    <div className="v">{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="gear-row">
                  <span className="gear-label">Primary</span>
                  <span className="gear-value">{loadout?.mainWeapon || "—"}</span>
                </div>
                <div className="gear-row">
                  <span className="gear-label">Secondary</span>
                  <span className="gear-value">{loadout?.secondaryWeapon || "—"}</span>
                </div>
                <div className="gear-row">
                  <span className="gear-label">Armor</span>
                  <span className="gear-value">{loadout?.armor.filter(Boolean).join(" · ") || "—"}</span>
                </div>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <Button size="sm" icon="helmet" onClick={() => navigate("/character")}>
                  Open character
                </Button>
                <Button size="sm" variant="ghost" icon="sword" onClick={() => navigate(`/builds?archetype=${profile.archetypeId}`)}>
                  Build details
                </Button>
              </div>
            </>
          ) : (
            <div className="empty" style={{ padding: "26px 14px" }}>
              <div>
                <Icon name="sword" size={24} />
                <h3>No certified build selected</h3>
                <p className="small muted">Choose one of the 14 certified parent builds or plan a freeform character.</p>
                <div style={{ marginTop: 12 }}>
                  <Button size="sm" variant="primary" icon="sword" onClick={() => navigate("/builds")}>
                    Browse builds
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="stack">


          <Disclosure title="Command & references" icon="command" tone="muted">
            <div className="dashboard-quick-links" style={{ marginTop: 10 }}>
              <Button size="sm" icon="search" onClick={openCommandSearch}>
                Command search
              </Button>
              <Button size="sm" icon="map" onClick={() => navigate("/journey")}>
                Journey
              </Button>
              <Button size="sm" icon="bag" onClick={() => navigate("/collection")}>
                Collection
              </Button>
              <Button size="sm" icon="trophy" onClick={() => navigate("/completion")}>
                Completion
              </Button>
            </div>
            <p className="tiny faint" style={{ marginTop: 10 }}>
              Ctrl/Cmd + K opens search from anywhere.
              {isDesktop() ? " Ctrl+Shift+L logs the next step from anywhere on the desktop app." : ""} Character level{" "}
              {level} · {character.classId} · {QUESTLINES.length} questlines tracked.
            </p>
          </Disclosure>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <Disclosure title="Content pack details" tone="muted" icon="scroll">
          <p className="tiny faint" style={{ margin: 0 }}>
            {formatNumber(route.total)} route steps · {formatNumber(ROUTE_AREAS.length)} route sections ·{" "}
            {chronology.total} companion chronology actions · {formatNumber(collection.total)} catalogued items ·{" "}
            {formatNumber(scopesById.achievements.denominator)} achievements ·{" "}
            {formatNumber(scopesById.bosses.denominator)} bosses · {QUESTLINES.length} questlines ·{" "}
            {formatNumber(scopesById.quests.denominator)} quest steps · {formatNumber(scopesById.ngplus.denominator)} NG+
            items · game {GAME_VERSION.app}/Reg {GAME_VERSION.regulation} · content baseline{" "}
            {DATA_BASELINE.regulation} · {state.settings.spoilerMode === "strict" ? "spoiler-safe" : "revealed"} mode
          </p>
        </Disclosure>
      </div>

      <Modal
        open={resetOpen}
        title="Reset all companion progress?"
        onClose={() => setResetOpen(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="refresh"
              onClick={() => {
                resetAll();
                setResetOpen(false);
                toast.push("Companion reset to a fresh state.", "success");
              }}
            >
              Reset everything
            </Button>
          </>
        }
      >
        <Callout tone="danger" icon="alert">
          This replaces every character, journey, route step, collection entry, and setting with a fresh companion. Export
          a backup first if you want to keep this state.
        </Callout>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <Button size="sm" icon="download" onClick={() => navigate("/settings")}>
            Export a backup first
          </Button>
        </div>
      </Modal>
    </div>
  );
}
