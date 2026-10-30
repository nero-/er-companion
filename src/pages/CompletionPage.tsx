import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Disclosure,
  Drawer,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  SearchInput,
  SectionTitle,
  Select,
  TabBar,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { formatNumber } from "../lib/format";
import {
  ACHIEVEMENTS,
  BRANCH_PLAN_DECISIONS,
  BRANCH_REWARDS,
  CONTENT_COVERAGE,
  FARMABLES,
  FINITE_RESOURCES,
  ITEM_BY_ID,
  ITEMS,
  LORE,
  MATERIALS,
  META,
  MERCHANTS,
  NGPLUS_SECTIONS,
  REQUIREMENT_GROUPS,
  REQUIREMENT_GROUP_BY_ID,
  SCARABS,
  STEP_BY_ID,
  SUPPLEMENTAL,
  normalizeContentKey,
} from "../lib/data";
import {
  achievementProgress,
  bossProgress,
  branchRewardProgress,
  collectionSummary,
  completionScopes,
  endingSummary,
  farmSummary,
  ngplusProgress,
  questlineProgress,
  routeProgress,
  supplementalProgress,
} from "../lib/selectors";
import { navigate, useRoute } from "../lib/router";
import { remembrancePlanRows, remembranceRowFor } from "../lib/remembrance";
import {
  RemembrancePlanList,
  RemembrancePlanSummary,
} from "../components/RemembrancePlan";
import {
  newJourney,
  resetJourney,
  setAchievement,
  setCertification,
  setDecision,
  setDecisionCheck,
  setEnding,
  setNgPlusItem,
  setRemembrance,
  setTransitionGate,
  useActiveCharacter,
  useActiveJourney,
} from "../lib/store";
import type { BranchPlanDecision, BranchReward, EndingState, JourneyState } from "../lib/types";
import "./lore-completion.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "achievements", label: "Achievements" },
  { id: "endings", label: "Endings & Certifications" },
  { id: "remembrances", label: "Remembrances" },
  { id: "branch", label: "Journey Plan" },
  { id: "ngplus", label: "NG+ Readiness" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ACHIEVEMENT_SECTION_ORDER = ["Misc", "Bosses", "Shardbearers", "Endings"] as const;

const ACHIEVEMENT_SECTION_NOTES: Record<string, string> = {
  Misc: "Systems, exploration, and legendary collections",
  Bosses: "Named boss and remembrance trophies",
  Shardbearers: "Great Rune holders",
  Endings: "Ending-path trophies",
};

const SCOPE_LINKS: Record<string, string> = {
  route: "/journey?tab=route",
  collection: "/collection",
  achievements: "/completion?tab=achievements",
  bosses: "/bosses",
  quests: "/quests",
  lore: "/lore",
  endings: "/completion?tab=endings",
  remembrances: "/completion?tab=remembrances",
  ngplus: "/completion?tab=ngplus",
  graces: "/atlas?category=grace",
  world: "/atlas",
  upgrades: "/materials?tab=upgrades",
  materials: "/materials?tab=materials",
  merchants: "/farms?tab=merchants",
  "npc-walkthrough": "/journey?tab=npc",
  "branch-rewards": "/completion?tab=branch",
};

const SCOPE_ICONS: Record<string, IconName> = {
  route: "map",
  collection: "bag",
  achievements: "achievement",
  bosses: "skull",
  quests: "quest",
  lore: "book",
  endings: "flame",
  remembrances: "grace",
  ngplus: "refresh",
  graces: "grace",
  world: "map",
  upgrades: "spark",
  materials: "leaf",
  merchants: "bag",
  "npc-walkthrough": "users",
  "branch-rewards": "target",
};

/**
 * The workbook's decision rows carry the authored outcome list; branch-plan
 * rows carry the rewards and route anchors. They share one decision id.
 */
const META_DECISION_BY_ID: Record<string, (typeof META.decisions)[number]> = Object.fromEntries(
  META.decisions.map((decision) => [decision.id, decision]),
);

const BRANCH_AVAILABILITY_LABELS: Record<string, string> = {
  "journey-1": "Journey 1",
  "journey-2": "Journey 2",
  "journey-3": "Journey 3",
  optional: "Optional",
};

const BRANCH_AVAILABILITY_TONES: Record<string, "accent" | "info" | "warning" | "default"> = {
  "journey-1": "accent",
  "journey-2": "info",
  "journey-3": "warning",
  optional: "default",
};

const REMEMBRANCE_GAMES = Array.from(new Set(META.remembrances.map((remembrance) => remembrance.game)));

const COVERAGE_NOTES = [
  `Route: ${CONTENT_COVERAGE.route.steps} steps across ${CONTENT_COVERAGE.route.sections} sections — ${CONTENT_COVERAGE.route.preDlcSteps} base-game pre-DLC, ${CONTENT_COVERAGE.route.dlcSteps} Shadow of the Erdtree, ${CONTENT_COVERAGE.route.endgameSteps} endgame. ${CONTENT_COVERAGE.route.missableSteps} steps are missable (${CONTENT_COVERAGE.route.missableBaseSteps} base, ${CONTENT_COVERAGE.route.missableDlcSteps} DLC).`,
  `Catalog: ${CONTENT_COVERAGE.items.final} merged permanent items; ${CONTENT_COVERAGE.items.linkedToRoute} are linked to route steps and ${CONTENT_COVERAGE.items.placeholdersReplaced} placeholder acquisitions were replaced.`,
  `Ledgers: ${CONTENT_COVERAGE.achievements.achievements} achievements with ${CONTENT_COVERAGE.achievements.requirementItems} legendary requirement items, ${CONTENT_COVERAGE.bosses.final} bosses, ${CONTENT_COVERAGE.questlines.questlines} questlines across ${CONTENT_COVERAGE.questlines.steps} steps, and ${CONTENT_COVERAGE.ngplus.items} NG+ checklist items.`,
  "Dialogue remains deferred: NPC dialogue lines are not tracked and do not contribute to any scope denominator. The merged pack covers choices, routes, and rewards only.",
  "Companion records live in local storage. They are not a platform trophy audit, and no single blended completion percentage is shown.",
];

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

const SCOPE_GROUPS = [
  {
    id: "route",
    label: "Route & collection",
    note: "Steps, items, quests, NPC walkthrough, achievements",
    ids: ["route", "collection", "quests", "npc-walkthrough", "achievements"],
  },
  {
    id: "world",
    label: "World ledgers",
    note: "Bosses, graces, objects, upgrades, materials, merchants, lore",
    ids: ["bosses", "graces", "world", "upgrades", "materials", "merchants", "lore"],
  },
  {
    id: "build",
    label: "Build & endings",
    note: "Endings, remembrances, NG+, branch rewards",
    ids: ["endings", "remembrances", "ngplus", "branch-rewards"],
  },
] as const;

/**
 * Reader-facing name for every internal record id that workbook prose cites.
 * Decisions use their short title in quotes; gates, certifications, and
 * supplemental actions read naturally as plain place names.
 */
const ID_LABELS: Record<string, { label: string; quoted: boolean }> = {
  ...Object.fromEntries(
    BRANCH_PLAN_DECISIONS.map((decision) => [
      decision.decisionId,
      { label: decision.title.split(" — ")[0], quoted: true },
    ]),
  ),
  ...Object.fromEntries(
    META.certifications.map((certification) => [
      certification.id,
      { label: certification.name, quoted: false },
    ]),
  ),
  ...Object.fromEntries(
    META.transitionGates.map((gate) => [gate.id, { label: gate.area, quoted: false }]),
  ),
  ...Object.fromEntries(
    SUPPLEMENTAL.map((action) => [action.id, { label: action.area, quoted: false }]),
  ),
};

/** Research-phase markers are internal bookkeeping and never render. */
const INTERNAL_PHASE = /\bPhase\s+\d+[A-Z]?\b/;
/** Workbook / research identifiers that must never reach the screen. */
const INTERNAL_ID =
  /\b(?:ARC|DLC|BASE|END|LCK|MCO|CERT|B|SUP|FRM|MAT|NPC)-[A-Z0-9][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g;
/** Shorthand ranges such as BASE-002/003/004. */
const ID_RANGE = /\b([A-Z]+)-(\d+)((?:\/\d+)+)\b/g;

/** Substitutes a record id with its reader-facing name when the sentence needs it. */
function idLabel(id: string, text: string): string {
  const entry = ID_LABELS[id];
  if (!entry) return "";
  const key = normalizeContentKey(entry.label);
  if (key.length > 3 && normalizeContentKey(text).includes(key)) return "";
  return entry.quoted ? `“${entry.label}”` : entry.label;
}

/**
 * Renders workbook prose without leaking internal identifiers. Record ids are
 * swapped for their names when the sentence does not already name the record;
 * phase markers drop the sentence they annotate.
 */
function plainText(value?: string): string {
  if (!value) return "";
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !INTERNAL_PHASE.test(sentence))
    .map((sentence) => {
      let text = sentence.replace(/\s*\(([A-Z]+-[0-9][0-9A-Z-]*)\)/g, (match, id: string) =>
        ID_LABELS[id] ? "" : match,
      );
      text = text.replace(ID_RANGE, (_match, prefix: string, first: string, rest: string) =>
        [first, ...rest.split("/").filter(Boolean)]
          .map((part) => ID_LABELS[`${prefix}-${part}`]?.label ?? "")
          .filter(Boolean)
          .join(" / "),
      );
      return text.replace(INTERNAL_ID, (id) => idLabel(id, text));
    })
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence))
    .join(" ")
    .replace(/”'s\b/g, "”")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])\s*([.;,])/g, "$2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Journey-plan status labels drop the internal research phase suffix. */
const PLAN_STATUS_PHASE = /\s*[—–-]\s*Canonical Phase\s+\d+[A-Z]?.*$/i;

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

/** Outcomes are authored as "A / B / C"; the recorded value is one of those. */
function decisionOutcomes(decisionId: string): string[] {
  const meta = META_DECISION_BY_ID[decisionId];
  if (!meta?.outcomes) return [];
  return meta.outcomes
    .split(/\s*\/\s*/)
    .map((outcome) => outcome.trim())
    .filter(Boolean);
}

interface DecisionState {
  /** Anchored route steps that exist in the bundled route. */
  anchors: { id: string; area: string; order: number; done: boolean }[];
  anchorsDone: number;
  /** Any anchored step done — a resolved branch needs one anchor, not all. */
  anchorSettled: boolean;
  manualChecked: boolean;
  chosen: string;
  /** Anchored completion, manual check, or a recorded outcome. */
  settled: boolean;
  /** How the card became settled, for the badge copy. */
  reason: "outcome" | "route" | "manual" | "open";
}

/**
 * A decision settles when the branch is actually resolved for this journey.
 * Anchors are alternatives inside one decision, so ANY done anchor is enough;
 * requiring every anchor was wrong for decisions whose branches are optional.
 */
function decisionState(decision: BranchPlanDecision, journey: JourneyState): DecisionState {
  const anchors = (decision.routeStepIds ?? []).flatMap((stepId) => {
    const step = STEP_BY_ID[stepId];
    return step
      ? [{ id: step.id, area: step.area, order: step.order, done: journey.steps[step.id] === "done" }]
      : [];
  });
  const anchorsDone = anchors.filter((anchor) => anchor.done).length;
  const anchorSettled = anchorsDone > 0;
  const manualChecked = Boolean(journey.decisionChecks[decision.decisionId]);
  const chosen = journey.decisions[decision.decisionId] ?? "";
  const settled = Boolean(chosen) || anchorSettled || manualChecked;
  const reason: DecisionState["reason"] = chosen
    ? "outcome"
    : anchorSettled
      ? "route"
      : manualChecked
        ? "manual"
        : "open";
  return { anchors, anchorsDone, anchorSettled, manualChecked, chosen, settled, reason };
}

function BranchRewardChip({
  reward,
  ownedItemIds,
}: {
  reward: BranchReward;
  ownedItemIds: Record<string, boolean>;
}) {
  const item = reward.itemId ? ITEM_BY_ID[reward.itemId] : undefined;
  const owned = Boolean(reward.itemId && ownedItemIds[reward.itemId]);
  const availabilityLabel =
    BRANCH_AVAILABILITY_LABELS[reward.availability] ?? reward.availability;
  const availabilityTone = BRANCH_AVAILABILITY_TONES[reward.availability] ?? "default";

  return (
    <div
      className={`branch-reward${owned ? " is-owned" : ""}${reward.unresolved ? " is-unresolved" : ""}`}
    >
      <div className="branch-reward-head">
        {item ? (
          <button
            type="button"
            className="lore-inline-link branch-reward-link"
            onClick={() => navigate(`/collection?item=${encodeURIComponent(reward.itemId)}`)}
            aria-label={`Open ${reward.name} in the collection`}
          >
            {reward.name}
          </button>
        ) : (
          <span className="branch-reward-name">{reward.name}</span>
        )}
        <span className="branch-reward-badges">
          <Badge tone={availabilityTone}>{availabilityLabel}</Badge>
          {owned ? <Badge tone="success">Owned</Badge> : null}
          {reward.unresolved ? <Badge tone="warning">Unresolved</Badge> : null}
          {!reward.retained ? <Badge tone="danger">Not retained</Badge> : null}
        </span>
      </div>

      {reward.unresolved ? (
        <p className="branch-reward-reason">
          {reward.reason ?? "Not resolved against the item catalog."}
        </p>
      ) : null}

      {reward.componentItemIds.length > 0 ? (
        <div className="branch-set">
          <span className="branch-set-label">
            Set components · {reward.componentItemIds.length}
          </span>
          <div className="branch-set-items">
            {reward.componentItemIds.map((componentId) => {
              const component = ITEM_BY_ID[componentId];
              const componentOwned = Boolean(ownedItemIds[componentId]);
              return (
                <button
                  key={componentId}
                  type="button"
                  className={`branch-component${componentOwned ? " is-owned" : ""}`}
                  onClick={() => navigate(`/collection?item=${encodeURIComponent(componentId)}`)}
                  aria-label={`Open ${component?.name ?? componentId} in the collection`}
                >
                  <Icon name={componentOwned ? "check" : "bag"} size={11} />
                  {component?.name ?? componentId}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <span className="branch-reward-foot">
        <span>{reward.retained ? "Retained on the character" : "Not retained after the run"}</span>
        <span>{reward.itemId ? "In catalog" : "No catalog entry"}</span>
      </span>
    </div>
  );
}

export function CompletionPage() {
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const route = useRoute();

  const [gameFilter, setGameFilter] = useState("all");
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [branchQuery, setBranchQuery] = useState("");
  const [branchJourneyFilter, setBranchJourneyFilter] = useState("all");
  const [branchResultFilter, setBranchResultFilter] = useState("all");
  const [confirm, setConfirm] = useState<"new-journey" | "reset-journey" | null>(null);
  const [planIndex, setPlanIndex] = useState<number | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);

  const tabParam = route.query.get("tab");
  const achievementParam = route.query.get("achievement");
  const branchParam = route.query.get("decision");
  const activeTab: TabId = achievementParam
    ? "achievements"
    : branchParam
      ? "branch"
      : isTabId(tabParam)
        ? tabParam
        : "overview";

  const routeState = routeProgress(journey);
  const chronology = supplementalProgress(journey);
  const collection = collectionSummary(character);
  const endings = endingSummary(character);
  const farms = farmSummary(character, journey);
  const achievements = achievementProgress(character);
  const ngplus = ngplusProgress(journey);
  const bosses = bossProgress(journey);
  const quests = questlineProgress(journey);
  const scopes = completionScopes(character, journey);
  const scopesComplete = scopes.filter((scopeRow) => scopeRow.complete).length;
  const branchProgress = branchRewardProgress(character);
  const branchResolvedDecisions = BRANCH_PLAN_DECISIONS.filter((decision) => !decision.unresolved).length;
  const decisionStateById: Record<string, DecisionState> = Object.fromEntries(
    BRANCH_PLAN_DECISIONS.map((decision) => [decision.decisionId, decisionState(decision, journey)]),
  );
  const decisionRows = BRANCH_PLAN_DECISIONS.map((decision) => decisionStateById[decision.decisionId]);
  const branchSettledDecisions = decisionRows.filter((row) => row.settled).length;
  const decisionsChosen = decisionRows.filter((row) => row.chosen).length;
  const decisionsFromRoute = decisionRows.filter((row) => row.reason === "route").length;
  const decisionsFromManual = decisionRows.filter((row) => row.reason === "manual").length;
  const priorJourney = character.journeys
    .filter((entry) => entry.index < journey.index)
    .sort((a, b) => b.index - a.index)[0];
  const priorDecisionRows = priorJourney
    ? BRANCH_PLAN_DECISIONS.flatMap((decision) => {
        const row = decisionState(decision, priorJourney);
        return row.settled ? [{ decision, row }] : [];
      })
    : [];
  /**
   * A branch reward that is already in the lifetime collection cannot be lost
   * by starting another run, so that decision needs no re-choosing for its
   * reward. Everything else has to be decided again in the current journey.
   */
  const securedDecisions = BRANCH_PLAN_DECISIONS.filter((decision) => {
    const resolved = decision.rewards.filter((reward) => !reward.unresolved && reward.itemId);
    return resolved.length > 0 && resolved.every((reward) => Boolean(character.items[reward.itemId]));
  });
  const securedByLifetime = securedDecisions.length;
  const freshRun = branchSettledDecisions === 0 && priorDecisionRows.length > 0;
  const rechooseDecisions = BRANCH_PLAN_DECISIONS.filter(
    (decision) => !securedDecisions.includes(decision) && !decisionStateById[decision.decisionId].settled,
  );
  const ngplusTotal = NGPLUS_SECTIONS.reduce((total, section) => total + section.stepCount, 0);
  const missableAchievements = ACHIEVEMENTS.filter((achievement) => achievement.missable).length;
  const achievementItems = REQUIREMENT_GROUPS.reduce((total, group) => total + group.items.length, 0);

  const certificationsChecked = META.certifications.filter((certification) => journey.certifications[certification.id]).length;
  const gatesReviewed = META.transitionGates.filter((gate) => journey.transitionGates[gate.id]).length;
  const endingsViewed = META.endings.filter((ending) => character.endings[ending.id]?.viewed).length;
  const endingsEarned = META.endings.filter((ending) => character.endings[ending.id]?.earned).length;
  const chronologyPending = chronology.total - chronology.resolved - chronology.deferred;
  const processedRemembrances = META.remembrances.filter((remembrance) => {
    const entry = journey.remembrances[remembrance.id];
    return Boolean(entry && (entry.selectedReward || entry.duplicated || entry.consumed));
  }).length;

  const readinessChecks: ReadinessCheck[] = [
    {
      id: "route",
      label: "Required route steps resolved",
      ok: routeState.complete,
      detail: `${routeState.requiredResolved} / ${routeState.required} required steps resolved · ${routeState.done} done, ${routeState.skipped} skipped, ${routeState.deferred} deferred`,
      note: "Covers the full route: base game through Maliketh, all Shadow of the Erdtree sections, then the Ashen Capital endgame.",
      cta: "Open journey",
      to: "/journey",
    },
    {
      id: "chronology",
      label: "Chronology resolved or explicitly deferred",
      ok: chronologyPending === 0,
      detail: `${chronology.resolved} / ${chronology.total} actions resolved · ${chronology.deferred} explicitly deferred · ${chronologyPending} still pending`,
      note: `Decisions recorded: ${decisionsChosen} / ${META.decisions.length}.`,
      cta: "Open chronology",
      to: "/journey?tab=chronology",
    },
    {
      id: "achievements",
      label: `All ${ACHIEVEMENTS.length} achievements earned`,
      ok: achievements.complete,
      detail: `${achievements.done} / ${achievements.total} achievements earned · ${missableAchievements} flagged MISSABLE · ${achievementItems} legendary requirement items linked`,
      note: "Earned flags are companion records, not a platform trophy check.",
      cta: "Review achievements",
      to: "/completion?tab=achievements",
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
      id: "ngplus",
      label: `NG+ checklist resolved (${NGPLUS_SECTIONS.length} sections)`,
      ok: ngplus.complete,
      detail: `${ngplus.done} / ${ngplusTotal} NG+ checklist items resolved · ${NGPLUS_SECTIONS.filter((section) => section.game === "Shadow of the Erdtree").length} Shadow of the Erdtree sections`,
      note: "Checklist state is per journey and resets when a new journey starts.",
      cta: "Open NG+ checklist",
      to: "/completion?tab=ngplus",
    },
    {
      id: "collection",
      label: "Permanent collection snapshot",
      ok: collection.owned === collection.total,
      detail: `${collection.owned} / ${collection.total} permanent items owned · base ${collection.baseGame.owned}/${collection.baseGame.total} · DLC ${collection.dlc.owned}/${collection.dlc.total}`,
      note: "Advisory only. The catalog denominator is the merged whole-game item list; it is still not a platform-level proof.",
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

  const filteredBranchDecisions = useMemo(() => {
    const query = branchQuery.trim().toLowerCase();
    const journey = branchJourneyFilter === "all" ? null : Number(branchJourneyFilter);
    return BRANCH_PLAN_DECISIONS.filter((decision) => {
      if (journey !== null && !decision.rewards.some((reward) => reward.journey === journey)) {
        return false;
      }
      if (branchResultFilter === "resolved" && decision.unresolved) return false;
      if (branchResultFilter === "unresolved" && !decision.unresolved) return false;
      if (!query) return true;
      const haystack = [
        decision.decisionId,
        decision.title,
        decision.game,
        decision.category,
        decision.journey1,
        decision.journey1Result,
        decision.futureOutcome,
        decision.futureJourney,
        decision.notes,
        ...decision.rewards.map((reward) => reward.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [branchQuery, branchJourneyFilter, branchResultFilter]);

  const tabItems = TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === "achievements"
        ? ACHIEVEMENTS.length
        : tab.id === "endings"
          ? META.endings.length
          : tab.id === "remembrances"
            ? META.remembrances.length
            : tab.id === "branch"
              ? BRANCH_PLAN_DECISIONS.length
              : tab.id === "ngplus"
                ? ngplusTotal
                : undefined,
  }));

  const filteredAchievements = ACHIEVEMENTS.filter((achievement) => {
    const earned = Boolean(character.achievements[achievement.id]);
    if (achievementFilter === "earned") return earned;
    if (achievementFilter === "unearned") return !earned;
    return true;
  });

  useEffect(() => {
    if (!achievementParam) return;
    const target = document.getElementById(`achievement-${achievementParam}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [achievementParam]);

  useEffect(() => {
    if (!branchParam) return;
    const target = document.getElementById(`branch-${branchParam}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [branchParam]);

  const updateEnding = (id: string, patch: Partial<EndingState>) => {
    setEnding(id, patch);
    const name = META.endings.find((ending) => ending.id === id)?.name ?? "Ending";
    toast.push(`${name} state updated.`, "success");
  };

  const toggleAchievement = (id: string, name: string, value: boolean) => {
    setAchievement(id, value);
    toast.push(`${name} ${value ? "marked earned" : "marked unearned"}.`, value ? "success" : "default");
  };

  const toggleNgPlusItem = (id: string, value: boolean) => {
    setNgPlusItem(id, value);
    toast.push(value ? "NG+ checklist item checked." : "NG+ checklist item cleared.");
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
            {scopes.length} ledgers covering the base game, Shadow of the Erdtree, and the Ashen Capital endgame. Each
            reports its own numerator and denominator from stored companion state — no blended percentage can hide an
            unfinished ledger, and nothing here claims platform-level completion.
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
              onClick={() => navigate("/completion?tab=ngplus")}
            >
              NG+ readiness
            </Button>
          </>
        }
      />

      <section className="completion-scopes" aria-label="100% completion scopes">
        <div className="scope-header">
          <div>
            <h2 className="scope-title">100% completion</h2>
            <p className="scope-subtitle">
              {scopesComplete} / {scopes.length} scopes complete · every scope reports its own real denominator
            </p>
          </div>
          <Badge tone={scopesComplete === scopes.length ? "success" : "accent"}>
            {scopes.length - scopesComplete} open {scopes.length - scopesComplete === 1 ? "scope" : "scopes"}
          </Badge>
        </div>
        <div className="scope-groups">
          {SCOPE_GROUPS.map((group) => {
            const rows = group.ids.flatMap((id) => {
              const found = scopes.find((scopeRow) => scopeRow.id === id);
              return found ? [found] : [];
            });
            if (rows.length === 0) return null;
            const groupDone = rows.filter((row) => row.complete).length;
            return (
              <Disclosure
                key={group.id}
                title={group.label}
                summary={`${groupDone} / ${rows.length} complete · ${group.note}`}
                icon={group.id === "world" ? "layers" : group.id === "build" ? "flame" : "map"}
                defaultOpen={group.id === "route"}
              >
                <div className="scope-grid">
                  {rows.map((scopeRow) => (
                    <button
                      key={scopeRow.id}
                      type="button"
                      className={`scope-card${scopeRow.complete ? " is-complete" : ""}`}
                      onClick={() => navigate(SCOPE_LINKS[scopeRow.id] ?? "/completion")}
                      aria-label={`Open ${scopeRow.label}: ${scopeRow.numerator} of ${scopeRow.denominator}`}
                    >
                      <span className="scope-card-head">
                        <span className="scope-icon" aria-hidden="true">
                          <Icon name={SCOPE_ICONS[scopeRow.id] ?? "target"} size={15} />
                        </span>
                        <span className="scope-label">{scopeRow.label}</span>
                        {scopeRow.complete ? <Icon name="check" size={13} /> : null}
                      </span>
                      <span className="scope-value">
                        {formatNumber(scopeRow.numerator)}{" "}
                        <span className="faint">/ {formatNumber(scopeRow.denominator)}</span>
                      </span>
                      <span className="scope-meta">
                        <span>{scopeRow.percent}%</span>
                        <span className="faint">{scopeRow.complete ? "complete" : "in progress"}</span>
                      </span>
                      <span className={`scope-track${scopeRow.complete ? " is-complete" : ""}`} aria-hidden="true">
                        <span className="scope-fill" style={{ width: `${scopeRow.percent}%` }} />
                      </span>
                    </button>
                  ))}
                </div>
              </Disclosure>
            );
          })}
        </div>
      </section>

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
              label="Full route"
              value={`${routeState.requiredPercent}%`}
              detail={
                <>
                  {routeState.requiredResolved} / {routeState.required} required · {routeState.done} done ·{" "}
                  {routeState.skipped} skipped of {routeState.total} steps
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
                  {decisionsChosen} / {META.decisions.length}
                </>
              }
              progress={chronology.percent}
            />
            <PulseCard
              label="Achievements"
              value={`${achievements.done} / ${achievements.total}`}
              detail={
                <>
                  {missableAchievements} flagged MISSABLE · {achievementItems} legendary requirement items ·{" "}
                  {achievements.total - achievements.done} remaining
                </>
              }
              progress={achievements.percent}
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
              label="Bosses & quests"
              value={`${bosses.done} / ${bosses.total}`}
              detail={`Boss ledger ${bosses.percent}% · questlines ${quests.done} / ${quests.total} steps (${quests.percent}%) · NG+ ${ngplus.done} / ${ngplusTotal}`}
              progress={bosses.percent}
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
                      {plan.status.replace(PLAN_STATUS_PHASE, "").trim() || plan.status}
                    </Badge>
                  </div>
                  <dl className="plan-fields">
                    <div>
                      <dt>Purpose</dt>
                      <dd>{plainText(plan.purpose) || "—"}</dd>
                    </div>
                    <div>
                      <dt>Route scope</dt>
                      <dd>{plainText(plan.routeScope) || "—"}</dd>
                    </div>
                    <div>
                      <dt>Ending target</dt>
                      <dd>{plainText(plan.endingTarget) || "—"}</dd>
                    </div>
                    <div>
                      <dt>Cleanup</dt>
                      <dd>{plainText(plan.cleanup) || "—"}</dd>
                    </div>
                    <div>
                      <dt>Entry requirements</dt>
                      <dd>{plainText(plan.entryRequirements) || "—"}</dd>
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
              {META.trophyCues.map((cue) => {
                const step = STEP_BY_ID[cue.sourceStepId];
                return (
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
                      {step ? (
                        <button
                          type="button"
                          className="lore-inline-link tiny"
                          onClick={() =>
                            navigate(
                              `/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`,
                            )
                          }
                        >
                          Route step {step.order}
                        </button>
                      ) : (
                        <span className="tiny faint">{cue.area}</span>
                      )}
                      <span className="tiny faint">Source step</span>
                    </div>
                  </div>
                );
              })}
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
                      <p className="gate-trigger">{plainText(gate.trigger)}</p>
                      <dl className="gate-details">
                        <div>
                          <dt>Safe window</dt>
                          <dd>{plainText(gate.safeWindow) || "—"}</dd>
                        </div>
                        <div>
                          <dt>Pre-check</dt>
                          <dd>{plainText(gate.preCheck) || "—"}</dd>
                        </div>
                      </dl>
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
                    <p className="small muted closeout-obligation">{plainText(entry.obligation) || "—"}</p>
                    <div className="tiny faint">{plainText(entry.deadline) || "Review before the gate"}</div>
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
            <SectionTitle title="Coverage & denominator caveats" note="Derived from the merged content pack" />
            <div className="card card-pad coverage-card">
              {COVERAGE_NOTES.map((note) => (
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

      {activeTab === "achievements" ? (
        <div className="completion-tab">
          <div className="row-between wrap achievement-header-row">
            <SectionTitle
              title="Achievements"
              note={`${achievements.done} / ${ACHIEVEMENTS.length} earned · ${missableAchievements} MISSABLE · ${REQUIREMENT_GROUPS.length} legendary groups (${achievementItems} items)`}
            />
            <div className="achievement-filter">
              <Select
                label="Earned state"
                value={achievementFilter}
                onChange={(event) => setAchievementFilter(event.target.value)}
              >
                <option value="all">All ({ACHIEVEMENTS.length})</option>
                <option value="earned">Earned only ({achievements.done})</option>
                <option value="unearned">Unearned only ({ACHIEVEMENTS.length - achievements.done})</option>
              </Select>
            </div>
          </div>

          <Callout tone="default" icon="achievement">
            All {ACHIEVEMENTS.length} achievements, grouped by section. Toggling earned state stores a companion flag on
            the active character; requirement items open directly in the collection catalog.
          </Callout>

          {filteredAchievements.length === 0 ? (
            <EmptyState
              title="No achievements in this filter"
              description="Switch back to all achievements to browse the full list."
              action={
                <Button icon="refresh" onClick={() => setAchievementFilter("all")}>
                  Show all achievements
                </Button>
              }
            />
          ) : (
            ACHIEVEMENT_SECTION_ORDER.map((section) => {
              const rows = filteredAchievements.filter((achievement) => achievement.section === section);
              if (rows.length === 0) return null;
              const earnedInSection = rows.filter((achievement) => character.achievements[achievement.id]).length;
              return (
                <div className="completion-section" key={section}>
                  <SectionTitle
                    title={section}
                    note={`${earnedInSection} / ${rows.length} earned · ${ACHIEVEMENT_SECTION_NOTES[section] ?? "Achievement group"}`}
                  />
                  <div className="achievement-grid">
                    {rows.map((achievement) => {
                      const earned = Boolean(character.achievements[achievement.id]);
                      return (
                        <article
                          className={`achievement-row${earned ? " is-earned" : ""}${achievement.id === achievementParam ? " is-focused" : ""}`}
                          key={achievement.id}
                          id={`achievement-${achievement.id}`}
                        >
                          <Checkbox
                            checked={earned}
                            onChange={(value) => toggleAchievement(achievement.id, achievement.name, value)}
                            label={<span className="sr-only">Mark {achievement.name} earned</span>}
                          />
                          <div className="grow achievement-body">
                            <div className="achievement-head">
                              <h3 className="card-title">{achievement.name}</h3>
                              <div className="tag-list achievement-badges">
                                <Badge>{achievement.section}</Badge>
                                {achievement.missable ? <Badge tone="warning">MISSABLE</Badge> : null}
                                {achievement.badges
                                  .filter((badge) => badge.toUpperCase() !== "MISSABLE")
                                  .map((badge) => (
                                    <Badge tone="accent" key={badge}>
                                      {badge}
                                    </Badge>
                                  ))}
                                {earned ? <Badge tone="success">Earned</Badge> : null}
                              </div>
                            </div>
                            <p className="achievement-desc">{achievement.description}</p>

                            {achievement.requirementGroupIds.length > 0 ? (
                              <div className="achievement-reqs">
                                {achievement.requirementGroupIds.map((groupId) => {
                                  const group = REQUIREMENT_GROUP_BY_ID[groupId];
                                  if (!group) return null;
                                  return (
                                    <div className="req-group" key={groupId}>
                                      <div className="req-group-head">
                                        <strong>{group.name}</strong>
                                        <span className="tiny faint">
                                          {group.items.length} items · {group.kind}
                                        </span>
                                      </div>
                                      <ul className="req-items">
                                        {group.items.map((item) => {
                                          const known = Boolean(ITEM_BY_ID[item.itemId]);
                                          const owned = Boolean(character.items[item.itemId]);
                                          return (
                                            <li key={item.itemId} className={owned ? "is-owned" : ""}>
                                              {known ? (
                                                <button
                                                  type="button"
                                                  className="lore-inline-link"
                                                  onClick={() => navigate(`/collection?item=${encodeURIComponent(item.itemId)}`)}
                                                >
                                                  {item.name}
                                                </button>
                                              ) : (
                                                <span>{item.name}</span>
                                              )}
                                              {item.missable ? <Badge tone="warning">MISSABLE</Badge> : null}
                                              {owned ? (
                                                <span className="req-owned" title="Owned">
                                                  <Icon name="check" size={11} />
                                                </span>
                                              ) : null}
                                              <a
                                                href={item.wikiUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="req-wiki"
                                                aria-label={`Wiki: ${item.name}`}
                                              >
                                                <Icon name="external" size={10} />
                                              </a>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}

                            <div className="achievement-foot">
                              <a href={achievement.wikiUrl} target="_blank" rel="noreferrer">
                                Wiki <Icon name="external" size={11} />
                              </a>
                              <span className="tiny faint">
                                {achievement.section}
                                {achievement.missable ? " · missable" : ""}
                              </span>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {activeTab === "endings" ? (
        <div className="completion-tab">
          <SectionTitle
            title="Endings"
            note={`${endingsViewed} / ${META.endings.length} viewed · ${endingsEarned} earned`}
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
              title="Ending achievements"
              note={`${META.endings.filter((ending) => ending.achievement !== "—").length} ending-path trophies · ${ACHIEVEMENTS.length} tracked in total`}
              actions={
                <Button size="sm" variant="ghost" iconRight="arrowRight" onClick={() => navigate("/completion?tab=achievements")}>
                  All achievements
                </Button>
              }
            />
            <div className="card card-pad achievement-card">
              <div className="list">
                {META.endings
                  .filter((ending) => ending.achievement !== "—")
                  .map((ending) => {
                    const achievement = ACHIEVEMENTS.find((row) => row.name === ending.achievement);
                    const earned = achievement ? Boolean(character.achievements[achievement.id]) : false;
                    return (
                      <div className="list-row" key={ending.id}>
                        <Icon name="trophy" size={16} />
                        <div className="grow">
                          <strong>{ending.achievement}</strong>
                          <div className="small faint">{ending.name}</div>
                        </div>
                        {achievement ? (
                          <Checkbox
                            checked={earned}
                            onChange={(value) => toggleAchievement(achievement.id, achievement.name, value)}
                            label={
                              <>
                                <span className="sr-only">{achievement.name} earned</span>
                                <span aria-hidden="true">{earned ? "Earned" : "Not earned"}</span>
                              </>
                            }
                          />
                        ) : null}
                        <Badge tone="accent">Ending {ending.order}</Badge>
                      </div>
                    );
                  })}
              </div>
              <Callout tone="default" icon="alert">
                Earned flags are companion records. They are not a claim that a platform trophy fired; ending{" "}
                <em>viewed</em> state above remains separate from achievement earnings.
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
        <div className="completion-tab remembrance-tab">
          <Callout tone="default" icon="scroll">
            The plan below is ordered by duplication priority: the remembrances most likely to need a duplicate come
            first, with the reward to take and whether to spend a mausoleum now or defer to the next journey. The
            ledger under it records what actually happened on the active journey.
          </Callout>

          <div className="completion-section remembrance-plan-section">
            <SectionTitle
              title="Duplication plan"
              note={`${remembrancePlanRows().length} remembrances · ordered by duplicate priority`}
            />
            <RemembrancePlanSummary rows={remembrancePlanRows()} />
            <RemembrancePlanList rows={remembrancePlanRows()} />
          </div>

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
                const planRow = remembranceRowFor(remembrance.id);
                return (
                  <article className={`card card-pad remembrance-card${processed ? " is-processed" : ""}`} key={remembrance.id}>
                    <div className="remembrance-head">
                      <div className="grow">
                        <h3 className="card-title">{remembrance.name}</h3>
                        <div className="small muted">
                          {planRow?.bossHref ? (
                            <a className="remembrance-entity-link" href={planRow.bossHref}>
                              {remembrance.boss}
                            </a>
                          ) : (
                            remembrance.boss
                          )}
                        </div>
                      </div>
                      <div className="tag-list">
                        <Badge tone="info">{remembrance.game}</Badge>
                        {planRow ? <Badge>#{planRow.order}</Badge> : null}
                        {processed ? <Badge tone="success">Processed</Badge> : null}
                      </div>
                    </div>

                    {planRow?.routeLinks.length ? (
                      <div className="remembrance-route-links">
                        {planRow.routeLinks.map((link) => (
                          <a className="remembrance-route-link" href={link.href} key={link.stepId}>
                            <Icon name="map" size={11} /> {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}

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

      {activeTab === "branch" ? (
        <div className="completion-tab">
          <div className="row-between wrap branch-header-row">
            <SectionTitle
              title="Journey plan"
              note={`${BRANCH_PLAN_DECISIONS.length} decisions · ${branchSettledDecisions} settled · ${BRANCH_REWARDS.length} rewards`}
            />
            <span className="tiny faint" aria-live="polite">
              {filteredBranchDecisions.length} / {BRANCH_PLAN_DECISIONS.length} decisions shown
            </span>
          </div>

          <Callout tone="default" icon="quest">
            Each decision records the outcome you actually chose, the Journey 1 plan, and the stated alternative. A
            card settles as soon as any one of these is true: an anchored route step on your chosen branch is done, you
            tick the manual check, or you record an outcome — branches inside one decision are alternatives, so one
            resolved branch is enough. Reward chips resolve to the permanent collection; unresolved rewards stay
            labeled with the reason they cannot be linked.
          </Callout>

          {priorJourney ? (
            <Callout tone={freshRun ? "warning" : "default"} icon={freshRun ? "alert" : "refresh"}>
              {freshRun ? (
                <>
                  <strong>{journey.label} has no decisions recorded yet.</strong> It is a clean run: nothing below is
                  secured for it. {securedByLifetime} of {BRANCH_PLAN_DECISIONS.length} decisions already have every
                  resolved reward in your lifetime collection, so those need no re-farming; {rechooseDecisions.length}{" "}
                  still have a branch to choose. {journey.label} carries none of {priorJourney.label}&rsquo;s manual
                  checks — the &ldquo;Secured in {priorJourney.label}&rdquo; list below is reference only.
                </>
              ) : (
                <>
                  <strong>{journey.label} is in progress.</strong> {securedByLifetime} of{" "}
                  {BRANCH_PLAN_DECISIONS.length} decisions already have every resolved reward in your lifetime
                  collection; {rechooseDecisions.length} still have a branch to choose for this run. Manual checks and
                  route anchors below belong to {journey.label} only; {priorJourney.label} is preserved separately.
                </>
              )}
            </Callout>
          ) : null}

          <div className="branch-summary" aria-label="Branch reward summary">
            <div className="branch-summary-cell">
              <span className="stat-label">Decisions settled</span>
              <strong>
                {branchSettledDecisions} <span className="faint">/ {BRANCH_PLAN_DECISIONS.length}</span>
              </strong>
              <span className="tiny faint">
                {decisionsChosen} outcome{decisionsChosen === 1 ? "" : "s"} recorded · {decisionsFromRoute} by route ·{" "}
                {decisionsFromManual} by check
              </span>
            </div>
            <div className="branch-summary-cell">
              <span className="stat-label">Rewards</span>
              <strong>{BRANCH_REWARDS.length}</strong>
              <span className="tiny faint">{branchProgress.resolved} resolved / {branchProgress.unresolved} unresolved</span>
            </div>
            <div className="branch-summary-cell">
              <span className="stat-label">Resolved rewards owned</span>
              <strong>
                {branchProgress.done} <span className="faint">/ {branchProgress.total}</span>
              </strong>
              <span className="tiny faint">{branchProgress.percent}% from character items</span>
            </div>
            <div className="branch-summary-cell">
              <span className="stat-label">Distinct item IDs</span>
              <strong>
                {branchProgress.distinctAcquired} <span className="faint">/ {branchProgress.distinctResolved}</span>
              </strong>
              <span className="tiny faint">owned / resolved distinct rewards</span>
            </div>
          </div>

          <div className="branch-lifecycle">
            <section className="branch-lifecycle-col" aria-label="Decisions secured by lifetime progress">
              <div className="branch-lifecycle-head">
                <h3>Secured by lifetime progress</h3>
                <Badge tone="success">{securedDecisions.length}</Badge>
              </div>
              <p className="tiny faint">
                Every resolved reward for these decisions is already in your collection, so {journey.label} does not
                have to farm them again. The outcome itself is still a choice you make in game — only the reward is
                banked.
              </p>
              {securedDecisions.length ? (
                <div className="branch-lifecycle-list">
                  {securedDecisions.map((decision) => (
                    <span className="branch-lifecycle-item" key={`secured-${decision.decisionId}`}>
                      <Icon name="check" size={11} /> {decision.title}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="small muted">No branch reward is fully owned yet.</p>
              )}
            </section>
            <section className="branch-lifecycle-col" aria-label="Decisions still to choose this run">
              <div className="branch-lifecycle-head">
                <h3>Still to decide this run</h3>
                <Badge tone={rechooseDecisions.length ? "warning" : "success"}>
                  {rechooseDecisions.length}
                </Badge>
              </div>
              <p className="tiny faint">
                No outcome recorded, no branch reached, and no manual check in {journey.label}
                {freshRun ? " — the run is still empty" : ""}. Each of these needs its branch chosen again.
              </p>
              {rechooseDecisions.length ? (
                <div className="branch-lifecycle-list">
                  {rechooseDecisions.map((decision) => (
                    <button
                      className="branch-lifecycle-link"
                      key={`rechoose-${decision.decisionId}`}
                      onClick={() =>
                        navigate(`/completion?tab=branch&decision=${encodeURIComponent(decision.decisionId)}`)
                      }
                    >
                      <Icon name="target" size={11} /> {decision.title}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small muted">Every decision is settled for this run.</p>
              )}
            </section>
          </div>

          <div className="branch-toolbar">
            <SearchInput
              value={branchQuery}
              onChange={setBranchQuery}
              placeholder="Search decisions, rewards, outcomes…"
            />
            <Select
              label="Journey availability"
              value={branchJourneyFilter}
              onChange={(event) => setBranchJourneyFilter(event.target.value)}
            >
              <option value="all">All journeys ({BRANCH_PLAN_DECISIONS.length})</option>
              <option value="1">Journey 1</option>
              <option value="2">Journey 2</option>
              <option value="3">Journey 3</option>
            </Select>
            <Select
              label="Reward state"
              value={branchResultFilter}
              onChange={(event) => setBranchResultFilter(event.target.value)}
            >
              <option value="all">All states ({BRANCH_PLAN_DECISIONS.length})</option>
              <option value="resolved">Resolved only ({branchResolvedDecisions})</option>
              <option value="unresolved">
                Unresolved only ({BRANCH_PLAN_DECISIONS.length - branchResolvedDecisions})
              </option>
            </Select>
          </div>

          {filteredBranchDecisions.length === 0 ? (
            <EmptyState
              title="No decisions in this filter"
              description="Try another journey, reward state, or search term."
              action={
                <Button
                  icon="refresh"
                  onClick={() => {
                    setBranchQuery("");
                    setBranchJourneyFilter("all");
                    setBranchResultFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="branch-grid">
              {filteredBranchDecisions.map((decision) => {
                const resolvedRewards = decision.rewards.filter((reward) => !reward.unresolved).length;
                const state = decisionStateById[decision.decisionId];
                const outcomes = decisionOutcomes(decision.decisionId);
                return (
                  <article
                    className={`card card-pad branch-card${decision.unresolved ? " is-unresolved" : " is-resolved"}${state.settled ? " is-settled" : ""}`}
                    key={decision.decisionId}
                    id={`branch-${decision.decisionId}`}
                  >
                    <div className="branch-card-head">
                      <div className="grow">
                        <div className="tag-list branch-tags">
                          <Badge tone="info">{decision.game}</Badge>
                          <Badge>{decision.category}</Badge>
                          {decision.unresolved ? (
                            <Badge tone="warning">Unresolved rewards</Badge>
                          ) : (
                            <Badge tone="success">Rewards resolved</Badge>
                          )}
                          {state.settled ? (
                            <Badge tone="success">
                              {state.reason === "outcome"
                                ? "Outcome recorded"
                                : state.reason === "route"
                                  ? "Branch reached"
                                  : "Checked"}
                            </Badge>
                          ) : (
                            <Badge>Open</Badge>
                          )}
                        </div>
                        <h3 className="card-title branch-title">{decision.title}</h3>
                      </div>
                      <span className="tiny faint branch-reward-count">
                        {resolvedRewards} / {decision.rewards.length} rewards
                      </span>
                    </div>

                    <div className="branch-status">
                      {state.anchors.length > 0 ? (
                        <>
                          <div className="branch-anchors">
                            <span className="branch-set-label">
                              Branch route {state.anchors.length === 1 ? "step" : "steps"} · {state.anchorsDone} of{" "}
                              {state.anchors.length} done
                            </span>
                            <div className="branch-set-items">
                              {state.anchors.map((anchor) => (
                                <button
                                  key={anchor.id}
                                  type="button"
                                  className={`branch-component${anchor.done ? " is-owned" : ""}`}
                                  onClick={() =>
                                    navigate(
                                      `/journey?area=${encodeURIComponent(anchor.area)}&step=${encodeURIComponent(anchor.id)}`,
                                    )
                                  }
                                  aria-label={`Open route step ${anchor.order} in ${anchor.area}${anchor.done ? " (done)" : ""}`}
                                >
                                  <Icon name={anchor.done ? "check" : "map"} size={11} />
                                  {anchor.area} · step {anchor.order}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="branch-check-row">
                            {state.anchorSettled ? (
                              <span className="branch-auto-note">
                                Settled — a route step on this branch is done.
                              </span>
                            ) : (
                              <Checkbox
                                checked={state.manualChecked}
                                onChange={(value) => setDecisionCheck(decision.decisionId, value)}
                                label={
                                  <>
                                    <span className="sr-only">Mark {decision.title} resolved</span>
                                    <span aria-hidden="true">Mark resolved manually</span>
                                  </>
                                }
                              />
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="branch-check-row">
                          <Checkbox
                            checked={state.manualChecked}
                            onChange={(value) => setDecisionCheck(decision.decisionId, value)}
                            label={
                              <>
                                <span className="sr-only">Mark {decision.title} resolved</span>
                                <span aria-hidden="true">Mark resolved manually</span>
                              </>
                            }
                          />
                          <span className="tiny faint">No route anchor — tracked by hand.</span>
                        </div>
                      )}
                    </div>

                    <div className="branch-decision">
                      <Select
                        label="Outcome chosen this journey"
                        value={state.chosen}
                        onChange={(event) => {
                          setDecision(decision.decisionId, event.target.value);
                          toast.push(
                            event.target.value
                              ? `${decision.title} outcome recorded.`
                              : `${decision.title} outcome cleared.`,
                            event.target.value ? "success" : "default",
                          );
                        }}
                      >
                        <option value="">Not decided yet</option>
                        {outcomes.map((outcome) => (
                          <option key={outcome} value={outcome}>
                            {outcome}
                          </option>
                        ))}
                        {state.chosen && !outcomes.includes(state.chosen) ? (
                          <option value={state.chosen}>{state.chosen}</option>
                        ) : null}
                      </Select>
                      <p className="tiny faint branch-decision-note">
                        {state.chosen
                          ? `Recorded: ${state.chosen}`
                          : "Recording the outcome settles this decision even before you reach its route step."}
                      </p>
                    </div>

                    <dl className="branch-outcomes">
                      <div>
                        <dt>Journey 1</dt>
                        <dd>{plainText(decision.journey1) || "—"}</dd>
                      </div>
                      <div>
                        <dt>Journey 1 result</dt>
                        <dd>{plainText(decision.journey1Result) || "—"}</dd>
                      </div>
                      <div>
                        <dt>Future outcome</dt>
                        <dd>{plainText(decision.futureOutcome) || "—"}</dd>
                      </div>
                      <div>
                        <dt>Future journey</dt>
                        <dd>{plainText(decision.futureJourney) || "—"}</dd>
                      </div>
                    </dl>

                    {decision.rewards.length > 0 ? (
                      <div className="branch-rewards">
                        {decision.rewards.map((reward, index) => (
                          <BranchRewardChip
                            key={`${decision.decisionId}-${reward.name}-${reward.journey}-${index}`}
                            reward={reward}
                            ownedItemIds={character.items}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="tiny faint branch-no-rewards">
                        No catalog item reward in any branch; outcome is narrative only.
                      </p>
                    )}

                    {plainText(decision.notes) ? <p className="branch-note">{plainText(decision.notes)}</p> : null}
                  </article>
                );
              })}
            </div>
          )}

          {priorJourney ? (
            <section className="branch-prior" aria-label={`Decisions secured in ${priorJourney.label}`}>
              <SectionTitle
                title={`Secured in ${priorJourney.label}`}
                note={`Reference only · ${priorDecisionRows.length} of ${BRANCH_PLAN_DECISIONS.length} decisions settled there`}
              />
              <p className="small muted" style={{ marginBottom: 10 }}>
                Read-only history from the previous run. Nothing here is current for {journey.label}, and ticking a row
                would not carry it forward — record the outcome again above once you reach that branch this run.
              </p>
              {priorDecisionRows.length === 0 ? (
                <p className="tiny faint">No decision was recorded in {priorJourney.label} either.</p>
              ) : (
                <div className="list">
                  {priorDecisionRows.map(({ decision, row }) => (
                    <div className="list-row" key={`prior-${decision.decisionId}`}>
                      <div className="grow">
                        <div className="card-title" style={{ fontSize: 13.5 }}>
                          {decision.title}
                        </div>
                        <div className="small muted">
                          {row.chosen
                            ? `Chosen: ${row.chosen}`
                            : row.reason === "route"
                              ? `Branch reached — ${row.anchors
                                  .filter((anchor) => anchor.done)
                                  .map((anchor) => `${anchor.area} step ${anchor.order}`)
                                  .join(", ")}`
                              : "Marked resolved by hand"}
                        </div>
                      </div>
                      <Badge tone="default">Read-only</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "ngplus" ? (
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
            Collection and farm rows are advisory snapshots, not readiness gates. Each readiness row above counts its
            own stored state; these snapshots cannot prove 100% game completion on their own.
          </Callout>

          <div className="completion-section">
            <SectionTitle
              title="NG+ checklist"
              note={`${ngplus.done} / ${ngplusTotal} items · ${NGPLUS_SECTIONS.length} sections · ${NGPLUS_SECTIONS.filter((section) => section.game === "Shadow of the Erdtree").length} DLC`}
            />
            <Callout tone="default" icon="list">
              Stockpile these before starting Journey 2. Checklist state is stored on {journey.label} and resets with a
              new or reset journey.
            </Callout>
            <div className="ngp-sections">
              {NGPLUS_SECTIONS.map((section) => {
                const sectionDone = section.steps.filter((step) => journey.ngplusChecklist[step.id]).length;
                const percent = section.steps.length
                  ? Math.round((sectionDone / section.steps.length) * 100)
                  : 0;
                return (
                  <article className="ngp-section" key={section.id}>
                    <div className="ngp-head">
                      <div className="grow">
                        <h3 className="card-title">{section.title}</h3>
                        <div className="tiny faint">
                          {section.game} · {section.steps.length} items
                          {section.levelRange ? ` · ${section.levelRange}` : ""}
                        </div>
                      </div>
                      <Badge tone={sectionDone === section.steps.length ? "success" : "default"}>
                        {sectionDone} / {section.steps.length}
                      </Badge>
                    </div>
                    <ProgressBar
                      value={percent}
                      tone={sectionDone === section.steps.length ? "success" : "accent"}
                    />
                    <ul className="ngp-steps">
                      {section.steps.map((step) => {
                        const checked = Boolean(journey.ngplusChecklist[step.id]);
                        return (
                          <li className={`ngp-step${checked ? " is-checked" : ""}`} key={step.id}>
                            <Checkbox
                              checked={checked}
                              onChange={(value) => toggleNgPlusItem(step.id, value)}
                              label={
                                <>
                                  <span className="sr-only">NG+ checklist: {step.text}</span>
                                  <span>{step.text}</span>
                                </>
                              }
                            />
                            <div className="ngp-step-meta">
                              {step.optional ? <Badge>Optional</Badge> : null}
                              {step.badges
                                .filter((badge) => badge.toUpperCase() !== "OPTIONAL")
                                .map((badge) => (
                                  <Badge key={badge} tone="warning">
                                    {badge}
                                  </Badge>
                                ))}
                              {step.links.slice(0, 2).map((link) => (
                                <a
                                  key={`${step.id}-${link.url}`}
                                  href={link.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ngp-link"
                                  aria-label={`${step.text} source: ${link.label}`}
                                >
                                  {link.label} <Icon name="external" size={10} />
                                </a>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="completion-section">
            <SectionTitle title="Journey actions" note="Lifetime records stay on the character" />
            <div className="card card-accent card-pad readiness-actions">
              <div>
                <h3 className="card-title">Begin the next journey</h3>
                <p className="small muted">
                  A new journey resets route, chronology, boss and questline state, journey-level farm tracking,
                  certifications, transition-gate reviews, remembrance state, and the NG+ checklist for the active run.
                  Lifetime item ownership, farmable quantities, read lore, and ending records are preserved.
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
              {COVERAGE_NOTES.map((note) => (
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
        subtitle={activePlan ? activePlan.status.replace(PLAN_STATUS_PHASE, "").trim() : undefined}
        onClose={() => setPlanIndex(null)}
      >
        {activePlan ? (
          <dl className="kv plan-detail">
            <dt>Purpose</dt>
            <dd>{plainText(activePlan.purpose) || "—"}</dd>
            <dt>Route scope</dt>
            <dd>{plainText(activePlan.routeScope) || "—"}</dd>
            <dt>Ending target</dt>
            <dd>{plainText(activePlan.endingTarget) || "—"}</dd>
            <dt>Alternate choices</dt>
            <dd>{plainText(activePlan.alternateChoices) || "—"}</dd>
            <dt>Remembrance plan</dt>
            <dd>{plainText(activePlan.remembrancePlan) || "—"}</dd>
            <dt>Duplicate plan</dt>
            <dd>{plainText(activePlan.duplicatePlan) || "—"}</dd>
            <dt>Cleanup</dt>
            <dd>{plainText(activePlan.cleanup) || "—"}</dd>
            <dt>Entry requirements</dt>
            <dd>{plainText(activePlan.entryRequirements) || "—"}</dd>
            <dt>Notes</dt>
            <dd>{plainText(activePlan.notes) || "—"}</dd>
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
              <dd>{plainText(activeMerchant.obligation) || "—"}</dd>
              <dt>Deadline</dt>
              <dd>{plainText(activeMerchant.deadline) || "—"}</dd>
              <dt>Authority</dt>
              <dd>{plainText(activeMerchant.authority) || "—"}</dd>
              <dt>Validation</dt>
              <dd>{plainText(activeMerchant.validation) || "—"}</dd>
              <dt>Notes</dt>
              <dd>{plainText(activeMerchant.notes) || "—"}</dd>
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
                This clears route steps, chronology actions, boss and questline state, journey-level farm tracking,
                certifications, gate reviews, remembrance choices, and the NG+ checklist for {journey.label}.
              </Callout>
              <p className="small muted">
                Lifetime item ownership, farmable quantities, read lore, and ending records stay on the character.
                Backup any state you need before resetting.
              </p>
            </>
          ) : (
            <>
              <Callout tone="warning" icon="alert">
                A new journey starts empty route, chronology, boss and questline, journey-level farm, certification,
                gate, remembrance, and NG+ checklist state for the run. Lifetime collection, farmable quantities, read
                lore, and ending records are preserved on the character.
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
