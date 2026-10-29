import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Drawer,
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
import type {
  Achievement,
  BossStatus,
  BossStrategy,
  Encounter,
  JourneyState,
  Settings,
} from "../lib/types";
import { setBossReveal, setBossStatus, useActiveJourney, useAppState } from "../lib/store";
import { bossStrategyCount } from "../lib/selectors";
import {
  ACHIEVEMENTS,
  BOSS_DESCRIPTIONS,
  BOSS_NAMES,
  BOSS_STRATEGIES,
  BOSS_STRATEGIES_BY_BOSS,
  ENCOUNTERS,
  PROFILE_BY_ID,
  ROUTE_AREAS,
  STEP_BY_ID,
  normalizeContentKey,
} from "../lib/data";
import { navigate, queryString, useRoute } from "../lib/router";
import "./world.css";

type BossTab = "encounters" | "prep";

interface EncounterCardProps {
  encounter: Encounter;
  status?: BossStatus;
  hidden: boolean;
  onOpen: () => void;
  onStatus: (status: BossStatus | null) => void;
  onReveal: () => void;
}

interface EncounterDetailProps {
  encounter: Encounter;
  status?: BossStatus;
  hidden: boolean;
  onReveal: () => void;
}

interface StrategyFieldProps {
  label: string;
  value: string;
  wide?: boolean;
}

const TABS = [
  { id: "encounters", label: "Boss ledger", count: ENCOUNTERS.length },
  { id: "prep", label: "Major boss prep", count: BOSS_NAMES.length },
];

const ALL_LEVELS = [
  ...new Set(Object.values(BOSS_STRATEGIES_BY_BOSS).flatMap((rows) => rows.map((row) => row.level))),
].sort((a, b) => a - b);

const ENCOUNTER_SECTIONS = [
  ...new Set(ENCOUNTERS.flatMap((encounter) => (encounter.section ? [encounter.section] : []))),
].sort((a, b) => a.localeCompare(b));

const SECTION_ALIASES: Record<string, string> = Object.fromEntries([
  ...ENCOUNTER_SECTIONS.map((section) => [section.toLowerCase(), section] as const),
  ...ROUTE_AREAS.flatMap((area) => {
    const name = area.name.toLowerCase();
    const match =
      ENCOUNTER_SECTIONS.find((section) => section.toLowerCase() === name) ??
      ENCOUNTER_SECTIONS.find(
        (section) =>
          name.includes(section.toLowerCase()) || section.toLowerCase().includes(name),
      );
    return match ? [[area.sectionId.toLowerCase(), match] as const] : [];
  }),
]);

const ENCOUNTER_REGIONS = [...new Set(ENCOUNTERS.map((encounter) => encounter.region))].sort((a, b) =>
  a.localeCompare(b),
);

const ENCOUNTER_TYPES = [...new Set(ENCOUNTERS.map((encounter) => encounter.type))].sort((a, b) =>
  a.localeCompare(b),
);

const PHASE_BASE = "Base Game — through Maliketh";
const PHASE_DLC = "Shadow of the Erdtree";
const PHASE_ENDGAME = "Base Game — endgame";
const PHASE_EXTRA = "Tarnished Pack";

const ENCOUNTER_PHASES = [PHASE_BASE, PHASE_DLC, PHASE_ENDGAME, PHASE_EXTRA];

const ACHIEVEMENT_BY_NAME: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((achievement) => [achievement.name, achievement]),
);

function encounterPhase(encounter: Encounter): string {
  if (encounter.game === PHASE_EXTRA) return PHASE_EXTRA;
  if (encounter.dlc || encounter.game === PHASE_DLC) return PHASE_DLC;
  if ((encounter.section ?? "").toLowerCase().includes("ashen capital")) return PHASE_ENDGAME;
  return PHASE_BASE;
}

function encounterAchievement(encounter: Encounter): Achievement | undefined {
  const name = (encounter.achievement ?? "").trim();
  if (!name || name.toLowerCase() === "no") return undefined;
  return ACHIEVEMENT_BY_NAME[name];
}

function isMissable(encounter: Encounter): boolean {
  return Boolean(encounter.missable || encounter.badges?.includes("MISSABLE"));
}

function isRequired(required?: string): boolean {
  return (required ?? "").trim().toLowerCase().startsWith("yes");
}

function statusTone(status: BossStatus | undefined): "success" | "warning" | "default" {
  return status === "defeated" ? "success" : status === "deferred" ? "warning" : "default";
}

function statusLabel(status: BossStatus | undefined): string {
  return status === "defeated" ? "Defeated" : status === "deferred" ? "Deferred" : "Pending";
}

function linkedEncounterStatus(boss: string, bosses: Record<string, BossStatus>): BossStatus | undefined {
  const linked = ENCOUNTERS.filter((encounter) => encounter.name === boss);
  if (linked.some((encounter) => bosses[encounter.id] === "defeated")) return "defeated";
  if (linked.some((encounter) => bosses[encounter.id] === "deferred")) return "deferred";
  return undefined;
}

/** Description keys are encounter ids; fall back to a normalized name match. */
const BOSS_LORE_BY_NORMALIZED_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(BOSS_DESCRIPTIONS).map(([key, entry]) => [normalizeContentKey(key), entry.text]),
);

/**
 * The boss ledger withholds names, locations, strategies, notes and lore until
 * the fight is defeated or the player reveals it. Manual reveals live on the
 * journey so they persist; the global setting can turn the gate off entirely.
 */
