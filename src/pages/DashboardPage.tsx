import { Badge, Button, PageHeader, ProgressBar, Ring, SectionTitle, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { useActiveCharacter, useActiveJourney, useAppState, setStepStatus } from "../lib/store";
import {
  areaProgress,
  collectionSummary,
  currentAreaName,
  endingSummary,
  loreAccess,
  nextRouteStep,
  nextSupplemental,
  routeProgress,
  supplementalProgress,
} from "../lib/selectors";
import {
  ITEM_BY_ID,
  ITEMS_BY_REGION,
  LORE,
  LOADOUTS_BY_BUILD,
  PROFILE_BY_ID,
  ROUTE_AREAS,
} from "../lib/data";
import { formatNumber, itemGroupIcon } from "../lib/format";
import { navigate } from "../lib/router";
import { levelFromStats } from "../lib/classes";

export function DashboardPage() {
  const state = useAppState();
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const route = routeProgress(journey);
  const chronology = supplementalProgress(journey);
  const collection = collectionSummary(character);
  const ending = endingSummary(character);
  const next = nextRouteStep(journey);
  const nextAction = nextSupplemental(journey);
  const area = currentAreaName(journey);
  const level = levelFromStats(character.stats);
  const profile = character.profileId ? PROFILE_BY_ID[character.profileId] : undefined;
  const loadout = profile ? LOADOUTS_BY_BUILD[profile.id]?.find((entry) => entry.type === "Signature") : undefined;
  const linkedItems = next
    ? next.linkedIds.map((id) => ITEM_BY_ID[id]).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 4)
    : [];
  const defeatedBosses = Object.values(journey.bosses).filter((status) => status === "defeated").length;
  const unlockedLore = LORE.filter((entry) => loreAccess(journey, state.settings, entry).unlocked).length;
  const areaItems = (ITEMS_BY_REGION[area] ?? []).filter((item) => !character.items[item.id]).slice(0, 6);

  const completeNext = () => {
    if (!next) return;
    const result = setStepStatus(next.id, "done");
    const parts = ["Step marked done."];
    if (result.acquiredItems.length) parts.push(`${result.acquiredItems.length} item${result.acquiredItems.length === 1 ? "" : "s"} acquired`);
    if (result.defeatedBosses.length) parts.push(`${result.defeatedBosses.length} boss${result.defeatedBosses.length === 1 ? "" : "s"} recorded`);
    if (result.scarabs.length) parts.push(`${result.scarabs.length} scarab${result.scarabs.length === 1 ? "" : "s"} collected`);
    toast.push(parts.join(" · "), "success");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Act I route`}
        title="Continue the journey"
        description={
          <>
            One next action, the closeout state around it, and the current build. The route is Act I; the companion
            chronology and all collection/build data span the full game.
          </>
        }
        actions={
          <>
            <Button variant="primary" icon="map" onClick={() => navigate("/journey")}>
              Open journey
            </Button>
            <Button variant="ghost" icon="search" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}>
              Search
            </Button>
          </>
        }
      />

      <div className="hero-grid">
        <section className="card card-accent hero-next">
          <div className="row-between wrap">
            <div className="row" style={{ gap: 7 }}>
              <Badge tone="accent">{area}</Badge>
              <Badge>{next?.type ?? "Route"}</Badge>
              {next?.required ? <Badge tone="warning">Required</Badge> : <Badge>Optional</Badge>}
            </div>
            <span className="tiny faint mono">
              Step {next ? next.order + 1 : route.total} / {route.total}
            </span>
          </div>

          {next ? (
            <>
              <div className="hero-kicker">Next action</div>
              <h2 className="hero-instruction">{next.instruction}</h2>
              <div className="hero-meta">
                <span className="row" style={{ gap: 5 }}>
                  <Icon name="target" size={13} /> {next.location || next.area}
                </span>
                <span className="row" style={{ gap: 5 }}>
                  <Icon name="layers" size={13} /> {next.objectiveName}
                </span>
                {next.estimatedTime ? (
                  <span className="row" style={{ gap: 5 }}>
                    <Icon name="clock" size={13} /> {next.estimatedTime}
                  </span>
                ) : null}
              </div>
              {next.warning ? (
                <div className="callout warning" style={{ marginTop: 14 }}>
                  <Icon name="alert" size={15} />
                  <div>{next.warning}</div>
                </div>
              ) : null}
              {next.prerequisites ? (
                <div className="small faint" style={{ marginTop: 10 }}>
                  Prerequisite: {next.prerequisites}
                </div>
              ) : null}
              {linkedItems.length ? (
                <div className="tag-list" style={{ marginTop: 14 }}>
                  {linkedItems.map((item) => (
                    <button
                      key={item.id}
                      className="chip"
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
                    >
                      <Icon name={itemGroupIcon(item.group)} size={12} />
                      {item.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="row wrap" style={{ marginTop: 20 }}>
                <Button variant="primary" icon="check" onClick={completeNext}>
                  Mark step done
                </Button>
                <Button icon="eye" onClick={() => navigate(`/journey?area=${encodeURIComponent(next.area)}&step=${next.id}`)}>
                  Inspect in journey
                </Button>
                <Button variant="ghost" icon="chevronRight" onClick={() => navigate("/journey")}>
                  Route details
                </Button>
              </div>
            </>
          ) : (
            <div style={{ padding: "24px 0 10px" }}>
              <div className="hero-kicker">Act I route complete</div>
              <h2 className="hero-instruction">The certified Act I route is closed.</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                Continue the whole-game companion chronology, close the collection, or prepare the ending sequence.
              </p>
              <div className="row wrap" style={{ marginTop: 18 }}>
                <Button variant="primary" icon="list" onClick={() => navigate("/journey?tab=chronology")}>
                  Open chronology
                </Button>
                <Button icon="trophy" onClick={() => navigate("/completion")}>
                  Completion
                </Button>
              </div>
            </div>
          )}
          <div className="hero-progress">
            <ProgressBar
              value={route.requiredPercent}
              label={`${route.requiredResolved} / ${route.required} required steps`}
              detail={`${route.done} done · ${route.skipped} skipped`}
            />
          </div>
        </section>

        <section className="card card-pad dashboard-pulse">
          <div className="row-between">
            <div>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                Journey pulse
              </div>
              <h2 className="card-title">{journey.label}</h2>
            </div>
            <Ring value={route.requiredPercent} size={84} stroke={5} />
          </div>
          <div className="pulse-grid">
            <div>
              <div className="stat-label">Collection</div>
              <div className="pulse-value">{collection.percent}%</div>
              <div className="tiny faint">{formatNumber(collection.owned)} / {formatNumber(collection.total)}</div>
            </div>
            <div>
              <div className="stat-label">Chronology</div>
              <div className="pulse-value">{chronology.percent}%</div>
              <div className="tiny faint">{chronology.resolved} / {chronology.total} actions</div>
            </div>
            <div>
              <div className="stat-label">Bosses</div>
              <div className="pulse-value">{defeatedBosses}</div>
              <div className="tiny faint">recorded in this journey</div>
            </div>
            <div>
              <div className="stat-label">Lore</div>
              <div className="pulse-value">{unlockedLore}</div>
              <div className="tiny faint">chapters unlocked</div>
            </div>
          </div>
          <div className="divider" />
          <div className="row-between">
            <div className="small muted">Next chronology action</div>
            <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate("/journey?tab=chronology")}>
              View
            </Button>
          </div>
          {nextAction ? (
            <button className="pulse-action" onClick={() => navigate(`/journey?tab=chronology&action=${encodeURIComponent(nextAction.id)}`)}>
              <Icon name="list" size={15} />
              <span className="grow">
                <span className="pulse-action-title">{nextAction.action}</span>
                <span className="pulse-action-sub">{nextAction.area} · {nextAction.category}</span>
              </span>
              <Icon name="chevronRight" size={14} />
            </button>
          ) : (
            <p className="small faint">All companion chronology actions are resolved.</p>
          )}
        </section>
      </div>

      <div className="grid-4" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="stat-label">Route completion</div>
          <div className="stat-value">
            {route.requiredPercent}% <small>required</small>
          </div>
          <div className="stat-delta">{route.resolved} of {route.total} steps resolved</div>
        </div>
        <div className="stat">
          <div className="stat-label">Master collection</div>
          <div className="stat-value">
            {formatNumber(collection.owned)} <small>/ {formatNumber(collection.total)}</small>
          </div>
          <div className="stat-delta">{collection.baseGame.owned} base · {collection.dlc.owned} DLC owned</div>
        </div>
        <div className="stat">
          <div className="stat-label">Endings viewed</div>
          <div className="stat-value">
            {ending.viewed} <small>/ {ending.total}</small>
          </div>
          <div className="stat-delta">Permanent: {ending.permanent}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Character</div>
          <div className="stat-value">
            Lv {level} <small>{profile?.archetype ?? "Unassigned"}</small>
          </div>
          <div className="stat-delta">{character.classId} · {character.equipmentMode}</div>
        </div>
      </div>

      <div className="dashboard-columns" style={{ marginTop: 22 }}>
        <section className="card card-pad">
          <SectionTitle
            title="Act I areas"
            note="Route order"
            actions={
              <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate("/journey")}>
                All steps
              </Button>
            }
          />
          <div className="area-list">
            {ROUTE_AREAS.filter((entry) => entry.hasRoute).map((entry) => {
              const progress = areaProgress(journey, entry.name);
              const isCurrent = area === entry.name;
              return (
                <button
                  key={entry.name}
                  className={`area-row ${isCurrent ? "current" : ""}`}
                  onClick={() => navigate(`/journey?area=${encodeURIComponent(entry.name)}`)}
                >
                  <div className="area-row-main">
                    <div className="row-between">
                      <span className="area-name">
                        {entry.name}
                        {isCurrent ? <span className="badge badge-accent" style={{ marginLeft: 8 }}>Current</span> : null}
                      </span>
                      <span className="tiny faint mono">{progress.resolved}/{progress.total}</span>
                    </div>
                    <ProgressBar value={progress.requiredPercent} tone={progress.complete ? "success" : "accent"} />
                  </div>
                  <Icon name="chevronRight" size={14} />
                </button>
              );
            })}
          </div>
        </section>

        <div className="stack">
          <section className="card card-pad">
            <SectionTitle
              title="Build at a glance"
              actions={
                <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate("/builds")}>
                  Builds
                </Button>
              }
            />
            {profile ? (
              <>
                <div className="row-between">
                  <div>
                    <div className="card-title">{profile.archetype}</div>
                    <div className="small muted">
                      Level {profile.level} · {profile.primaryStat} / {profile.secondaryStat}
                    </div>
                  </div>
                  <Badge tone="accent">{loadout?.type ?? "Certified"}</Badge>
                </div>
                <div className="stat-grid" style={{ marginTop: 14 }}>
                  {Object.entries(profile.stats).map(([key, value]) => (
                    <div className="stat-cell" key={key}>
                      <div className="k">{key.toUpperCase()}</div>
                      <div className="v">{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="gear-row">
                    <span className="gear-label">Primary</span>
                    <span className="gear-value">{loadout?.mainWeapon || "—"}</span>
                  </div>
                  <div className="gear-row">
                    <span className="gear-label">Secondary</span>
                    <span className="gear-value">{loadout?.secondaryWeapon || "—"}</span>
                  </div>
                  <div className="gear-row">
                    <span className="gear-label">Armor</span>
                    <span className="gear-value">{loadout?.armor.filter(Boolean).join(" · ") || "—"}</span>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 14 }}>
                  <Button size="sm" icon="helmet" onClick={() => navigate("/character")}>
                    Open character
                  </Button>
                  <Button size="sm" variant="ghost" icon="sword" onClick={() => navigate(`/builds?archetype=${profile.archetypeId}`)}>
                    Build details
                  </Button>
                </div>
              </>
            ) : (
              <div className="empty" style={{ padding: "26px 14px" }}>
                <div>
                  <Icon name="sword" size={24} />
                  <h3>No certified build selected</h3>
                  <p className="small muted">Choose one of the 14 certified parent builds or plan a freeform character.</p>
                  <div style={{ marginTop: 12 }}>
                    <Button size="sm" variant="primary" icon="sword" onClick={() => navigate("/builds")}>
                      Browse builds
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="card card-pad">
            <SectionTitle
              title={`Missing in ${area}`}
              note={`${areaItems.length} shown`}
              actions={
                <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => navigate(`/collection?region=${encodeURIComponent(area)}`)}>
                  Collection
                </Button>
              }
            />
            {areaItems.length ? (
              <div className="stack" style={{ gap: 7 }}>
                {areaItems.map((item) => (
                  <button
                    key={item.id}
                    className="item-card"
                    onClick={() => navigate(`/collection?item=${encodeURIComponent(item.id)}`)}
                  >
                    <span className="item-glyph">
                      <Icon name={itemGroupIcon(item.group)} size={14} />
                    </span>
                    <span className="grow">
                      <span className="item-name">{item.name}</span>
                      <span className="item-sub">
                        {item.group} · {item.acquisitionType}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="small muted">No catalogued items remain in this area.</p>
            )}
          </section>
        </div>
      </div>

      <p className="tiny faint" style={{ marginTop: 26 }}>
        {formatNumber(route.total)} Act I route steps · {chronology.total} whole-game chronology actions ·{" "}
        {formatNumber(collection.total)} catalogued items · source workbook {state.settings.spoilerMode === "strict" ? "spoiler-safe" : "revealed"} mode
      </p>
    </div>
  );
}
