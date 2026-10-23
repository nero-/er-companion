import { useEffect, useMemo, useRef, useState } from "react";
import { ART, ArtBanner } from "../components/Art";
import { Icon, type IconName } from "../components/Icon";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ProgressBar,
  SearchInput,
  Select,
  TabBar,
} from "../components/ui";
import {
  STEP_BY_ID,
  WORLD_BY_ID,
  WORLD_CATEGORY_STATUS,
  WORLD_GAPS,
  WORLD_GRACE_COUNT,
  WORLD_OBJECTS,
  WORLD_OBJECT_COUNT,
} from "../lib/data";
import { formatNumber } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import { worldProgress } from "../lib/selectors";
import { setWorldCheck, useActiveJourney } from "../lib/store";
import type { WorldObject } from "../lib/types";
import "./atlas.css";

/* ---------------------------------------------------------------------------
 * Category configuration
 * ------------------------------------------------------------------------- */

interface CategoryConfig {
  id: string;
  label: string;
  tab: string;
  icon: IconName;
}

const CATEGORIES: CategoryConfig[] = [
  { id: "grace", label: "Sites of Grace", tab: "Graces", icon: "grace" },
  { id: "finger-reader", label: "Finger Readers", tab: "Finger Readers", icon: "users" },
  { id: "stranded-soul", label: "Stranded Souls", tab: "Stranded Souls", icon: "spirit" },
  { id: "sword-monument", label: "Sword Monuments", tab: "Sword Monuments", icon: "greatsword" },
  { id: "martyr-effigy", label: "Martyr Effigies", tab: "Martyr Effigies", icon: "target" },
  { id: "birdseye-telescope", label: "Birdseye Telescopes", tab: "Telescopes", icon: "eye" },
  { id: "stake-of-marika", label: "Stakes of Marika", tab: "Stakes", icon: "flame" },
  { id: "gatekeeper-statue", label: "Gatekeeper Statues", tab: "Gatekeeper Statues", icon: "lock" },
];

const CATEGORY_BY_ID: Record<string, CategoryConfig> = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
);

const CATEGORY_IDS = CATEGORIES.map((category) => category.id);

const CATEGORY_ROWS: Record<string, WorldObject[]> = Object.fromEntries(
  CATEGORIES.map((category) => [
    category.id,
    WORLD_OBJECTS.filter((object) => object.category === category.id),
  ]),
);

const REGIONS = [
  ...new Set(WORLD_OBJECTS.map((object) => object.region).filter((region) => region.trim())),
].sort((a, b) => a.localeCompare(b));

const PAGE_SIZE = 100;

const DLC_OBJECT_COUNT = WORLD_OBJECTS.filter((object) => object.dlc).length;
const ROUTE_LINKED_COUNT = WORLD_OBJECTS.filter((object) => object.routeStepId).length;
const ZERO_LIST_CATEGORIES = CATEGORIES.filter(
  (category) => (WORLD_CATEGORY_STATUS[category.id]?.count ?? 0) === 0,
);

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

type CategoryState = "resolved" | "partial" | "unresolved";

const CATEGORY_STATE: Record<string, CategoryState> = Object.fromEntries(
  CATEGORIES.map((entry) => {
    const categoryStatus = WORLD_CATEGORY_STATUS[entry.id];
    if (!categoryStatus) return [entry.id, "unresolved"] as const;
    if (categoryStatus.resolved) return [entry.id, "resolved"] as const;
    return [entry.id, categoryStatus.count === 0 ? "unresolved" : "partial"] as const;
  }),
);

const STATE_LABEL: Record<CategoryState, string> = {
  resolved: "Resolved",
  partial: "Partial",
  unresolved: "Unresolved",
};

const STATE_SHORT_LABEL: Record<CategoryState, string> = {
  resolved: "Resolved",
  partial: "Partial",
  unresolved: "No list",
};

const STATE_TONE: Record<CategoryState, "success" | "warning" | "danger"> = {
  resolved: "success",
  partial: "warning",
  unresolved: "danger",
};

function matchesSearch(query: string, object: WorldObject): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    object.name,
    object.region,
    object.subregion,
    object.location,
    object.description,
  ].some((value) => value.toLowerCase().includes(needle));
}

function hostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = decodeURIComponent(parsed.pathname).replace(/^\/wiki\//, "");
    return path && path !== "/" ? `${host} · ${path.replace(/_/g, " ")}` : host;
  } catch {
    return url;
  }
}

function categoryFromRoute(
  categoryParam: string | null,
  focusParam: string | null,
): string {
  const focus = focusParam ? WORLD_BY_ID[focusParam] : undefined;
  if (focus && CATEGORY_IDS.includes(focus.category)) return focus.category;
  return categoryParam && CATEGORY_IDS.includes(categoryParam) ? categoryParam : "grace";
}

/* ---------------------------------------------------------------------------
 * Row pieces
 * ------------------------------------------------------------------------- */

function WorldLinks({ object }: { object: WorldObject }) {
  const step = object.routeStepId ? STEP_BY_ID[object.routeStepId] : undefined;
  return (
    <div className="atlas-row-links">
      {object.sourceUrl ? (
        <a
          className="atlas-link"
          href={object.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open source for ${object.name}`}
        >
          Source
          <Icon name="external" size={11} />
        </a>
      ) : (
        <span className="atlas-link atlas-link--missing">No source</span>
      )}
      {object.mapUrl ? (
        <a
          className="atlas-link"
          href={object.mapUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open map location for ${object.name}`}
        >
          Map
          <Icon name="external" size={11} />
        </a>
      ) : null}
      {object.routeStepId ? (
        <button
          type="button"
          className="atlas-link atlas-link-button"
          onClick={() =>
            navigate(
              step
                ? `/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`
                : `/journey?step=${encodeURIComponent(object.routeStepId)}`,
            )
          }
        >
          Route step
          <Icon name="chevronRight" size={12} />
        </button>
      ) : null}
    </div>
  );
}

