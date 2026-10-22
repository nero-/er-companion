import { useEffect, useRef, useState } from "react";
import { Badge, Button, Callout, Checkbox, Modal, PageHeader, SectionTitle, Select, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import {
  addCharacter,
  exportState,
  importState,
  newJourney,
  renameCharacter,
  resetAll,
  resetJourney,
  setClass,
  setSettings,
  setSpoilerMode,
  switchCharacter,
  switchJourney,
  useActiveCharacter,
  useActiveJourney,
  useAppState,
} from "../lib/store";
import { CLASSES, STAT_LABELS, STAT_ORDER, levelFromStats } from "../lib/classes";
import {
  ACHIEVEMENTS,
  CONTENT_COVERAGE,
  ENCOUNTERS,
  ITEMS,
  META,
  NGPLUS_STEPS,
  QUESTLINES,
  ROUTE_AREAS,
  ROUTE_STEPS,
} from "../lib/data";
import { ART, ArtBanner, OrnamentRule, UnofficialNote } from "../components/Art";
import { DATA_BASELINE, GAME_VERSION, TARNISHED_ENCOUNTERS } from "../data/game";
import { formatDate, formatNumber } from "../lib/format";

type ConfirmKind = "new-journey" | "reset-journey" | "reset-all" | null;

const CONTENT_SOURCES = [
  {
    name: "Redmaw base-game walkthrough",
    url: "https://eldenring.redmaw.dev/sheets/walkthrough",
    note: `${formatNumber(CONTENT_COVERAGE.sources["research/route.base.json"]?.sections ?? 0)} sections · ${formatNumber(
      CONTENT_COVERAGE.sources["research/route.base.json"]?.steps ?? 0,
    )} steps · objectives, badges, missable cues, and inline links`,
  },
  {
    name: "Redmaw Shadow of the Erdtree walkthrough",
    url: "https://eldenring.redmaw.dev/sheets/dlc-walkthrough",
    note: `${formatNumber(CONTENT_COVERAGE.sources["research/route.dlc.json"]?.sections ?? 0)} sections · ${formatNumber(
      CONTENT_COVERAGE.sources["research/route.dlc.json"]?.steps ?? 0,
    )} steps · full DLC route through Enir-Ilim and the finale`,
  },
  {
    name: "Redmaw item sheets",
    url: "https://eldenring.redmaw.dev/sheets/",
    note: "Weapons, armor, ashes, spells, talismans, key items, and miscellaneous items",
  },
  {
    name: "Redmaw boss sheet",
    url: "https://eldenring.redmaw.dev/sheets/bosses",
    note: `${formatNumber(CONTENT_COVERAGE.bosses.redmaw)} boss rows merged with the workbook ledger into ${formatNumber(
      CONTENT_COVERAGE.bosses.final,
    )} distinct encounters`,
  },
  {
    name: "Redmaw questlines",
    url: "https://eldenring.redmaw.dev/sheets/questlines",
    note: `${CONTENT_COVERAGE.questlines.questlines} questlines · ${formatNumber(CONTENT_COVERAGE.questlines.steps)} ordered steps`,
  },
  {
    name: "Redmaw achievements",
    url: "https://eldenring.redmaw.dev/sheets/achievements",
    note: `${ACHIEVEMENTS.length} achievements plus ${CONTENT_COVERAGE.achievements.requirementGroups} legendary requirement groups`,
  },
  {
    name: "Redmaw New Game Plus",
    url: "https://eldenring.redmaw.dev/sheets/new-game-plus",
    note: `${CONTENT_COVERAGE.ngplus.sections} sections · ${CONTENT_COVERAGE.ngplus.items} checklist items`,
  },
];

const HASH_INPUTS = [
  "research/route.base.json",
  "research/route.dlc.json",
  "research/items.json",
  "research/achievements.json",
  "research/bosses.json",
  "research/questlines.json",
  "research/ngplus.json",
  "src/data/game.ts",
];

const ROUTE_PHASES = [
  {
    label: "Base game — through Maliketh",
    detail: `Sections 1–${CONTENT_COVERAGE.route.preDlcSections}, ending with Maliketh, the Black Blade`,
    sections: CONTENT_COVERAGE.route.preDlcSections,
    steps: CONTENT_COVERAGE.route.preDlcSteps,
  },
  {
    label: "Shadow of the Erdtree",
    detail: `All ${CONTENT_COVERAGE.route.dlcSections} DLC sections before returning to the capital`,
    sections: CONTENT_COVERAGE.route.dlcSections,
    steps: CONTENT_COVERAGE.route.dlcSteps,
  },
  {
    label: "Base game — endgame",
    detail: "Aftermath → Leyndell, Ashen Capital → Endings → NG+ Preparation",
    sections: CONTENT_COVERAGE.route.endgameSections,
    steps: CONTENT_COVERAGE.route.endgameSteps,
  },
];

export function SettingsPage() {
  const state = useAppState();
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const [name, setName] = useState(character.name);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(character.name);
  }, [character.id, character.name]);

  const level = levelFromStats(character.stats);
  const questStepCount = QUESTLINES.reduce((total, questline) => total + questline.steps.length, 0);

  const download = () => {
    const blob = new Blob([exportState()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `er-companion-${character.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.push("Backup exported.", "success");
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      importState(await file.text());
      toast.push("Backup imported. Progress restored.", "success");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Import failed.", "error");
    }
  };

  const confirmAction = () => {
    if (confirm === "new-journey") {
      const created = newJourney();
      toast.push(`${created.label} created. Lifetime collection and endings were preserved.`, "success");
    }
    if (confirm === "reset-journey") {
      resetJourney();
      toast.push(`${journey.label} progress reset. Collection and endings were preserved.`, "success");
    }
    if (confirm === "reset-all") {
      resetAll();
      toast.push("Companion reset to a fresh state.", "success");
    }
    setConfirm(null);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Companion control"
        title="Settings"
        description="Characters, journeys, spoiler policy, backups, and the provenance of the content pack."
        actions={
          <>
            <Button icon="download" onClick={download}>
              Export backup
            </Button>
            <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </>
        }
      />

      <div className="grid-2">
        <section className="card card-pad">
          <SectionTitle title="Character" note={`Created ${formatDate(character.createdAt)}`} />
          <div className="stack">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => {
                  if (name.trim() && name !== character.name) {
                    renameCharacter(name);
                    toast.push("Character renamed.");
                  }
                }}
                maxLength={40}
              />
            </label>
            <label className="field">
              <span className="field-label">Starting class</span>
              <select
                className="select"
                value={character.classId}
                onChange={(event) => {
                  setClass(event.target.value);
                  toast.push("Class base stats applied.");
                }}
              >
                {CLASSES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} — Level {entry.level}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-between">
              <div>
                <div className="stat-label">Derived level</div>
                <div className="stat-value" style={{ fontSize: 22 }}>
                  {level}
                </div>
              </div>
              <div className="tag-list">
                {character.archetypeId ? <Badge tone="accent">{character.archetypeId}</Badge> : <Badge>No certified build</Badge>}
                {character.profileId ? <Badge>{character.profileId}</Badge> : null}
              </div>
            </div>
            <div className="stat-grid">
              {STAT_ORDER.map((key) => (
                <div className="stat-cell" key={key}>
                  <div className="k">{STAT_LABELS[key].slice(0, 3).toUpperCase()}</div>
                  <div className="v">{character.stats[key]}</div>
                </div>
              ))}
            </div>
            <div className="row wrap">
              <Button size="sm" variant="ghost" onClick={() => switchCharacter(character.id)}>
                Active character
              </Button>
              {state.characters.length > 1 ? (
                <select
                  className="select"
                  style={{ width: 200 }}
                  value={character.id}
                  onChange={(event) => switchCharacter(event.target.value)}
                >
                  {state.characters.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button
                size="sm"
                icon="plus"
                onClick={() => {
                  addCharacter("New Tarnished");
                  toast.push("New character created.");
                }}
              >
                Add character
              </Button>
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <SectionTitle title="Journeys" note={`${character.journeys.length} on this character`} />
          <div className="stack">
            {character.journeys.map((entry) => (
              <div
                key={entry.id}
                className={`list-row ${entry.id === journey.id ? "area-row current" : ""}`}
                style={{ paddingLeft: entry.id === journey.id ? 10 : 0, paddingRight: entry.id === journey.id ? 10 : 0, borderRadius: 9 }}
              >
                <div className="grow">
                  <div className="row" style={{ gap: 7 }}>
                    <span className="card-title" style={{ fontSize: 14 }}>
                      {entry.label}
                    </span>
                    {entry.id === journey.id ? <Badge tone="accent">Active</Badge> : null}
                  </div>
                  <div className="small faint">
                    Created {formatDate(entry.createdAt)} · {Object.keys(entry.steps).length} route steps recorded
                  </div>
                </div>
                {entry.id !== journey.id ? (
                  <Button size="sm" variant="ghost" onClick={() => switchJourney(entry.id)}>
                    Switch
                  </Button>
                ) : null}
              </div>
            ))}
            <div className="row wrap">
              <Button size="sm" icon="plus" onClick={() => setConfirm("new-journey")}>
                Begin next journey
              </Button>
              <Button size="sm" variant="danger" icon="refresh" onClick={() => setConfirm("reset-journey")}>
                Reset current journey
              </Button>
            </div>
            <Callout tone="warning" icon="alert">
              New journeys reset route, quest, farm, and ending-run state. Lifetime item ownership and viewed endings stay
              on the character.
            </Callout>
          </div>
        </section>
      </div>

      <OrnamentRule label="Preferences and local data" />

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card card-pad">
          <SectionTitle title="Preferences" note="Stored locally" />
          <div className="stack">
            <label className="field">
              <span className="field-label">Spoiler policy</span>
              <select
                className="select"
                value={state.settings.spoilerMode}
                onChange={(event) => {
                  const mode = event.target.value === "reveal-all" ? "reveal-all" : "strict";
                  setSpoilerMode(mode);
                  toast.push(mode === "strict" ? "Lore is spoiler-gated." : "All lore is revealed.");
                }}
              >
                <option value="strict">Strict — unlock after the matching area</option>
                <option value="reveal-all">Reveal all lore, including unreached chapters</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Density</span>
              <select
                className="select"
                value={state.settings.density}
                onChange={(event) =>
                  setSettings({ density: event.target.value === "compact" ? "compact" : "comfortable" })
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <Checkbox
              checked={state.settings.hideCompleted}
              onChange={(checked) => setSettings({ hideCompleted: checked })}
              label="Hide completed route steps by default"
            />
            <Checkbox
              checked={state.settings.reducedMotion}
              onChange={(checked) => setSettings({ reducedMotion: checked })}
              label="Prefer reduced motion"
            />
            <Select
              label="Active character"
              value={character.id}
              onChange={(event) => switchCharacter(event.target.value)}
            >
              {state.characters.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </div>
        </section>

        <section className="card card-pad">
          <SectionTitle title="Data & backups" note="Offline-first" />
          <div className="stack">
            <div className="row wrap">
              <Button icon="download" onClick={download}>
                Export JSON backup
              </Button>
              <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>
                Import JSON backup
              </Button>
            </div>
            <Callout icon="lock">
              Progress is stored in this browser's local storage. Export a backup before clearing site data or moving to
              another device. The desktop/PWA build has no network dependency.
            </Callout>
            <div className="divider" />
            <div className="kv">
              <dt>Schema</dt>
              <dd>v{state.schemaVersion} · updated {formatDate(state.updatedAt)}</dd>
              <dt>Live game</dt>
              <dd>
                App {GAME_VERSION.app} · Regulation {GAME_VERSION.regulation} · checked {formatDate(GAME_VERSION.checkedAt)}
              </dd>
              <dt>Content baseline</dt>
              <dd>
                Workbook build, tier, and encounter data: Regulation {DATA_BASELINE.regulation} (v
                {DATA_BASELINE.workbookVersion})
              </dd>
              <dt>Content pack generated</dt>
              <dd>
                {formatDate(CONTENT_COVERAGE.generatedAt)} · {formatNumber(ROUTE_AREAS.length)} route sections ·{" "}
                {formatNumber(ROUTE_STEPS.length)} steps
              </dd>
              <dt>Workbook seed</dt>
              <dd className="mono tiny" style={{ wordBreak: "break-all" }}>
                {META.source.file}
              </dd>
              <dt>Workbook SHA-256</dt>
              <dd className="mono tiny" style={{ wordBreak: "break-all" }}>
                {META.source.sha256}
              </dd>
              <dt>Workbook sheets</dt>
              <dd>
                {META.source.sheets} total · {META.source.visibleSheets} visible
              </dd>
            </div>
            <div className="divider" />
            <Button variant="danger" icon="refresh" onClick={() => setConfirm("reset-all")}>
              Reset companion to fresh state
            </Button>
          </div>
        </section>
      </div>

      <OrnamentRule label="Full-game content pack" />

      <section className="card card-pad">
        <SectionTitle
          title="Full-game content pack"
          note={`Generated ${formatDate(CONTENT_COVERAGE.generatedAt)} · Redmaw Completion Sheets merged with the workbook seed`}
          actions={<Badge tone="accent">{formatNumber(ROUTE_STEPS.length)} route steps</Badge>}
        />
        <ArtBanner
          image={ART.heroSote}
          variant="sote"
          caption="Shadow of the Erdtree · DLC phase"
          title="The Shadow Realm sits between Maliketh and the Ashen Capital"
        >
          <p className="small muted" style={{ margin: 0 }}>
            The route is a single ordered walkthrough across the base game, the complete expansion, and the endgame.
            Every count on this page is read from the generated pack or the runtime arrays, not from the legacy partial
            export.
          </p>
        </ArtBanner>
        <div style={{ height: 14 }} />
        <Callout tone="warning" icon="alert">
          <strong>Version boundary:</strong> live rules are App {GAME_VERSION.app} / Regulation{" "}
          {GAME_VERSION.regulation}. Route, collection, questline, boss, achievement, and NG+ structure come from the
          full-game pack. Build, tier, encounter-preset, and upgrade recommendations remain authored against Regulation{" "}
          {DATA_BASELINE.regulation} and are shown as baseline data.{" "}
          <button
            className="btn btn-sm btn-ghost"
            style={{ verticalAlign: "baseline" }}
            onClick={() => {
              window.location.hash = "#/patch";
            }}
          >
            Patch &amp; DLC
          </button>
        </Callout>
        <div className="divider" />
        <div className="grid-3">
          <div>
            <div className="stat-label">Route</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(ROUTE_STEPS.length)} <small>steps · {formatNumber(ROUTE_AREAS.length)} sections</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              {formatNumber(CONTENT_COVERAGE.route.requiredSteps)} required ·{" "}
              {formatNumber(CONTENT_COVERAGE.route.missableSteps)} missable. Base, DLC, and endgame phases share one
              contiguous order.
            </p>
          </div>
          <div>
            <div className="stat-label">Catalog</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(ITEMS.length)} <small>items</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              {formatNumber(CONTENT_COVERAGE.items.workbook)} workbook records +{" "}
              {formatNumber(CONTENT_COVERAGE.items.redmawOnly)} Redmaw-only records;{" "}
              {formatNumber(CONTENT_COVERAGE.items.tarnishedPack)} Tarnished Pack rows are merged in place.
            </p>
          </div>
          <div>
            <div className="stat-label">Achievements</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(ACHIEVEMENTS.length)} <small>achievements</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              {CONTENT_COVERAGE.achievements.requirementGroups} legendary requirement groups ·{" "}
              {CONTENT_COVERAGE.achievements.linkedRequirementItems} linked requirement items.
            </p>
          </div>
          <div>
            <div className="stat-label">Boss ledger</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(ENCOUNTERS.length)} <small>encounters</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              {CONTENT_COVERAGE.bosses.workbookEncounters} workbook encounters + {CONTENT_COVERAGE.bosses.redmaw}{" "}
              Redmaw rows, merged with {TARNISHED_ENCOUNTERS.length} Tarnished Pack invasions.
            </p>
          </div>
          <div>
            <div className="stat-label">Questlines</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(QUESTLINES.length)} <small>questlines</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              {formatNumber(questStepCount)} ordered quest steps across base-game and DLC NPC routes.
            </p>
          </div>
          <div>
            <div className="stat-label">New Game Plus</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(NGPLUS_STEPS.length)} <small>checklist items</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              {CONTENT_COVERAGE.ngplus.sections} NG+ sections covering duplication, preparation, and carry-over work.
            </p>
          </div>
        </div>

        <div className="divider" />

        <SectionTitle title="Route order" note="Base → DLC → endgame, in this order" />
        <div className="stack" style={{ gap: 9 }}>
          {ROUTE_PHASES.map((phase, index) => (
            <div className="list-row" key={phase.label}>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <Badge tone="accent">{index + 1}</Badge>
                  <span className="card-title" style={{ fontSize: 14 }}>
                    {phase.label}
                  </span>
                </div>
                <div className="small muted">{phase.detail}</div>
              </div>
              <div className="small faint" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {formatNumber(phase.steps)} steps
                <br />
                {phase.sections} sections
              </div>
            </div>
          ))}
        </div>
        <Callout tone="warning" icon="alert">
          {formatNumber(CONTENT_COVERAGE.route.missableSteps)} missable route steps:{" "}
          {formatNumber(CONTENT_COVERAGE.route.missableBaseSteps)} in the pre-DLC base game and{" "}
          {formatNumber(CONTENT_COVERAGE.route.missableDlcSteps)} in Shadow of the Erdtree. Phase gates pause before the
          DLC and again before Leyndell, Ashen Capital; the capital changes permanently after Maliketh.
        </Callout>

        <div className="divider" />

        <SectionTitle title="Source inputs" note={`Generated ${formatDate(CONTENT_COVERAGE.generatedAt)} · bundled locally`} />
        <div className="list">
          {CONTENT_SOURCES.map((source) => (
            <div className="list-row" key={source.url + source.name}>
              <div className="grow">
                <div className="card-title" style={{ fontSize: 14 }}>
                  {source.name}
                </div>
                <div className="small muted">{source.note}</div>
              </div>
              <a className="btn btn-sm btn-ghost" href={source.url} target="_blank" rel="noreferrer">
                <Icon name="external" size={14} /> Open
              </a>
            </div>
          ))}
        </div>
        <div className="divider" />
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            Generated inputs and SHA-256 hashes
          </summary>
          <div className="stack" style={{ gap: 7, marginTop: 10 }}>
            {HASH_INPUTS.map((path) => (
              <div key={path}>
                <div className="tiny faint mono">{path}</div>
                <div className="tiny mono" style={{ wordBreak: "break-all" }}>
                  {CONTENT_COVERAGE.sources[path]?.sha256 ?? "hash unavailable"}
                </div>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <SectionTitle title="Artwork, fonts & licensing" note="Unofficial free fan project" />
        <div className="grid-2">
          <div>
            <div className="stat-label">Artwork</div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Official Steam store and press artwork for ELDEN RING (app 1245620) and Shadow of the Erdtree (app
              2778580), optimized and bundled under <span className="mono">public/art</span>. Nothing is hotlinked at
              runtime, so the PWA renders offline.
            </p>
            <div className="row wrap">
              <a
                className="btn btn-sm btn-ghost"
                href="https://store.steampowered.com/app/1245620/ELDEN_RING/"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="external" size={14} /> ELDEN RING on Steam
              </a>
              <a
                className="btn btn-sm btn-ghost"
                href="https://store.steampowered.com/app/2778580/ELDEN_RING_Shadow_of_the_Erdtree/"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="external" size={14} /> Shadow of the Erdtree
              </a>
            </div>
          </div>
          <div>
            <div className="stat-label">Fonts</div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Cinzel and EB Garamond WOFF2 latin subsets, licensed under the SIL Open Font License 1.1. License texts
              ship in <span className="mono">public/fonts/licenses/</span>; the app makes no external font request.
            </p>
            <div className="row wrap">
              <a className="btn btn-sm btn-ghost" href="/fonts/licenses/OFL-Cinzel.txt" target="_blank" rel="noreferrer">
                OFL — Cinzel
              </a>
              <a
                className="btn btn-sm btn-ghost"
                href="/fonts/licenses/OFL-EBGaramond.txt"
                target="_blank"
                rel="noreferrer"
              >
                OFL — EB Garamond
              </a>
              <a className="btn btn-sm btn-ghost" href="https://scripts.sil.org/OFL" target="_blank" rel="noreferrer">
                <Icon name="external" size={14} /> OFL 1.1
              </a>
            </div>
          </div>
        </div>
        <div className="divider" />
        <p className="small muted">
          Asset-by-asset provenance, dimensions, source URLs, and the font manifest live in{" "}
          <a href="docs/ART_CREDITS.md">docs/ART_CREDITS.md</a>. Artwork and marks remain the property of FromSoftware
          and Bandai Namco Entertainment. This companion is a free, non-commercial fan project and is not affiliated
          with, endorsed by, or sponsored by either company.
        </p>
        <UnofficialNote />
      </section>

      <Modal
        open={confirm !== null}
        title={confirm === "new-journey" ? "Begin the next journey?" : confirm === "reset-journey" ? "Reset this journey?" : "Reset everything?"}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant={confirm === "reset-all" ? "danger" : "primary"} onClick={confirmAction}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="muted">
          {confirm === "new-journey"
            ? "A new journey starts with empty route, quest, farm, and ending-run state. Lifetime collection, farmable quantities, lore reads, and viewed endings are preserved."
            : confirm === "reset-journey"
              ? "This clears route, supplemental, quest, farm, and certification state for the active journey. Collection and endings are preserved."
              : "This replaces all characters, journeys, collection progress, and settings with a fresh companion. Export a backup first if you want to keep this state."}
        </p>
      </Modal>
    </div>
  );
}
