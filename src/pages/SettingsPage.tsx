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
import { META } from "../lib/data";
import { formatDate, formatNumber } from "../lib/format";

type ConfirmKind = "new-journey" | "reset-journey" | "reset-all" | null;

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
                    Created {formatDate(entry.createdAt)} · {Object.keys(entry.steps).length} route decisions recorded
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
              <dt>Source pack</dt>
              <dd className="mono tiny" style={{ wordBreak: "break-all" }}>
                {META.source.file}
              </dd>
              <dt>SHA-256</dt>
              <dd className="mono tiny" style={{ wordBreak: "break-all" }}>
                {META.source.sha256}
              </dd>
              <dt>Workbook</dt>
              <dd>
                {META.source.sheets} sheets · {META.source.visibleSheets} visible · {formatNumber(META.counts.routeSteps)} Act I steps
              </dd>
            </div>
            <div className="divider" />
            <Button variant="danger" icon="refresh" onClick={() => setConfirm("reset-all")}>
              Reset companion to fresh state
            </Button>
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <SectionTitle title="Content coverage" note="Observed from the source workbook" />
        <div className="grid-3">
          <div>
            <div className="stat-label">Route</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(META.counts.routeSteps)} <small>Act I steps</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              The workbook's completion ledger references 4,477 route steps; only the 994 Act I steps are present as
              structured step records in this export.
            </p>
          </div>
          <div>
            <div className="stat-label">Chronology</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {META.counts.supplementalActions} <small>whole-game actions</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Companion-only actions across the base game, Shadow of the Erdtree, endings, and NG+ preparation.
            </p>
          </div>
          <div>
            <div className="stat-label">Catalog</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {formatNumber(META.counts.items)} <small>items</small>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Permanent collection records, including source-enumerated base-game and DLC items without exact locations.
            </p>
          </div>
        </div>
        <div className="divider" />
        <div className="stack" style={{ gap: 7 }}>
          {META.coverageNotes.map((note) => (
            <div key={note} className="small muted" style={{ display: "flex", gap: 8 }}>
              <Icon name="alert" size={13} />
              <span>{note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <SectionTitle title="Sources" note="External references" />
        <div className="list">
          {META.externalResources.map((resource) => (
            <div className="list-row" key={resource.name}>
              <div className="grow">
                <div className="row" style={{ gap: 7 }}>
                  <span className="card-title" style={{ fontSize: 14 }}>
                    {resource.name}
                  </span>
                  <Badge>{resource.role}</Badge>
                  {resource.required.toLowerCase().startsWith("yes") ? <Badge tone="warning">Required</Badge> : null}
                </div>
                <div className="small muted">{resource.whenToUse}</div>
                <div className="tiny faint">{resource.notes}</div>
              </div>
              {resource.url.startsWith("http") ? (
                <a className="btn btn-sm btn-ghost" href={resource.url} target="_blank" rel="noreferrer">
                  <Icon name="external" size={14} /> Open
                </a>
              ) : null}
            </div>
          ))}
        </div>
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
