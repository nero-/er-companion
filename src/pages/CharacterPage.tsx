import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Badge,
  Button,
  Callout,
  Disclosure,
  EmptyState,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Select,
  StatCompare,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import type { IconName } from "../components/Icon";
import { EquipmentPicker } from "../components/EquipmentPicker";
import type { EquipmentKind } from "../components/EquipmentPicker";
import {
  applyProfile,
  applyStatSnapshot,
  deleteStatSnapshot,
  renameCharacter,
  saveStatSnapshot,
  setClass,
  setEquipment,
  setItemOwned,
  setStat,
  useActiveCharacter,
  useActiveJourney,
} from "../lib/store";
import { ARCHETYPES, PROFILE_BY_ID, SPELL_PACKAGE_BY_ID, UPGRADES_BY_NODE } from "../lib/data";
import {
  equipmentOwnedCount,
  isEquipmentOwned,
  itemForEquipmentName,
  loadoutsForProfile,
  nearestTechNode,
  profilesForArchetype,
} from "../lib/selectors";
import { CLASSES, CLASS_BY_ID, STAT_LABELS, STAT_ORDER, levelFromStats } from "../lib/classes";
import { equipmentModeLabel, formatDate, itemGroupIcon } from "../lib/format";
import { navigate } from "../lib/router";
import type { Character, EquipmentState, StatKey, Stats } from "../lib/types";
import "./builds.css";

type EquipmentSlot = keyof EquipmentState;

interface PickerTarget {
  slot: EquipmentSlot;
  index?: number;
  title: string;
  kind: EquipmentKind;
}

const CERTIFIED = ARCHETYPES.filter((archetype) => archetype.familyRole !== "Historical Redirect");

const KIND_BY_SLOT: Record<EquipmentSlot, EquipmentKind> = {
  mainWeapon: "weapon",
  secondaryWeapon: "weapon",
  offhand: "weapon",
  shield: "shield",
  armor: "armor",
  talismans: "talisman",
  spells: "spell",
  physick: "physick",
};

const ARMOR_SLOT_NAMES = ["Head", "Chest", "Arms", "Legs"];

function padSlots(values: string[], length: number): string[] {
  const next = values.slice(0, length);
  while (next.length < length) next.push("");
  return next;
}

function uniqueEquipmentNames(names: string[]): string[] {
  return [...new Set(names.filter((name) => name && !name.toLowerCase().startsWith("empty") && name !== "—"))];
}

function equipmentSlotValue(equipment: EquipmentState, slot: EquipmentSlot, index = 0): string {
  switch (slot) {
    case "armor":
      return equipment.armor[index] ?? "";
    case "talismans":
      return equipment.talismans[index] ?? "";
    case "spells":
      return equipment.spells[index] ?? "";
    case "physick":
      return equipment.physick[index] ?? "";
    case "mainWeapon":
      return equipment.mainWeapon;
    case "secondaryWeapon":
      return equipment.secondaryWeapon;
    case "offhand":
      return equipment.offhand;
    case "shield":
      return equipment.shield;
    default:
      return "";
  }
}

interface SlotCardProps {
  character: Character;
  label: string;
  value: string;
  icon: IconName;
  onPick: () => void;
  onClear: () => void;
}

function SlotCard({ character, label, value, icon, onPick, onClear }: SlotCardProps) {
  const item = itemForEquipmentName(value);
  const owned = isEquipmentOwned(character, value);
  return (
    <div className={`slot-card ${value ? "" : "is-empty"}`.trim()}>
      <div className="row-between">
        <span className="slot-label">{label}</span>
        {value ? (
          <Badge tone={!item ? "default" : owned ? "success" : "warning"}>
            {!item ? "Not indexed" : owned ? "Owned" : "Missing"}
          </Badge>
        ) : null}
      </div>
      <div className="slot-main">
        <span className="slot-glyph">
          <Icon name={item ? itemGroupIcon(item.group) : icon} size={15} />
        </span>
        <span className="slot-name">
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
            value || "Empty slot"
          )}
        </span>
      </div>
      <div className="slot-actions">
        <Button size="sm" variant="ghost" icon="search" onClick={onPick} aria-label={`Choose ${label}`}>
          Choose
        </Button>
        {value ? (
          <Button size="sm" variant="ghost" icon="x" onClick={onClear} aria-label={`Clear ${label}`} />
        ) : null}
      </div>
    </div>
  );
}

