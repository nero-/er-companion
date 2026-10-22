import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Drawer,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Select,
  TabBar,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import {
  FARMABLES,
  FINITE_RESOURCES,
  ITEMS,
  LORE,
  MATERIALS,
  META,
  MERCHANTS,
  SCARABS,
  SUPPLEMENTAL,
} from "../lib/data";
import {
  collectionSummary,
  decisionsResolved,
  endingSummary,
  farmSummary,
  routeProgress,
  supplementalProgress,
} from "../lib/selectors";
import { navigate, useRoute } from "../lib/router";
import {
  newJourney,
  resetJourney,
  setCertification,
  setEnding,
  setRemembrance,
  setTransitionGate,
  useActiveCharacter,
  useActiveJourney,
} from "../lib/store";
import type { EndingState } from "../lib/types";
import "./lore-completion.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "endings", label: "Endings & Achievements" },
  { id: "remembrances", label: "Remembrances" },
  { id: "readiness", label: "NG+ Readiness" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const REMEMBRANCE_GAMES = Array.from(new Set(META.remembrances.map((remembrance) => remembrance.game)));

const CATALOG_COUNTS = {
  items: ITEMS.length,
  lore: LORE.length,
  supplemental: SUPPLEMENTAL.length,
  farmables: FARMABLES.length,
  materials: MATERIALS.length,
  finite: FINITE_RESOURCES.length,
  merchants: MERCHANTS.length,
  scarabs: SCARABS.length,
};

interface ReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  note?: string;
  cta: string;
  to: string;
  advisory?: boolean;
}

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

const GATE_SEVERITY_TONES: Record<string, "danger" | "warning" | "default"> = {
  critical: "danger",
  major: "warning",
};

function PulseCard({
  label,
  value,
  detail,
  progress,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  progress?: number;
}) {
  return (
    <div className="pulse-card">
      <span className="stat-label">{label}</span>
      <div className="pulse-card-value">{value}</div>
      <div className="pulse-card-detail">{detail}</div>
      {typeof progress === "number" ? <ProgressBar value={progress} /> : null}
    </div>
  );
}

