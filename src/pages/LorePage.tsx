import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Drawer,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  SearchInput,
  Select,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { LORE } from "../lib/data";
import { loreAccess } from "../lib/selectors";
import type { LoreAccess } from "../lib/selectors";
import { navigate, queryString, useRoute } from "../lib/router";
import { revealZone, setLoreRead, useActiveCharacter, useActiveJourney, useAppState } from "../lib/store";
import type { LoreEntry } from "../lib/types";
import "./lore-completion.css";

type ReadFilter = "all" | "read" | "unread";
type LockFilter = "all" | "unlocked" | "locked";

const DETAIL_SECTIONS: { key: keyof Pick<LoreEntry, "rawSummary" | "rawCharacters" | "rawEvidence" | "rawQuestions" | "rawLater" | "rawChronicle">; label: string; spoiler?: boolean }[] = [
  { key: "rawSummary", label: "Summary" },
  { key: "rawCharacters", label: "Characters & Factions" },
  { key: "rawEvidence", label: "Key Item / Environmental Evidence" },
  { key: "rawQuestions", label: "Open Questions" },
  { key: "rawLater", label: "Later Context", spoiler: true },
  { key: "rawChronicle", label: "Character Chronicle" },
];

function loreHref(entryId?: string, area?: string): string {
  return `/lore${queryString({ entry: entryId, area: area && area !== "all" ? area : undefined })}`;
}

