import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Disclosure,
  EmptyState,
  PageHeader,
  ProgressBar,
  SearchInput,
  SectionTitle,
  Select,
  TabBar,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import {
  DIALOGUE_EVENTS,
  ENCOUNTERS,
  ITEMS_BY_NAME,
  LORE,
  LORE_EXPANDED,
  META,
  NPC_DESCRIPTIONS,
  NPC_STATES,
  QUESTLINES,
  QUESTLINE_ROUTE_LINKS,
  QUESTLINE_ROUTE_MAP,
  QUESTLINE_STEPS,
  STEP_BY_ID,
  normalizeContentKey,
} from "../lib/data";
import worldJson from "../data/world.json";
import { loreAccess, questlineProgress } from "../lib/selectors";
import { navigate, queryString, useRoute } from "../lib/router";
import {
  setDecision,
  setDialogue,
  setNpcState,
  setQuestlineStep,
  useActiveJourney,
  useAppState,
} from "../lib/store";
import type {
  Decision,
  Dependency,
  DialogueEvent,
  Encounter,
  Link,
  Lockout,
  LoreEntry,
  NpcState,
  Questline,
  QuestlineRouteLink,
  QuestlineStep,
} from "../lib/types";
import "./world.css";

const LOCKOUTS: Lockout[] = worldJson.lockouts;
const DEPENDENCIES: Dependency[] = worldJson.dependencies;

type QuestTab = "questlines" | "npcs" | "decisions" | "lockouts" | "dependencies";
type BadgeTone = "default" | "accent" | "success" | "warning" | "danger" | "info";

const QUESTLINE_BY_ID: Record<string, Questline> = Object.fromEntries(
  QUESTLINES.map((questline) => [questline.id, questline]),
);

/**
 * Route links are keyed by questline step id, but the record key is not part of
 * the contract — index both the key and the value so either keying works.
 */
const ROUTE_LINK_BY_QUESTLINE_STEP: Record<string, QuestlineRouteLink> = Object.fromEntries(
  Object.entries(QUESTLINE_ROUTE_LINKS).flatMap(([key, link]) => [
    [key, link] as const,
    [link.questlineStepId, link] as const,
  ]),
);

/** Only links whose route step exists in the bundled route are navigable. */
const ROUTE_LINKS_WITH_TARGET: QuestlineRouteLink[] = Object.values(QUESTLINE_ROUTE_LINKS).filter(
  (link) => Boolean(STEP_BY_ID[link.routeStepId]),
);

const NPC_LORE_BY_NORMALIZED_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(NPC_DESCRIPTIONS).map(([key, entry]) => [normalizeContentKey(key), entry.text]),
);

const NPC_LORE_SOURCE_BY_NORMALIZED_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(NPC_DESCRIPTIONS).map(([key, entry]) => [normalizeContentKey(key), entry.sourceUrl]),
);

/**
 * World-state records name NPCs by the role the route calls them ("Blaidd",
 * "Castellan Edgar"), while the lore store keys the wiki page name ("Blaidd
 * the Half-Wolf", "Irina of Morne"). Each alias points at a description key
 * that actually exists, so an aliased NPC renders the same paragraph the Lore
 * page would.
 */
const NPC_LORE_ALIASES: Record<string, string> = {
  blaidd: "Blaidd the Half-Wolf",
  "iron fist alexander": "Alexander, Warrior Jar",
  alexander: "Alexander, Warrior Jar",
  irina: "Irina of Morne",
  roderika: "Roderika, Spirit Tuner",
  "sir gideon ofnir": "Sir Gideon Ofnir, the All-Knowing",
  "gideon ofnir": "Sir Gideon Ofnir, the All-Knowing",
  "bloody finger hunter yura": "Yura, Hunter of Bloody Fingers",
  yura: "Yura, Hunter of Bloody Fingers",
  "two fingers and finger reader enia": "Finger Reader Enia",
  "smithing master hewg and roderika": "Smithing Master Hewg",
  renna: "Ranni the Witch",
};

/**
 * NPCs the world file tracks but the wiki description set has no page for
 * (generic roles, dead traders, husks, lingering spirits). Each note is
 * written from the in-game text and route records that do exist, and names
 * its source so it is never mistaken for a wiki quotation.
 */