export function CharacterPage() {
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const equipment = character.equipment;
  const level = levelFromStats(character.stats);
  const appliedProfile = character.profileId ? PROFILE_BY_ID[character.profileId] : undefined;
  const classEntry = CLASS_BY_ID[character.classId];
  const [nameDraft, setNameDraft] = useState(character.name);
  const [statDrafts, setStatDrafts] = useState<Record<StatKey, string>>({
    vig: String(character.stats.vig),
    mnd: String(character.stats.mnd),
    end: String(character.stats.end),
    str: String(character.stats.str),
    dex: String(character.stats.dex),
    int: String(character.stats.int),
    fai: String(character.stats.fai),
    arc: String(character.stats.arc),
  });
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [draft, setDraft] = useState<Stats | null>(null);

  const [profileArchetype, setProfileArchetype] = useState(
    CERTIFIED.find((entry) => entry.id === character.archetypeId)?.id ?? CERTIFIED[0]?.id ?? "",
  );
  const [profileLevel, setProfileLevel] = useState(
    appliedProfile?.level ?? profilesForArchetype(character.archetypeId)[0]?.level ?? 150,
  );
  const [recArchetype, setRecArchetype] = useState(
    CERTIFIED.find((entry) => entry.id === character.archetypeId)?.id ?? CERTIFIED[0]?.id ?? "",
  );

  useEffect(() => {
    setNameDraft(character.name);
  }, [character.name]);

  useEffect(() => {
    const next = CERTIFIED.find((entry) => entry.id === character.archetypeId);
    if (!next) return;
    setProfileArchetype(next.id);
    setRecArchetype(next.id);
    const applied = PROFILE_BY_ID[character.profileId];
    if (applied) setProfileLevel(applied.level);
  }, [character.archetypeId, character.profileId]);

  useEffect(() => {
    setStatDrafts({
      vig: String(character.stats.vig),
      mnd: String(character.stats.mnd),
      end: String(character.stats.end),
      str: String(character.stats.str),
      dex: String(character.stats.dex),
      int: String(character.stats.int),
      fai: String(character.stats.fai),
      arc: String(character.stats.arc),
    });
  }, [character.stats]);

  const profileOptions = profilesForArchetype(profileArchetype);
  const chosenProfile = profileOptions.find((entry) => entry.level === profileLevel) ?? profileOptions[0];
  const signatureLoadout = chosenProfile
    ? loadoutsForProfile(chosenProfile.id).find((entry) => entry.type === "Signature") ??
      loadoutsForProfile(chosenProfile.id)[0]
    : undefined;
  const signatureGearNames = signatureLoadout
    ? uniqueEquipmentNames([
        signatureLoadout.mainWeapon,
        signatureLoadout.secondaryWeapon,
        signatureLoadout.offhand,
        signatureLoadout.shield,
        ...signatureLoadout.armor,
        ...signatureLoadout.talismans,
        ...signatureLoadout.physick,
        ...(SPELL_PACKAGE_BY_ID[signatureLoadout.packageId]?.slots ?? []),
      ])
    : [];
  const signatureOwned = equipmentOwnedCount(
    character,
    signatureGearNames.filter((name) => Boolean(itemForEquipmentName(name))),
  );
  const signatureUnindexed = signatureGearNames.filter((name) => !itemForEquipmentName(name)).length;

  const plannedNames = uniqueEquipmentNames([
    equipment.mainWeapon,
    equipment.secondaryWeapon,
    equipment.offhand,
    equipment.shield,
    ...equipment.armor,
    ...equipment.talismans,
    ...equipment.spells,
    ...equipment.physick,
  ]);
  const cataloguedPlanned = plannedNames.filter((name) => Boolean(itemForEquipmentName(name)));
  const unindexedPlanned = plannedNames.filter((name) => !itemForEquipmentName(name));
  const plannedOwned = equipmentOwnedCount(character, cataloguedPlanned);
  const missingNames = cataloguedPlanned.filter((name) => !isEquipmentOwned(character, name));

  const armorSlots = padSlots(equipment.armor, 4);
  const talismanSlots = padSlots(equipment.talismans, 4);
  const spellSlots = padSlots(equipment.spells, 10);
  const physickSlots = padSlots(equipment.physick, 2);

  const recommendation = useMemo(
    () => nearestTechNode(recArchetype, level),
    [recArchetype, level],
  );
  const recommendationGear = recommendation?.loadout
    ? uniqueEquipmentNames([
        recommendation.loadout.primaryWeapon,
        recommendation.loadout.secondaryWeapon,
        recommendation.loadout.catalyst,
        ...recommendation.loadout.armor,
        ...recommendation.loadout.talismans,
        ...recommendation.loadout.physick,
      ])
    : [];
  const cataloguedRecommendationGear = recommendationGear.filter((name) => Boolean(itemForEquipmentName(name)));
  const recommendationUnindexed = recommendationGear.length - cataloguedRecommendationGear.length;
  const recommendationOwned = equipmentOwnedCount(character, cataloguedRecommendationGear);
  const recommendationUpgrades = recommendation ? UPGRADES_BY_NODE[recommendation.node.id] ?? [] : [];

  const writeSlot = (slot: EquipmentSlot, index: number, value: string) => {
    switch (slot) {
      case "mainWeapon":
        setEquipment({ mainWeapon: value });
        break;
      case "secondaryWeapon":
        setEquipment({ secondaryWeapon: value });
        break;
      case "offhand":
        setEquipment({ offhand: value });
        break;
      case "shield":
        setEquipment({ shield: value });
        break;
      case "armor": {
        const next = padSlots(equipment.armor, 4);
        next[index] = value;
        setEquipment({ armor: next });
        break;
      }
      case "talismans": {
        const next = padSlots(equipment.talismans, 4);
        next[index] = value;
        setEquipment({ talismans: next });
        break;
      }
      case "spells": {
        const next = padSlots(equipment.spells, 10);
        next[index] = value;
        setEquipment({ spells: next });
        break;
      }
      case "physick": {
        const next = padSlots(equipment.physick, 2);
        next[index] = value;
        setEquipment({ physick: next });
        break;
      }
      default:
        break;
    }
  };

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.push("Enter a character name before saving.", "error");
      return;
    }
    if (trimmed === character.name) return;
    renameCharacter(trimmed);
    setNameDraft(trimmed);
    toast.push(`Character renamed to ${trimmed}.`, "success");
  };

  const respec = () => {
    if (!classEntry) return;
    setClass(character.classId);
    toast.push(
      `Stats reset to the ${classEntry.name} origin base. The certified profile selection is cleared; equipment is unchanged.`,
      "success",
    );
  };

  const clearEquipment = () => {
    setEquipment({
      mainWeapon: "",
      secondaryWeapon: "",
      offhand: "",
      shield: "",
      armor: ["", "", "", ""],
      talismans: ["", "", "", ""],
      spells: Array.from({ length: 10 }, () => ""),
      physick: ["", ""],
    });
    toast.push("Equipment planner cleared. Collection ownership is unchanged.", "success");
  };

  const applyCertified = () => {
    if (!chosenProfile) return;
    const missing = signatureOwned.total - signatureOwned.owned;
    applyProfile(chosenProfile.id);
    setProfileArchetype(chosenProfile.archetypeId);
    setProfileLevel(chosenProfile.level);
    setRecArchetype(chosenProfile.archetypeId);
    toast.push(
      `Applied ${chosenProfile.archetype} · Level ${chosenProfile.level}. Stats and signature gear updated${
        missing > 0 ? `; ${missing} signature pieces are not marked owned.` : "."
      }`,
      "success",
    );
  };

  const applyRecommendation = () => {
    if (!recommendation || !recommendation.loadout) return;
    const loadout = recommendation.loadout;
    setEquipment({
      mainWeapon: loadout.primaryWeapon,
      secondaryWeapon: loadout.secondaryWeapon,
      offhand: loadout.catalyst,
      armor: padSlots(loadout.armor, 4),
      talismans: padSlots(loadout.talismans, 4),
      physick: padSlots(loadout.physick, 2),
    });
    toast.push(
      `Applied the ${recommendation.node.name} progression gear as custom equipment. The shield and spell slots were left unchanged.`,
      "success",
    );
  };

  const currentPickerValue = picker ? equipmentSlotValue(equipment, picker.slot, picker.index) : "";
  const currentPickerItem = currentPickerValue ? itemForEquipmentName(currentPickerValue) : undefined;

  const saveCurrentSpread = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = saveStatSnapshot(snapshotName);
    if (!saved) {
      toast.push("No active character to save a spread for.", "error");
      return;
    }
    setSnapshotName("");
    toast.push(`Saved “${saved.name}” · derived Level ${levelFromStats(saved.stats)}.`, "success");
  };

  const updateDraft = (key: StatKey, value: string) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const parsed = Number(value);
      if (value.trim() === "" || !Number.isFinite(parsed)) return { ...previous, [key]: previous[key] };
      return { ...previous, [key]: Math.max(1, Math.min(99, Math.floor(parsed))) };
    });
  };

  const applyDraft = () => {
    if (!draft) return;
    // Draft is local-only until this point; setStat writes each key and clears the profile once.
    for (const key of STAT_ORDER) setStat(key, draft[key]);
    setDraft(null);
    toast.push(
      `Experiment applied to ${character.name} · derived Level ${levelFromStats(draft)}. The certified profile selection is cleared.`,
      "success",
    );
  };

  const plannedProfileStats = chosenProfile?.stats;

  return (
    <div className="page character-page">
      <PageHeader
        eyebrow={`${journey.label} · ${classEntry?.name ?? "Character"}`}
        title={character.name}
        description={
          <>
            Derive the character level from the eight stats, apply a certified profile, and plan every equipment slot.
            Level {level} is computed from the stat total; no softcap or legality claims are made beyond the content pack.
          </>
        }
        actions={
          <>
            <Button icon="layers" onClick={() => navigate("/builds")}>
              Browse builds
            </Button>
            <Button variant="ghost" icon="bag" onClick={() => navigate("/collection")}>
              Open collection
            </Button>
          </>
        }
      />

      <div className="char-top">
        <section className="card card-pad">
          <SectionTitle title="Identity" note={equipmentModeLabel(character.equipmentMode)} />
          <form className="stack" onSubmit={saveName} style={{ gap: 10 }}>
            <label className="field">
              <span className="field-label">Character name</span>
              <div className="name-row">
                <input
                  className="input"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  aria-label="Character name"
                  autoComplete="off"
                />
                <Button type="submit" icon="check" disabled={!nameDraft.trim() || nameDraft.trim() === character.name}>
                  Save
                </Button>
              </div>
            </label>
          </form>
          <div className="divider" />
          <Select
            label="Class"
            value={character.classId}
            onChange={(event) => {
              const next = CLASSES.find((entry) => entry.id === event.target.value);
              if (!next) return;
              setClass(next.id);
              toast.push(
                `Class set to ${next.name}. Stats reset to the origin base and the certified profile selection is cleared.`,
                "success",
              );
            }}
          >
            {CLASSES.map((entry) => (
              <option value={entry.id} key={entry.id}>
                {entry.name} · Level {entry.level}
              </option>
            ))}
          </Select>
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            {classEntry?.blurb ?? "No class blurb is present for this class id."}
          </p>
          <div className="char-level-row">
            <div>
              <div className="tiny faint">Derived level</div>
              <div className="char-level">{level}</div>
            </div>
            <div>
              <div className="tiny faint">Class base</div>
              <div className="char-level-sub">{classEntry ? `Level ${classEntry.level}` : "Not in CLASSES"}</div>
            </div>
            <div>
              <div className="tiny faint">Certified profile</div>
              <div className="char-level-sub">
                {appliedProfile ? `${appliedProfile.archetype} · ${appliedProfile.level}` : "None applied"}
              </div>
            </div>
          </div>
          {appliedProfile ? (
            <Badge tone={level === appliedProfile.calculatedLevel ? "success" : "warning"}>
              {level === appliedProfile.calculatedLevel
                ? `Matches certified level ${appliedProfile.calculatedLevel}`
                : `Stats diverge from certified level ${appliedProfile.calculatedLevel}`}
            </Badge>
          ) : null}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Button variant="danger" icon="refresh" onClick={respec} disabled={!classEntry}>
              Respec / clear build
            </Button>
          </div>
          <p className="tiny faint" style={{ margin: "8px 0 0" }}>
            Respec restores the class origin stats and clears the certified profile; equipment is untouched. Use the
            equipment planner below to clear gear separately.
          </p>
        </section>

        <section className="card card-pad">
          <SectionTitle title="Stats" note="Direct inputs are clamped to 1–99 by the store" />
          <div className="stat-editor">
            {STAT_ORDER.map((key) => {
              const label = STAT_LABELS[key];
              return (
                <div className="stat-edit" key={key}>
                  <label htmlFor={`stat-${key}`}>{label}</label>
                  <div className="stat-controls">
                    <button
                      type="button"
                      className="stat-step"
                      onClick={() => setStat(key, character.stats[key] - 1)}
                      aria-label={`Decrease ${label}`}
                    >
                      <Icon name="minus" size={13} />
                    </button>
                    <input
                      id={`stat-${key}`}
                      className="stat-input"
                      type="number"
                      min={1}
                      max={99}
                      value={statDrafts[key]}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setStatDrafts((previous) => ({ ...previous, [key]: raw }));
                        if (raw.trim() === "") return;
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) setStat(key, parsed);
                      }}
                      onBlur={() =>
                        setStatDrafts((previous) => ({ ...previous, [key]: String(character.stats[key]) }))
                      }
                    />
                    <button
                      type="button"
                      className="stat-step"
                      onClick={() => setStat(key, character.stats[key] + 1)}
                      aria-label={`Increase ${label}`}
                    >
                      <Icon name="plus" size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="divider" />
          <div className="row-between wrap">
            <span className="small muted">
              Stat total {STAT_ORDER.reduce((total, key) => total + character.stats[key], 0)} · derived level {level}
            </span>
            <Badge tone={appliedProfile ? "accent" : "default"}>
              {appliedProfile?.status ?? "Custom stat spread"}
            </Badge>
          </div>
          <p className="tiny faint" style={{ margin: "8px 0 0" }}>
            Level is the stat total minus 79, matching levelFromStats. The planner does not assert that a spread is
            legal, optimal, or inside any softcap. Changing a stat clears the profile selection until a certified
            profile is applied again.
          </p>
        </section>
      </div>

      <div className="grid-2 char-summary-grid">
        <section className="card card-pad">
          <SectionTitle
            title="Apply certified profile"
            note={chosenProfile ? `Level ${chosenProfile.level} · ${chosenProfile.startingClass}` : "No profile"}
          />
          <div className="grid-2" style={{ gap: 10 }}>
            <Select
              label="Archetype"
              value={profileArchetype}
              onChange={(event) => {
                const nextId = event.target.value;
                setProfileArchetype(nextId);
                setProfileLevel(profilesForArchetype(nextId)[0]?.level ?? 150);
              }}
            >
              {CERTIFIED.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
            <Select
              label="Level"
              value={chosenProfile?.level ?? ""}
              onChange={(event) => setProfileLevel(Number(event.target.value))}
              disabled={profileOptions.length === 0}
            >
              {profileOptions.map((entry) => (
                <option key={entry.id} value={entry.level}>
                  Level {entry.level} · {entry.startingClass}
                </option>
              ))}
            </Select>
          </div>
          {chosenProfile ? (
            <>
              <div className="stat-grid" style={{ marginTop: 10 }}>
                {STAT_ORDER.map((key) => (
                  <div className="stat-cell" key={key}>
                    <div className="k">{key.toUpperCase()}</div>
                    <div className="v">{chosenProfile.stats[key]}</div>
                  </div>
                ))}
              </div>
              <dl className="kv" style={{ marginTop: 10 }}>
                <dt>Primary</dt>
                <dd>{chosenProfile.primaryStat}</dd>
                <dt>Secondary</dt>
                <dd>{chosenProfile.secondaryStat}</dd>
                <dt>Signature gear</dt>
                <dd>
                  {signatureOwned.owned}/{signatureOwned.total} indexed owned
                  {signatureUnindexed > 0 ? ` · ${signatureUnindexed} not indexed` : ""}
                  {signatureLoadout ? ` · ${signatureLoadout.mainWeapon}` : ""}
                </dd>
                <dt>Status</dt>
                <dd>{chosenProfile.status}</dd>
              </dl>
              {classEntry && chosenProfile.startingClass !== classEntry.name ? (
                <p className="tiny faint" style={{ margin: "8px 0 0" }}>
                  This profile starts from {chosenProfile.startingClass}; the character class stays {classEntry.name}
                  unless you change it. Applying the profile writes the certified stats regardless.
                </p>
              ) : null}
              {signatureOwned.owned < signatureOwned.total ? (
                <Callout tone="warning" icon="alert">
                  {signatureOwned.total - signatureOwned.owned} indexed signature pieces are not marked owned.
                  Applying the profile writes the certified gear regardless; ownership stays unchanged.
                </Callout>
              ) : null}
              <div className="row wrap" style={{ marginTop: 10 }}>
                <Button variant="primary" icon="check" onClick={applyCertified}>
                  Apply profile
                </Button>
                <Button
                  variant="ghost"
                  icon="layers"
                  onClick={() =>
                    navigate(`/builds?archetype=${encodeURIComponent(chosenProfile.archetypeId)}&level=${chosenProfile.level}`)
                  }
                >
                  Open in builds
                </Button>
              </div>
            </>
          ) : (
            <EmptyState title="No profile at this level" description="No certified profile rows are available for this archetype." icon="layers" />
          )}
        </section>

        <section className="card card-pad">
          <SectionTitle
            title="Stat spreads"
            note={`${character.statSnapshots.length} saved · current derives Level ${level}`}
          />
          <form className="stack" onSubmit={saveCurrentSpread} style={{ gap: 8 }}>
            <label className="field">
              <span className="field-label">Save current spread</span>
              <div className="name-row">
                <input
                  className="input"
                  value={snapshotName}
                  onChange={(event) => setSnapshotName(event.target.value)}
                  placeholder={`Spread ${character.statSnapshots.length + 1}`}
                  aria-label="Saved spread name"
                  autoComplete="off"
                />
                <Button type="submit" icon="download">
                  Save current spread
                </Button>
              </div>
            </label>
            <p className="tiny faint" style={{ margin: 0 }}>
              Saves the eight current stats with the derived level. Equipment and ownership are not part of a spread.
            </p>
          </form>

          {character.statSnapshots.length === 0 ? (
            <p className="small muted" style={{ marginTop: 10 }}>
              No spreads saved yet. Save the current spread to compare or return to it later.
            </p>
          ) : (
            <ul className="spread-list">
              {character.statSnapshots.map((snapshot) => (
                <li className="spread-row" key={snapshot.id}>
                  <div className="grow">
                    <div className="spread-name">{snapshot.name}</div>
                    <div className="tiny faint">
                      Level {levelFromStats(snapshot.stats)} · {formatDate(snapshot.createdAt)}
                      {snapshot.note ? ` · ${snapshot.note}` : ""}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <Button
                      size="sm"
                      icon="check"
                      onClick={() => {
                        applyStatSnapshot(snapshot.id);
                        setDraft(null);
                        toast.push(`Applied “${snapshot.name}” to ${character.name}.`, "success");
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="x"
                      aria-label={`Delete ${snapshot.name}`}
                      onClick={() => {
                        deleteStatSnapshot(snapshot.id);
                        toast.push(`Deleted “${snapshot.name}”.`, "success");
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="divider" />

          <div className="row-between wrap">
            <div>
              <div className="subheading">Experiment</div>
              <p className="tiny faint" style={{ margin: "2px 0 0", maxWidth: 460 }}>
                Plan a spread without touching the character. Nothing is written until you apply it.
              </p>
            </div>
            {draft ? (
              <Button size="sm" variant="ghost" icon="x" onClick={() => setDraft(null)}>
                Close draft
              </Button>
            ) : (
              <Button size="sm" icon="spark" onClick={() => setDraft({ ...character.stats })}>
                Start experiment
              </Button>
            )}
          </div>

          {draft ? (
            <>
              <div className="stat-editor experiment-editor">
                {STAT_ORDER.map((key) => (
                  <div className="stat-edit" key={key}>
                    <label htmlFor={`draft-${key}`}>{STAT_LABELS[key]}</label>
                    <div className="stat-controls">
                      <button
                        type="button"
                        className="stat-step"
                        onClick={() => updateDraft(key, String(draft[key] - 1))}
                        aria-label={`Decrease draft ${STAT_LABELS[key]}`}
                      >
                        <Icon name="minus" size={13} />
                      </button>
                      <input
                        id={`draft-${key}`}
                        className="stat-input"
                        type="number"
                        min={1}
                        max={99}
                        value={draft[key]}
                        onChange={(event) => updateDraft(key, event.target.value)}
                      />
                      <button
                        type="button"
                        className="stat-step"
                        onClick={() => updateDraft(key, String(draft[key] + 1))}
                        aria-label={`Increase draft ${STAT_LABELS[key]}`}
                      >
                        <Icon name="plus" size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <StatCompare
                rows={STAT_ORDER.map((key) => ({
                  key,
                  label: STAT_LABELS[key],
                  current: character.stats[key],
                  target: draft[key],
                }))}
              />
              <div className="row-between wrap" style={{ marginTop: 10 }}>
                <span className="tiny faint">
                  Draft derives Level {levelFromStats(draft)} · total{" "}
                  {STAT_ORDER.reduce((total, key) => total + draft[key], 0)}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="ghost" icon="refresh" onClick={() => setDraft({ ...character.stats })}>
                    Reset draft
                  </Button>
                  <Button size="sm" variant="primary" icon="check" onClick={applyDraft}>
                    Apply to character
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>

      <section className="card card-pad current-vs-planned" style={{ marginBottom: 16 }}>
        <SectionTitle
          title="Current vs planned"
          note={
            chosenProfile
              ? `${chosenProfile.archetype} · Level ${chosenProfile.level}`
              : "No certified profile selected"
          }
        />
        <div className="current-vs-planned-grid">
          <div>
            <div className="tiny faint" style={{ marginBottom: 6 }}>
              Current spread → planned profile
            </div>
            {plannedProfileStats ? (
              <StatCompare
                rows={STAT_ORDER.map((key) => ({
                  key,
                  label: STAT_LABELS[key],
                  current: character.stats[key],
                  target: plannedProfileStats[key],
                }))}
              />
            ) : (
              <EmptyState
                title="No planned profile"
                description="Pick an archetype and level to compare against a certified spread."
                icon="layers"
              />
            )}
            {plannedProfileStats ? (
              <p className="tiny faint" style={{ margin: "8px 0 0" }}>
                Planned spread derives Level {levelFromStats(plannedProfileStats)} · current derives Level {level}.
                Nothing is written until you apply the profile.
              </p>
            ) : null}
          </div>
          <Disclosure
            title="Gear coverage"
            summary={`${plannedOwned.owned}/${plannedOwned.total} indexed owned`}
            tone="muted"
            defaultOpen={missingNames.length > 0}
          >
            <ProgressBar
              value={plannedOwned.total ? (plannedOwned.owned / plannedOwned.total) * 100 : 0}
              label="Planned indexed gear marked owned"
              detail={`${missingNames.length} indexed missing`}
              tone={plannedOwned.total > 0 && plannedOwned.owned === plannedOwned.total ? "success" : "accent"}
            />
            {unindexedPlanned.length > 0 ? (
              <p className="tiny faint" style={{ margin: "6px 0 0" }}>
                {unindexedPlanned.length} planned {unindexedPlanned.length === 1 ? "entry has" : "entries have"} no
                item-catalogue match; ownership cannot be determined for those names and they are excluded from the
                count.
              </p>
            ) : null}
            {plannedNames.length === 0 ? (
              <p className="small muted" style={{ marginTop: 10 }}>
                No equipment planned yet. Use the planner below or apply a certified profile.
              </p>
            ) : cataloguedPlanned.length === 0 ? (
              <p className="small muted" style={{ marginTop: 10 }}>
                None of the planned names match the item catalogue, so ownership cannot be determined.
              </p>
            ) : missingNames.length === 0 ? (
              <Callout tone="success" icon="check">
                Every indexed planned slot is marked owned in the collection.
              </Callout>
            ) : (
              <>
                <div className="tag-list" style={{ marginTop: 10 }}>
                  {missingNames.slice(0, 12).map((name) => (
                    <span className="own-chip is-missing" key={name} title="Not in collection">
                      <span className="owned-dot" aria-hidden="true" />
                      {name}
                    </span>
                  ))}
                  {missingNames.length > 12 ? (
                    <span className="own-chip">+{missingNames.length - 12} more</span>
                  ) : null}
                </div>
                <Callout tone="warning" icon="alert">
                  {missingNames.length} indexed planned piece{missingNames.length === 1 ? " is" : "s are"} not marked
                  owned. The planner records intent; it does not claim the loadout is playable.
                </Callout>
              </>
            )}
            <div className="row-between wrap" style={{ marginTop: 10 }}>
              <span className="tiny faint">
                Unique pieces {plannedNames.length} · mode {equipmentModeLabel(character.equipmentMode)}
              </span>
              <Button size="sm" variant="ghost" icon="bag" onClick={() => navigate("/collection")}>
                Mark gear in collection
              </Button>
            </div>
          </Disclosure>
        </div>
      </section>

      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <SectionTitle
          title="Equipment planner"
          note={`${equipmentModeLabel(character.equipmentMode)} · changes save as custom`}
          actions={
            <Button size="sm" variant="ghost" icon="x" onClick={clearEquipment}>
              Clear all slots
            </Button>
          }
        />

        <div className="planner-group">
          <div className="row-between wrap">
            <h3 className="planner-heading">Weapons</h3>
            <span className="tiny faint">Main weapon, secondary, offhand, shield</span>
          </div>
          <div className="slot-grid">
            <SlotCard
              character={character}
              label="Main weapon"
              value={equipment.mainWeapon}
              icon="sword"
              onPick={() => setPicker({ slot: "mainWeapon", title: "Choose main weapon", kind: "weapon" })}
              onClear={() => {
                writeSlot("mainWeapon", 0, "");
                toast.push("Main weapon cleared.", "success");
              }}
            />
            <SlotCard
              character={character}
              label="Secondary weapon"
              value={equipment.secondaryWeapon}
              icon="sword"
              onPick={() => setPicker({ slot: "secondaryWeapon", title: "Choose secondary weapon", kind: "weapon" })}
              onClear={() => {
                writeSlot("secondaryWeapon", 0, "");
                toast.push("Secondary weapon cleared.", "success");
              }}
            />
            <SlotCard
              character={character}
              label="Offhand"
              value={equipment.offhand}
              icon="spark"
              onPick={() => setPicker({ slot: "offhand", title: "Choose offhand weapon or tool", kind: "weapon" })}
              onClear={() => {
                writeSlot("offhand", 0, "");
                toast.push("Offhand cleared.", "success");
              }}
            />
            <SlotCard
              character={character}
              label="Shield"
              value={equipment.shield}
              icon="shield"
              onPick={() => setPicker({ slot: "shield", title: "Choose shield", kind: "shield" })}
              onClear={() => {
                writeSlot("shield", 0, "");
                toast.push("Shield cleared.", "success");
              }}
            />
          </div>
        </div>

        <div className="planner-group">
          <div className="row-between wrap">
            <h3 className="planner-heading">Armor</h3>
            <span className="tiny faint">Four slots</span>
          </div>
          <div className="slot-grid">
            {armorSlots.map((value, index) => (
              <SlotCard
                key={`armor-${index}`}
                character={character}
                label={ARMOR_SLOT_NAMES[index] ?? `Armor ${index + 1}`}
                value={value}
                icon="helmet"
                onPick={() =>
                  setPicker({
                    slot: "armor",
                    index,
                    title: `Choose ${ARMOR_SLOT_NAMES[index] ?? `armor ${index + 1}`} armor`,
                    kind: "armor",
                  })
                }
                onClear={() => {
                  writeSlot("armor", index, "");
                  toast.push(`Armor slot ${index + 1} cleared.`, "success");
                }}
              />
            ))}
          </div>
        </div>

        <div className="planner-group">
          <div className="row-between wrap">
            <h3 className="planner-heading">Talismans</h3>
            <span className="tiny faint">Four slots</span>
          </div>
          <div className="slot-grid">
            {talismanSlots.map((value, index) => (
              <SlotCard
                key={`talisman-${index}`}
                character={character}
                label={`Talisman ${index + 1}`}
                value={value}
                icon="talisman"
                onPick={() =>
                  setPicker({ slot: "talismans", index, title: `Choose talisman ${index + 1}`, kind: "talisman" })
                }
                onClear={() => {
                  writeSlot("talismans", index, "");
                  toast.push(`Talisman slot ${index + 1} cleared.`, "success");
                }}
              />
            ))}
          </div>
        </div>

        <div className="planner-group">
          <div className="row-between wrap">
            <h3 className="planner-heading">Spells</h3>
            <span className="tiny faint">Ten memory slots</span>
          </div>
          <div className="slot-grid slot-grid-compact">
            {spellSlots.map((value, index) => (
              <SlotCard
                key={`spell-${index}`}
                character={character}
                label={`Slot ${index + 1}`}
                value={value}
                icon="spark"
                onPick={() =>
                  setPicker({ slot: "spells", index, title: `Choose spell for slot ${index + 1}`, kind: "spell" })
                }
                onClear={() => {
                  writeSlot("spells", index, "");
                  toast.push(`Spell slot ${index + 1} cleared.`, "success");
                }}
              />
            ))}
          </div>
        </div>

        <div className="planner-group">
          <div className="row-between wrap">
            <h3 className="planner-heading">Physick</h3>
            <span className="tiny faint">Two crystal tears</span>
          </div>
          <div className="slot-grid">
            {physickSlots.map((value, index) => (
              <SlotCard
                key={`physick-${index}`}
                character={character}
                label={`Tear ${index + 1}`}
                value={value}
                icon="flask"
                onPick={() =>
                  setPicker({ slot: "physick", index, title: `Choose crystal tear ${index + 1}`, kind: "physick" })
                }
                onClear={() => {
                  writeSlot("physick", index, "");
                  toast.push(`Physick slot ${index + 1} cleared.`, "success");
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="card card-pad">
        <SectionTitle
          title="Nearest progression recommendation"
          note={recommendation ? recommendation.node.stage : "No node"}
        />
        <div className="row-between wrap recommendation-head">
          <div className="row wrap">
            <Select
              label="Archetype"
              value={recArchetype}
              onChange={(event) => setRecArchetype(event.target.value)}
            >
              {CERTIFIED.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
            <div className="rec-level">
              <div className="tiny faint">Current derived level</div>
              <div className="char-level">{level}</div>
            </div>
          </div>
          {recommendation ? (
            <div className="row wrap">
              <Badge tone="accent">{recommendation.node.type}</Badge>
              <Badge>Target {recommendation.node.levelTarget}</Badge>
              <Badge tone={recommendationOwned.owned === recommendationOwned.total ? "success" : "warning"}>
                {recommendationOwned.owned}/{recommendationOwned.total} indexed owned
              </Badge>
              {recommendationUnindexed > 0 ? <Badge>{recommendationUnindexed} not indexed</Badge> : null}
            </div>
          ) : null}
        </div>

        {recommendation && recommendation.loadout ? (
          <>
            <h3 className="rec-title">{recommendation.node.name}</h3>
            <p className="small muted" style={{ margin: "2px 0 10px" }}>
              Nearest loadout-bearing tech node at or below level {level}.{" "}
              {level < recommendation.node.levelTarget
                ? `The selected level is below this node's ${recommendation.node.levelTarget} target; this is the first available row.`
                : `Node target ${recommendation.node.levelTarget}, range ${recommendation.node.levelMin}–${recommendation.node.levelMax}.`}
            </p>
            <div className="grid-2 rec-grid">
              <dl className="kv">
                <dt>Primary</dt>
                <dd>{recommendation.loadout.primaryWeapon || "—"}</dd>
                <dt>Secondary</dt>
                <dd>{recommendation.loadout.secondaryWeapon || "—"}</dd>
                <dt>Catalyst</dt>
                <dd>{recommendation.loadout.catalyst || "—"}</dd>
                <dt>Armor</dt>
                <dd>{recommendation.loadout.armor.join(" · ") || "—"}</dd>
                <dt>Talismans</dt>
                <dd>{recommendation.loadout.talismans.join(" · ") || "—"}</dd>
                <dt>Physick</dt>
                <dd>{recommendation.loadout.physick.join(" · ") || "—"}</dd>
              </dl>
              <div>
                <div className="tiny faint" style={{ marginBottom: 4 }}>
                  Upgrade plan
                </div>
                {recommendationUpgrades.length > 0 ? (
                  recommendationUpgrades.map((plan) => (
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
                    </div>
                  ))
                ) : (
                  <p className="tiny faint" style={{ margin: 0 }}>
                    No upgrade plan rows for this node.
                  </p>
                )}
              </div>
            </div>
            {recommendation.loadout.spellPackage ? (
              <div className="rec-package">
                <div className="row-between wrap">
                  <span className="tiny faint">Spell package from progression row</span>
                  <Badge>Read-only</Badge>
                </div>
                <div className="small">{recommendation.loadout.spellPackage}</div>
                <div className="tiny faint">
                  Reference only. Applying recommended gear does not change the ten spell slots.
                </div>
              </div>
            ) : null}
            <div className="row-between wrap recommendation-actions">
              <span className="tiny faint">
                Applying writes primary, secondary, catalyst, armor, talismans and physick from the progression row. The
                shield and spell slots stay as-is; the result is custom, not a certified loadout.
              </span>
              <Button variant="primary" icon="check" onClick={applyRecommendation}>
                Apply recommended gear
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            title="No progression recommendation"
            description="No loadout-bearing progression node was found for this archetype and level."
            icon="layers"
          />
        )}
      </section>

      <EquipmentPicker
        open={Boolean(picker)}
        title={picker?.title ?? "Choose equipment"}
        kind={picker?.kind ?? "weapon"}
        currentItemId={currentPickerItem?.id}
        owned={character.items}
        onClose={() => setPicker(null)}
        onSelect={(name) => {
          if (!picker) return;
          writeSlot(picker.slot, picker.index ?? 0, name);
          toast.push(name ? `${name} equipped.` : "Slot cleared.", "success");
        }}
        onToggleOwned={(itemId, owned) => setItemOwned(itemId, owned)}
      />
    </div>
  );
}
