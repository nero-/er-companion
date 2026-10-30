import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  StatCompare,
  TabBar,
  useToast,
} from "../components/ui";
import type { TabItem } from "../components/ui";
import { Icon } from "../components/Icon";
import {
  applyLoadout,
  applyProfile,
  setProgressionCheck,
  setStat,
  useActiveCharacter,
} from "../lib/store";
import { ALL_SOFTCAP_STATS, softCapFor } from "../lib/gameplay";
import {
  ARCHETYPES,
  BOSS_STRATEGIES_BY_BUILD,
  ENCOUNTER_PRESETS_BY_BUILD,
  SPELL_PACKAGE_BY_ID,
  UPGRADES_BY_NODE,
} from "../lib/data";
import {
  equipmentOwnedCount,
  isEquipmentOwned,
  itemForEquipmentName,
  loadoutsForProfile,
  nearestTechNode,
  profilesForArchetype,
  techProgressionForArchetype,
} from "../lib/selectors";
import { STAT_LABELS, STAT_ORDER, STAT_SHORT, levelFromStats } from "../lib/classes";
import { itemGroupIcon } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import type { BuildLoadout, Character } from "../lib/types";
import "./builds.css";

const LEVELS = [150, 200] as const;
const TYPE_ORDER: Record<string, number> = { Signature: 0, Optimized: 1, Fashion: 2 };

const CERTIFIED = ARCHETYPES.filter((archetype) => archetype.familyRole !== "Historical Redirect");
const FAMILY_GROUP_FALLBACK = "Standalone archetypes";

interface ArchetypeFamilyGroup {
  family: string;
  members: typeof CERTIFIED;
}

/** Group the certified archetypes by content-pack family for the picker. */
function archetypeFamilyGroups(): ArchetypeFamilyGroup[] {
  const grouped = new Map<string, ArchetypeFamilyGroup["members"]>();
  for (const archetype of CERTIFIED) {
    const family = archetype.family && archetype.family !== archetype.name ? archetype.family : FAMILY_GROUP_FALLBACK;
    const members = grouped.get(family) ?? [];
    members.push(archetype);
    grouped.set(family, members);
  }
  return [...grouped.entries()]
    .map(([family, members]) => ({ family, members }))
    .sort((a, b) => {
      if (a.family === FAMILY_GROUP_FALLBACK) return 1;
      if (b.family === FAMILY_GROUP_FALLBACK) return -1;
      return a.family.localeCompare(b.family);
    });
}

type PresetTabId = "all" | "General" | "Combat Style" | "Damage Type" | "Enemy Profile" | "Boss" | "Named Boss";

const PRESET_TABS: { id: PresetTabId; label: string; types: string[] | null }[] = [
  { id: "all", label: "All", types: null },
  { id: "General", label: "General", types: ["General"] },
  { id: "Combat Style", label: "Combat Style", types: ["Combat Style"] },
  { id: "Damage Type", label: "Damage Type", types: ["Damage Type"] },
  { id: "Enemy Profile", label: "Enemy Family", types: ["Enemy Profile"] },
  { id: "Boss", label: "Boss", types: ["Specific Boss"] },
  { id: "Named Boss", label: "Named Boss", types: ["Named Boss"] },
];

const TIMELINE_MIN = 1;
const TIMELINE_MAX = 200;

function uniqueNames(names: string[]): string[] {
  return [...new Set(names.filter((name) => name && !name.toLowerCase().startsWith("empty") && name !== "—"))];
}

function loadoutGearNames(loadout: BuildLoadout): string[] {
  return uniqueNames([
    loadout.mainWeapon,
    loadout.secondaryWeapon,
    loadout.offhand,
    loadout.shield,
    ...loadout.armor,
    ...loadout.talismans,
    ...loadout.physick,
  ]);
}

function buildGearNames(loadouts: BuildLoadout[]): string[] {
  const names = loadouts.flatMap((loadout) => {
    const pkg = SPELL_PACKAGE_BY_ID[loadout.packageId];
    return [...loadoutGearNames(loadout), ...(pkg?.slots ?? [])];
  });
  return uniqueNames(names);
}

function cataloguedGearNames(names: string[]): string[] {
  return uniqueNames(names).filter((name) => Boolean(itemForEquipmentName(name)));
}

interface GearRowProps {
  character: Character;
  label: string;
  value: string;
  tracked?: boolean;
}

function GearRow({ character, label, value, tracked = true }: GearRowProps) {
  const item = itemForEquipmentName(value);
  const owned = isEquipmentOwned(character, value);
  const open = !value || value.toLowerCase().startsWith("empty") || value === "—";
  return (
    <div className="gear-row">
      <span className="gear-label">{label}</span>
      <span className="gear-value">
        {item ? (
          <button
            type="button"
            className="gear-link"
            onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
            title={`Open ${item.name} in the collection`}
          >
            {value}
          </button>
        ) : (
          value || <span className="faint">Empty slot</span>
        )}
      </span>
      {tracked ? (
        <span
          className={`gear-own ${!item ? "unknown" : owned ? "yes" : "no"}`.trim()}
          title={
            open
              ? "Open slot"
              : !item
                ? "No matching item in the collection catalogue"
                : owned
                  ? "In collection"
                  : "Not in collection"
          }
        >
          <span className={`owned-dot ${item && owned ? "yes" : ""}`} aria-hidden="true" />
          {open ? "Open" : !item ? "Not indexed" : owned ? "Owned" : "Missing"}
        </span>
      ) : (
        <span className="gear-own faint">Skill</span>
      )}
    </div>
  );
}