const NPC_LORE_NOTES: Record<string, NpcLore> = {
  "castellan edgar": {
    text: "Edgar is the castellan of Castle Morne, appointed by Godrick the Grafted and father to Irina of Morne. After the Misbegotten servants seize the castle he holds out at the rampart, staying on duty until the treasured Grafted Blade Greatsword is recovered and Irina's Letter reaches him.",
    source: "Castle Morne area and Irina of Morne entries",
  },
  edgar: {
    text: "Edgar is the castellan of Castle Morne, appointed by Godrick the Grafted and father to Irina of Morne. He holds out at the rampart after the Misbegotten seize the castle, staying on duty until the Grafted Blade Greatsword is recovered and Irina's Letter reaches him.",
    source: "Castle Morne area and Irina of Morne entries",
  },
  "merchant kale": {
    text: "Kalé is the nomadic merchant camped at the Church of Elleh, the first trader most Tarnished meet. He sells the Crafting Kit that unlocks crafting, reads the Mistwood howl for you, and teaches the Finger Snap. The nomadic merchants' own garb records what became of their clan: the Great Caravan was accused of heresy, buried alive far underground, and answered with a curse that summoned the flame of frenzy.",
    source: "Nomadic Merchant's Chapeau item text and Church of Elleh route records",
  },
  "nomadic merchant": {
    text: "Nomadic merchants are the hooded traders who sit under lanterns along every road of the Lands Between. Their garb records what became of their clan: the Great Caravan was accused of heretical beliefs, buried alive far underground, and answered with a curse of despair that summoned the flame of frenzy. Each one still buys and sells, and each carries finite one-stock lines worth clearing.",
    source: "Nomadic Merchant's Chapeau item text",
  },
  "isolated merchant": {
    text: "Isolated merchants are nomadic merchants posted far from any road — the Weeping Peninsula shack and Raya Lucaria are the usual two. They carry the same clan history as the rest of the Great Caravan and the same finite one-stock lines, so a single visit should clear their list.",
    source: "Nomadic Merchant's Chapeau item text and merchant inventory records",
  },
  "twin maiden husks": {
    text: "The Twin Maiden Husks are the two silent attendants behind the counter in Roundtable Hold. They hold the base twenty-one-line inventory and accept every bell bearing the Tarnished recovers, folding that merchant's or instructor's remaining stock into their own list — which is why killing a merchant early is never the way to reach their wares.",
    source: "Roundtable Hold merchant closeout records",
  },
  "stranded soul": {
    text: "Stranded Souls are the lingering dead of the Lands Between, heard rather than fought. They answer once with a single piece of buried testimony; the one in the rear chamber beyond Godrick's throne speaks beside the Shabriri Grape, and its line is missable once the room is left.",
    source: "Stormveil Castle route and world-state records",
  },
  "wandering noble spirit": {
    text: "The Wandering Noble Spirit at the Church of Pilgrimage is one of the nobles who keep walking the Lands Between after death. The Wandering Noble Ashes describe them as spirits surely in search of something once — something long since forgotten.",
    source: "Wandering Noble Ashes item text",
  },
  "finger reader crone": {
    text: "Finger Reader Crones are the blind women posted along the roads who read the Two Fingers' meaning for passing Tarnished. Enia, who keeps the Two Fingers' audience chamber in Roundtable Hold, is one of their number.",
    source: "Finger Reader Enia entry",
  },
};

/** Honorifics and role prefixes that never identify an NPC on their own. */
const NPC_LORE_TITLE_PREFIXES = [
  "bloody finger hunter",
  "dragon communion priestess",
  "volcano manor proprietress",
  "swordhand of night",
  "smithing master",
  "finger reader",
  "war counselor",
  "witch hunter",
  "needle knight",
  "fire knight",
  "iron fist",
  "castellan",
  "gatekeeper",
  "lightseeker",
  "blackguard",
  "sorceress",
  "sorcerer",
  "preceptor",
  "commander",
  "general",
  "master",
  "knight",
  "brother",
  "redmane",
  "dryleaf",
  "lord",
  "lady",
  "sage",
  "count",
  "sir",
];

/** Role words that match far too many chapters to identify anyone. */
const NPC_LORE_GENERIC_TERMS: Record<string, true> = {
  "merchant": true,
  "merchants": true,
  "nomadic merchant": true,
  "isolated merchant": true,
  "finger": true,
  "fingers": true,
  "reader": true,
  "husk": true,
  "husks": true,
  "tarnished": true,
  "two fingers": true,
  "spirit": true,
  "warrior": true,
  "hunter": true,
  "beast": true,
  "dragon": true,
  "twin": true,
};

interface NpcLore {
  text: string;
  source: string;
}