function isEncounterHidden(settings: Settings, journey: JourneyState, encounter: Encounter): boolean {
  if (settings.bossSpoilerMode === "show") return false;
  if (journey.bosses[encounter.id] === "defeated") return false;
  return !journey.bossReveals[encounter.id] && !journey.bossReveals[encounter.name];
}

function isBossNameHidden(settings: Settings, journey: JourneyState, boss: string): boolean {
  if (settings.bossSpoilerMode === "show") return false;
  const linked = ENCOUNTERS.filter((encounter) => encounter.name === boss);
  if (linked.some((encounter) => journey.bosses[encounter.id] === "defeated")) return false;
  if (journey.bossReveals[boss]) return false;
  return !linked.some((encounter) => journey.bossReveals[encounter.id]);
}

function DetailRow({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function StrategyField({ label, value, wide = false }: StrategyFieldProps) {
  if (!value) return null;
  return (
    <div className={`world-strategy-field ${wide ? "wide" : ""}`.trim()}>
      <div className="world-field-label">{label}</div>
      <p className="world-strategy-text">{value}</p>
    </div>
  );
}

function EncounterCard({ encounter, status, hidden, onOpen, onStatus, onReveal }: EncounterCardProps) {
  const step = encounter.routeStepIds[0] ? STEP_BY_ID[encounter.routeStepIds[0]] : undefined;
  const required = isRequired(encounter.required);
  const missable = isMissable(encounter);
  const achievement = encounterAchievement(encounter);
  const name = hidden ? `Unknown encounter · ${encounter.region}` : encounter.name;
  return (
    <article
      className={`card card-pad world-encounter ${status ? `is-${status}` : ""} ${hidden ? "is-hidden" : ""}`.trim()}
    >
      <div className="row-between wrap" style={{ gap: 6 }}>
        <div className="world-badges">
          <Badge tone="accent">{encounter.type}</Badge>
          <Badge tone={required ? "warning" : "default"}>{required ? "Required" : "Optional"}</Badge>
          <Badge tone={encounter.dlc ? "info" : "default"}>
            {encounter.dlc ? "DLC" : encounter.game ?? "Base Game"}
          </Badge>
          {status ? <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge> : null}
          {hidden ? (
            <Badge tone="warning">
              <Icon name="lock" size={11} /> Spoiler safe
            </Badge>
          ) : null}
        </div>
        <span className="tiny faint mono">{hidden ? "—" : encounter.id}</span>
      </div>

      {hidden ? (
        <span className="world-title-static">{name}</span>
      ) : (
        <button className="world-title-btn" onClick={onOpen}>
          {name}
        </button>
      )}

      <div className="world-location">
        <Icon name="map" size={12} />
        <span>{hidden ? "Location sealed" : `${encounter.section ?? encounter.region} · ${encounter.location}`}</span>
      </div>

      {hidden ? (
        <>
          <p className="small faint">
            Name, strategy, notes and lore stay sealed until this fight is marked defeated, or you reveal it for this
            journey.
          </p>
          <div className="world-card-actions">
            <Button size="sm" icon="eye" onClick={onReveal} aria-label="Reveal this encounter">
              Reveal
            </Button>
            <Button
              size="sm"
              variant={status === "defeated" ? "primary" : "default"}
              icon="trophy"
              aria-label="Mark this encounter defeated"
              onClick={() => onStatus(status === "defeated" ? null : "defeated")}
            >
              Defeated
            </Button>
            <Button
              size="sm"
              variant={status === "deferred" ? "primary" : "default"}
              icon="clock"
              aria-label="Defer this encounter"
              onClick={() => onStatus(status === "deferred" ? null : "deferred")}
            >
              Defer
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="world-badges">
            <Badge>{encounter.levelRange || encounter.recommendedLevel || "Level unlisted"}</Badge>
            {missable ? <Badge tone="danger">MISSABLE</Badge> : null}
            {encounter.optional ? <Badge>Optional fight</Badge> : null}
            {encounter.questRelated ? <Badge tone="info">Quest</Badge> : null}
            {achievement ? <Badge tone="success">🏆 {achievement.name}</Badge> : null}
            {encounter.difficulty ? <Badge tone="danger">{encounter.difficulty}</Badge> : null}
          </div>

          <p className="small muted world-clamp">
            {encounter.description || encounter.strategyNotes || encounter.notes}
          </p>

          {encounter.defaultRoute ? (
            <div className="world-note">
              Plan: {encounter.defaultRoute}
              {encounter.returnObjective ? ` · Return: ${encounter.returnObjective}` : ""}
            </div>
          ) : null}

          <div className="world-badges">
            {step ? (
              <button
                className="chip quest-route-chip"
                onClick={() =>
                  navigate(`/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`)
                }
              >
                <Icon name="map" size={12} /> Step {step.order + 1} · {step.area}
              </button>
            ) : (
              <span className="tiny faint">No route step linked</span>
            )}
            {achievement ? (
              <button
                className="chip quest-route-chip"
                onClick={() => navigate(`/completion?tab=endings&achievement=${encodeURIComponent(achievement.id)}`)}
              >
                <Icon name="trophy" size={12} /> Achievement
              </button>
            ) : null}
            {encounter.wikiUrl ? (
              <a className="chip" href={encounter.wikiUrl} target="_blank" rel="noreferrer noopener">
                <Icon name="external" size={12} /> Wiki
              </a>
            ) : null}
          </div>

          <div className="world-card-actions">
            <Button
              size="sm"
              variant={status === "defeated" ? "primary" : "default"}
              icon="trophy"
              aria-label={`Mark ${encounter.name} defeated`}
              onClick={() => onStatus(status === "defeated" ? null : "defeated")}
            >
              Defeated
            </Button>
            <Button
              size="sm"
              variant={status === "deferred" ? "primary" : "default"}
              icon="clock"
              aria-label={`Defer ${encounter.name}`}
              onClick={() => onStatus(status === "deferred" ? null : "deferred")}
            >
              Defer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconRight="chevronRight"
              aria-label={`Open details for ${encounter.name}`}
              onClick={onOpen}
            >
              Details
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

function EncounterDetail({ encounter, status, hidden, onReveal }: EncounterDetailProps) {
  const steps = encounter.routeStepIds.flatMap((id) => {
    const step = STEP_BY_ID[id];
    return step ? [step] : [];
  });
  const tags = encounter.tags ?? [];
  const achievement = encounterAchievement(encounter);
  const lore =
    BOSS_DESCRIPTIONS[encounter.id]?.text ??
    BOSS_LORE_BY_NORMALIZED_KEY[normalizeContentKey(encounter.name)] ??
    "";

  if (hidden) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <Callout tone="warning" icon="lock">
          This encounter is sealed by the boss spoiler policy. Its name, strategy, notes and in-game lore stay hidden
          until you mark it defeated or reveal it for this journey.
        </Callout>
        <dl className="kv">
          <DetailRow label="Encounter" value="Unknown encounter" />
          <DetailRow label="Region" value={encounter.region} />
          <DetailRow label="Requirement" value={isRequired(encounter.required) ? "Required" : "Optional"} />
          <DetailRow label="Game" value={encounter.dlc ? "DLC" : encounter.game ?? "Base Game"} />
          <DetailRow label="Phase" value={encounterPhase(encounter)} />
          <DetailRow label="Status" value={statusLabel(status)} />
        </dl>
        <Button icon="eye" onClick={onReveal}>
          Reveal this encounter
        </Button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="world-badges">
        <Badge tone="accent">{encounter.type}</Badge>
        <Badge tone={isRequired(encounter.required) ? "warning" : "default"}>
          {isRequired(encounter.required) ? "Required" : "Optional"}
        </Badge>
        <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
        <Badge tone={encounter.dlc ? "info" : "default"}>{encounter.dlc ? "DLC" : encounter.game ?? "Base Game"}</Badge>
        <Badge>{encounterPhase(encounter)}</Badge>
        {isMissable(encounter) ? <Badge tone="danger">MISSABLE</Badge> : null}
        {encounter.difficulty ? <Badge tone="danger">{encounter.difficulty}</Badge> : null}
      </div>

      {encounter.description ? <p className="quest-text">{encounter.description}</p> : null}

      {encounter.strategyNotes ? (
        <Callout tone="warning" icon="target">
          {encounter.strategyNotes}
        </Callout>
      ) : null}

      {lore ? (
        <section className="world-lore">
          <div className="world-field-label">In-game lore</div>
          <p className="quest-text">{lore}</p>
          <div className="tiny faint">Source: in-game item and dialogue text</div>
        </section>
      ) : (
        <p className="small faint">No in-game lore recorded for this encounter yet.</p>
      )}

      <dl className="kv">
        <DetailRow label="Section" value={encounter.section} />
        <DetailRow label="Region" value={encounter.region} />
        <DetailRow label="Location" value={encounter.location} />
        <DetailRow label="Level range" value={encounter.levelRange} />
        <DetailRow label="Game" value={encounter.game} />
        <DetailRow label="Requirement" value={encounter.required} />
        <DetailRow
          label="Optional"
          value={encounter.optional === undefined ? undefined : encounter.optional ? "Yes" : "No"}
        />
        <DetailRow
          label="Missable"
          value={encounter.missable === undefined ? undefined : encounter.missable ? "Yes" : "No"}
        />
        <DetailRow label="Achievement" value={achievement?.name ?? encounter.achievement} />
        <DetailRow
          label="Quest related"
          value={encounter.questRelated === undefined ? undefined : encounter.questRelated ? "Yes" : "No"}
        />
        <DetailRow label="Recommended level" value={encounter.recommendedLevel} />
        <DetailRow label="Standard weapon" value={encounter.standardWeapon} />
        <DetailRow label="Somber weapon" value={encounter.somberWeapon} />
        <DetailRow label="Flask charges" value={encounter.flaskCharges} />
        <DetailRow label="Flask allocation" value={encounter.flaskDistribution} />
        <DetailRow label="Spirit ash" value={encounter.spiritAsh} />
        <DetailRow label="NPC summon" value={encounter.npcSummon} />
        <DetailRow label="Consumables" value={encounter.consumables} />
        <DetailRow label="Default route" value={encounter.defaultRoute} />
        <DetailRow label="Return objective" value={encounter.returnObjective} />
        <DetailRow label="Rune risk" value={encounter.runeRisk} />
        <DetailRow label="Scadutree" value={encounter.scadutree} />
        <DetailRow label="Multiplayer" value={encounter.multiplayer} />
        <DetailRow label="Time lock" value={encounter.timeLock} />
        <DetailRow label="Completion unit" value={encounter.completionUnit} />
        <DetailRow label="Confidence" value={encounter.confidence} />
        <DetailRow label="Validation" value={encounter.validation} />
      </dl>

      {achievement ? (
        <div>
          <div className="world-field-label">Achievement cross-reference</div>
          <button
            className="chip quest-route-chip"
            onClick={() => navigate(`/completion?tab=endings&achievement=${encodeURIComponent(achievement.id)}`)}
          >
            <Icon name="trophy" size={12} /> {achievement.name} · {achievement.section}
          </button>
        </div>
      ) : null}

      {encounter.wikiUrl || (encounter.links?.length ?? 0) > 0 ? (
        <div>
          <div className="world-field-label">References</div>
          <div className="tag-list">
            {encounter.wikiUrl ? (
              <a className="chip" href={encounter.wikiUrl} target="_blank" rel="noreferrer noopener">
                <Icon name="external" size={12} /> Wiki page
              </a>
            ) : null}
            {(encounter.links ?? []).map((link) => (
              <a
                className="chip"
                key={`${link.label}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="external" size={12} /> {link.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {encounter.notes ? (
        <div>
          <div className="world-field-label">Notes</div>
          <p className="quest-text">{encounter.notes}</p>
        </div>
      ) : null}

      {encounter.notes2 ? (
        <div>
          <div className="world-field-label">Route note</div>
          <p className="quest-text">{encounter.notes2}</p>
        </div>
      ) : null}

      {tags.length ? (
        <div>
          <div className="world-field-label">Tags</div>
          <div className="tag-list">
            {tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {steps.length ? (
        <div>
          <div className="world-field-label">Linked route steps</div>
          <div className="tag-list">
            {steps.map((step) => (
              <button
                key={step.id}
                className="chip quest-route-chip"
                onClick={() =>
                  navigate(`/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`)
                }
              >
                <Icon name="map" size={12} /> Step {step.order + 1} · {step.area}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BossesPage() {
  const route = useRoute();
  const journey = useActiveJourney();
  const { settings } = useAppState();
  const toast = useToast();

  const encounterParam = route.query.get("encounter");
  const bossParam = route.query.get("boss");
  const tabParam = route.query.get("tab");
  const sectionParam = route.query.get("section");
  const missableParam = route.query.get("missable");
  const sectionFromParam = sectionParam ? SECTION_ALIASES[sectionParam.trim().toLowerCase()] : undefined;
  const validBoss = bossParam && BOSS_NAMES.includes(bossParam) ? bossParam : undefined;
  const tab: BossTab =
    tabParam === "prep" || (!tabParam && validBoss && !encounterParam) ? "prep" : "encounters";

  const selectedEncounter = encounterParam
    ? ENCOUNTERS.find((encounter) => encounter.id === encounterParam)
    : undefined;

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState(sectionFromParam ?? "all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [dlcFilter, setDlcFilter] = useState("all");
  const [missableFilter, setMissableFilter] = useState(missableParam === "1" ? "missable" : "all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [bossQuery, setBossQuery] = useState("");
  const [buildFilter, setBuildFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [strategyId, setStrategyId] = useState<string | null>(null);

  const selectedBoss = validBoss ?? BOSS_NAMES[0];
  const strategies = BOSS_STRATEGIES_BY_BOSS[selectedBoss] ?? [];

  useEffect(() => {
    if (sectionFromParam) setSectionFilter(sectionFromParam);
  }, [sectionFromParam]);

  useEffect(() => {
    if (missableParam === "1") setMissableFilter("missable");
  }, [missableParam]);

  const buildOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const strategy of strategies) {
      const profile = PROFILE_BY_ID[strategy.buildId];
      if (profile) map.set(profile.archetypeId, profile.archetype);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [strategies]);

  const levelOptions = useMemo(
    () => [...new Set(strategies.map((strategy) => strategy.level))].sort((a, b) => a - b),
    [strategies],
  );

  useEffect(() => {
    setBuildFilter("all");
    setLevelFilter("all");
    setStrategyId(null);
  }, [selectedBoss]);

  const filteredEncounters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENCOUNTERS.filter((encounter) => {
      if (typeFilter !== "all" && encounter.type !== typeFilter) return false;
      if (sectionFilter !== "all" && encounter.section !== sectionFilter) return false;
      if (regionFilter !== "all" && encounter.region !== regionFilter) return false;
      if (phaseFilter !== "all" && encounterPhase(encounter) !== phaseFilter) return false;
      if (dlcFilter === "dlc" && !encounter.dlc) return false;
      if (dlcFilter === "base" && encounter.dlc) return false;
      if (missableFilter === "missable" && !isMissable(encounter)) return false;
      const status = journey.bosses[encounter.id];
      if (statusFilter === "pending" && status) return false;
      if (statusFilter === "defeated" && status !== "defeated") return false;
      if (statusFilter === "deferred" && status !== "deferred") return false;
      if (!q) return true;
      const hidden = isEncounterHidden(settings, journey, encounter);
      const haystack = (hidden
        ? [encounter.type, encounter.region, encounter.section, encounterPhase(encounter)]
        : [
            encounter.name,
            encounter.type,
            encounter.region,
            encounter.section,
            encounter.location,
            encounter.levelRange,
            encounter.description,
            encounter.notes,
            encounter.notes2,
            encounter.strategyNotes,
            encounter.required,
            encounter.achievement,
            encounterPhase(encounter),
            encounterAchievement(encounter)?.name,
            ...(encounter.tags ?? []),
          ]
      )
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    query,
    typeFilter,
    sectionFilter,
    regionFilter,
    phaseFilter,
    dlcFilter,
    missableFilter,
    statusFilter,
    journey,
    settings,
  ]);

  const filteredBosses = useMemo(() => {
    const q = bossQuery.trim().toLowerCase();
    if (!q) return BOSS_NAMES;
    return BOSS_NAMES.filter((boss) => {
      if (!isBossNameHidden(settings, journey, boss)) return boss.toLowerCase().includes(q);
      const linked = ENCOUNTERS.find((encounter) => encounter.name === boss);
      const sealedHaystack = ["unknown target", "sealed", linked?.region ?? ""].join(" ").toLowerCase();
      return sealedHaystack.includes(q);
    });
  }, [bossQuery, settings, journey]);

  const filteredStrategies = useMemo(
    () =>
      strategies
        .filter((strategy) => {
          const profile = PROFILE_BY_ID[strategy.buildId];
          if (buildFilter !== "all" && profile?.archetypeId !== buildFilter) return false;
          if (levelFilter !== "all" && String(strategy.level) !== levelFilter) return false;
          return true;
        })
        .sort((a, b) => {
          if (a.level !== b.level) return a.level - b.level;
          const nameA = PROFILE_BY_ID[a.buildId]?.archetype ?? a.buildId;
          const nameB = PROFILE_BY_ID[b.buildId]?.archetype ?? b.buildId;
          return nameA.localeCompare(nameB);
        }),
    [strategies, buildFilter, levelFilter],
  );

  const activeStrategy: BossStrategy | undefined =
    filteredStrategies.find((strategy) => strategy.id === strategyId) ?? filteredStrategies[0];
  const strategyLevels = [...new Set(filteredStrategies.map((strategy) => strategy.level))].sort(
    (a, b) => a - b,
  );

  const missableCount = ENCOUNTERS.filter((encounter) => isMissable(encounter)).length;
  const achievementCount = ENCOUNTERS.filter((encounter) => Boolean(encounterAchievement(encounter))).length;
  const defeatedCount = ENCOUNTERS.filter((encounter) => journey.bosses[encounter.id] === "defeated").length;
  const deferredCount = ENCOUNTERS.filter((encounter) => journey.bosses[encounter.id] === "deferred").length;
  const sealedCount = ENCOUNTERS.filter((encounter) => isEncounterHidden(settings, journey, encounter)).length;

  const goTab = (id: string) => {
    const next = id === "prep" ? "prep" : "encounters";
    navigate(
      `/bosses${queryString({ tab: next === "prep" ? "prep" : undefined, boss: next === "prep" ? selectedBoss : undefined })}`,
    );
  };

  const selectBoss = (boss: string) => {
    navigate(`/bosses?tab=prep&boss=${encodeURIComponent(boss)}`);
  };

  const openEncounter = (id: string) => {
    navigate(`/bosses?encounter=${encodeURIComponent(id)}`);
  };

  const applyStatus = (encounter: Encounter, status: BossStatus | null) => {
    const label = isEncounterHidden(settings, journey, encounter) ? "Encounter" : encounter.name;
    setBossStatus(encounter.id, status);
    toast.push(
      status ? `${label} marked ${status}.` : `${label} status cleared.`,
      "success",
    );
  };

  const revealEncounter = (encounter: Encounter) => {
    setBossReveal(encounter.id, true);
    toast.push(`${encounter.name} revealed for ${journey.label}.`, "success");
  };

  const revealBoss = (boss: string) => {
    const linked = ENCOUNTERS.find((encounter) => encounter.name === boss);
    setBossReveal(linked?.id ?? boss, true);
    toast.push(`${boss} revealed for ${journey.label}.`, "success");
  };

  const clearEncounterFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setSectionFilter("all");
    setRegionFilter("all");
    setPhaseFilter("all");
    setDlcFilter("all");
    setMissableFilter("all");
    setStatusFilter("all");
  };

  const linkedEncounter = ENCOUNTERS.find((encounter) => encounter.name === selectedBoss);
  const bossStatus = linkedEncounterStatus(selectedBoss, journey.bosses);
  const selectedBossHidden = isBossNameHidden(settings, journey, selectedBoss);

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Boss ledger`}
        title="Bosses"
        description={
          <>
            {ENCOUNTERS.length} catalogued encounters across {ENCOUNTER_SECTIONS.length} sections, with persistent
            outcomes and wiki references. {BOSS_NAMES.length} major targets carry {BOSS_STRATEGIES.length} strategy
            rows at level {ALL_LEVELS.join(" / ")}. Names, strategy and lore stay sealed until defeated or revealed.
          </>
        }
        actions={
          <>
            <Badge tone="danger">{missableCount} MISSABLE</Badge>
            <Badge tone="info">{defeatedCount} defeated</Badge>
            {settings.bossSpoilerMode === "hide-until-defeated" ? (
              <Badge tone="warning">
                {sealedCount} sealed · {journey.label}
              </Badge>
            ) : (
              <Badge tone="accent">Spoilers shown</Badge>
            )}
            <Button icon="map" onClick={() => navigate("/journey")}>
              Open journey
            </Button>
            <Button variant="ghost" icon="sword" onClick={() => navigate("/builds")}>
              Build details
            </Button>
          </>
        }
      />

      <div style={{ marginTop: 16 }}>
        <TabBar items={TABS} value={tab} onChange={goTab} />
      </div>

      {tab === "encounters" ? (
        <div style={{ marginTop: 16 }}>
          <section className="card card-pad">
            <div className="world-toolbar">
              <div className="world-filters">
                <SearchInput
                  className="world-filter-search"
                  value={query}
                  onChange={setQuery}
                  placeholder="Search bosses, sections, wiki notes…"
                />
                <Select
                  label="Section"
                  className="world-filter-field"
                  value={sectionFilter}
                  onChange={(event) => setSectionFilter(event.target.value)}
                >
                  <option value="all">All sections</option>
                  {ENCOUNTER_SECTIONS.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Region"
                  className="world-filter-field"
                  value={regionFilter}
                  onChange={(event) => setRegionFilter(event.target.value)}
                >
                  <option value="all">All regions</option>
                  {ENCOUNTER_REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Phase / act"
                  className="world-filter-field"
                  value={phaseFilter}
                  onChange={(event) => setPhaseFilter(event.target.value)}
                >
                  <option value="all">All phases</option>
                  {ENCOUNTER_PHASES.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Game"
                  className="world-filter-field"
                  value={dlcFilter}
                  onChange={(event) => setDlcFilter(event.target.value)}
                >
                  <option value="all">Base + DLC</option>
                  <option value="base">Base game</option>
                  <option value="dlc">Shadow of the Erdtree</option>
                </Select>
                <Select
                  label="Missable"
                  className="world-filter-field"
                  value={missableFilter}
                  onChange={(event) => setMissableFilter(event.target.value)}
                >
                  <option value="all">All encounters</option>
                  <option value="missable">Missable only</option>
                </Select>
                <Select
                  label="Status"
                  className="world-filter-field"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">Any status</option>
                  <option value="pending">Pending</option>
                  <option value="defeated">Defeated</option>
                  <option value="deferred">Deferred</option>
                </Select>
                <Select
                  label="Type"
                  className="world-filter-field"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                >
                  <option value="all">All types</option>
                  {ENCOUNTER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>
              <span className="badge">
                {filteredEncounters.length} / {ENCOUNTERS.length}
              </span>
            </div>

            <div className="world-summary">
              <div className="world-summary-cell">
                <div className="k">Encounters</div>
                <div className="v">{ENCOUNTERS.length}</div>
                <div className="d">merged across {ENCOUNTER_SECTIONS.length} sections</div>
              </div>
              <div className="world-summary-cell">
                <div className="k">Missable</div>
                <div className="v">{missableCount}</div>
                <div className="d">time-locked or one-shot fights</div>
              </div>
              <div className="world-summary-cell">
                <div className="k">Achievements</div>
                <div className="v">{achievementCount}</div>
                <div className="d">cross-referenced with the ledger</div>
              </div>
              <div className="world-summary-cell">
                <div className="k">Defeated</div>
                <div className="v">{defeatedCount}</div>
                <div className="d">{deferredCount} deferred in {journey.label}</div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <ProgressBar
                value={ENCOUNTERS.length ? (defeatedCount / ENCOUNTERS.length) * 100 : 0}
                label={`${defeatedCount} of ${ENCOUNTERS.length} encounters recorded as defeated`}
                detail={`${deferredCount} deferred`}
              />
            </div>
          </section>

          {filteredEncounters.length ? (
            <div className="world-encounter-grid">
              {filteredEncounters.map((encounter) => (
                <EncounterCard
                  key={encounter.id}
                  encounter={encounter}
                  status={journey.bosses[encounter.id]}
                  hidden={isEncounterHidden(settings, journey, encounter)}
                  onOpen={() => openEncounter(encounter.id)}
                  onStatus={(status) => applyStatus(encounter, status)}
                  onReveal={() => revealEncounter(encounter)}
                />
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <EmptyState
                title="No encounters match"
                description="Adjust the search, section, region, phase, DLC, missable, status, or type filter."
                icon="skull"
                action={
                  <Button variant="primary" icon="refresh" onClick={clearEncounterFilters}>
                    Reset filters
                  </Button>
                }
              />
            </div>
          )}
        </div>
      ) : (
        <div className="world-split">
          <aside className="card card-pad">
            <SectionTitle
              title="Bosses"
              note={`${BOSS_NAMES.length} targets · ${BOSS_STRATEGIES.length} strategy rows`}
            />
            <SearchInput value={bossQuery} onChange={setBossQuery} placeholder="Search bosses…" />
            <div className="world-roster">
              {filteredBosses.map((boss) => {
                const linked = linkedEncounterStatus(boss, journey.bosses);
                const locked = isBossNameHidden(settings, journey, boss);
                const linkedEncounterRow = ENCOUNTERS.find((encounter) => encounter.name === boss);
                return (
                  <button
                    key={boss}
                    className={`world-roster-item ${boss === selectedBoss ? "active" : ""}`.trim()}
                    aria-current={boss === selectedBoss ? "true" : undefined}
                    aria-label={locked ? "Unrevealed boss target" : boss}
                    onClick={() => selectBoss(boss)}
                  >
                    <span className="grow">
                      <span className="world-roster-title">{locked ? "Unknown target" : boss}</span>
                      <span className="world-roster-sub">
                        {locked
                          ? `Sealed · ${linkedEncounterRow?.region ?? "region unknown"}`
                          : `${bossStrategyCount(boss)} strategies · levels ${ALL_LEVELS.join(" / ")}`}
                      </span>
                    </span>
                    {linked ? (
                      <Badge tone={statusTone(linked)} className="world-roster-badge">
                        {linked === "defeated" ? "Defeated" : "Deferred"}
                      </Badge>
                    ) : null}
                    {locked ? (
                      <Badge tone="warning" className="world-roster-badge">
                        <Icon name="lock" size={11} />
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
              {filteredBosses.length === 0 ? <p className="small faint">No boss matches this search.</p> : null}
            </div>
          </aside>

          <div className="world-boss-panel stack">
            <section className="card card-pad card-accent">
              <div className="world-detail-head">
                <div className="grow">
                  <div className="eyebrow" style={{ marginBottom: 4 }}>
                    Major boss prep · {BOSS_NAMES.length} targets / {BOSS_STRATEGIES.length} rows
                  </div>
                  <h2 className="world-boss-title">
                    {selectedBossHidden ? "Unknown target" : selectedBoss}
                  </h2>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {selectedBossHidden
                      ? "Sealed by the boss spoiler policy until defeated or revealed."
                      : `${bossStrategyCount(selectedBoss)} strategy rows · ${buildOptions.length} builds · levels ${levelOptions.join(" / ")}`}
                  </div>
                </div>
                <div className="world-badges">
                  {selectedBossHidden ? (
                    <Badge tone="warning">
                      <Icon name="lock" size={11} /> Unrevealed
                    </Badge>
                  ) : (
                    <Badge tone="accent">{filteredStrategies.length} shown</Badge>
                  )}
                  {linkedEncounter ? (
                    <Badge tone={statusTone(bossStatus)}>{statusLabel(bossStatus)}</Badge>
                  ) : null}
                </div>
              </div>

              {selectedBossHidden ? (
                <div className="stack" style={{ marginTop: 12 }}>
                  <Callout tone="warning" icon="lock">
                    {linkedEncounter ? linkedEncounter.region : "Region unlisted"} · strategy rows, gear and kill plan
                    stay hidden until this target is defeated or revealed.
                  </Callout>
                  <div className="row wrap">
                    <Button icon="eye" onClick={() => revealBoss(selectedBoss)}>
                      Reveal target
                    </Button>
                    {linkedEncounter ? (
                      <Button
                        variant="ghost"
                        icon="trophy"
                        onClick={() => applyStatus(linkedEncounter, "defeated")}
                      >
                        Mark defeated
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : linkedEncounter ? (
                <div className="row wrap" style={{ marginTop: 10 }}>
                  <Badge tone="info">{linkedEncounter.type}</Badge>
                  <Badge>{linkedEncounter.region}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="skull"
                    onClick={() => openEncounter(linkedEncounter.id)}
                  >
                    Open encounter record
                  </Button>
                </div>
              ) : (
                <p className="world-note" style={{ marginTop: 8 }}>
                  No linked encounter row shares this boss name; strategy rows still apply to the target.
                </p>
              )}

              {selectedBossHidden ? null : (
                <div className="world-filters" style={{ marginTop: 14 }}>
                  <Select
                    label="Build"
                    className="world-filter-field"
                    value={buildFilter}
                    onChange={(event) => setBuildFilter(event.target.value)}
                  >
                    <option value="all">All builds</option>
                    {buildOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Level"
                    className="world-filter-field"
                    value={levelFilter}
                    onChange={(event) => setLevelFilter(event.target.value)}
                  >
                    <option value="all">Both levels</option>
                    {levelOptions.map((level) => (
                      <option key={level} value={String(level)}>
                        Level {level}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="ghost"
                    icon="refresh"
                    onClick={() => {
                      setBuildFilter("all");
                      setLevelFilter("all");
                      setStrategyId(null);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </section>

            {selectedBossHidden ? null : filteredStrategies.length ? (
              <>
                <section className="card card-pad">
                  <SectionTitle
                    title="Build roster"
                    note={`${filteredStrategies.length} rows grouped by level`}
                  />
                  {strategyLevels.map((level) => (
                    <div className="world-level-block" key={level}>
                      <div className="world-level-label">
                        Level {level}
                        <span className="faint">
                          {filteredStrategies.filter((strategy) => strategy.level === level).length} builds
                        </span>
                      </div>
                      <div className="world-build-grid">
                        {filteredStrategies
                          .filter((strategy) => strategy.level === level)
                          .map((strategy) => {
                            const profile = PROFILE_BY_ID[strategy.buildId];
                            return (
                              <button
                                key={strategy.id}
                                className={`world-build-chip ${
                                  activeStrategy?.id === strategy.id ? "active" : ""
                                }`.trim()}
                                aria-pressed={activeStrategy?.id === strategy.id}
                                onClick={() => setStrategyId(strategy.id)}
                              >
                                <span className="world-build-name">
                                  {profile?.archetype ?? strategy.buildId}
                                </span>
                                <span className="world-build-sub">
                                  {strategy.buildId} · {strategy.loadout}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </section>

                {activeStrategy ? (
                  <section className="card card-pad">
                    <div className="world-detail-head">
                      <div className="grow">
                        <div className="row wrap" style={{ gap: 7 }}>
                          <Badge tone="accent">{activeStrategy.buildId}</Badge>
                          <Badge>Level {activeStrategy.level}</Badge>
                          <Badge tone="info">{activeStrategy.loadout}</Badge>
                        </div>
                        <h3 style={{ fontSize: 21, marginTop: 6 }}>
                          {PROFILE_BY_ID[activeStrategy.buildId]?.archetype ?? activeStrategy.buildId}
                        </h3>
                        <div className="small muted" style={{ marginTop: 3 }}>
                          {activeStrategy.location}
                        </div>
                      </div>
                      <div className="row wrap">
                        {PROFILE_BY_ID[activeStrategy.buildId] ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="sword"
                            onClick={() =>
                              navigate(
                                `/builds?archetype=${encodeURIComponent(
                                  PROFILE_BY_ID[activeStrategy.buildId].archetypeId,
                                )}`,
                              )
                            }
                          >
                            Open build
                          </Button>
                        ) : null}
                        {linkedEncounter ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="map"
                            onClick={() =>
                              navigate(`/bosses?encounter=${encodeURIComponent(linkedEncounter.id)}`)
                            }
                          >
                            Encounter record
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div className="gear-row">
                        <span className="gear-label">Main weapon</span>
                        <span className="gear-value">{activeStrategy.mainWeapon}</span>
                      </div>
                      <div className="gear-row">
                        <span className="gear-label">Skill</span>
                        <span className="gear-value">{activeStrategy.skill}</span>
                      </div>
                      <div className="gear-row">
                        <span className="gear-label">Talismans</span>
                        <span className="gear-value">{activeStrategy.talismans}</span>
                      </div>
                      <div className="gear-row">
                        <span className="gear-label">Physick</span>
                        <span className="gear-value">{activeStrategy.physick}</span>
                      </div>
                      <div className="gear-row">
                        <span className="gear-label">Flask</span>
                        <span className="gear-value">{activeStrategy.flask}</span>
                      </div>
                      <div className="gear-row">
                        <span className="gear-label">Buffs</span>
                        <span className="gear-value">{activeStrategy.buffs}</span>
                      </div>
                    </div>

                    <div className="world-strategy-grid">
                      <StrategyField label="Opening" value={activeStrategy.opening} wide />
                      <StrategyField label="Phase 1" value={activeStrategy.phase1} wide />
                      <StrategyField label="Phase 2" value={activeStrategy.phase2} wide />
                      <StrategyField label="Safe first clear" value={activeStrategy.safeClear} wide />
                      <StrategyField label="Max-damage plan" value={activeStrategy.maxDamage} wide />
                      <StrategyField label="Boss-specific tool" value={activeStrategy.tool} />
                      <StrategyField label="Avoid / failure points" value={activeStrategy.avoid} wide />
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No strategy rows for this filter"
                description="Pick another build or level for this boss."
                icon="sword"
                action={
                  <Button
                    variant="primary"
                    icon="refresh"
                    onClick={() => {
                      setBuildFilter("all");
                      setLevelFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </div>
        </div>
      )}

      <Drawer
        open={Boolean(selectedEncounter)}
        title={
          selectedEncounter
            ? isEncounterHidden(settings, journey, selectedEncounter)
              ? "Unknown encounter"
              : selectedEncounter.name
            : "Encounter"
        }
        subtitle={
          selectedEncounter
            ? isEncounterHidden(settings, journey, selectedEncounter)
              ? `${selectedEncounter.region} · sealed`
              : `${selectedEncounter.region} · ${selectedEncounter.location}`
            : undefined
        }
        onClose={() => navigate("/bosses")}
        footer={
          selectedEncounter ? (
            <div className="row-between wrap">
              <div className="row wrap">
                <Button
                  size="sm"
                  variant={journey.bosses[selectedEncounter.id] === "defeated" ? "primary" : "default"}
                  icon="trophy"
                  aria-label={
                    isEncounterHidden(settings, journey, selectedEncounter)
                      ? "Mark this encounter defeated"
                      : `Mark ${selectedEncounter.name} defeated`
                  }
                  onClick={() =>
                    applyStatus(
                      selectedEncounter,
                      journey.bosses[selectedEncounter.id] === "defeated" ? null : "defeated",
                    )
                  }
                >
                  Defeated
                </Button>
                <Button
                  size="sm"
                  variant={journey.bosses[selectedEncounter.id] === "deferred" ? "primary" : "default"}
                  icon="clock"
                  aria-label={
                    isEncounterHidden(settings, journey, selectedEncounter)
                      ? "Defer this encounter"
                      : `Defer ${selectedEncounter.name}`
                  }
                  onClick={() =>
                    applyStatus(
                      selectedEncounter,
                      journey.bosses[selectedEncounter.id] === "deferred" ? null : "deferred",
                    )
                  }
                >
                  Defer
                </Button>
              </div>
              <span className="tiny faint">
                {isEncounterHidden(settings, journey, selectedEncounter) ? "sealed" : selectedEncounter.id}
              </span>
            </div>
          ) : null
        }
      >
        {selectedEncounter ? (
          <EncounterDetail
            encounter={selectedEncounter}
            status={journey.bosses[selectedEncounter.id]}
            hidden={isEncounterHidden(settings, journey, selectedEncounter)}
            onReveal={() => revealEncounter(selectedEncounter)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
