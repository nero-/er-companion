import { Badge, Button, Callout, PageHeader, SectionTitle } from "../components/ui";
import { Icon } from "../components/Icon";
import { ART, ArtBanner } from "../components/Art";
import { CLASSES, STAT_SHORT, STAT_ORDER } from "../lib/classes";
import { formatDate, formatNumber } from "../lib/format";
import {
  ACHIEVEMENTS,
  CONTENT_COVERAGE,
  ENCOUNTERS,
  ITEMS,
  ITEMS_BY_NAME,
  NGPLUS_STEPS,
  QUESTLINES,
  ROUTE_AREAS,
  ROUTE_STEPS,
} from "../lib/data";
import { navigate } from "../lib/router";
import {
  DATA_BASELINE,
  GAME_VERSION,
  PACK_HIGHLIGHTS,
  PATCHES,
  PATCH_IMPACTS,
  TARNISHED_ENCOUNTERS,
  TARNISHED_ITEMS,
} from "../data/game";
import "./patch.css";

const PACK_CLASS_IDS = ["idus-knight", "heavy-knight"];

const ROUTE_PHASES = [
  {
    label: "Base game — through Maliketh",
    detail: `Sections 1–${CONTENT_COVERAGE.route.preDlcSections} · closes after Maliketh, the Black Blade`,
    sections: CONTENT_COVERAGE.route.preDlcSections,
    steps: CONTENT_COVERAGE.route.preDlcSteps,
  },
  {
    label: "Shadow of the Erdtree",
    detail: `All ${CONTENT_COVERAGE.route.dlcSections} DLC sections, including Enir-Ilim and the finale`,
    sections: CONTENT_COVERAGE.route.dlcSections,
    steps: CONTENT_COVERAGE.route.dlcSteps,
  },
  {
    label: "Base game — endgame",
    detail: "Farum Azula aftermath → Ashen Capital → Endings → NG+ Preparation",
    sections: CONTENT_COVERAGE.route.endgameSections,
    steps: CONTENT_COVERAGE.route.endgameSteps,
  },
];