/** Drops a region suffix so "Nomadic Merchant — Western Limgrave" still resolves. */
function npcBaseKey(npc: string): string {
  return normalizeContentKey(npc.split(/\s+—\s+|\s+\(/)[0]);
}

/**
 * Resolves an NPC to its lore note. Exact keys win, then the region-stripped
 * key (nomadic/isolated merchant variants), then the explicit alias table.
 */
function npcLoreFor(npc: string): NpcLore | null {
  const fullKey = normalizeContentKey(npc);
  const baseKey = npcBaseKey(npc);
  const note = NPC_LORE_NOTES[fullKey] ?? NPC_LORE_NOTES[baseKey];
  if (note) return note;
  const aliasTarget = NPC_LORE_ALIASES[fullKey] ?? NPC_LORE_ALIASES[baseKey];
  const keys = [fullKey, baseKey, aliasTarget ? normalizeContentKey(aliasTarget) : ""];
  for (const key of keys) {
    const text = key ? NPC_LORE_BY_NORMALIZED_KEY[key] : undefined;
    if (text) {
      return {
        text,
        source: NPC_LORE_SOURCE_BY_NORMALIZED_KEY[key] ?? "In-game item and dialogue text",
      };
    }
  }
  return null;
}

/** Strips region suffixes, role prefixes and "X and Y" pairings down to names. */
function npcNameCandidates(npc: string): string[] {
  const names: string[] = [];
  const head = npc.split(/\s+—\s+|\s+\(/)[0];
  const sources = [npc, head, NPC_LORE_ALIASES[normalizeContentKey(npc)] ?? ""];
  for (const raw of sources) {
    if (!raw) continue;
    for (const part of raw.split(/\s+and\s+/)) {
      const trimmed = part.split(",")[0].trim();
      if (trimmed) names.push(trimmed);
    }
    const commaTail = raw.includes(",") ? raw.split(",").slice(1).join(",").replace(/^the\s+/i, "").trim() : "";
    if (commaTail) names.push(commaTail);
  }
  return names;
}

/** Meaningful search terms for a name: the name plus each title-stripped tail. */
function npcSearchTerms(npc: string): string[] {
  const terms = new Set<string>();
  for (const candidate of npcNameCandidates(npc)) {
    let current = normalizeContentKey(candidate);
    const push = (value: string) => {
      // Single letters ("D") and two-letter fragments match too much prose to
      // be evidence; every real NPC name is at least three characters.
      if (value.replace(/\s/g, "").length < 3) return;
      if (NPC_LORE_GENERIC_TERMS[value]) return;
      terms.add(value);
    };
    push(current);
    let changed = true;
    while (changed) {
      changed = false;
      for (const prefix of NPC_LORE_TITLE_PREFIXES) {
        if (current.startsWith(`${prefix} `)) {
          current = current.slice(prefix.length + 1);
          push(current);
          changed = true;
          break;
        }
      }
    }
    // "Sir Gideon Ofnir" and "Boc the Seamster" both identify by their head
    // phrase, which is what chapter prose actually writes.
    const head = current.split(/\s+(?:of|the)\s+/)[0];
    if (head !== current) push(head);
  }
  return [...terms];
}

interface LoreChapter {
  entry: LoreEntry;
  /** Area plus the chapter's cast list — the strongest signal of an appearance. */
  cast: string;
  /** Non-spoiler chapter prose, used only when the cast list is silent. */
  body: string;
}

/**
 * Chapter text used for NPC matching. Only non-spoiler fields are indexed —
 * `rawLater` and the expanded `spoiler` block stay out of the haystack so a
 * sealed chapter can never leak through an NPC cross-reference.
 */
const LORE_CHAPTERS: LoreChapter[] = LORE.map((entry) => {
  const expanded = LORE_EXPANDED[entry.id];
  const normalize = (value: string) => normalizeContentKey(value);
  return {
    entry,
    cast: ` ${normalize([entry.area, entry.rawCharacters].join(" "))} `,
    body: ` ${normalize(
      [
        entry.area,
        entry.rawSummary,
        entry.rawCharacters,
        entry.rawEvidence,
        entry.rawQuestions,
        entry.rawChronicle,
        expanded?.overview ?? "",
        expanded?.context ?? "",
      ].join(" "),
    )} `,
  };
});

/** Chapter prose names groups in the plural ("Finger Reader Crones"). */
function chapterMentions(haystack: string, term: string): boolean {
  return haystack.includes(` ${term} `) || haystack.includes(` ${term}s `);
}

/**
 * Chapters this NPC appears in. The cast list is authoritative; prose is only
 * consulted when no chapter lists them, which keeps a passing mention in an
 * area summary from outranking a real appearance.
 */
function loreChaptersFor(npc: string): LoreEntry[] {
  const terms = npcSearchTerms(npc);
  if (!terms.length) return [];
  const inCast = LORE_CHAPTERS.filter((chapter) =>
    terms.some((term) => chapterMentions(chapter.cast, term)),
  );
  const matches = inCast.length
    ? inCast
    : LORE_CHAPTERS.filter((chapter) => terms.some((term) => chapterMentions(chapter.body, term)));
  return matches.map((chapter) => chapter.entry);
}

const ROUTE_LINK_COVERAGE =
  QUESTLINE_ROUTE_MAP.coverage.steps > 0
    ? QUESTLINE_ROUTE_MAP.coverage
    : {
        steps: QUESTLINE_STEPS.length,
        linked: ROUTE_LINKS_WITH_TARGET.length,
        high: 0,
        medium: 0,
        low: 0,
      };

const ENCOUNTER_BY_NAME: Record<string, Encounter> = Object.fromEntries(
  ENCOUNTERS.map((encounter) => [encounter.name, encounter]),
);

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
  { id: "questlines", label: "Questlines", count: QUESTLINES.length },
  { id: "npcs", label: "NPCs", count: NPC_STATES.length + DIALOGUE_EVENTS.length },
  { id: "decisions", label: "Decisions", count: META.decisions.length },
  { id: "lockouts", label: "Lockouts", count: LOCKOUTS.length },
  { id: "dependencies", label: "Dependencies", count: DEPENDENCIES.length },
];

function isQuestTab(value: string | null): value is QuestTab {
  return (
    value === "questlines" ||
    value === "npcs" ||
    value === "decisions" ||
    value === "lockouts" ||
    value === "dependencies"
  );
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

/**
 * Identification prose for an NPC plus the lore chapters they appear in.
 * The one-paragraph note is safe to show: it is wiki identification, not plot
 * outcome. Chapter text and later context stay sealed until the spoiler gate
 * for that chapter is unlocked, exactly as on the Lore page.
 */
function NpcLoreNote({ npc, collapsible = false }: { npc: string; collapsible?: boolean }) {
  const state = useAppState();
  const journey = useActiveJourney();
  const lore = npcLoreFor(npc);
  const chapters = useMemo(() => loreChaptersFor(npc), [npc]);
  const strict = state.settings.spoilerMode === "strict";
  if (!lore && chapters.length === 0) return null;
  const unlockedCount = chapters.filter((entry) => loreAccess(journey, state.settings, entry).unlocked).length;

  const note = lore ? (
    <>
      <p className="quest-text">{lore.text}</p>
      <div className="tiny faint">Source: {lore.source}</div>
    </>
  ) : (
    <p className="quest-text faint">
      No single-item description covers this NPC; the chapters below are where they appear.
    </p>
  );

  const chapterList = chapters.length ? (
    <Disclosure
      title="Lore chapters"
      summary={`${chapters.length} chapter${chapters.length === 1 ? "" : "s"} · ${unlockedCount} unlocked`}
      tone="muted"
      icon="book"
    >
      <p className="tiny faint" style={{ marginBottom: 8 }}>
        {strict
          ? "Strict spoiler mode: a chapter's overview and later context stay sealed until its route section is complete or you reveal the area on the Lore page."
          : "Reveal-all mode: chapter overviews are open for this journey."}
      </p>
      <div className="stack" style={{ gap: 10 }}>
        {chapters.map((entry) => {
          const access = loreAccess(journey, state.settings, entry);
          const expanded = LORE_EXPANDED[entry.id];
          return (
            <div key={entry.id}>
              <div className="row-between wrap" style={{ gap: 6 }}>
                <button
                  className="chip quest-route-chip"
                  onClick={() =>
                    navigate(
                      `/lore?entry=${encodeURIComponent(entry.id)}&area=${encodeURIComponent(entry.area)}`,
                    )
                  }
                  aria-label={`Open the ${entry.area} lore chapter`}
                >
                  <Icon name="book" size={12} /> {entry.area}
                </button>
                <Badge tone={access.unlocked ? "success" : "warning"}>
                  {access.unlocked ? "Unlocked" : "Sealed"}
                </Badge>
              </div>
              {access.unlocked ? (
                <>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {expanded?.overview || entry.rawSummary}
                  </p>
                  {expanded?.context ? <p className="tiny faint">{expanded.context}</p> : null}
                  {expanded?.spoiler ? (
                    <Disclosure title="Later context" summary="Spoiler" tone="muted">
                      <p className="small">{expanded.spoiler}</p>
                    </Disclosure>
                  ) : null}
                </>
              ) : (
                <p className="tiny faint" style={{ marginTop: 4 }}>
                  {access.reason}. The chapter text stays hidden until then.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Disclosure>
  ) : null;

  // Grouped by region the NPC name is only a badge on the card, so the note
  // folds under it instead of adding a paragraph to every milestone.
  if (collapsible) {
    return (
      <section className="quest-npc-lore">
        <Disclosure
          title={`Lore — ${npc}`}
          summary={chapters.length ? `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}` : "Note"}
          tone="muted"
        >
          {note}
          {chapterList}
        </Disclosure>
      </section>
    );
  }

  return (
    <section className="quest-npc-lore">
      <div className="k">In-game lore</div>
      {note}
      {chapterList}
    </section>
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

function QuestlineLinkChip({ link }: { link: Link }) {
  const items = ITEMS_BY_NAME[link.label] ?? [];
  const item = items.find((entry) => Boolean(entry.autoStepId) || entry.routeStepIds.length > 0) ?? items[0];
  const stepId = item?.autoStepId && STEP_BY_ID[item.autoStepId]
    ? item.autoStepId
    : item?.routeStepIds[0];
  const step = stepId ? STEP_BY_ID[stepId] : undefined;

  if (step) {
    return (
      <button
        className="chip quest-route-chip"
        onClick={() =>
          navigate(`/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`)
        }
      >
        <Icon name="map" size={12} /> {link.label} · Step {step.order + 1}
      </button>
    );
  }

  if (item) {
    return (
      <button
        className="chip quest-route-chip"
        onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
      >
        <Icon name="bag" size={12} /> {link.label} · Collection
      </button>
    );
  }

  const encounter = ENCOUNTER_BY_NAME[link.label];
  if (encounter) {
    return (
      <button
        className="chip quest-route-chip"
        onClick={() => navigate(`/bosses?encounter=${encodeURIComponent(encounter.id)}`)}
      >
        <Icon name="skull" size={12} /> {link.label} · Boss ledger
      </button>
    );
  }

  return (
    <a className="chip" href={link.url} target="_blank" rel="noreferrer noopener">
      <Icon name="external" size={12} /> {link.label}
    </a>
  );
}

interface QuestlineStepCardProps {
  step: QuestlineStep;
  done: boolean;
  onToggle: (value: boolean) => void;
}

function QuestlineStepCard({ step, done, onToggle }: QuestlineStepCardProps) {
  const extraBadges = step.badges.filter(
    (badge) => badge !== "Optional" && !badge.toUpperCase().includes("MISSABLE"),
  );
  const routeLink = ROUTE_LINK_BY_QUESTLINE_STEP[step.id];
  const routeStep = routeLink ? STEP_BY_ID[routeLink.routeStepId] : undefined;
  return (
    <article
      className={`card card-pad quest-card questline-step ${done ? "is-done" : ""} ${
        step.missable ? "is-missable" : ""
      }`.trim()}
      style={{ marginLeft: Math.min(step.depth, 3) * 10 }}
    >
      <div className="row-between wrap" style={{ gap: 6 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Checkbox
            checked={done}
            onChange={onToggle}
            label={
              <>
                Step {step.order}
                {done ? " · done" : ""}
                <span className="sr-only"> — {step.npc}</span>
              </>
            }
          />
          {step.optional ? <Badge>Optional</Badge> : null}
          {step.missable ? <Badge tone="danger">MISSABLE</Badge> : null}
          {extraBadges.map((badge, index) => (
            <Badge key={`${badge}-${index}`} tone={badge === "🏆" ? "success" : "default"}>
              {badge}
            </Badge>
          ))}
          {routeLink ? <Badge tone="info">Route</Badge> : null}
        </div>
        <span className="tiny faint mono">{step.id}</span>
      </div>

      <p className="quest-text">{step.text}</p>

      {routeLink ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="tiny faint">
            {routeStep ? `Route step ${routeStep.order + 1} · ` : "Route step missing from pack · "}
            {routeLink.area || routeStep?.area} · {routeLink.confidence} confidence
          </span>
          {routeStep ? (
            <Button
              size="sm"
              variant="ghost"
              icon="map"
              onClick={() =>
                navigate(
                  `/journey?step=${encodeURIComponent(routeLink.routeStepId)}&area=${encodeURIComponent(
                    routeLink.area || routeStep.area,
                  )}`,
                )
              }
            >
              Open route step
            </Button>
          ) : null}
        </div>
      ) : null}

      {step.links.length ? (
        <div className="tag-list">
          {step.links.map((link) => (
            <QuestlineLinkChip key={`${link.label}-${link.url}`} link={link} />
          ))}
        </div>
      ) : null}
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
  const questlineParam = route.query.get("questline");
  const validQuestlineParam =
    questlineParam && QUESTLINE_BY_ID[questlineParam] ? questlineParam : undefined;
  const questlineNpcMatch = npcParam
    ? QUESTLINES.find(
        (questline) =>
          questline.id === npcParam || questline.npc.toLowerCase() === npcParam.toLowerCase(),
      )
    : undefined;
  const questlineNpcQuery = questlineNpcMatch?.npc ?? npcParam ?? "";
  const tab: QuestTab = isQuestTab(tabParam)
    ? tabParam
    : decisionParam
      ? "decisions"
      : validQuestlineParam
        ? "questlines"
        : "npcs";

  const [npcQuery, setNpcQuery] = useState("");
  const [groupMode, setGroupMode] = useState<"npc" | "region">("npc");
  const [decisionQuery, setDecisionQuery] = useState("");
  const [gameFilter, setGameFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lockQuery, setLockQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [dependencyQuery, setDependencyQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [questlineQuery, setQuestlineQuery] = useState(
    tab === "questlines" ? questlineNpcQuery : "",
  );
  const [questlineGameFilter, setQuestlineGameFilter] = useState("all");
  const [questlineOptionalFilter, setQuestlineOptionalFilter] = useState("all");
  const [questlineMissableFilter, setQuestlineMissableFilter] = useState("all");
  const [selectedQuestlineId, setSelectedQuestlineId] = useState(
    validQuestlineParam ??
      (tab === "questlines" ? questlineNpcMatch?.id : undefined) ??
      QUESTLINES[0]?.id ??
      "",
  );

  const focusedState = NPC_STATES.find((state) => state.id === npcParam || state.npc === npcParam);
  const focusedDialogue = DIALOGUE_EVENTS.find(
    (event) => event.id === npcParam || event.npc === npcParam,
  );
  const focusedNpc = focusedState?.npc ?? focusedDialogue?.npc;

  const npcDone = NPC_STATES.filter((state) => journey.npcStates[state.id]).length;
  const dialogueDone = DIALOGUE_EVENTS.filter((event) => journey.dialogue[event.id]).length;
  // Only ids that exist in the decision table count: an orphaned key from an
  // older pack must not inflate the recorded total.
  const resolvedDecisions = META.decisions.filter((decision) => journey.decisions[decision.id]).length;
  const questsProgress = questlineProgress(journey);
  const missableStepCount = QUESTLINE_STEPS.filter((step) => step.missable).length;
  const optionalStepCount = QUESTLINE_STEPS.filter((step) => step.optional).length;
  const dlcQuestlineCount = QUESTLINES.filter((questline) => questline.dlc).length;

  useEffect(() => {
    if (tab === "questlines" && questlineNpcMatch) setSelectedQuestlineId(questlineNpcMatch.id);
  }, [tab, questlineNpcMatch]);

  useEffect(() => {
    if (validQuestlineParam) setSelectedQuestlineId(validQuestlineParam);
  }, [validQuestlineParam]);

  useEffect(() => {
    if (tab === "questlines" && questlineNpcQuery) setQuestlineQuery(questlineNpcQuery);
  }, [tab, questlineNpcQuery]);

  const filteredQuestlines = useMemo(() => {
    const q = questlineQuery.trim().toLowerCase();
    return QUESTLINES.filter((questline) => {
      if (questlineGameFilter === "dlc" && !questline.dlc) return false;
      if (questlineGameFilter === "base" && questline.dlc) return false;
      if (questlineOptionalFilter === "optional" && !questline.steps.some((step) => step.optional)) {
        return false;
      }
      if (questlineOptionalFilter === "required" && questline.steps.every((step) => step.optional)) {
        return false;
      }
      if (
        questlineMissableFilter === "missable" &&
        !questline.steps.some((step) => step.missable)
      ) {
        return false;
      }
      if (!q) return true;
      return [
        questline.npc,
        questline.game,
        questline.steps.map((step) => step.text).join(" "),
        questline.steps.flatMap((step) => step.links.map((link) => link.label)).join(" "),
        questline.steps.flatMap((step) => step.badges).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [questlineQuery, questlineGameFilter, questlineOptionalFilter, questlineMissableFilter]);

  const selectedQuestline =
    filteredQuestlines.find((questline) => questline.id === selectedQuestlineId) ??
    filteredQuestlines[0];

  useEffect(() => {
    if (!filteredQuestlines.length) return;
    if (!filteredQuestlines.some((questline) => questline.id === selectedQuestlineId)) {
      setSelectedQuestlineId(filteredQuestlines[0].id);
    }
  }, [filteredQuestlines, selectedQuestlineId]);

  const visibleQuestlineSteps = useMemo(() => {
    if (!selectedQuestline) return [];
    return selectedQuestline.steps.filter((step) => {
      if (questlineOptionalFilter === "optional" && !step.optional) return false;
      if (questlineOptionalFilter === "required" && step.optional) return false;
      if (questlineMissableFilter === "missable" && !step.missable) return false;
      return true;
    });
  }, [selectedQuestline, questlineOptionalFilter, questlineMissableFilter]);

  const selectedQuestlineDone = selectedQuestline
    ? selectedQuestline.steps.filter((step) => journey.questlineSteps[step.id]).length
    : 0;

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

  const selectQuestline = (id: string) => {
    setSelectedQuestlineId(id);
    navigate(`/quests?tab=questlines&questline=${encodeURIComponent(id)}`);
  };

  const clearQuestlineFilters = () => {
    setQuestlineQuery("");
    setQuestlineGameFilter("all");
    setQuestlineOptionalFilter("all");
    setQuestlineMissableFilter("all");
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
        eyebrow={`${journey.label} · Fates and world state`}
        title="Quests"
        description={
          <>
            {QUESTLINES.length} questlines and {QUESTLINE_STEPS.length} steps, plus {NPC_STATES.length} NPC
            milestones, {DIALOGUE_EVENTS.length} dialogue events, {META.decisions.length} decisions,{" "}
            {LOCKOUTS.length} lockouts, and {DEPENDENCIES.length} dependencies.
          </>
        }
        actions={
          <>
            <Badge tone="accent">
              {questsProgress.done} / {questsProgress.total} quest steps
            </Badge>
            <Badge tone="danger">{missableStepCount} MISSABLE</Badge>
            <Button icon="map" onClick={() => navigate("/journey")}>
              Open journey
            </Button>
            <Button variant="ghost" icon="skull" onClick={() => navigate("/bosses")}>
              Bosses
            </Button>
          </>
        }
      />

      <div style={{ marginTop: 16 }}>
        <TabBar items={TABS} value={tab} onChange={goTab} />
      </div>

      {tab === "questlines" ? (
        <div style={{ marginTop: 16 }}>
          <section className="card card-pad">
            <div className="quest-toolbar">
              <SearchInput
                className="world-filter-search"
                value={questlineQuery}
                onChange={setQuestlineQuery}
                placeholder="Search NPCs, steps, linked items…"
              />
              <Select
                label="Game"
                className="world-filter-field"
                value={questlineGameFilter}
                onChange={(event) => setQuestlineGameFilter(event.target.value)}
              >
                <option value="all">Base + DLC</option>
                <option value="base">Base game</option>
                <option value="dlc">Shadow of the Erdtree</option>
              </Select>
              <Select
                label="Step type"
                className="world-filter-field"
                value={questlineOptionalFilter}
                onChange={(event) => setQuestlineOptionalFilter(event.target.value)}
              >
                <option value="all">All steps</option>
                <option value="optional">Optional only</option>
                <option value="required">Required only</option>
              </Select>
              <Select
                label="Missable"
                className="world-filter-field"
                value={questlineMissableFilter}
                onChange={(event) => setQuestlineMissableFilter(event.target.value)}
              >
                <option value="all">All steps</option>
                <option value="missable">Missable only</option>
              </Select>
              <div className="quest-counts">
                <Badge>
                  {filteredQuestlines.length} / {QUESTLINES.length}
                </Badge>
                <Badge tone="danger">{missableStepCount} missable</Badge>
              </div>
            </div>

            <div className="world-summary">
              <div className="world-summary-cell">
                <div className="k">Questlines</div>
                <div className="v">{QUESTLINES.length}</div>
                <div className="d">{dlcQuestlineCount} in Shadow of the Erdtree</div>
              </div>
              <div className="world-summary-cell">
                <div className="k">Quest steps</div>
                <div className="v">{QUESTLINE_STEPS.length}</div>
                <div className="d">{optionalStepCount} optional</div>
              </div>
              <div className="world-summary-cell">
                <div className="k">Missable</div>
                <div className="v">{missableStepCount}</div>
                <div className="d">time-sensitive quest beats</div>
              </div>
              <div className="world-summary-cell">
                <div className="k">Completed</div>
                <div className="v">{questsProgress.done}</div>
                <div className="d">{questsProgress.percent}% of all quest steps</div>
              </div>
            </div>

            <div style={{ marginTop: 13 }}>
              <ProgressBar
                value={questsProgress.percent}
                label={`${questsProgress.done} of ${questsProgress.total} quest steps recorded`}
                detail={`${filteredQuestlines.length} questlines shown`}
              />
            </div>

            <div className="quest-route-summary">
              <div className="row-between wrap" style={{ gap: 8 }}>
                <div>
                  <div className="k">Route mapping</div>
                  <div className="v">
                    {ROUTE_LINK_COVERAGE.linked} / {ROUTE_LINK_COVERAGE.steps} linked steps
                  </div>
                </div>
                <Badge tone={ROUTE_LINK_COVERAGE.linked > 0 ? "info" : "warning"}>
                  {ROUTE_LINK_COVERAGE.linked > 0 ? "Route badges active" : "No links yet"}
                </Badge>
              </div>
              <Disclosure title="How steps map to the route" summary="Mapping policy" tone="muted">
                <p className="small muted">
                  Each questline step is matched to a journey route step by NPC, area and objective. Linked steps show
                  a Route badge and an <strong>Open route step</strong> button; unlinked steps stay navigation-free
                  rather than guessing a destination.
                </p>
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  <Badge tone="success">{ROUTE_LINK_COVERAGE.high} high confidence</Badge>
                  <Badge tone="warning">{ROUTE_LINK_COVERAGE.medium} medium</Badge>
                  <Badge>{ROUTE_LINK_COVERAGE.low} low</Badge>
                </div>
                {QUESTLINE_ROUTE_MAP.method ? (
                  <p className="tiny faint" style={{ marginTop: 8 }}>
                    Method: {QUESTLINE_ROUTE_MAP.method}
                  </p>
                ) : null}
              </Disclosure>
            </div>
          </section>

          {filteredQuestlines.length && selectedQuestline ? (
            <div className="world-split">
              <aside className="card card-pad">
                <SectionTitle
                  title="Questlines"
                  note={`${filteredQuestlines.length} of ${QUESTLINES.length}`}
                />
                <div className="world-roster">
                  {filteredQuestlines.map((questline) => {
                    const done = questline.steps.filter((step) => journey.questlineSteps[step.id]).length;
                    const complete = done === questline.steps.length;
                    return (
                      <button
                        key={questline.id}
                        className={`world-roster-item ${
                          questline.id === selectedQuestline.id ? "active" : ""
                        }`.trim()}
                        aria-current={questline.id === selectedQuestline.id ? "true" : undefined}
                        onClick={() => selectQuestline(questline.id)}
                      >
                        <span className="grow">
                          <span className="world-roster-title">{questline.npc}</span>
                          <span className="world-roster-sub">
                            {questline.game} · {done}/{questline.steps.length} steps
                            {questline.steps.some((step) => step.missable)
                              ? ` · ${questline.steps.filter((step) => step.missable).length} missable`
                              : ""}
                          </span>
                        </span>
                        <Badge
                          tone={complete ? "success" : questline.dlc ? "info" : "default"}
                          className="world-roster-badge"
                        >
                          {complete ? "Complete" : questline.dlc ? "DLC" : `${done}/${questline.steps.length}`}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="world-boss-panel stack">
                <section className="card card-pad card-accent">
                  <div className="world-detail-head">
                    <div className="grow">
                      <div className="eyebrow" style={{ marginBottom: 4 }}>
                        Questline · {selectedQuestline.game}
                      </div>
                      <h2 className="world-boss-title">{selectedQuestline.npc}</h2>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {selectedQuestline.steps.length} steps ·{" "}
                        {selectedQuestline.steps.filter((step) => step.missable).length} missable ·{" "}
                        {selectedQuestline.steps.filter((step) => step.optional).length} optional
                      </div>
                    </div>
                    <div className="world-badges">
                      {selectedQuestline.dlc ? <Badge tone="info">DLC</Badge> : null}
                      <Badge
                        tone={
                          selectedQuestlineDone === selectedQuestline.steps.length ? "success" : "accent"
                        }
                      >
                        {selectedQuestlineDone} / {selectedQuestline.steps.length}
                      </Badge>
                      <a
                        className="chip"
                        href={selectedQuestline.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Icon name="external" size={12} /> Source
                      </a>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <ProgressBar
                      value={
                        selectedQuestline.steps.length
                          ? (selectedQuestlineDone / selectedQuestline.steps.length) * 100
                          : 0
                      }
                      label={`${selectedQuestlineDone} of ${selectedQuestline.steps.length} steps recorded`}
                      detail={`${visibleQuestlineSteps.length} shown`}
                    />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <NpcLoreNote npc={selectedQuestline.npc} />
                  </div>
                  {validQuestlineParam === selectedQuestline.id ? (
                    <div className="quest-focus" style={{ marginTop: 12, marginBottom: 0 }}>
                      <Badge tone="accent">Deep link</Badge>
                      <span className="quest-focus-label">{selectedQuestline.npc}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="x"
                        onClick={() => navigate("/quests?tab=questlines")}
                      >
                        Clear focus
                      </Button>
                    </div>
                  ) : null}
                </section>

                {visibleQuestlineSteps.length ? (
                  <div className="stack" style={{ gap: 8 }}>
                    {visibleQuestlineSteps.map((step) => (
                      <QuestlineStepCard
                        key={step.id}
                        step={step}
                        done={Boolean(journey.questlineSteps[step.id])}
                        onToggle={(value) => {
                          setQuestlineStep(step.id, value);
                          toast.push(
                            value
                              ? `${selectedQuestline.npc} step ${step.order} marked done.`
                              : `${selectedQuestline.npc} step ${step.order} reopened.`,
                            "success",
                          );
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No steps match this filter"
                    description="Clear the optional or missable step filter to see the full questline."
                    icon="scroll"
                    action={
                      <Button variant="primary" icon="refresh" onClick={clearQuestlineFilters}>
                        Reset filters
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <EmptyState
                title="No questlines match"
                description="Adjust the search, game, optional, or missable filter."
                icon="scroll"
                action={
                  <Button variant="primary" icon="refresh" onClick={clearQuestlineFilters}>
                    Reset filters
                  </Button>
                }
              />
            </div>
          )}
        </div>
      ) : null}

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
            <div className="stack" style={{ gap: 8 }}>
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
              <NpcLoreNote npc={focusedNpc} />
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
                {groupMode === "npc" ? (
                  <NpcLoreNote npc={groupName} />
                ) : (
                  <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
                    {[...new Set(states.map((state) => state.npc))].sort().map((npc) => (
                      <NpcLoreNote key={npc} npc={npc} collapsible />
                    ))}
                  </div>
                )}
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
                  <NpcLoreNote npc={npc} />
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