function SlotList({ character, items, icon = "talisman" }: { character: Character; items: string[]; icon?: "helmet" | "talisman" | "flask" }) {
  if (items.length === 0) return <span className="faint tiny">None listed</span>;
  return (
    <div className="tag-list">
      {items.map((name, index) => {
        const owned = isEquipmentOwned(character, name);
        const item = itemForEquipmentName(name);
        return (
          <span
            key={`${name}-${index}`}
            className={`own-chip ${!item ? "is-unindexed" : owned ? "is-owned" : "is-missing"}`.trim()}
            title={!item ? "No matching item in the collection catalogue" : owned ? "In collection" : "Not in collection"}
          >
            <Icon name={itemGroupIcon(item?.group ?? (icon === "helmet" ? "Armor" : icon === "flask" ? "Crystal Tear" : "Talisman"))} size={11} />
            {item ? (
              <button
                type="button"
                className="own-chip-text"
                onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
                title={`Open ${item.name} in the collection`}
              >
                {name}
              </button>
            ) : (
              <span>{name}</span>
            )}
            <span className={`owned-dot ${item && owned ? "yes" : ""}`} aria-hidden="true" />
            <span className="sr-only">{!item ? "not indexed" : owned ? "owned" : "missing"}</span>
          </span>
        );
      })}
    </div>
  );
}

function LoadoutCard({
  character,
  loadout,
  active,
  onInspectSpellPackage,
}: {
  character: Character;
  loadout: BuildLoadout;
  active: boolean;
  onInspectSpellPackage: () => void;
}) {
  const toast = useToast();
  const pkg = SPELL_PACKAGE_BY_ID[loadout.packageId];
  const listedNames = uniqueNames([...loadoutGearNames(loadout), ...(pkg?.slots ?? [])]);
  const cataloguedNames = cataloguedGearNames(listedNames);
  const owns = equipmentOwnedCount(character, cataloguedNames);
  const unindexed = listedNames.length - cataloguedNames.length;

  return (
    <article className={`loadout-card ${active ? "is-active" : ""}`.trim()}>
      <div className="row-between wrap">
        <div className="row" style={{ gap: 7 }}>
          <Badge tone={loadout.type === "Signature" ? "accent" : "default"}>{loadout.type}</Badge>
          <span className="tiny faint">Level {loadout.level}</span>
        </div>
        <Badge tone={owns.owned === owns.total ? "success" : "warning"}>
          {owns.owned}/{owns.total} owned
        </Badge>
      </div>
      <h3 className="loadout-name">{loadout.mainWeapon || "No primary weapon listed"}</h3>
      {unindexed > 0 ? (
        <span className="tiny faint">
          {unindexed} listed {unindexed === 1 ? "entry has" : "entries have"} no item-catalogue match
        </span>
      ) : null}
      <div className="loadout-gear">
        <GearRow character={character} label="Primary" value={loadout.mainWeapon} />
        {loadout.mainSkill ? <GearRow character={character} label="Skill" value={loadout.mainSkill} tracked={false} /> : null}
        <GearRow character={character} label="Secondary" value={loadout.secondaryWeapon} />
        {loadout.secondarySkill ? <GearRow character={character} label="Skill" value={loadout.secondarySkill} tracked={false} /> : null}
        <GearRow character={character} label="Offhand" value={loadout.offhand} />
        <GearRow character={character} label="Shield" value={loadout.shield} />
      </div>
      <div className="loadout-sub">
        <div className="tiny faint">Armor</div>
        <SlotList character={character} items={loadout.armor} icon="helmet" />
      </div>
      <div className="loadout-sub">
        <div className="tiny faint">Talismans</div>
        <SlotList character={character} items={loadout.talismans} icon="talisman" />
      </div>
      <div className="loadout-sub">
        <div className="tiny faint">Physick</div>
        <SlotList character={character} items={loadout.physick} icon="flask" />
      </div>
      <div className="row wrap loadout-actions">
        <Button
          size="sm"
          variant="primary"
          icon="check"
          onClick={() => {
            applyLoadout(loadout.id);
            toast.push(
              `Applied ${loadout.type === "Optimized" ? "an" : "the"} ${loadout.type} loadout. ${owns.owned}/${owns.total} indexed pieces are marked owned. Profile selection and stats are unchanged.`,
              "success",
            );
          }}
        >
          Apply loadout
        </Button>
        <Button size="sm" icon="spark" onClick={onInspectSpellPackage} disabled={!pkg}>
          Spell package
        </Button>
        {pkg ? <span className="tiny faint grow truncate">{pkg.name}</span> : null}
      </div>
    </article>
  );
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div className="preset-line">
      <span className="preset-key">{label}</span>
      <span className="preset-value">{value}</span>
    </div>
  );
}