export function PatchPage() {
  const packClasses = CLASSES.filter((entry) => PACK_CLASS_IDS.includes(entry.id));
  const packItems = TARNISHED_ITEMS;
  const packEquipment = packItems.filter((item) => item.group !== "Steed Attire");
  const packAttire = packItems.filter((item) => item.group === "Steed Attire");
  const uniqueWeapons = packEquipment.filter((item) => item.group === "Weapon" || item.group === "Shield");

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Live game status · checked ${formatDate(GAME_VERSION.checkedAt)}`}
        title="Patch & DLC"
        description={
          <>
            Route, catalog, quests, bosses, achievements, and NG+ now cover the full game. The live rules are{" "}
            <strong>{GAME_VERSION.app}</strong> / Regulation <strong>{GAME_VERSION.regulation}</strong>. The workbook
            was authored against Regulation {DATA_BASELINE.regulation}, so build and tier recommendations are explicitly
            marked as baseline data.
          </>
        }
        actions={
          <>
            <Button icon="external" onClick={() => window.open(GAME_VERSION.sources[0].url, "_blank", "noopener")}>
              Official patch notes
            </Button>
            <Button variant="ghost" icon="search" onClick={() => navigate("/settings")}>
              Data provenance
            </Button>
          </>
        }
      />

      <ArtBanner
        className="patch-art-banner"
        image={ART.heroSote}
        variant="sote"
        caption={`Shadow of the Erdtree · ${CONTENT_COVERAGE.route.dlcSections} sections · ${formatNumber(
          CONTENT_COVERAGE.route.dlcSteps,
        )} steps`}
        title="The expansion sits between Maliketh and the Ashen Capital"
      >
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          The full route pauses after Maliketh, plays every DLC section, then returns to Leyndell, Ashen Capital,
          endings, and NG+ preparation.
        </p>
      </ArtBanner>

      <div className="grid-4">
        <div className="stat">
          <div className="stat-label">Live app version</div>
          <div className="stat-value">{GAME_VERSION.app}</div>
          <div className="stat-delta">Regulation {GAME_VERSION.regulation}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Content baseline</div>
          <div className="stat-value">{DATA_BASELINE.regulation}</div>
          <div className="stat-delta">Workbook v{DATA_BASELINE.workbookVersion}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Tarnished Edition</div>
          <div className="stat-value" style={{ fontSize: 21 }}>
            {formatDate(GAME_VERSION.tarnishedEditionRelease)}
          </div>
          <div className="stat-delta">Tarnished Pack on other platforms</div>
        </div>
        <div className="stat">
          <div className="stat-label">Pack records</div>
          <div className="stat-value">{packItems.length}</div>
          <div className="stat-delta">{packClasses.length} classes · {uniqueWeapons.length} weapons/shields</div>
        </div>
      </div>

      <div className="patch-banner">
        <Callout tone="warning" icon="alert">
          <strong>Data boundary:</strong> {DATA_BASELINE.note} {DATA_BASELINE.trustRule}
        </Callout>
      </div>

      <section className="card card-pad" style={{ marginTop: 18 }}>
        <SectionTitle
          title="Full content pack"
          note={`Generated ${formatDate(CONTENT_COVERAGE.generatedAt)} · Redmaw Completion Sheets + workbook seed`}
          actions={<Badge tone="accent">{formatNumber(ROUTE_STEPS.length)} route steps</Badge>}
        />
        <p className="small muted" style={{ marginBottom: 12 }}>
          The route and completion denominators cover the whole game: base game through Maliketh, every Shadow of the
          Erdtree section, then the Ashen Capital endgame. The workbook remains the source for build and tier data.
        </p>

        <div className="pack-stat-grid">
          <div className="pack-stat">
            <div className="pack-stat-label">Route</div>
            <div className="pack-stat-value">{formatNumber(ROUTE_STEPS.length)}</div>
            <div className="pack-stat-note">
              steps · {formatNumber(ROUTE_AREAS.length)} sections ·{" "}
              {formatNumber(CONTENT_COVERAGE.route.missableSteps)} missable
            </div>
          </div>
          <div className="pack-stat">
            <div className="pack-stat-label">Catalog</div>
            <div className="pack-stat-value">{formatNumber(ITEMS.length)}</div>
            <div className="pack-stat-note">
              items · {formatNumber(CONTENT_COVERAGE.items.workbook)} workbook +{" "}
              {formatNumber(CONTENT_COVERAGE.items.redmawOnly)} Redmaw-only
            </div>
          </div>
          <div className="pack-stat">
            <div className="pack-stat-label">Achievements</div>
            <div className="pack-stat-value">{formatNumber(ACHIEVEMENTS.length)}</div>
            <div className="pack-stat-note">
              {CONTENT_COVERAGE.achievements.requirementGroups} legendary requirement groups
            </div>
          </div>
          <div className="pack-stat">
            <div className="pack-stat-label">Boss ledger</div>
            <div className="pack-stat-value">{formatNumber(ENCOUNTERS.length)}</div>
            <div className="pack-stat-note">
              encounters · {formatNumber(CONTENT_COVERAGE.bosses.redmawOnly)} Redmaw-only +{" "}
              {TARNISHED_ENCOUNTERS.length} pack invasions
            </div>
          </div>
          <div className="pack-stat">
            <div className="pack-stat-label">Questlines</div>
            <div className="pack-stat-value">{formatNumber(QUESTLINES.length)}</div>
            <div className="pack-stat-note">
              {formatNumber(CONTENT_COVERAGE.questlines.steps)} ordered quest steps
            </div>
          </div>
          <div className="pack-stat">
            <div className="pack-stat-label">NG+ checklist</div>
            <div className="pack-stat-value">{formatNumber(NGPLUS_STEPS.length)}</div>
            <div className="pack-stat-note">{CONTENT_COVERAGE.ngplus.sections} sections · duplication and prep</div>
          </div>
        </div>

        <div className="divider" />

        <SectionTitle title="Canonical route order" note="Maliketh → DLC → Ashen Capital" />
        <div className="content-route">
          {ROUTE_PHASES.map((phase, index) => (
            <div className="content-route-row" key={phase.label}>
              <span className="content-route-index">{index + 1}</span>
              <div className="content-route-body">
                <div className="card-title" style={{ fontSize: 13.5 }}>
                  {phase.label}
                </div>
                <div className="small muted">{phase.detail}</div>
              </div>
              <div className="content-route-count">
                {formatNumber(phase.steps)}
                <span>steps</span>
                <span>{phase.sections} sections</span>
              </div>
            </div>
          ))}
        </div>

        <Callout tone="warning" icon="alert">
          <strong>Workbook baseline still applies:</strong> {DATA_BASELINE.note} Route, collection, questline, boss,
          achievement, and NG+ denominators are current; tier rankings, certified loadouts, encounter presets, and
          upgrade plans remain Regulation {DATA_BASELINE.regulation} until re-validated.
        </Callout>

        <p className="tiny faint" style={{ marginTop: 12 }}>
          Content sources:{" "}
          <a href="https://eldenring.redmaw.dev/sheets/walkthrough" target="_blank" rel="noreferrer">
            base walkthrough
          </a>{" "}
          ·{" "}
          <a href="https://eldenring.redmaw.dev/sheets/dlc-walkthrough" target="_blank" rel="noreferrer">
            DLC walkthrough
          </a>{" "}
          ·{" "}
          <a href="https://eldenring.redmaw.dev/sheets/" target="_blank" rel="noreferrer">
            item sheets
          </a>{" "}
          ·{" "}
          <a href="https://eldenring.redmaw.dev/sheets/bosses" target="_blank" rel="noreferrer">
            bosses
          </a>{" "}
          ·{" "}
          <a href="https://eldenring.redmaw.dev/sheets/questlines" target="_blank" rel="noreferrer">
            questlines
          </a>{" "}
          ·{" "}
          <a href="https://eldenring.redmaw.dev/sheets/achievements" target="_blank" rel="noreferrer">
            achievements
          </a>{" "}
          ·{" "}
          <a href="https://eldenring.redmaw.dev/sheets/new-game-plus" target="_blank" rel="noreferrer">
            NG+
          </a>
          . Generated {formatDate(CONTENT_COVERAGE.generatedAt)}; hashes and per-input provenance are in Settings.
        </p>
      </section>

      <section className="card card-pad" style={{ marginTop: 18 }}>
        <SectionTitle
          title="Tarnished Pack"
          note="Patch 1.17 · included in Tarnished Edition"
          actions={<Badge tone="accent">Owned content tracking</Badge>}
        />
        <div className="grid-2">
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <Icon name="spark" size={17} />
              <h3 style={{ fontSize: 16 }}>What the pack adds</h3>
            </div>
            <div className="pack-highlights">
              {PACK_HIGHLIGHTS.map((highlight) => (
                <div className="pack-highlight" key={highlight.title}>
                  <span className="pack-dot" />
                  <div>
                    <div className="pack-highlight-title">{highlight.title}</div>
                    <div className="small muted">{highlight.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <Icon name="users" size={17} />
              <h3 style={{ fontSize: 16 }}>New starting classes</h3>
            </div>
            <div className="stack" style={{ gap: 9 }}>
              {packClasses.map((entry) => (
                <div className="pack-class" key={entry.id}>
                  <div className="row-between">
                    <div>
                      <div className="card-title">{entry.name}</div>
                      <div className="tiny faint">Level {entry.level}</div>
                    </div>
                    <Badge tone="accent">1.17</Badge>
                  </div>
                  <div className="stat-grid" style={{ marginTop: 9 }}>
                    {STAT_ORDER.map((key) => (
                      <div className="stat-cell" key={key}>
                        <div className="k">{STAT_SHORT[key]}</div>
                        <div className="v">{entry.stats[key]}</div>
                      </div>
                    ))}
                  </div>
                  <p className="small muted" style={{ marginTop: 8 }}>{entry.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="divider" />

        <SectionTitle title="New equipment" note={`${packEquipment.length} records`} />
        <div className="pack-item-grid">
          {packEquipment.map((item) => (
            <button
              key={item.id}
              className="pack-item"
              onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
            >
              <span className="pack-item-head">
                <span className="badge">{item.group}</span>
                <Icon name="chevronRight" size={13} />
              </span>
              <span className="pack-item-name">{item.name}</span>
              <span className="pack-item-loc">{item.region} · {item.acquisitionType}</span>
            </button>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 18 }}>
          <div>
            <SectionTitle title="Spectral Steed attire" note="Cosmetic · Site of Grace" />
            <div className="list">
              {packAttire.map((item) => (
                <div className="list-row" key={item.id}>
                  <div className="grow">
                    <div className="card-title" style={{ fontSize: 13.5 }}>{item.name}</div>
                    <div className="small muted">{item.location}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}>
                    Track
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle title="NPC invasions" note="Missable timing" />
            <div className="list">
              {TARNISHED_ENCOUNTERS.map((encounter) => (
                <div className="list-row" key={encounter.id}>
                  <div className="grow">
                    <div className="row" style={{ gap: 6 }}>
                      <span className="card-title" style={{ fontSize: 13.5 }}>{encounter.name}</span>
                      {encounter.missable ? <Badge tone="warning">Missable</Badge> : null}
                    </div>
                    <div className="small muted">{encounter.location}</div>
                    <div className="tiny faint">{encounter.notes}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/bosses?encounter=${encodeURIComponent(encounter.id)}`)}>
                    Open
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <section className="card card-pad">
          <SectionTitle title="Patch timeline" note="Official releases" />
          <div className="patch-timeline">
            {PATCHES.map((patch) => (
              <div className="patch-release" key={patch.version}>
                <div className="patch-release-head">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="patch-version">{patch.version}</span>
                    <Badge tone={patch.kind === "content" ? "accent" : patch.kind === "bugfix" ? "info" : "default"}>
                      {patch.kind}
                    </Badge>
                  </div>
                  <span className="tiny faint">{formatDate(patch.date)}</span>
                </div>
                <div className="small muted" style={{ margin: "4px 0 8px" }}>{patch.summary}</div>
                <ul className="patch-list">
                  {patch.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="tiny faint">Regulation {patch.regulation}</span>
                  <a className="tiny" href={patch.sourceUrl} target="_blank" rel="noreferrer">
                    Source <Icon name="external" size={11} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card card-pad">
          <SectionTitle title="1.17 balance impact register" note="Validate affected builds" />
          <p className="small muted" style={{ marginBottom: 12 }}>
            These are the official 1.17 changes. The certified build/tier data has not been re-ranked against them.
          </p>
          <div className="impact-list">
            {PATCH_IMPACTS.map((impact) => (
              <details className="impact" key={impact.category}>
                <summary>
                  <span>{impact.category}</span>
                  <Badge>{impact.affected.length}</Badge>
                </summary>
                <p className="small muted">{impact.summary}</p>
                <div className="tag-list">
                  {impact.affected.map((name) => {
                    const match = ITEMS_BY_NAME[name]?.[0];
                    return match ? (
                      <button
                        key={name}
                        className="chip"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/collection?item=${encodeURIComponent(match.id)}`)}
                      >
                        {name}
                      </button>
                    ) : (
                      <span className="chip" key={name}>{name}</span>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 18 }}>
        <SectionTitle title="Remaining validation and coverage" note="Honest gaps before calling build data 1.17-current" />
        <div className="upgrade-checklist">
          {[
            [
              "Fold Tarnished Pack acquisitions into route sequencing",
              `The ${TARNISHED_ITEMS.length} pack records and ${TARNISHED_ENCOUNTERS.length} NPC invasions are tracked in the collection and boss ledger, but are not yet inserted as steps in the Redmaw route.`,
            ],
            [
              "Re-validate tier lists and build loadouts",
              "The 1.17 weapon/skill/spell changes above can move rankings and encounter presets. Treat 1.16.1 rankings as baseline.",
            ],
            [
              "Re-check encounter strategies",
              "Boss strategies and recommended weapons may be affected by buffed skills/spells and shield guard-boost changes.",
            ],
            [
              "Reconcile coverage edges",
              `${formatNumber(CONTENT_COVERAGE.links.unresolved)} of ${formatNumber(CONTENT_COVERAGE.links.labels)} route link labels remain unresolved in linkedRaw, and ${formatNumber(CONTENT_COVERAGE.items.unmatchedWorkbook)} workbook records had no Redmaw match. They stay visible but unlinked.`,
            ],
            [
              "Verify legacy progress migration",
              `${formatNumber(CONTENT_COVERAGE.legacyMap.mapped)} of ${formatNumber(CONTENT_COVERAGE.legacyMap.workbookSteps)} legacy workbook step IDs map to the full route. Unmapped legacy route keys are dropped on load; lifetime collection and endings survive.`,
            ],
            [
              "Re-run extraction and update the source hash",
              "Keep the original workbook immutable and regenerate the workbook seed plus the merged full-game pack when a newer certified workbook arrives.",
            ],
          ].map(([title, detail]) => (
            <div className="checklist-row" key={title}>
              <span className="checklist-dot" />
              <div>
                <div className="card-title" style={{ fontSize: 13.5 }}>{title}</div>
                <div className="small muted">{detail}</div>
              </div>
              <Badge tone="warning">Pending</Badge>
            </div>
          ))}
        </div>
      </section>

      <p className="tiny faint" style={{ marginTop: 20 }}>
        Live-version sources:
        {GAME_VERSION.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
            {source.label}
          </a>
        ))}
      </p>
    </div>
  );
}