export function LorePage() {
  const state = useAppState();
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const route = useRoute();
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [lockFilter, setLockFilter] = useState<LockFilter>("all");
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const [gateEntryId, setGateEntryId] = useState<string | null>(null);

  const areaParam = route.query.get("area") ?? "all";
  const entryParam = route.query.get("entry");

  const orderedLore = useMemo(() => [...LORE].sort((a, b) => a.areaOrder - b.areaOrder), []);

  const accessById = useMemo(() => {
    const map: Record<string, LoreAccess> = {};
    for (const entry of orderedLore) {
      map[entry.id] = loreAccess(journey, state.settings, entry);
    }
    return map;
  }, [orderedLore, journey, state.settings]);

  const unlockedCount = orderedLore.filter((entry) => accessById[entry.id]?.unlocked).length;
  const readCount = orderedLore.filter((entry) => character.loreRead[entry.id]).length;
  const strict = state.settings.spoilerMode === "strict";

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orderedLore.filter((entry) => {
      const access = accessById[entry.id];
      const unlocked = Boolean(access?.unlocked);
      const read = Boolean(character.loreRead[entry.id]);
      if (areaParam !== "all" && entry.area !== areaParam) return false;
      if (lockFilter === "unlocked" && !unlocked) return false;
      if (lockFilter === "locked" && unlocked) return false;
      if (readFilter === "read" && !read) return false;
      if (readFilter === "unread" && read) return false;
      if (!term) return true;
      const haystack = [
        entry.area,
        entry.unlockCondition,
        unlocked ? entry.rawSummary : "",
        unlocked ? entry.rawCharacters : "",
        unlocked ? entry.rawEvidence : "",
        unlocked ? entry.rawQuestions : "",
        unlocked ? entry.rawLater : "",
        unlocked ? entry.rawChronicle : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orderedLore, accessById, character.loreRead, areaParam, lockFilter, readFilter, search]);

  const selectedEntry = entryParam ? orderedLore.find((entry) => entry.id === entryParam) : undefined;
  const selectedAccess = selectedEntry ? accessById[selectedEntry.id] : undefined;
  const gateEntry = gateEntryId ? orderedLore.find((entry) => entry.id === gateEntryId) : undefined;
  const gateAccess = gateEntry ? accessById[gateEntry.id] : undefined;

  const toggleRead = (entry: LoreEntry, value: boolean) => {
    setLoreRead(entry.id, value);
    toast.push(value ? `${entry.area} marked read.` : `${entry.area} marked unread.`);
  };

  const confirmReveal = () => {
    if (!pendingReveal) return;
    revealZone(pendingReveal, true);
    toast.push(`${pendingReveal} revealed. Lore for this area is now unlocked.`, "success");
    setPendingReveal(null);
  };

  const revealCount = gateEntry
    ? orderedLore.filter((entry) => entry.area === gateEntry.area).length
    : pendingReveal
      ? orderedLore.filter((entry) => entry.area === pendingReveal).length
      : 1;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Lore archive`}
        title="Lore"
        description={
          <>
            {LORE.length} area chapters tied to the route and whole-game chronology. Strict mode withholds raw summaries,
            characters, evidence, questions, later context, and chronicles until the matching section is resolved or you
            deliberately reveal the area.
          </>
        }
        actions={
          <>
            <Badge tone={strict ? "warning" : "accent"}>
              {strict ? "Strict spoiler mode" : "Reveal-all mode"}
            </Badge>
            <Button icon="settings" onClick={() => navigate("/settings")}>
              Spoiler settings
            </Button>
          </>
        }
      />

      <div className="lore-summary-strip">
        <div className="lore-summary-cell">
          <span className="stat-label">Unlocked</span>
          <strong>
            {unlockedCount} <span className="faint">/ {orderedLore.length}</span>
          </strong>
        </div>
        <div className="lore-summary-cell">
          <span className="stat-label">Read</span>
          <strong>
            {readCount} <span className="faint">/ {orderedLore.length}</span>
          </strong>
        </div>
        <div className="lore-summary-cell">
          <span className="stat-label">Spoiler mode</span>
          <strong>{strict ? "Strict" : "Reveal all"}</strong>
        </div>
        <div className="lore-summary-cell">
          <span className="stat-label">Lore scope</span>
          <strong>{orderedLore[0]?.journey ?? "Not recorded"}</strong>
        </div>
        <div className="lore-summary-note">
          <Icon name="lock" size={14} />
          <span>
            Unlocking is derived from route and chronology completion. Manual reveals bypass that gating for this
            journey only.
          </span>
        </div>
      </div>

      <div className="lore-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search unlocked lore, area, or unlock condition" />
        <Select
          label="Area"
          value={areaParam}
          onChange={(event) => navigate(loreHref(undefined, event.target.value))}
        >
          <option value="all">All areas ({orderedLore.length})</option>
          {orderedLore.map((entry) => (
            <option key={entry.id} value={entry.area}>
              {String(entry.areaOrder).padStart(2, "0")} · {entry.area}
            </option>
          ))}
        </Select>
        <Select label="Access" value={lockFilter} onChange={(event) => setLockFilter(event.target.value as LockFilter)}>
          <option value="all">All access</option>
          <option value="unlocked">Unlocked only</option>
          <option value="locked">Locked only</option>
        </Select>
        <Select label="Read state" value={readFilter} onChange={(event) => setReadFilter(event.target.value as ReadFilter)}>
          <option value="all">All entries</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </Select>
      </div>

      <div className="row-between wrap lore-result-row">
        <span className="small muted">
          Showing {filtered.length} of {orderedLore.length} area chapters
          {areaParam !== "all" ? ` in ${areaParam}` : ""}
        </span>
        {search || readFilter !== "all" || lockFilter !== "all" || areaParam !== "all" ? (
          <Button
            size="sm"
            variant="ghost"
            icon="x"
            onClick={() => {
              setSearch("");
              setReadFilter("all");
              setLockFilter("all");
              navigate(loreHref());
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No lore chapters match"
          description="Adjust the area, access, read state, or search term. Locked entries only match their area and unlock condition."
          action={
            <Button
              icon="refresh"
              onClick={() => {
                setSearch("");
                setReadFilter("all");
                setLockFilter("all");
                navigate(loreHref());
              }}
            >
              Reset lore filters
            </Button>
          }
        />
      ) : (
        <div className="lore-grid">
          {filtered.map((entry) => {
            const access = accessById[entry.id];
            const unlocked = Boolean(access?.unlocked);
            const read = Boolean(character.loreRead[entry.id]);
            return (
              <article
                key={entry.id}
                className={`lore-card${unlocked ? "" : " is-locked"}${read ? " is-read" : ""}`}
              >
                <div className="lore-card-head">
                  <span className="lore-order" aria-hidden="true">
                    {String(entry.areaOrder).padStart(2, "0")}
                  </span>
                  <div className="grow">
                    <h3 className="lore-area">{entry.area}</h3>
                    <div className="lore-meta">
                      <span>{entry.journey}</span>
                      <span aria-hidden="true">·</span>
                      <span>Area order {entry.areaOrder}</span>
                    </div>
                  </div>
                  <div className="tag-list lore-badges">
                    {unlocked ? (
                      <Badge tone="accent">Unlocked</Badge>
                    ) : (
                      <Badge tone="warning">
                        <Icon name="lock" size={11} /> Locked
                      </Badge>
                    )}
                    {read ? <Badge tone="success">Read</Badge> : null}
                  </div>
                </div>

                {unlocked ? (
                  <>
                    <p className="lore-teaser">{entry.rawSummary}</p>
                    <p className="lore-unlock-note">{access?.reason}</p>
                    <div className="lore-card-footer">
                      <Button
                        size="sm"
                        icon={read ? "refresh" : "check"}
                        onClick={() => toggleRead(entry, !read)}
                        aria-label={`${read ? "Mark unread" : "Mark read"}: ${entry.area}`}
                      >
                        {read ? "Mark unread" : "Mark read"}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        iconRight="arrowRight"
                        onClick={() => navigate(loreHref(entry.id, areaParam))}
                        aria-label={`Open lore chapter: ${entry.area}`}
                      >
                        Open chapter
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lore-lockbox">
                      <Icon name="lock" size={16} />
                      <div>
                        <div className="small">Unlock condition</div>
                        <p>{entry.unlockCondition}</p>
                      </div>
                    </div>
                    <div className="lore-gate-state">
                      <div className="row-between wrap">
                        <span className="tiny">{access?.reason ?? "Locked by spoiler policy"}</span>
                        {access?.progress ? (
                          <span className="tiny faint mono">
                            {access.progress.resolved} / {access.progress.total}
                          </span>
                        ) : null}
                      </div>
                      {access?.progress ? (
                        <ProgressBar
                          value={access.progress.percent}
                          label={`${access.progress.requiredResolved} / ${access.progress.required} required`}
                          detail={`${access.progress.percent}% resolved`}
                        />
                      ) : null}
                    </div>
                    <div className="lore-card-footer">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="eye"
                        onClick={() => setGateEntryId(entry.id)}
                        aria-label={`Review lore gate: ${entry.area}`}
                      >
                        Review gate
                      </Button>
                      <Button
                        size="sm"
                        icon="lock"
                        onClick={() => setPendingReveal(entry.area)}
                        aria-label={`Reveal lore area: ${entry.area}`}
                      >
                        Reveal area
                      </Button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Drawer
        open={Boolean(selectedEntry)}
        title={selectedEntry?.area ?? "Lore chapter"}
        subtitle={
          selectedEntry
            ? `${selectedEntry.journey} · Area order ${selectedEntry.areaOrder} · ${selectedAccess?.unlocked ? "unlocked" : "locked"}`
            : undefined
        }
        onClose={() => navigate(loreHref(undefined, areaParam))}
        footer={
          selectedEntry && selectedAccess?.unlocked ? (
            <div className="row-between wrap">
              <Button
                icon={character.loreRead[selectedEntry.id] ? "refresh" : "check"}
                onClick={() => toggleRead(selectedEntry, !character.loreRead[selectedEntry.id])}
              >
                {character.loreRead[selectedEntry.id] ? "Mark unread" : "Mark read"}
              </Button>
              <Button variant="ghost" icon="settings" onClick={() => navigate("/settings")}>
                Spoiler settings
              </Button>
            </div>
          ) : selectedEntry ? (
            <div className="row-between wrap">
              <Button icon="lock" onClick={() => setPendingReveal(selectedEntry.area)}>
                Reveal this area
              </Button>
              <Button variant="ghost" icon="settings" onClick={() => navigate("/settings")}>
                Reveal all in settings
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedEntry && selectedAccess?.unlocked ? (
          <>
            <div className="tag-list" style={{ marginBottom: 16 }}>
              <Badge tone="accent">Area {selectedEntry.areaOrder}</Badge>
              {character.loreRead[selectedEntry.id] ? <Badge tone="success">Read</Badge> : <Badge>Unread</Badge>}
              <Badge>{selectedEntry.journey}</Badge>
            </div>
            <div className="lore-detail-sections">
              {DETAIL_SECTIONS.map((section) => {
                const value = selectedEntry[section.key];
                if (!value) return null;
                return (
                  <section key={section.key} className={`lore-section${section.spoiler ? " is-spoiler" : ""}`}>
                    <h3>
                      {section.label}
                      {section.spoiler ? <Badge tone="warning">Spoiler</Badge> : null}
                    </h3>
                    <p>{value}</p>
                  </section>
                );
              })}
            </div>
            <div className="lore-source">
              <dl className="kv">
                <dt>Source contract</dt>
                <dd>{selectedEntry.sourceContract}</dd>
                <dt>Primary route</dt>
                <dd>
                  {selectedEntry.primaryRouteUrl ? (
                    <a href={selectedEntry.primaryRouteUrl} target="_blank" rel="noreferrer">
                      Open primary route source <Icon name="external" size={12} />
                    </a>
                  ) : (
                    <span className="faint">Not recorded in the content pack.</span>
                  )}
                </dd>
                <dt>Source row</dt>
                <dd className="mono">{selectedEntry.sourceRow}</dd>
              </dl>
            </div>
          </>
        ) : selectedEntry ? (
          <div className="stack">
            <Callout tone="warning" icon="lock">
              This chapter is locked in strict mode. Its raw summary, characters, evidence, questions, later context, and
              chronicle are withheld until the gating section is resolved or the area is deliberately revealed.
            </Callout>
            <dl className="kv">
              <dt>Area</dt>
              <dd>{selectedEntry.area}</dd>
              <dt>Unlock condition</dt>
              <dd>{selectedEntry.unlockCondition}</dd>
              <dt>Current gate</dt>
              <dd>{selectedAccess?.reason ?? "Locked by spoiler policy"}</dd>
            </dl>
            {selectedAccess?.progress ? (
              <ProgressBar
                value={selectedAccess.progress.percent}
                label={`${selectedAccess.progress.resolved} / ${selectedAccess.progress.total} resolved`}
                detail={`${selectedAccess.progress.requiredResolved} / ${selectedAccess.progress.required} required`}
              />
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={Boolean(gateEntry)}
        title={gateEntry ? `${gateEntry.area} · gate review` : "Gate review"}
        onClose={() => setGateEntryId(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setGateEntryId(null)}>
              Close
            </Button>
            {gateEntry && gateAccess?.unlocked ? (
              <Button variant="primary" iconRight="arrowRight" onClick={() => navigate(loreHref(gateEntry.id, areaParam))}>
                Open chapter
              </Button>
            ) : gateEntry ? (
              <Button variant="primary" icon="lock" onClick={() => setPendingReveal(gateEntry.area)}>
                Reveal area
              </Button>
            ) : null}
          </>
        }
      >
        {gateEntry ? (
          <div className="stack">
            {gateAccess?.unlocked ? (
              <Callout tone="success" icon="check">
                This chapter is unlocked. Open it to read the full detail.
              </Callout>
            ) : (
              <Callout tone="warning" icon="lock">
                Locked. The raw lore is not rendered in strict mode.
              </Callout>
            )}
            <dl className="kv">
              <dt>Unlock condition</dt>
              <dd>{gateEntry.unlockCondition}</dd>
              <dt>Reason</dt>
              <dd>{gateAccess?.reason ?? "Locked by spoiler policy"}</dd>
            </dl>
            {gateAccess?.progress ? (
              <ProgressBar
                value={gateAccess.progress.percent}
                label={`${gateAccess.progress.resolved} / ${gateAccess.progress.total} resolved`}
                detail={`${gateAccess.progress.requiredResolved} / ${gateAccess.progress.required} required`}
              />
            ) : null}
            <p className="small faint">
              Manual reveals bypass route gating for this area only. They do not change route progress or completion.
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingReveal)}
        title={pendingReveal ? `Reveal ${pendingReveal}?` : "Reveal area?"}
        onClose={() => setPendingReveal(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPendingReveal(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon="eye" onClick={confirmReveal}>
              Reveal area
            </Button>
          </>
        }
      >
        <div className="stack">
          <Callout tone="warning" icon="alert">
            This bypasses route gating and unlocks all {revealCount} lore {revealCount === 1 ? "chapter" : "chapters"} in
            this area immediately. The reveal applies to {journey.label} and persists.
          </Callout>
          <p className="small muted">
            Use this only after reaching the area in game or when you accept spoilers. It does not mark any route or
            chronology action complete, and it does not change completion readiness.
          </p>
          <p className="small faint">
            To reveal every chapter at once, open{" "}
            <button className="lore-inline-link" onClick={() => navigate("/settings")}>
              spoiler settings
            </button>
            .
          </p>
        </div>
      </Modal>
    </div>
  );
}
