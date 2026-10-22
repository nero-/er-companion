import { Badge, Button, Callout, PageHeader, SectionTitle } from "../components/ui";
import { Icon } from "../components/Icon";
import { CLASSES, STAT_SHORT, STAT_ORDER } from "../lib/classes";
import { formatDate } from "../lib/format";
import { ITEMS_BY_NAME } from "../lib/data";
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

export function PatchPage() {
  const packClasses = CLASSES.filter((entry) => PACK_CLASS_IDS.includes(entry.id));
  const packItems = TARNISHED_ITEMS;
  const packEquipment = packItems.filter((item) => item.group !== "Steed Attire");
  const packAttire = packItems.filter((item) => item.group === "Steed Attire");
  const uniqueWeapons = packEquipment.filter((item) => item.group === "Weapon" || item.group === "Shield");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Live game status · checked 2026-10-21"
        title="Patch & DLC"
        description={
          <>
            The live rules are <strong>{GAME_VERSION.app}</strong> / Regulation{" "}
            <strong>{GAME_VERSION.regulation}</strong>. The workbook was authored against Regulation{" "}
            {DATA_BASELINE.regulation}, so build and tier recommendations are explicitly marked as baseline data.
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
        <SectionTitle title="Content update checklist" note="What remains before calling build data 1.17-current" />
        <div className="upgrade-checklist">
          {[
            ["Add Tarnished Pack route steps and acquisition anchors", "The workbook route is Act I-only and predates the pack. The pack items are tracked; they are not yet folded into route sequencing."],
            ["Re-validate tier lists and build loadouts", "The 1.17 weapon/skill/spell changes above can move rankings and encounter presets. Treat 1.16.1 rankings as baseline."],
            ["Re-check encounter strategies", "Boss strategies and recommended weapons may be affected by buffed skills/spells and shield guard-boost changes."],
            ["Reconcile completion denominators", "Pack items are appended to the collection and marked as Tarnished Pack; whole-game completion claims remain coverage-qualified."],
            ["Re-run extraction and update the source hash", "Keep the original workbook immutable and regenerate canonical JSON when a newer certified workbook arrives."],
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