function ObjectBadges({ object }: { object: WorldObject }) {
  if (!object.dlc && !object.missable && !object.unresolved) return null;
  return (
    <span className="atlas-badges">
      {object.dlc ? <Badge tone="info">SotE</Badge> : null}
      {object.missable ? <Badge tone="warning">Missable</Badge> : null}
      {object.unresolved ? (
        <Badge
          tone="danger"
          className="atlas-unresolved-badge"
        >
          Location unresolved
        </Badge>
      ) : null}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export function AtlasPage() {
  const journey = useActiveJourney();
  const route = useRoute();
  const progress = useMemo(() => worldProgress(journey), [journey]);

  const focusId = route.query.get("focus") ?? "";
  const focusObject = focusId ? WORLD_BY_ID[focusId] : undefined;

  const [category, setCategory] = useState(() =>
    categoryFromRoute(route.query.get("category"), route.query.get("focus")),
  );
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState(() => route.query.get("region") ?? "all");
  const [game, setGame] = useState("all");
  const [checkFilter, setCheckFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const appliedFocus = useRef("");
  const scrolledFocus = useRef("");
  const previousCategory = useRef(category);

  const config = CATEGORY_BY_ID[category] ?? CATEGORIES[0];
  const status = WORLD_CATEGORY_STATUS[category];
  const state = CATEGORY_STATE[category];
  const gap = state === "resolved" ? undefined : WORLD_GAPS.find((entry) => entry.category === category);
  const rows = CATEGORY_ROWS[category] ?? [];
  const categoryProgress = progress.byCategory[category] ?? { done: 0, total: rows.length };

  const regions = useMemo(
    () =>
      [
        ...new Set(rows.map((object) => object.region).filter((value) => value.trim())),
      ].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((object) => {
        if (region !== "all" && object.region !== region) return false;
        if (game === "base" && object.dlc) return false;
        if (game === "dlc" && !object.dlc) return false;
        const checked = Boolean(journey.worldChecks[object.id]);
        if (checkFilter === "checked" && !checked) return false;
        if (checkFilter === "unchecked" && checked) return false;
        return matchesSearch(query, object);
      }),
    [rows, region, game, checkFilter, query, journey.worldChecks],
  );

  const visible = filtered.slice(0, limit);
  const checkedInCategory = categoryProgress.done;
  const listedCount = status?.count ?? rows.length;

  function resetFilters() {
    setQuery("");
    setRegion("all");
    setGame("all");
    setCheckFilter("all");
    setLimit(PAGE_SIZE);
  }

  function changeCategory(next: string) {
    if (next === category) return;
    setCategory(next);
    setQuery("");
    setRegion("all");
    setGame("all");
    setCheckFilter("all");
    setLimit(PAGE_SIZE);
    navigate(`/atlas?category=${encodeURIComponent(next)}`);
  }

  // Respond to external hash changes (deep links, back/forward). In-app tab
  // clicks navigate too; their state is already applied and the observed route
  // key only changes once the hash lands, so this never fights the click.
  const routeCategory = categoryFromRoute(
    route.query.get("category"),
    route.query.get("focus"),
  );
  const routeRegion = route.query.get("region") ?? "all";
  const routeKey = `${routeCategory}|${focusId}|${routeRegion}`;
  const lastRouteKey = useRef(routeKey);

  useEffect(() => {
    if (lastRouteKey.current === routeKey) return;
    lastRouteKey.current = routeKey;
    setCategory(routeCategory);
    setQuery("");
    setRegion(routeRegion);
    setGame("all");
    setCheckFilter("all");
    setLimit(PAGE_SIZE);
  }, [routeKey, routeCategory, routeRegion]);

  // Reset filters when the tab really changes for any reason.
  useEffect(() => {
    if (previousCategory.current === category) return;
    previousCategory.current = category;
    setLimit(PAGE_SIZE);
  }, [category]);

  useEffect(() => {
    if (region !== "all" && !regions.includes(region)) setRegion("all");
  }, [regions, region]);

  // A focus deep link wins over filters: clear anything that could hide it and
  // extend the window far enough to include its index.
  useEffect(() => {
    if (!focusObject) {
      appliedFocus.current = "";
      return;
    }
    if (appliedFocus.current === focusObject.id) return;
    appliedFocus.current = focusObject.id;
    setCategory(focusObject.category);
    setQuery("");
    const requestedRegion = route.query.get("region") ?? "all";
    setRegion(
      requestedRegion !== "all" && requestedRegion === focusObject.region
        ? requestedRegion
        : "all",
    );
    setGame("all");
    setCheckFilter("all");
    const index = CATEGORY_ROWS[focusObject.category].findIndex(
      (object) => object.id === focusObject.id,
    );
    setLimit(Math.max(PAGE_SIZE, index + 1));
  }, [focusObject]);

  useEffect(() => {
    if (!focusId) {
      scrolledFocus.current = "";
      return;
    }
    if (scrolledFocus.current === focusId) return;
    const node = document.getElementById(`atlas-row-${focusId}`);
    if (!node) return;
    scrolledFocus.current = focusId;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, category, limit]);

  return (
    <div className="page atlas-page">
      <ArtBanner
        image={ART.heroErdtree}
        alt=""
        caption={`World atlas · ${formatNumber(WORLD_OBJECT_COUNT)} objects`}
        title="Every grace, monument, effigy, and spirit"
        variant="world"
        priority
        className="atlas-banner"
      >
        <div className="atlas-banner-stats">
          <div className="atlas-banner-stat atlas-banner-stat--hero">
            <span className="atlas-banner-stat-label">World objects</span>
            <strong>{formatNumber(WORLD_OBJECT_COUNT)}</strong>
            <span className="atlas-banner-stat-detail">
              {formatNumber(DLC_OBJECT_COUNT)} Shadow of the Erdtree
            </span>
          </div>
          <div className="atlas-banner-stat atlas-banner-stat--hero">
            <span className="atlas-banner-stat-label">Sites of Grace</span>
            <strong>{formatNumber(WORLD_GRACE_COUNT)}</strong>
            <span className="atlas-banner-stat-detail">resolved list</span>
          </div>
          {CATEGORIES.filter((entry) => entry.id !== "grace").map((entry) => (
            <div
              key={entry.id}
              className={`atlas-banner-stat atlas-banner-stat--${CATEGORY_STATE[entry.id]}`}
            >
              <span className="atlas-banner-stat-label">{entry.label}</span>
              <strong>{formatNumber(WORLD_CATEGORY_STATUS[entry.id]?.count ?? 0)}</strong>
              <span className="atlas-banner-stat-detail">{STATE_SHORT_LABEL[CATEGORY_STATE[entry.id]]}</span>
            </div>
          ))}
        </div>
        <p className="atlas-banner-note">
          {formatNumber(ROUTE_LINKED_COUNT)} entries link to a route step.{" "}
          {ZERO_LIST_CATEGORIES.length > 0
            ? `${ZERO_LIST_CATEGORIES.map((entry) => entry.label).join(" and ")} publish zero rows because no authoritative per-object list exists.`
            : ""}
        </p>
      </ArtBanner>

      <TabBar
        items={CATEGORIES.map((entry) => ({
          id: entry.id,
          label: entry.tab,
          count: WORLD_CATEGORY_STATUS[entry.id]?.count ?? CATEGORY_ROWS[entry.id].length,
        }))}
        value={category}
        onChange={changeCategory}
      />

      <section className={`atlas-status atlas-status--${state}`}>
        <div className="atlas-status-head">
          <span className="atlas-status-icon" aria-hidden="true">
            <Icon name={config.icon} size={22} />
          </span>
          <div className="atlas-status-copy">
            <div className="atlas-status-eyebrow">Category status</div>
            <h2 className="atlas-status-title">{config.label}</h2>
            <p className="atlas-status-note">
              {status?.note ?? "No category metadata is recorded for this ledger."}
            </p>
          </div>
          <div className="atlas-status-side">
            <div className="atlas-status-badges">
              <Badge tone={STATE_TONE[CATEGORY_STATE[category]]}>
                {STATE_LABEL[CATEGORY_STATE[category]]}
              </Badge>
              {listedCount === 0 ? (
                <Badge tone="danger">No authoritative list</Badge>
              ) : null}
            </div>
            <div className="atlas-status-metrics">
              <div className="atlas-status-metric">
                <strong>{formatNumber(listedCount)}</strong>
                <span>listed</span>
              </div>
              <div className="atlas-status-metric">
                <strong>{formatNumber(checkedInCategory)}</strong>
                <span>checked</span>
              </div>
              <div className="atlas-status-metric">
                <strong>
                  {listedCount > 0
                    ? `${Math.round((checkedInCategory / listedCount) * 100)}%`
                    : "—"}
                </strong>
                <span>complete</span>
              </div>
            </div>
            {status?.sourceUrl ? (
              <a
                className="atlas-source-link"
                href={status.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Category source
                <Icon name="external" size={11} />
              </a>
            ) : null}
          </div>
        </div>

        {listedCount > 0 ? (
          <ProgressBar
            value={listedCount > 0 ? (checkedInCategory / listedCount) * 100 : 0}
            tone={listedCount > 0 && checkedInCategory >= listedCount ? "success" : "accent"}
            label={`${formatNumber(checkedInCategory)} of ${formatNumber(listedCount)} checked`}
            detail={`Overall atlas ${formatNumber(progress.done)} / ${formatNumber(progress.total)}`}
          />
        ) : (
          <p className="atlas-status-zero">
            This ledger deliberately contains <strong>0 rows</strong>. No authoritative
            per-object list exists in the permitted sources, so no locations were invented.
          </p>
        )}

        {gap ? (
          <div className="atlas-gap">
            <div className="atlas-gap-head">
              <Icon name="alert" size={14} />
              <strong>{gap.issue}</strong>
            </div>
            <p>{gap.detail}</p>
            {gap.sourcesTried.length > 0 ? (
              <div className="atlas-gap-sources">
                <span className="atlas-gap-sources-label">Sources checked</span>
                {gap.sourcesTried.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {hostLabel(url)}
                    <Icon name="external" size={10} />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="atlas-toolbar">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setLimit(PAGE_SIZE);
          }}
          placeholder="Search name, region, or location…"
          className="atlas-search"
        />
        <Select
          label="Region"
          value={region}
          onChange={(event) => {
            setRegion(event.target.value);
            setLimit(PAGE_SIZE);
          }}
        >
          <option value="all">All regions ({regions.length})</option>
          {regions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          label="Game"
          value={game}
          onChange={(event) => {
            setGame(event.target.value);
            setLimit(PAGE_SIZE);
          }}
        >
          <option value="all">Base + Shadow of the Erdtree</option>
          <option value="base">Base game</option>
          <option value="dlc">Shadow of the Erdtree</option>
        </Select>
        <Select
          label="Check state"
          value={checkFilter}
          onChange={(event) => {
            setCheckFilter(event.target.value);
            setLimit(PAGE_SIZE);
          }}
        >
          <option value="all">All entries</option>
          <option value="unchecked">
            Unchecked ({formatNumber(Math.max(0, listedCount - checkedInCategory))})
          </option>
          <option value="checked">Checked ({formatNumber(checkedInCategory)})</option>
        </Select>
        <Button variant="ghost" icon="x" onClick={resetFilters}>
          Reset
        </Button>
      </div>

      {focusId && !focusObject ? (
        <p className="atlas-focus-warning">
          <Icon name="alert" size={13} /> No world object matches{" "}
          <code>focus={focusId}</code>.
        </p>
      ) : null}

      <div className="atlas-list-head">
        <span className="atlas-list-count">
          <strong>{formatNumber(filtered.length)}</strong> matching{" "}
          {filtered.length === 1 ? "entry" : "entries"}
          {filtered.length !== rows.length ? ` of ${formatNumber(rows.length)} listed` : ""}
        </span>
        <span className="atlas-list-note">
          {formatNumber(visible.length)} rendered · page size {PAGE_SIZE}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No entries exist for this category"
          description={
            <span>
              No authoritative list of {config.label.toLowerCase()} is available. The atlas
              keeps the category visible rather than claiming coverage that the sources do
              not support.
            </span>
          }
          icon="alert"
          action={
            status?.sourceUrl ? (
              <a
                className="btn"
                href={status.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Check the source
                <Icon name="external" size={14} />
              </a>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No world objects match these filters"
          description="Clear the search or widen the region, game, and check-state filters."
          icon="search"
          action={
            <Button variant="primary" icon="refresh" onClick={resetFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="table-wrap atlas-table-wrap">
            <table className="data-table atlas-table">
              <thead>
                <tr>
                  <th className="atlas-check-cell">Done</th>
                  <th>World object</th>
                  <th>Region</th>
                  <th>Location</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((object) => {
                  const checked = Boolean(journey.worldChecks[object.id]);
                  const isFocus = object.id === focusId;
                  return (
                    <tr
                      key={object.id}
                      id={`atlas-row-${object.id}`}
                      className={`${checked ? "is-checked " : ""}${isFocus ? "is-focus" : ""}`.trim() || undefined}
                    >
                      <td className="atlas-check-cell" data-label="Visited">
                        <Checkbox
                          checked={checked}
                          onChange={(value) => setWorldCheck(object.id, value)}
                          label={
                            <span className="sr-only">
                              Mark {object.name} as visited
                            </span>
                          }
                        />
                      </td>
                      <td className="atlas-object-cell" data-label="World object">
                        <div className="atlas-object-name">{object.name}</div>
                        <ObjectBadges object={object} />
                        {object.description && object.description !== object.location ? (
                          <div className="atlas-object-desc">{object.description}</div>
                        ) : null}
                      </td>
                      <td data-label="Region">
                        <div className="atlas-region">{object.region}</div>
                        {object.subregion && object.subregion !== object.region ? (
                          <div className="atlas-subregion">{object.subregion}</div>
                        ) : null}
                      </td>
                      <td data-label="Location">
                        <div className="atlas-location">{object.location || "—"}</div>
                      </td>
                      <td data-label="Links">
                        <WorldLinks object={object} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="atlas-load-row">
            {visible.length < filtered.length ? (
              <Button
                icon="chevronDown"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              >
                Load {formatNumber(Math.min(PAGE_SIZE, filtered.length - visible.length))}{" "}
                more
              </Button>
            ) : (
              <span className="tiny faint">
                All {formatNumber(filtered.length)} matching entries shown.
              </span>
            )}
            <span className="tiny faint">
              {formatNumber(visible.length)} of {formatNumber(filtered.length)} ·{" "}
              {formatNumber(rows.length)} in {config.label}
            </span>
          </div>
        </>
      )}

      <p className="atlas-footnote">
        Counts come from the merged world ledger. Partial categories list every row the
        sources publish but are not presented as complete; zero-row categories are explicit
        gaps. Checked state is saved automatically.
      </p>
    </div>
  );
}