export function CompletionPage() {
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const route = useRoute();

  const [gameFilter, setGameFilter] = useState("all");
  const [confirm, setConfirm] = useState<"new-journey" | "reset-journey" | null>(null);
  const [planIndex, setPlanIndex] = useState<number | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);

  const tabParam = route.query.get("tab");
  const activeTab: TabId = isTabId(tabParam) ? tabParam : "overview";

  const routeState = routeProgress(journey);
  const chronology = supplementalProgress(journey);
  const collection = collectionSummary(character);
  const endings = endingSummary(character);
  const farms = farmSummary(character, journey);

  const certificationsChecked = META.certifications.filter((certification) => journey.certifications[certification.id]).length;
  const gatesReviewed = META.transitionGates.filter((gate) => journey.transitionGates[gate.id]).length;
  const endingsViewed = META.endings.filter((ending) => character.endings[ending.id]?.viewed).length;
  const endingsEarned = META.endings.filter((ending) => character.endings[ending.id]?.earned).length;
  const chronologyPending = chronology.total - chronology.resolved - chronology.deferred;
  const decisionsDone = decisionsResolved(journey, META.decisions.length);
  const processedRemembrances = META.remembrances.filter((remembrance) => {
    const entry = journey.remembrances[remembrance.id];
    return Boolean(entry && (entry.selectedReward || entry.duplicated || entry.consumed));
  }).length;
  const achievementNames = Array.from(
    new Set(META.endings.map((ending) => ending.achievement).filter((achievement) => achievement !== "—")),
  );

  const readinessChecks: ReadinessCheck[] = [
    {
      id: "route",
      label: "Required Act I route steps resolved",
      ok: routeState.complete,
      detail: `${routeState.requiredResolved} / ${routeState.required} required steps resolved · ${routeState.done} done, ${routeState.skipped} skipped, ${routeState.deferred} deferred`,
      note: `The content pack contains the ${META.counts.routeSteps}-step Act I route only; later route sections are not in this export.`,
      cta: "Open journey",
      to: "/journey",
    },
    {
      id: "chronology",
      label: "Chronology resolved or explicitly deferred",
      ok: chronologyPending === 0,
      detail: `${chronology.resolved} / ${chronology.total} actions resolved · ${chronology.deferred} explicitly deferred · ${chronologyPending} still pending`,
      note: `Decisions recorded: ${decisionsDone} / ${META.decisions.length}.`,
      cta: "Open chronology",
      to: "/journey?tab=chronology",
    },
    {
      id: "endings",
      label: `All ${META.endings.length} endings recorded as viewed`,
      ok: endingsViewed === META.endings.length,
      detail: `${endingsViewed} / ${META.endings.length} endings viewed · ${endingsEarned} marked earned`,
      note: "Ending records live on the character and survive new journeys.",
      cta: "Review endings",
      to: "/completion?tab=endings",
    },
    {
      id: "certifications",
      label: `All ${META.certifications.length} certifications checked`,
      ok: certificationsChecked === META.certifications.length,
      detail: `${certificationsChecked} / ${META.certifications.length} certification checkpoints checked`,
      note: "Certifications are companion checkpoints, not platform achievement unlocks.",
      cta: "Review certifications",
      to: "/completion?tab=endings",
    },
    {
      id: "gates",
      label: `All ${META.transitionGates.length} transition gates reviewed`,
      ok: gatesReviewed === META.transitionGates.length,
      detail: `${gatesReviewed} / ${META.transitionGates.length} point-of-no-return gates reviewed`,
      note: "Reviewing a gate records that the deadline and pre-checks were read; it does not complete linked route steps.",
      cta: "Review gates",
      to: "/completion?tab=overview",
    },
    {
      id: "collection",
      label: "Permanent collection snapshot",
      ok: collection.owned === collection.total,
      detail: `${collection.owned} / ${collection.total} permanent items owned · base ${collection.baseGame.owned}/${collection.baseGame.total} · DLC ${collection.dlc.owned}/${collection.dlc.total}`,
      note: "Advisory only. The content-pack denominator differs from the workbook's whole-game item total, so this cannot prove complete collection.",
      cta: "Open collection",
      to: "/collection",
      advisory: true,
    },
    {
      id: "farms",
      label: "Farm closeout snapshot",
      ok:
        farms.finiteCollected === farms.finiteTotal &&
        farms.materialsStocked === farms.materialsTotal &&
        farms.merchantsPurchased === farms.merchantsTotal &&
        farms.scarabsCollected === farms.scarabsTotal,
      detail: `Farmables ${farms.farmablesOwned}/${farms.farmablesTotal} · finite ${farms.finiteCollected}/${farms.finiteTotal} · materials ${farms.materialsStocked}/${farms.materialsTotal} · merchants ${farms.merchantsPurchased}/${farms.merchantsTotal} · scarabs ${farms.scarabsCollected}/${farms.scarabsTotal}`,
      note: "Advisory only. Merchant-wide closeout is not persisted separately; per-row purchases live in the farm ledger.",
      cta: "Open farms",
      to: "/farms",
      advisory: true,
    },
  ];

  const gatingChecks = readinessChecks.filter((check) => !check.advisory);
  const blockers = gatingChecks.filter((check) => !check.ok);
  const ready = blockers.length === 0;

  const activePlan = planIndex !== null ? META.journeys[planIndex] : undefined;
  const activeMerchant = merchantId ? META.merchantCloseout.find((entry) => entry.id === merchantId) : undefined;

  const filteredRemembrances = useMemo(
    () =>
      META.remembrances.filter(
        (remembrance) => gameFilter === "all" || remembrance.game === gameFilter,
      ),
    [gameFilter],
  );

  const tabItems = TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === "endings"
        ? META.endings.length
        : tab.id === "remembrances"
          ? META.remembrances.length
          : tab.id === "readiness"
            ? blockers.length || undefined
            : undefined,
  }));

  const updateEnding = (id: string, patch: Partial<EndingState>) => {
    setEnding(id, patch);
    const name = META.endings.find((ending) => ending.id === id)?.name ?? "Ending";
    toast.push(`${name} state updated.`, "success");
  };

  const confirmAction = () => {
    if (confirm === "new-journey") {
      const created = newJourney();
      toast.push(`${created.label} started. Lifetime collection, read lore, and ending records preserved.`, "success");
    }
    if (confirm === "reset-journey") {
      resetJourney();
      toast.push(`${journey.label} progress reset. Lifetime collection and ending records preserved.`, "success");
    }
    setConfirm(null);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Whole-game closeout`}
        title="Completion"
        description={
          <>
            Ending execution, certifications, remembrance choices, and the real NG+ gate. Progress is computed from
            stored companion state; the route export covers Act I only and collection denominators come from the content
            pack, so nothing here claims platform-level completion.
          </>
        }
        actions={
          <>
            <Badge tone={ready ? "success" : "warning"}>
              {ready ? "Tracked gates clear" : `${blockers.length} readiness ${blockers.length === 1 ? "blocker" : "blockers"}`}
            </Badge>
            <Button
              variant={ready ? "primary" : "default"}
              icon="target"
              onClick={() => navigate("/completion?tab=readiness")}
            >
              NG+ readiness
            </Button>
          </>
        }
      />

      <TabBar
        items={tabItems}
        value={activeTab}
        onChange={(id) => navigate(`/completion?tab=${encodeURIComponent(id)}`)}
      />

      {activeTab === "overview" ? (
        <div className="completion-tab">
          <SectionTitle title="Closeout pulse" note={`${journey.label} · derived from stored state`} />
          <div className="pulse-grid completion-pulse-grid">
            <PulseCard
              label="Act I route"
              value={`${routeState.requiredPercent}%`}
              detail={
                <>
                  {routeState.requiredResolved} / {routeState.required} required · {routeState.done} done ·{" "}
                  {routeState.skipped} skipped
                </>
              }
              progress={routeState.requiredPercent}
            />
            <PulseCard
              label="Chronology"
              value={`${chronology.percent}%`}
              detail={
                <>
                  {chronology.resolved} / {chronology.total} actions · {chronology.deferred} deferred · decisions{" "}
                  {decisionsDone} / {META.decisions.length}
                </>
              }
              progress={chronology.percent}
            />
            <PulseCard
              label="Permanent collection"
              value={`${collection.percent}%`}
              detail={
                <>
                  {collection.owned} / {collection.total} items · base {collection.baseGame.owned}/
                  {collection.baseGame.total} · DLC {collection.dlc.owned}/{collection.dlc.total}
                </>
              }
              progress={collection.percent}
            />
            <PulseCard
              label="Endings"
              value={`${endingsViewed} / ${META.endings.length}`}
              detail={
                <>
                  Viewed {endings.viewed} · earned {endingsEarned} · permanent flag {endings.permanent}
                </>
              }
              progress={(endingsViewed / META.endings.length) * 100}
            />
            <PulseCard
              label="Remembrances"
              value={`${processedRemembrances} / ${META.remembrances.length}`}
              detail={
                <>
                  Processed when a reward is selected or duplication/consumption is recorded ·{" "}
                  {META.remembrances.length - processedRemembrances} open
                </>
              }
              progress={(processedRemembrances / META.remembrances.length) * 100}
            />
            <PulseCard
              label="Farm closeout"
              value={`${farms.finiteCollected} / ${farms.finiteTotal}`}
              detail={`Farmables ${farms.farmablesOwned}/${farms.farmablesTotal} · finite ${farms.finiteCollected}/${farms.finiteTotal} · materials ${farms.materialsStocked}/${farms.materialsTotal} · merchants ${farms.merchantsPurchased}/${farms.merchantsTotal} · scarabs ${farms.scarabsCollected}/${farms.scarabsTotal}`}
              progress={(farms.finiteCollected / farms.finiteTotal) * 100}
            />
          </div>

          <div className="completion-section">
            <SectionTitle title="Journey plans" note={`${META.journeys.length} planned runs from the content pack`} />
            <div className="completion-plans">
              {META.journeys.map((plan, index) => (
                <article className="card card-pad plan-card" key={plan.sourceRow}>
                  <div className="row-between wrap plan-card-head">
                    <h3 className="card-title">{plan.name}</h3>
                    <Badge
                      tone={
                        plan.status.startsWith("Active")
                          ? "accent"
                          : plan.status.toLowerCase().includes("conditional")
                            ? "warning"
                            : "info"
                      }
                    >
                      {plan.status}
                    </Badge>
                  </div>
                  <dl className="plan-fields">
                    <div>
                      <dt>Purpose</dt>
                      <dd>{plan.purpose}</dd>
                    </div>
                    <div>
                      <dt>Route scope</dt>
                      <dd>{plan.routeScope}</dd>
                    </div>
                    <div>
                      <dt>Ending target</dt>
                      <dd>{plan.endingTarget}</dd>
                    </div>
                    <div>
                      <dt>Cleanup</dt>
                      <dd>{plan.cleanup}</dd>
                    </div>
                    <div>
                      <dt>Entry requirements</dt>
                      <dd>{plan.entryRequirements}</dd>
                    </div>
                  </dl>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconRight="arrowRight"
                    onClick={() => setPlanIndex(index)}
                    aria-label={`Open full journey plan: ${plan.name}`}
                  >
                    Full plan
                  </Button>
                </article>
              ))}
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle title="Trophy route cues" note={`${META.trophyCues.length} cues · route progress only`} />
            <div className="card card-pad trophy-list">
              {META.trophyCues.map((cue) => (
                <div className="trophy-row" key={`${cue.order}-${cue.sourceStepId}`}>
                  <span className="trophy-order mono">{String(cue.order).padStart(2, "0")}</span>
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 7 }}>
                      <Badge tone="accent">{cue.area}</Badge>
                      <Badge>{cue.flags.join(" · ")}</Badge>
                    </div>
                    <p className="trophy-cue">{cue.cue}</p>
                    <p className="tiny faint">{cue.boundary}</p>
                  </div>
                  <div className="trophy-source">
                    <span className="tiny faint mono">{cue.sourceStepId}</span>
                    <span className="tiny faint">Source step</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle
              title="Transition gates"
              note={`${gatesReviewed} / ${META.transitionGates.length} reviewed · point-of-no-return checks`}
            />
            <div className="gate-grid">
              {META.transitionGates.map((gate) => {
                const reviewed = Boolean(journey.transitionGates[gate.id]);
                return (
                  <article className={`gate-card${reviewed ? " is-reviewed" : ""}`} key={gate.id}>
                    <Checkbox
                      checked={reviewed}
                      onChange={(value) => setTransitionGate(gate.id, value)}
                      label={
                        <>
                          <span className="sr-only">Review gate {gate.area}</span>
                          <span aria-hidden="true" className="tiny faint">Reviewed</span>
                        </>
                      }
                    />
                    <div className="grow">
                      <div className="row-between wrap" style={{ gap: 8 }}>
                        <h3 className="gate-area">{gate.area}</h3>
                        <div className="tag-list">
                          <Badge tone={GATE_SEVERITY_TONES[gate.severity.toLowerCase()] ?? "default"}>
                            {gate.severity}
                          </Badge>
                          <Badge>{gate.game}</Badge>
                          {reviewed ? <Badge tone="success">Reviewed</Badge> : null}
                        </div>
                      </div>
                      <p className="gate-trigger">{gate.trigger}</p>
                      <dl className="gate-details">
                        <div>
                          <dt>Safe window</dt>
                          <dd>{gate.safeWindow}</dd>
                        </div>
                        <div>
                          <dt>Pre-check</dt>
                          <dd>{gate.preCheck}</dd>
                        </div>
                      </dl>
                      <div className="tiny faint gate-source">
                        {gate.sourceStatus} · {gate.id}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle
              title="Merchant closeout"
              note={`${META.merchantCloseout.length} reference rows · no per-merchant persistence`}
            />
            <Callout tone="default" icon="bag">
              There is no store field for merchant-wide closeout. These rows are a read-only reference; individual
              purchases and finite stock are tracked per row in Collection &amp; Farms.
            </Callout>
            <div className="card card-pad closeout-list">
              {META.merchantCloseout.map((entry) => (
                <div className="list-row closeout-row" key={entry.id}>
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 7 }}>
                      <strong>{entry.merchant}</strong>
                      <Badge>{entry.scope}</Badge>
                      <Badge tone="info">{entry.coverage}</Badge>
                    </div>
                    <p className="small muted closeout-obligation">{entry.obligation}</p>
                    <div className="tiny faint">{entry.deadline}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconRight="chevronRight"
                    onClick={() => setMerchantId(entry.id)}
                    aria-label={`Merchant closeout details: ${entry.merchant}`}
                  >
                    Details
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle title="Coverage & denominator caveats" note="From the content pack" />
            <div className="card card-pad coverage-card">
              {META.coverageNotes.map((note) => (
                <div className="coverage-note" key={note}>
                  <Icon name="alert" size={14} />
                  <span>{note}</span>
                </div>
              ))}
              <div className="coverage-catalog">
                <Badge>{CATALOG_COUNTS.items} permanent item rows</Badge>
                <Badge>{CATALOG_COUNTS.supplemental} chronology actions</Badge>
                <Badge>{CATALOG_COUNTS.lore} lore chapters</Badge>
                <Badge>{CATALOG_COUNTS.farmables} farmables</Badge>
                <Badge>{CATALOG_COUNTS.materials} materials</Badge>
                <Badge>{CATALOG_COUNTS.finite} finite resources</Badge>
                <Badge>{CATALOG_COUNTS.merchants} merchant records</Badge>
                <Badge>{CATALOG_COUNTS.scarabs} scarabs</Badge>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "endings" ? (
        <div className="completion-tab">
          <SectionTitle
            title="Endings"
            note={`${endingsViewed} / ${META.endings.length} viewed · ${endingsEarned} earned · ${achievementNames.length} unique achievement names`}
          />
          <div className="endings-grid">
            {META.endings.map((ending) => {
              const current = character.endings[ending.id];
              return (
                <article className="card card-pad ending-card" key={ending.id}>
                  <div className="ending-head">
                    <span className="ending-order mono">{String(ending.order).padStart(2, "0")}</span>
                    <div className="grow">
                      <h3 className="card-title">{ending.name}</h3>
                      <div className="small muted">
                        {ending.achievement === "—" ? "No separate achievement name" : `Achievement: ${ending.achievement}`}
                      </div>
                    </div>
                    <div className="tag-list ending-badges">
                      {current?.viewed ? <Badge tone="success">Viewed</Badge> : <Badge>Not viewed</Badge>}
                      {current?.earned ? <Badge tone="accent">Earned</Badge> : null}
                    </div>
                  </div>
                  <dl className="kv ending-kv">
                    <dt>Recovery state</dt>
                    <dd>{ending.recoveryState}</dd>
                    <dt>Permanent</dt>
                    <dd>{ending.permanent === "—" ? "— (not permanent)" : ending.permanent}</dd>
                    <dt>After completion</dt>
                    <dd>{ending.afterCompletion}</dd>
                  </dl>
                  <div className="ending-toggles">
                    <Checkbox
                      checked={Boolean(current?.viewed)}
                      onChange={(value) => updateEnding(ending.id, { viewed: value })}
                      label={
                        <>
                          <span className="sr-only">{ending.name} viewed</span>
                          <span aria-hidden="true">Viewed</span>
                        </>
                      }
                    />
                    <Checkbox
                      checked={Boolean(current?.earned)}
                      onChange={(value) => updateEnding(ending.id, { earned: value })}
                      label={
                        <>
                          <span className="sr-only">{ending.name} earned</span>
                          <span aria-hidden="true">Earned</span>
                        </>
                      }
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="completion-section">
            <SectionTitle
              title="Achievement names"
              note={`${achievementNames.length} unique names derived from ending rows`}
            />
            <div className="card card-pad achievement-card">
              <div className="list">
                {META.endings
                  .filter((ending) => ending.achievement !== "—")
                  .map((ending) => (
                    <div className="list-row" key={ending.id}>
                      <Icon name="trophy" size={16} />
                      <div className="grow">
                        <strong>{ending.achievement}</strong>
                        <div className="small faint">{ending.name}</div>
                      </div>
                      <Badge tone="accent">Ending {ending.order}</Badge>
                    </div>
                  ))}
              </div>
              <Callout tone="default" icon="alert">
                The workbook does not independently track platform achievement unlocks. These {achievementNames.length}{" "}
                names are derived from ending rows and are not a claim that a platform trophy fired.
              </Callout>
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle
              title="Certifications"
              note={`${certificationsChecked} / ${META.certifications.length} checked`}
            />
            <div className="certification-list">
              {META.certifications.map((certification) => {
                const checked = Boolean(journey.certifications[certification.id]);
                return (
                  <article className={`cert-row${checked ? " is-done" : ""}`} key={certification.id}>
                    <Checkbox
                      checked={checked}
                      onChange={(value) => setCertification(certification.id, value)}
                      label={<span className="sr-only">Mark {certification.name} certified</span>}
                    />
                    <div className="grow">
                      <div className="row wrap" style={{ gap: 7 }}>
                        <strong>{certification.name}</strong>
                        <Badge tone="accent">#{certification.order}</Badge>
                        {certification.mandatory ? <Badge tone="warning">Mandatory</Badge> : null}
                        {checked ? <Badge tone="success">Checked</Badge> : null}
                      </div>
                      <div className="small muted cert-timing">{certification.timing}</div>
                      <p className="small cert-purpose">{certification.purpose}</p>
                      <div className="tiny faint">{certification.notes}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle
              title="Six Futures sequence"
              note={`${META.sixFutures.length} recorded steps · ${META.endings.length} endings`}
            />
            <div className="card card-pad six-futures">
              {META.sixFutures.map((future) => (
                <div className="future-row" key={`${future.order}-${future.ending}`}>
                  <span className="future-order mono">{String(future.order).padStart(2, "0")}</span>
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 7 }}>
                      <strong>{future.ending}</strong>
                      <Badge>{future.recoveryState}</Badge>
                      <Badge tone={future.permanent === "No" ? "default" : "accent"}>
                        {future.permanent === "No" ? "Not permanent" : `Permanent: ${future.permanent}`}
                      </Badge>
                    </div>
                    <div className="small muted future-after">After completion: {future.afterCompletion}</div>
                  </div>
                </div>
              ))}
              <p className="small faint">
                The final recorded step covers Age of Order, the restore, and then Age of Stars. Ending records above are
                the companion's execution state, not platform proof.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "remembrances" ? (
        <div className="completion-tab">
          <div className="row-between wrap remembrance-header">
            <SectionTitle
              title="Remembrance ledger"
              note={`${processedRemembrances} / ${META.remembrances.length} processed · reward, duplication, or consumption recorded`}
            />
            <div className="remembrance-filter">
              <Select label="Game" value={gameFilter} onChange={(event) => setGameFilter(event.target.value)}>
                <option value="all">All games ({META.remembrances.length})</option>
                {REMEMBRANCE_GAMES.map((game) => (
                  <option key={game} value={game}>
                    {game}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Callout tone="default" icon="scroll">
            Select one reward per remembrance, then record duplication and rune consumption when they happen. Choices and
            flags are stored on the active journey.
          </Callout>

          {filteredRemembrances.length === 0 ? (
            <EmptyState
              title="No remembrances in this filter"
              description="Choose another game filter."
              action={
                <Button icon="refresh" onClick={() => setGameFilter("all")}>
                  Show all games
                </Button>
              }
            />
          ) : (
            <div className="remembrance-grid">
              {filteredRemembrances.map((remembrance) => {
                const current = journey.remembrances[remembrance.id];
                const selectedReward = current?.selectedReward ?? "";
                const rewards = remembrance.rewards.filter((reward) => reward !== "—");
                const processed = Boolean(current && (current.selectedReward || current.duplicated || current.consumed));
                return (
                  <article className={`card card-pad remembrance-card${processed ? " is-processed" : ""}`} key={remembrance.id}>
                    <div className="remembrance-head">
                      <div className="grow">
                        <h3 className="card-title">{remembrance.name}</h3>
                        <div className="small muted">{remembrance.boss}</div>
                      </div>
                      <div className="tag-list">
                        <Badge tone="info">{remembrance.game}</Badge>
                        {processed ? <Badge tone="success">Processed</Badge> : null}
                      </div>
                    </div>

                    <div className="tag-list">
                      {rewards.map((reward) => (
                        <Badge key={reward} tone={selectedReward === reward ? "accent" : "default"}>
                          {reward}
                        </Badge>
                      ))}
                    </div>

                    <label className="field remembrance-select">
                      <span className="field-label">Selected reward</span>
                      <select
                        className="select"
                        value={selectedReward}
                        aria-label={`Selected reward: ${remembrance.name}`}
                        onChange={(event) => setRemembrance(remembrance.id, { selectedReward: event.target.value })}
                      >
                        <option value="">Not selected</option>
                        {rewards.map((reward) => (
                          <option key={reward} value={reward}>
                            {reward}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="remembrance-actions">
                      <Checkbox
                        checked={Boolean(current?.duplicated)}
                        onChange={(value) => setRemembrance(remembrance.id, { duplicated: value })}
                        label={
                          <>
                            <span className="sr-only">{remembrance.name} duplicated</span>
                            <span aria-hidden="true">Duplicated</span>
                          </>
                        }
                      />
                      <Checkbox
                        checked={Boolean(current?.consumed)}
                        onChange={(value) => setRemembrance(remembrance.id, { consumed: value })}
                        label={
                          <>
                            <span className="sr-only">{remembrance.name} consumed for runes</span>
                            <span aria-hidden="true">Consumed for runes</span>
                          </>
                        }
                      />
                    </div>

                    <dl className="kv remembrance-kv">
                      <dt>J1 plan</dt>
                      <dd>
                        {remembrance.journey1Selection} · {remembrance.journey1Duplication}
                      </dd>
                      <dt>J2 plan</dt>
                      <dd>
                        {remembrance.journey2Selection} · {remembrance.journey2Duplication}
                      </dd>
                      <dt>Duplicate target</dt>
                      <dd>{remembrance.duplicateTarget}</dd>
                      <dt>NG+ need</dt>
                      <dd>{remembrance.ngPlusNeed}</dd>
                      <dt>Priority</dt>
                      <dd>{remembrance.priority}</dd>
                      <dt>Rune policy</dt>
                      <dd>{remembrance.consumedForRunes}</dd>
                    </dl>

                    <div className="row-between wrap remembrance-footer">
                      <span className="tiny faint">{remembrance.duplicationClass}</span>
                      <a
                        href={remembrance.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="tiny"
                        aria-label={`Source for ${remembrance.name}`}
                      >
                        Source <Icon name="external" size={11} />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "readiness" ? (
        <div className="completion-tab">
          <SectionTitle
            title="NG+ readiness checklist"
            note={`${gatingChecks.length - blockers.length} / ${gatingChecks.length} companion gates clear · ${readinessChecks.length - gatingChecks.length} advisory snapshots`}
          />
          {ready ? (
            <Callout tone="success" icon="check">
              All companion-tracked readiness gates are clear. Collection and farm snapshots remain advisory. This does
              not verify platform achievements or untracked content. Create and verify Backup B before entering
              Journey 2.
            </Callout>
          ) : (
            <Callout tone="warning" icon="alert">
              Not ready — {blockers.length} companion {blockers.length === 1 ? "gate remains" : "gates remain"}. You can
              still start a new journey, but the companion will not show it as NG+ ready.
            </Callout>
          )}

          <div className="readiness-list">
            {readinessChecks.map((check) => (
              <article
                className={`readiness-row${check.advisory ? " is-advisory" : check.ok ? " is-ok" : " is-blocked"}`}
                key={check.id}
              >
                <span className="readiness-mark" aria-hidden="true">
                  <Icon name={check.advisory ? "eye" : check.ok ? "check" : "lock"} size={16} />
                </span>
                <div className="grow">
                  <div className="row-between wrap" style={{ gap: 8 }}>
                    <h3>{check.label}</h3>
                    <Badge tone={check.advisory ? "info" : check.ok ? "success" : "warning"}>
                      {check.advisory ? (check.ok ? "Complete" : "Advisory") : check.ok ? "Clear" : "Blocker"}
                    </Badge>
                  </div>
                  <p className="small muted readiness-detail">{check.detail}</p>
                  {check.note ? <p className="tiny faint">{check.note}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant={check.ok || check.advisory ? "ghost" : "primary"}
                  iconRight="chevronRight"
                  onClick={() => navigate(check.to)}
                >
                  {check.cta}
                </Button>
              </article>
            ))}
          </div>

          <Callout tone="default" icon="alert">
            Collection and farm rows are advisory snapshots, not readiness gates. The source workbook's whole-game
            denominators differ from the extracted counts, so these percentages cannot prove 100% game completion.
          </Callout>

          <div className="completion-section">
            <SectionTitle title="Journey actions" note="Lifetime records stay on the character" />
            <div className="card card-accent card-pad readiness-actions">
              <div>
                <h3 className="card-title">Begin the next journey</h3>
                <p className="small muted">
                  A new journey resets route, chronology, journey-level farm tracking, certifications,
                  transition-gate reviews, and remembrance state for the active run. Lifetime item ownership, farmable
                  quantities, read lore, and ending records are preserved.
                </p>
              </div>
              <div className="row wrap">
                <Button variant="primary" icon="plus" onClick={() => setConfirm("new-journey")}>
                  Begin next journey
                </Button>
                <Button variant="danger" icon="refresh" onClick={() => setConfirm("reset-journey")}>
                  Reset current journey
                </Button>
              </div>
              {ready ? (
                <p className="tiny faint">
                  Companion gates are clear. Verify the Journey 1 museum save (Backup B) before entering Journey 2.
                </p>
              ) : (
                <p className="tiny faint">
                  {blockers.length} readiness {blockers.length === 1 ? "blocker remains" : "blockers remain"}. Starting
                  a new journey now is shown as unverified against the companion checklist.
                </p>
              )}
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle title="Coverage caveats" note="Read before claiming completion" />
            <div className="card card-pad coverage-card">
              {META.coverageNotes.map((note) => (
                <div className="coverage-note" key={note}>
                  <Icon name="alert" size={14} />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <Drawer
        open={Boolean(activePlan)}
        title={activePlan?.name ?? "Journey plan"}
        subtitle={activePlan?.status}
        onClose={() => setPlanIndex(null)}
      >
        {activePlan ? (
          <dl className="kv plan-detail">
            <dt>Purpose</dt>
            <dd>{activePlan.purpose}</dd>
            <dt>Route scope</dt>
            <dd>{activePlan.routeScope}</dd>
            <dt>Ending target</dt>
            <dd>{activePlan.endingTarget}</dd>
            <dt>Alternate choices</dt>
            <dd>{activePlan.alternateChoices}</dd>
            <dt>Remembrance plan</dt>
            <dd>{activePlan.remembrancePlan}</dd>
            <dt>Duplicate plan</dt>
            <dd>{activePlan.duplicatePlan}</dd>
            <dt>Cleanup</dt>
            <dd>{activePlan.cleanup}</dd>
            <dt>Entry requirements</dt>
            <dd>{activePlan.entryRequirements}</dd>
            <dt>Notes</dt>
            <dd>{activePlan.notes}</dd>
            <dt>Source row</dt>
            <dd className="mono">{activePlan.sourceRow}</dd>
          </dl>
        ) : null}
      </Drawer>

      <Drawer
        open={Boolean(activeMerchant)}
        title={activeMerchant?.merchant ?? "Merchant closeout"}
        subtitle={activeMerchant ? `${activeMerchant.scope} · ${activeMerchant.coverage}` : undefined}
        onClose={() => setMerchantId(null)}
      >
        {activeMerchant ? (
          <div className="stack">
            <Callout tone="default" icon="bag">
              Reference only. Merchant closeout is not persisted; per-item purchases live in the farm ledger.
            </Callout>
            <dl className="kv">
              <dt>Obligation</dt>
              <dd>{activeMerchant.obligation}</dd>
              <dt>Deadline</dt>
              <dd>{activeMerchant.deadline}</dd>
              <dt>Authority</dt>
              <dd>{activeMerchant.authority}</dd>
              <dt>Validation</dt>
              <dd>{activeMerchant.validation}</dd>
              <dt>Notes</dt>
              <dd>{activeMerchant.notes}</dd>
              <dt>Source row</dt>
              <dd className="mono">{activeMerchant.sourceRow}</dd>
            </dl>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={Boolean(confirm)}
        title={confirm === "reset-journey" ? "Reset current journey?" : "Begin the next journey?"}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant={confirm === "reset-journey" ? "danger" : "primary"} icon={confirm === "reset-journey" ? "refresh" : "plus"} onClick={confirmAction}>
              {confirm === "reset-journey" ? "Reset journey" : "Begin journey"}
            </Button>
          </>
        }
      >
        <div className="stack">
          {confirm === "reset-journey" ? (
            <>
              <Callout tone="danger" icon="alert">
                This clears route steps, chronology actions, boss/quest/journey-level farm tracking, certifications, gate
                reviews, and remembrance choices for {journey.label}.
              </Callout>
              <p className="small muted">
                Lifetime item ownership, farmable quantities, read lore, and ending records stay on the character.
                Backup any state you need before resetting.
              </p>
            </>
          ) : (
            <>
              <Callout tone="warning" icon="alert">
                A new journey starts empty route, chronology, journey-level farm, certification, gate, and remembrance
                state for the run. Lifetime collection, farmable quantities, read lore, and ending records are preserved
                on the character.
              </Callout>
              {!ready ? (
                <p className="small muted">
                  {blockers.length} companion readiness {blockers.length === 1 ? "blocker remains" : "blockers remain"}.
                  The new journey will be allowed, but the companion will not show this run as NG+ ready.
                </p>
              ) : (
                <p className="small muted">
                  Companion gates are clear. Create and verify Backup B before starting Journey 2.
                </p>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