export function BuildsPage() {
  const route = useRoute();
  const character = useActiveCharacter();
  const toast = useToast();

  const queryArchetype = route.query.get("archetype");
  const requested = CERTIFIED.find((archetype) => archetype.id === queryArchetype);
  const fallback =
    (character.archetypeId ? CERTIFIED.find((archetype) => archetype.id === character.archetypeId) : undefined) ??
    CERTIFIED[0];
  const selected = requested ?? fallback;

  const familyGroups = useMemo(() => archetypeFamilyGroups(), []);

  const requestedLevel = route.query.get("level") === "200" ? 200 : 150;
  const profiles = selected ? profilesForArchetype(selected.id) : [];
  const profile = profiles.find((entry) => entry.level === requestedLevel) ?? profiles[profiles.length - 1];
  const activeLevel = profile?.level ?? requestedLevel;
  const ideal150 = profiles.find((entry) => entry.level === 150);
  const ideal200 = profiles.find((entry) => entry.level === 200);
  const characterLevel = levelFromStats(character.stats);
  const loadouts = useMemo(
    () =>
      profile
        ? loadoutsForProfile(profile.id).slice().sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))
        : [],
    [profile],
  );

  const [activeLoadoutId, setActiveLoadoutId] = useState("");
  const [activeTab, setActiveTab] = useState("encounters");
  const [presetTab, setPresetTab] = useState<PresetTabId>("all");
  const [presetSearch, setPresetSearch] = useState("");
  const [presetLimit, setPresetLimit] = useState(12);
  const [bossLimit, setBossLimit] = useState(6);
  const [timelineLevel, setTimelineLevel] = useState(activeLevel);

  const activeLoadout =
    loadouts.find((loadout) => loadout.id === activeLoadoutId) ??
    loadouts.find((loadout) => loadout.type === "Signature") ??
    loadouts[0];
  const activePackage = activeLoadout ? SPELL_PACKAGE_BY_ID[activeLoadout.packageId] : undefined;

  const allGearNames = useMemo(() => (profile ? buildGearNames(loadouts) : []), [profile, loadouts]);
  const cataloguedBuildNames = cataloguedGearNames(allGearNames);
  const buildOwned = equipmentOwnedCount(character, cataloguedBuildNames);
  const buildUnindexed = allGearNames.length - cataloguedBuildNames.length;

  const buildPresets = useMemo(() => {
    if (!profile) return [];
    return (ENCOUNTER_PRESETS_BY_BUILD[profile.id] ?? []).filter(
      (preset) => preset.level === profile.level && preset.archetype === selected?.name,
    );
  }, [profile, selected]);

  const filteredPresets = useMemo(() => {
    const tab = PRESET_TABS.find((entry) => entry.id === presetTab);
    const needle = presetSearch.trim().toLowerCase();
    return buildPresets
      .filter((preset) => (tab?.types ? tab.types.includes(preset.encounterType) : true))
      .filter((preset) => {
        if (!needle) return true;
        return [
          preset.target,
          preset.encounterType,
          preset.loadout,
          preset.mainWeapon,
          preset.mainSkill,
          preset.secondaryWeapon,
          preset.secondarySkill,
          preset.offhand,
          preset.shield,
          preset.armor,
          preset.talismans,
          preset.physick.join(" "),
          preset.greatRune,
          preset.flask,
          preset.consumables,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.target.localeCompare(b.target));
  }, [buildPresets, presetTab, presetSearch]);

  const bossStrategies = useMemo(() => {
    if (!profile) return [];
    return (BOSS_STRATEGIES_BY_BUILD[profile.id] ?? []).slice().sort((a, b) => a.routeOrder - b.routeOrder);
  }, [profile]);

  const progressionRows = useMemo(() => (selected ? techProgressionForArchetype(selected.id) : []), [selected]);
  const nearest = useMemo(
    () => (selected ? nearestTechNode(selected.id, timelineLevel) : undefined),
    [selected, timelineLevel],
  );

  useEffect(() => {
    setPresetLimit(12);
  }, [profile?.id, presetTab, presetSearch]);

  useEffect(() => {
    setBossLimit(6);
  }, [profile?.id]);

  useEffect(() => {
    setTimelineLevel(activeLevel);
  }, [selected?.id, activeLevel]);

  // Rows are checked by default when the target level is reached; a local set tracks
  // explicit unticking so the default rule cannot immediately re-check the row.
  const [clearedRows, setClearedRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setClearedRows({});
  }, [selected?.id]);

  if (!selected) {
    return (
      <div className="page">
        <PageHeader eyebrow="Build library" title="Builds" description="Certified archetypes from the build content pack." />
        <EmptyState title="No archetypes in the content pack" description="The build content pack contains no archetypes." icon="layers" />
      </div>
    );
  }

  const selectArchetype = (id: string, level = activeLevel) => {
    navigate(`/builds?archetype=${encodeURIComponent(id)}&level=${level}`);
  };

  const applySelectedProfile = () => {
    if (!profile) return;
    const missing = buildOwned.total - buildOwned.owned;
    applyProfile(profile.id);
    toast.push(
      `Applied ${profile.archetype} · Level ${profile.level} to ${character.name}. Stats and certified gear updated${
        missing > 0 ? `; ${missing} indexed pieces are still missing from your collection.` : "."
      }`,
      "success",
    );
  };

  const buildTabs: TabItem[] = [
    { id: "encounters", label: "Encounter presets", count: buildPresets.length },
    { id: "bosses", label: "Boss strategies", count: bossStrategies.length },
    { id: "progression", label: "Progression", count: progressionRows.length },
  ];

  // Tech nodes carry no route-step link, so the route signal is the character's own
  // derived level (the journey's progression proxy); manual checks always win.
  const isRowChecked = (nodeId: string, levelTarget: number) => {
    if (clearedRows[nodeId]) return false;
    return Boolean(character.progressionChecks[nodeId]) || levelTarget <= characterLevel;
  };

  const toggleRowCheck = (nodeId: string, value: boolean) => {
    setClearedRows((previous) => ({ ...previous, [nodeId]: !value }));
    setProgressionCheck(selected?.id ?? character.archetypeId, nodeId, value);
  };

  const applyAllSoftcaps = () => {
    // setStat clears the certified profile once; every stat is then written in turn.
    for (const key of STAT_ORDER) setStat(key, ALL_SOFTCAP_STATS[key]);
    toast.push(
      `Reference soft-cap spread applied to ${character.name}: every stat at its first soft cap, deriving Level ${levelFromStats(
        ALL_SOFTCAP_STATS,
      )}. This is not a level-150 legal build and no certified profile is selected.`,
      "success",
    );
  };

  return (
    <div className="page builds-page">
      <PageHeader
        eyebrow="Build library · certified profiles"
        title="Builds"
        description={
          <>
            {CERTIFIED.length} certified archetypes with Level 150 and Level 200 profiles, Signature / Optimized /
            Fashion loadouts, spell packages, encounter presets and the progression path. Pick a family in the dropdown
            to open its detail below.
          </>
        }
        actions={
          <>
            <Button icon="users" onClick={() => navigate("/character")}>
              Open character
            </Button>
            <Button variant="ghost" icon="skull" onClick={() => navigate("/bosses")}>
              Boss library
            </Button>
          </>
        }
      />

      <section className="card card-pad build-picker" style={{ marginBottom: 16 }}>
        <div className="build-picker-row">
          <Select
            label="Archetype"
            value={selected.id}
            onChange={(event) => selectArchetype(event.target.value)}
            className="build-select"
          >
            {familyGroups.map((group) => (
              <optgroup key={group.family} label={group.family}>
                {group.members.map((archetype) => (
                  <option key={archetype.id} value={archetype.id}>
                    {archetype.name} · {archetype.priorityStats}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <div className="build-picker-level">
            <span className="field-label">Level</span>
            <div className="btn-group" role="group" aria-label="Certified profile level">
              {LEVELS.map((level) => {
                const available = profilesForArchetype(selected.id).some((entry) => entry.level === level);
                return (
                  <Button
                    key={level}
                    size="sm"
                    variant={activeLevel === level ? "primary" : "default"}
                    onClick={() => selectArchetype(selected.id, level)}
                    aria-pressed={activeLevel === level}
                    disabled={!available}
                  >
                    {level}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="build-summary">
          <span className="build-summary-name">{selected.name}</span>
          {selected.family && selected.family !== selected.name ? (
            <span className="chip">{selected.family}</span>
          ) : null}
          <span className="chip">{selected.familyRole === "Parent Family" ? "Parent family" : "Standalone"}</span>
          <span className="chip">{selected.priorityStats}</span>
          <span className="tiny faint">
            {profiles.length} certified {profiles.length === 1 ? "level" : "levels"} · recommended{" "}
            {selected.recommendedClass}
          </span>
        </div>
      </section>

      <section className="card card-pad softcap-reference" style={{ marginBottom: 16 }}>
        <div className="row-between wrap">
          <div className="grow">
            <SectionTitle
              title="Reference ceiling — not a level-150 legal build"
              note="All stats at their first soft cap"
            />
            <p className="small muted" style={{ margin: "2px 0 0", maxWidth: 720 }}>
              Every stat pushed to its first soft cap from the bundled resource table. This is a reference ceiling for
              comparing spreads, not a certified archetype and not a legal level-150 build: it derives{" "}
              {levelFromStats(ALL_SOFTCAP_STATS)} levels from the stat total.
            </p>
          </div>
          <Button icon="upload" onClick={applyAllSoftcaps}>
            Apply reference stats
          </Button>
        </div>
        <div className="softcap-reference-body">
          <StatCompare
            rows={STAT_ORDER.map((key) => ({
              key,
              label: STAT_LABELS[key],
              current: character.stats[key],
              target: ALL_SOFTCAP_STATS[key],
              softCap: softCapFor(key),
            }))}
          />
          <div className="softcap-reference-meta">
            <div>
              <div className="tiny faint">Derived level</div>
              <div className="char-level">{levelFromStats(ALL_SOFTCAP_STATS)}</div>
            </div>
            <div>
              <div className="tiny faint">Certified comparison</div>
              <div className="char-level-sub">
                {profile
                  ? `${selected.name} · Level ${profile.level} derives ${levelFromStats(profile.stats)}`
                  : "No certified profile for this selection"}
              </div>
            </div>
          </div>
        </div>
        <p className="tiny faint" style={{ margin: "10px 0 0" }}>
          Applying writes all eight stats to the character and clears the certified profile selection, exactly like
          editing a stat by hand. Nothing else is changed.
        </p>
      </section>

      {profile ? (
        <>
          <section className="card card-pad card-accent build-detail">
            <div className="row-between wrap build-detail-head">
              <div className="grow">
                <div className="row wrap" style={{ marginBottom: 8 }}>
                  <Badge tone="accent">{selected.priorityStats}</Badge>
                  <Badge>{selected.familyRole === "Parent Family" ? "Parent family" : "Standalone"}</Badge>
                  <Badge tone="info">{profile.status}</Badge>
                  <span className="tiny faint">{profile.regulation}</span>
                </div>
                <h2 className="build-title">{selected.name}</h2>
                <p className="muted small" style={{ margin: "6px 0 0", maxWidth: 760 }}>
                  {selected.fantasy}
                </p>
              </div>
              <div className="stack" style={{ alignItems: "flex-end", gap: 8 }}>
                <Badge tone="accent">Level {profile.level} profile</Badge>
                <span className="tiny faint">
                  {profile.calculatedLevel} certified · {levelFromStats(profile.stats)} computed
                </span>
              </div>
            </div>

            <div className="build-detail-grid">
              <div className="stack" style={{ gap: 12 }}>
                <div>
                  <div className="tiny faint">Priority stats</div>
                  <div className="build-identity">{selected.priorityStats}</div>
                </div>
                <dl className="kv build-kv">
                  <dt>Profile</dt>
                  <dd>
                    Level {profile.level} · derived {levelFromStats(profile.stats)} from the stat total
                  </dd>
                  <dt>Primary</dt>
                  <dd>{profile.primaryStat}</dd>
                  <dt>Secondary</dt>
                  <dd>{profile.secondaryStat}</dd>
                  <dt>Starting class</dt>
                  <dd>{profile.startingClass}</dd>
                  <dt>Recommended class</dt>
                  <dd>{selected.recommendedClass}</dd>
                  <dt>Research status</dt>
                  <dd>{selected.researchStatus}</dd>
                  <dt>Role</dt>
                  <dd>{profile.role}</dd>
                </dl>
              </div>
              <div>
                <div className="stat-grid">
                  {STAT_ORDER.map((key) => (
                    <div className="stat-cell" key={key}>
                      <div className="k">{STAT_SHORT[key]}</div>
                      <div className="v">{profile.stats[key]}</div>
                    </div>
                  ))}
                </div>
                <div className="row-between wrap" style={{ marginTop: 10 }}>
                  <span className="tiny faint">
                    {profile.calculatedLevel} certified · {levelFromStats(profile.stats)} computed
                  </span>
                  <span className="tiny faint">Class note: {selected.classStatus}</span>
                </div>
              </div>
            </div>

            <div className="divider" />

            <div className="row-between wrap">
              <div className="row wrap" style={{ gap: 8 }}>
                <Badge tone={buildOwned.owned === buildOwned.total ? "success" : "warning"}>
                  {buildOwned.owned}/{buildOwned.total} indexed gear pieces owned
                </Badge>
                <span className="tiny faint">
                  Counted across all three loadout modes and their spell slots
                  {buildUnindexed > 0 ? `; ${buildUnindexed} listed entries have no item-catalogue match and are not counted` : ""}.
                </span>
              </div>
              <div className="row wrap">
                <Button variant="primary" icon="check" onClick={applySelectedProfile}>
                  Apply profile to character
                </Button>
                <Button icon="users" onClick={() => navigate("/character")}>
                  Open equipment planner
                </Button>
              </div>
            </div>
            <ProgressBar
              value={buildOwned.total ? (buildOwned.owned / buildOwned.total) * 100 : 0}
              label="Collection coverage for this build"
              detail={`${buildOwned.owned} owned · ${buildOwned.total - buildOwned.owned} indexed missing`}
              className="build-progress"
            />
            {buildOwned.owned < buildOwned.total ? (
              <p className="tiny faint" style={{ margin: "4px 0 0" }}>
                Gear not in your collection is marked Missing; names without a catalogue match are marked Not indexed.
                The page does not claim the build is playable while indexed pieces are missing.
              </p>
            ) : null}
          </section>

          <section className="card card-pad build-section" id="ideal-stats">
            <SectionTitle
              title="Ideal stats"
              note={`Current spread derives Level ${characterLevel}`}
            />
            <div className="ideal-stats-grid">
              <div>
                <div className="tiny faint" style={{ marginBottom: 6 }}>
                  Current → Level 150 certified
                </div>
                {ideal150 ? (
                  <StatCompare
                    rows={STAT_ORDER.map((key) => ({
                      key,
                      label: STAT_LABELS[key],
                      current: character.stats[key],
                      target: ideal150.stats[key],
                      softCap: softCapFor(key),
                    }))}
                  />
                ) : (
                  <EmptyState title="No Level 150 profile" description="This archetype has no certified Level 150 profile." icon="layers" />
                )}
              </div>
              {ideal200 && characterLevel > 150 ? (
                <div>
                  <div className="tiny faint" style={{ marginBottom: 6 }}>
                    Current → Level 200 certified
                  </div>
                  <StatCompare
                    rows={STAT_ORDER.map((key) => ({
                      key,
                      label: STAT_LABELS[key],
                      current: character.stats[key],
                      target: ideal200.stats[key],
                      softCap: softCapFor(key),
                    }))}
                  />
                </div>
              ) : null}
            </div>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <Button
                icon="refresh"
                disabled={!ideal150}
                onClick={() => {
                  if (!ideal150) return;
                  applyProfile(ideal150.id);
                  toast.push(
                    `Reset ${character.name} to the ${selected.name} Level 150 certified spread.`,
                    "success",
                  );
                }}
              >
                Reset to Level 150
              </Button>
              {ideal200 && characterLevel > 150 ? (
                <Button
                  variant="primary"
                  icon="check"
                  onClick={() => {
                    applyProfile(ideal200.id);
                    toast.push(
                      `Applied the ${selected.name} Level 200 certified spread to ${character.name}.`,
                      "success",
                    );
                  }}
                >
                  Apply Level 200
                </Button>
              ) : null}
              <span className="tiny faint grow">
                Ideal stats come from the certified profiles; applying one also writes its signature gear.
              </span>
            </div>
          </section>

          <section className="build-section">
            <SectionTitle
              title="Certified loadouts"
              note={`${loadouts.length} listed · Signature / Optimized / Fashion`}
            />
            {loadouts.length === 0 ? (
              <EmptyState title="No loadouts for this profile" description="This profile has no certified loadout rows in the content pack." icon="sword" />
            ) : (
              <div className="grid-3 loadout-grid">
                {loadouts.map((loadout) => (
                  <LoadoutCard
                    key={loadout.id}
                    character={character}
                    loadout={loadout}
                    active={activeLoadout?.id === loadout.id}
                    onInspectSpellPackage={() => {
                      setActiveLoadoutId(loadout.id);
                      document.getElementById("spell-package")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="card card-pad build-section" id="spell-package">
            <SectionTitle
              title="Spell package"
              note={activeLoadout ? `${activeLoadout.type} loadout · ${activeLoadout.mainWeapon}` : undefined}
            />
            {activePackage ? (
              <>
                <div className="row wrap" style={{ marginBottom: 12 }}>
                  <Badge tone="accent">{activePackage.name}</Badge>
                  <Badge>{activePackage.role}</Badge>
                  <Badge>{activePackage.modes}</Badge>
                  <span className="tiny faint">
                    {activePackage.totalSlots ?? activePackage.slots.length} slots · {activePackage.primaryTool}
                  </span>
                </div>
                <div className="spell-layout">
                  <div>
                    <div className="tiny faint" style={{ marginBottom: 6 }}>
                      Slots
                    </div>
                    <ol className="spell-slot-list">
                      {activePackage.slots.map((slot, index) => {
                        const item = itemForEquipmentName(slot);
                        const owned = item ? isEquipmentOwned(character, slot) : false;
                        return (
                          <li key={`${slot}-${index}`}>
                            <span className="spell-index">{index + 1}</span>
                            <span className="grow">{slot}</span>
                            <span
                              className={`owned-dot ${item && owned ? "yes" : ""}`}
                              title={!item ? "No item-catalogue match" : owned ? "In collection" : "Not in collection"}
                              aria-label={!item ? "Not indexed" : owned ? "Owned" : "Missing"}
                              role="img"
                            />
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <div className="stack" style={{ gap: 10 }}>
                    <dl className="kv">
                      <dt>Primary tool</dt>
                      <dd>{activePackage.primaryTool}</dd>
                      <dt>Support tool</dt>
                      <dd>{activePackage.supportTool || "None listed"}</dd>
                    </dl>
                    <Callout icon="flame">
                      <strong>Pre-fight</strong>
                      <div>{activePackage.preFight}</div>
                    </Callout>
                    <Callout tone="warning" icon="refresh">
                      <strong>Hard-swap rule</strong>
                      <div>{activePackage.hardSwap}</div>
                    </Callout>
                    {activeLoadout ? (
                      <p className="tiny faint" style={{ margin: 0 }}>
                        {activePackage.name} is attached to the {activeLoadout.type} loadout. Switching loadout mode
                        changes the package when the certified row uses a different package.
                      </p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No spell package" description="This loadout has no linked spell package in the content pack." icon="spark" />
            )}
          </section>

          <section className="build-section">
            <TabBar items={buildTabs} value={activeTab} onChange={setActiveTab} />

            {activeTab === "encounters" ? (
              <div className="stack" style={{ marginTop: 14 }}>
                <div className="row-between wrap">
                  <div>
                    <h2 className="tab-heading">Encounter presets</h2>
                    <p className="small muted" style={{ margin: "2px 0 0" }}>
                      {buildPresets.length} presets for {profile.archetype} at Level {profile.level}. Search targets and
                      switch the encounter class. Enemy Family maps to the content pack's Enemy Profile type; presets
                      list recommended overrides from the content pack.
                    </p>
                  </div>
                  <SearchInput value={presetSearch} onChange={setPresetSearch} placeholder="Search presets, targets, consumables…" />
                </div>
                <div className="preset-filters" role="group" aria-label="Encounter preset filters">
                  {PRESET_TABS.map((tab) => {
                    const count = tab.types
                      ? buildPresets.filter((preset) => tab.types?.includes(preset.encounterType)).length
                      : buildPresets.length;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`filter-chip ${presetTab === tab.id ? "active" : ""}`.trim()}
                        aria-pressed={presetTab === tab.id}
                        onClick={() => setPresetTab(tab.id)}
                        title={tab.id === "Enemy Profile" ? "Content-pack encounter type: Enemy Profile" : undefined}
                      >
                        {tab.label}
                        <span className="filter-count">{count}</span>
                      </button>
                    );
                  })}
                </div>
                {filteredPresets.length === 0 ? (
                  <EmptyState
                    title="No presets match"
                    description="Clear the search or choose a different encounter class. The content pack has no additional rows in this filter."
                    action={
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setPresetSearch("");
                          setPresetTab("all");
                        }}
                      >
                        Reset filters
                      </Button>
                    }
                    icon="filter"
                  />
                ) : (
                  <>
                    <div className="grid-2">
                      {filteredPresets.slice(0, presetLimit).map((preset) => {
                        const pkg = SPELL_PACKAGE_BY_ID[preset.packageId];
                        return (
                          <article className="card card-pad preset-card" key={preset.id}>
                            <div className="row-between wrap">
                              <div className="row wrap" style={{ gap: 6 }}>
                                <Badge tone="accent">{preset.encounterType}</Badge>
                                <Badge>{preset.loadout}</Badge>
                                {preset.priority ? <span className="tiny faint">Priority {preset.priority}</span> : null}
                              </div>
                              <span className="tiny faint">Lv {preset.level}</span>
                            </div>
                            <h3 className="preset-target">{preset.target}</h3>
                            <div className="preset-lines">
                              {preset.mainWeapon ? (
                                <DetailLine label="Main" value={`${preset.mainWeapon}${preset.mainSkill ? ` · ${preset.mainSkill}` : ""}`} />
                              ) : null}
                              {preset.secondaryWeapon ? (
                                <DetailLine
                                  label="Secondary"
                                  value={`${preset.secondaryWeapon}${preset.secondarySkill ? ` · ${preset.secondarySkill}` : ""}`}
                                />
                              ) : null}
                              {preset.offhand ? <DetailLine label="Offhand" value={preset.offhand} /> : null}
                              {preset.shield ? <DetailLine label="Shield" value={preset.shield} /> : null}
                              {preset.armor ? <DetailLine label="Armor" value={preset.armor} /> : null}
                              {preset.talismans ? <DetailLine label="Talismans" value={preset.talismans} /> : null}
                              <DetailLine label="Physick" value={preset.physick.join(" · ")} />
                              {preset.greatRune ? <DetailLine label="Great rune" value={preset.greatRune} /> : null}
                              {preset.flask ? <DetailLine label="Flasks" value={preset.flask} /> : null}
                              {preset.consumables ? <DetailLine label="Consumables" value={preset.consumables} /> : null}
                              {pkg ? <DetailLine label="Package" value={pkg.name} /> : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    {filteredPresets.length > presetLimit ? (
                      <div className="row" style={{ justifyContent: "center" }}>
                        <Button icon="chevronDown" onClick={() => setPresetLimit((limit) => limit + 12)}>
                          Show more · {filteredPresets.length - presetLimit} remaining
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "bosses" ? (
              <div className="stack" style={{ marginTop: 14 }}>
                <div className="row-between wrap">
                  <div>
                    <h2 className="tab-heading">Boss strategies</h2>
                    <p className="small muted" style={{ margin: "2px 0 0" }}>
                      {bossStrategies.length} strategy rows for this build. Showing {Math.min(bossLimit, bossStrategies.length)}{" "}
                      now; open a boss for the full strategy library.
                    </p>
                  </div>
                  <Button icon="skull" onClick={() => navigate("/bosses")}>
                    Open boss library
                  </Button>
                </div>
                {bossStrategies.length === 0 ? (
                  <EmptyState title="No boss strategies for this build" description="No build-specific boss strategy rows are present for this profile." icon="skull" />
                ) : (
                  <>
                    <div className="stack" style={{ gap: 8 }}>
                      {bossStrategies.slice(0, bossLimit).map((strategy) => (
                        <article className="card card-pad boss-card" key={strategy.id}>
                          <div className="row-between wrap">
                            <div className="row wrap" style={{ gap: 8 }}>
                              <span className="tiny faint">#{strategy.routeOrder}</span>
                              <h3 className="boss-name">
                                <button
                                  type="button"
                                  className="gear-link boss-link"
                                  onClick={() => navigate(`/bosses?boss=${encodeURIComponent(strategy.boss)}`)}
                                  title={`Open ${strategy.boss} in the boss library`}
                                >
                                  {strategy.boss}
                                  <Icon name="external" size={12} />
                                </button>
                              </h3>
                              <Badge tone="accent">{strategy.loadout}</Badge>
                              <Badge>Lv {strategy.level}</Badge>
                            </div>
                          </div>
                          <div className="preset-lines">
                            <DetailLine label="Location" value={strategy.location} />
                            <DetailLine
                              label="Weapon"
                              value={`${strategy.mainWeapon}${strategy.skill ? ` · ${strategy.skill}` : ""}`}
                            />
                            <DetailLine label="Talismans" value={strategy.talismans} />
                            <DetailLine label="Physick" value={strategy.physick} />
                            <DetailLine label="Flasks" value={strategy.flask} />
                            <DetailLine label="Opening" value={strategy.opening} />
                          </div>
                          <details className="boss-details">
                            <summary>Full plan and overrides</summary>
                            <dl className="kv">
                              {strategy.buffs ? (
                                <>
                                  <dt>Buffs</dt>
                                  <dd>{strategy.buffs}</dd>
                                </>
                              ) : null}
                              {strategy.phase1 ? (
                                <>
                                  <dt>Phase 1</dt>
                                  <dd>{strategy.phase1}</dd>
                                </>
                              ) : null}
                              {strategy.phase2 ? (
                                <>
                                  <dt>Phase 2</dt>
                                  <dd>{strategy.phase2}</dd>
                                </>
                              ) : null}
                              {strategy.safeClear ? (
                                <>
                                  <dt>Safe clear</dt>
                                  <dd>{strategy.safeClear}</dd>
                                </>
                              ) : null}
                              {strategy.maxDamage ? (
                                <>
                                  <dt>Max damage</dt>
                                  <dd>{strategy.maxDamage}</dd>
                                </>
                              ) : null}
                              {strategy.tool ? (
                                <>
                                  <dt>Tools</dt>
                                  <dd>{strategy.tool}</dd>
                                </>
                              ) : null}
                              {strategy.avoid ? (
                                <>
                                  <dt>Avoid</dt>
                                  <dd>{strategy.avoid}</dd>
                                </>
                              ) : null}
                            </dl>
                          </details>
                        </article>
                      ))}
                    </div>
                    {bossStrategies.length > bossLimit ? (
                      <div className="row" style={{ justifyContent: "center" }}>
                        <Button icon="chevronDown" onClick={() => setBossLimit((limit) => limit + 6)}>
                          Show more · {bossStrategies.length - bossLimit} remaining
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {activeTab === "progression" ? (
              <div className="stack" style={{ marginTop: 14 }}>
                <div className="row-between wrap">
                  <div>
                    <h2 className="tab-heading">Progression timeline</h2>
                    <p className="small muted" style={{ margin: "2px 0 0" }}>
                      {progressionRows.length} tech-tree rows for {selected.name}, sorted by level target. The highlighted
                      row is the nearest loadout-bearing node at or below the selected level. Rows default to checked
                      when their target level is at or under your character's derived Level {characterLevel}; ticking or
                      unticking records the checkpoint for this archetype.
                    </p>
                  </div>
                  <div className="timeline-control">
                    <label htmlFor="timeline-level">Level {timelineLevel}</label>
                    <input
                      id="timeline-level"
                      type="range"
                      min={TIMELINE_MIN}
                      max={TIMELINE_MAX}
                      value={timelineLevel}
                      onChange={(event) => setTimelineLevel(Number(event.target.value))}
                      aria-label="Progression level"
                    />
                  </div>
                </div>

                {nearest ? (
                  <Callout icon="target">
                    Nearest progression loadout: <strong>{nearest.node.name}</strong> at Level{" "}
                    {nearest.node.levelTarget} ({nearest.node.stage}).{" "}
                    {timelineLevel < nearest.node.levelTarget
                      ? "This is the first loadout row in the tree; the selected level is below its target."
                      : null}
                  </Callout>
                ) : null}

                {progressionRows.length === 0 ? (
                  <EmptyState title="No progression rows" description="No tech-tree rows are available for this archetype." icon="layers" />
                ) : (
                  <div className="timeline">
                    {progressionRows.map((row) => {
                      const node = row.node;
                      const loadout = row.loadout;
                      const upgrades = UPGRADES_BY_NODE[node.id] ?? [];
                      const rawNames = loadout
                        ? uniqueNames([
                            loadout.primaryWeapon,
                            loadout.secondaryWeapon,
                            loadout.catalyst,
                            ...loadout.armor,
                            ...loadout.talismans,
                          ])
                        : [];
                      const names = cataloguedGearNames(rawNames);
                      const unindexed = rawNames.length - names.length;
                      const owns = equipmentOwnedCount(character, names);
                      const isNearest = nearest?.node.id === node.id;
                      const checked = isRowChecked(node.id, node.levelTarget);
                      return (
                        <article
                          className={`timeline-row ${isNearest ? "is-nearest" : ""} ${checked ? "is-reached" : ""}`.trim()}
                          key={node.id}
                        >
                          <div className="timeline-marker" aria-hidden="true">
                            <span>{node.levelTarget}</span>
                          </div>
                          <div className="timeline-body">
                            <div className="row-between wrap timeline-head">
                              <div className="row wrap" style={{ gap: 6 }}>
                                <Badge tone={isNearest ? "accent" : "default"}>{node.stage}</Badge>
                                <Badge>{node.type}</Badge>
                                {isNearest ? <Badge tone="success">Nearest row</Badge> : null}
                              </div>
                              <div className="row wrap timeline-head-meta">
                                <span className="tiny faint">
                                  Levels {node.levelMin}–{node.levelMax} · target {node.levelTarget}
                                  {node.exactLevel ? " · exact" : ""}
                                </span>
                                <Checkbox
                                  checked={checked}
                                  onChange={(value) => toggleRowCheck(node.id, value)}
                                  label="Reached"
                                />
                              </div>
                            </div>
                            <h3 className="timeline-name">{node.name}</h3>
                            <div className="small muted">{node.primaryIdentity}</div>
                            <div className="tiny faint" style={{ marginBottom: 8 }}>
                              {node.secondaryIdentity} · {node.journeyScope}
                            </div>

                            <Disclosure
                              title="Ideal stats at this stage"
                              summary={`derives Level ${levelFromStats(node.stats)}`}
                              tone="muted"
                              className="timeline-stats"
                            >
                              <StatCompare
                                rows={STAT_ORDER.map((key) => ({
                                  key,
                                  label: STAT_LABELS[key],
                                  current: character.stats[key],
                                  target: node.stats[key] ?? 0,
                                  softCap: softCapFor(key),
                                }))}
                              />
                            </Disclosure>

                            {loadout ? (
                              <>
                                <div className="timeline-gear">
                                  <DetailLine label="Primary" value={loadout.primaryWeapon} />
                                  <DetailLine label="Secondary" value={loadout.secondaryWeapon} />
                                  <DetailLine label="Catalyst" value={loadout.catalyst} />
                                  <DetailLine label="Armor" value={loadout.armor.join(" · ")} />
                                  <DetailLine label="Talismans" value={loadout.talismans.join(" · ")} />
                                </div>
                                <div className="row-between wrap timeline-owned">
                                  <span className="tiny faint">
                                    Indexed gear owned in this row · loadout level {loadout.level}
                                    {unindexed > 0 ? ` · ${unindexed} not indexed` : ""}
                                  </span>
                                  <Badge tone={owns.owned === owns.total ? "success" : "warning"}>
                                    {owns.owned}/{owns.total}
                                  </Badge>
                                </div>
                                {rawNames.length > 0 ? (
                                  <div className="tag-list timeline-chips">
                                    {rawNames.map((name) => {
                                      const item = itemForEquipmentName(name);
                                      const owned = item ? isEquipmentOwned(character, name) : false;
                                      return (
                                        <span
                                          key={name}
                                          className={`own-chip ${!item ? "is-unindexed" : owned ? "is-owned" : "is-missing"}`.trim()}
                                          title={
                                            !item
                                              ? "No matching item in the collection catalogue"
                                              : owned
                                                ? "In collection"
                                                : "Not in collection"
                                          }
                                        >
                                          <span className={`owned-dot ${item && owned ? "yes" : ""}`} aria-hidden="true" />
                                          <span className="sr-only">
                                            {!item ? "not indexed" : owned ? "owned" : "missing"}
                                          </span>
                                          {name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : null}
                                {upgrades.length > 0 ? (
                                  <div className="upgrade-plan">
                                    <div className="tiny faint" style={{ marginBottom: 4 }}>
                                      Upgrade plan
                                    </div>
                                    {upgrades.map((plan) => (
                                      <div className="upgrade-row" key={plan.id}>
                                        <span className="upgrade-weapon">{plan.weapon}</span>
                                        <span className="tiny faint">{plan.track}</span>
                                        <span className="tiny">
                                          {plan.minimumUpgrade}
                                          {plan.recommendedUpgrade && plan.recommendedUpgrade !== plan.minimumUpgrade
                                            ? ` → ${plan.recommendedUpgrade}`
                                            : ""}
                                        </span>
                                        {plan.stopAt ? <span className="tiny faint">stop at {plan.stopAt}</span> : null}
                                        {plan.ownedState ? (
                                          <span className="tiny faint truncate" title={plan.ownedState}>
                                            {plan.ownedState}
                                          </span>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="tiny faint" style={{ margin: "8px 0 0" }}>
                                    No upgrade plan rows for this node.
                                  </p>
                                )}
                              </>
                            ) : (
                              <Callout tone="warning" icon="lock">
                                This is a certified destination node without a separate progression loadout row. Use the
                                certified profile loadouts above for its gear.
                              </Callout>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <EmptyState
          title="No certified profile"
          description="The selected archetype has no profile for the requested level."
          icon="layers"
          action={
            <Button variant="primary" onClick={() => selectArchetype(selected.id, 150)}>
              Show Level 150
            </Button>
          }
        />
      )}
    </div>
  );
}
