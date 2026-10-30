import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import {
  Badge,
  Button,
  Checkbox,
  Disclosure,
  EmptyState,
  PageHeader,
  ProgressBar,
  SearchInput,
  Select,
  TabBar,
} from "../components/ui";
import {
  STEP_BY_ID,
  STEP_BY_SOURCE_ID,
  remapStepId,
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
import type {
  RouteStep,
  WorldObject,
  WorldObjectCategoryStatus,
  WorldObjectGap,
} from "../lib/types";
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

const CATEGORY_ROWS: Record<string, WorldObject[]> = Object.fromEntries(
  CATEGORIES.map((category) => [
    category.id,
    WORLD_OBJECTS.filter((object) => object.category === category.id),
  ]),
);

const PAGE_SIZE = 100;

/**
 * World-object rows carry the Redmaw source id (`w2-1`), journey steps use the
 * runtime id (`RW-B-w2-1`) and old saves hold remapped ids, so every object is
 * resolved once: step id → source id → legacy map. Unresolved ids stay empty
 * instead of producing a link that opens nothing.
 */
const RESOLVED_STEPS: Record<string, RouteStep | undefined> = {};
for (const object of WORLD_OBJECTS) {
  const rawId = object.routeStepId;
  if (!rawId) continue;
  const direct = STEP_BY_ID[rawId] ?? STEP_BY_SOURCE_ID[rawId];
  const remapped = direct ? null : remapStepId(rawId);
  RESOLVED_STEPS[object.id] = direct ?? (remapped ? STEP_BY_ID[remapped] : undefined);
}

const DLC_OBJECT_COUNT = WORLD_OBJECTS.filter((object) => object.dlc).length;
const ROUTE_LINKED_COUNT = WORLD_OBJECTS.filter((object) => RESOLVED_STEPS[object.id]).length;

const UNTRACKED_CATEGORIES = CATEGORIES.filter(
  (category) => (WORLD_CATEGORY_STATUS[category.id]?.count ?? 0) === 0,
);

/* ---------------------------------------------------------------------------
 * Category state — derived from WORLD_CATEGORY_STATUS, never hard-coded counts
 * ------------------------------------------------------------------------- */

type CategoryState = "resolved" | "partial" | "archived" | "untracked";

function categoryState(entry: CategoryConfig): CategoryState {
  const categoryStatus: WorldObjectCategoryStatus | undefined = WORLD_CATEGORY_STATUS[entry.id];
  if (!categoryStatus || categoryStatus.count === 0) return "untracked";
  if (categoryStatus.resolved) return "resolved";
  return /web\.archive\.org/i.test(categoryStatus.sourceUrl) ? "archived" : "partial";
}

const CATEGORY_STATE: Record<string, CategoryState> = Object.fromEntries(
  CATEGORIES.map((entry) => [entry.id, categoryState(entry)] as [string, CategoryState]),
);

const STATE_LABEL: Record<CategoryState, string> = {
  resolved: "Resolved list",
  partial: "Partial list",
  archived: "Archived source — unresolved",
  untracked: "Not tracked — no authoritative list exists",
};

const STATE_TONE: Record<CategoryState, "success" | "warning" | "danger"> = {
  resolved: "success",
  partial: "warning",
  archived: "warning",
  untracked: "danger",
};

/** Short, state-specific explanation shown next to the long category note. */
const STATE_REASON: Record<CategoryState, string> = {
  resolved: "Every row comes from a source that publishes a complete per-object list.",
  partial:
    "Lower bound: the listed rows are every row the sources publish, but no source claims the list is complete, so this category is never presented as finished.",
  archived:
    "Rows come from an Internet Archive snapshot because no live source publishes a per-object list; the live pages are stubs or 404s.",
  untracked:
    "Not tracked: no authoritative per-object list exists, so no rows are invented and this category stays out of every percentage.",
};

/** Categories that can appear as tabs and count toward percentages. */
const TRACKED_CATEGORIES = CATEGORIES.filter(
  (category) => (WORLD_CATEGORY_STATUS[category.id]?.count ?? 0) > 0,
);

const TRACKED_CATEGORY_IDS = TRACKED_CATEGORIES.map((category) => category.id);

const RESOLVED_CATEGORY_COUNT = CATEGORIES.filter(
  (category) => CATEGORY_STATE[category.id] === "resolved",
).length;
const PARTIAL_CATEGORY_COUNT = CATEGORIES.filter((category) => {
  const state = CATEGORY_STATE[category.id];
  return state === "partial" || state === "archived";
}).length;

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
  const requested = focus?.category ?? categoryParam ?? "";
  return TRACKED_CATEGORY_IDS.includes(requested) ? requested : TRACKED_CATEGORY_IDS[0];
}

/* ---------------------------------------------------------------------------
 * Row pieces
 * ------------------------------------------------------------------------- */

function WorldLinks({ object }: { object: WorldObject }) {
  const step = RESOLVED_STEPS[object.id];
  const hasStepId = Boolean(object.routeStepId);
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
      {step ? (
        <button
          type="button"
          className="atlas-link atlas-link-button"
          aria-label={`Open route step ${step.area} for ${object.name}`}
          onClick={() => {
            const params = new URLSearchParams();
            params.set("step", step.id);
            params.set("area", step.area);
            navigate(`/journey?${params.toString()}`);
          }}
        >
          Open route step
          <Icon name="chevronRight" size={12} />
        </button>
      ) : hasStepId ? (
        <span className="atlas-link atlas-link--missing">
          Route step unresolved
        </span>
      ) : (
        <span className="atlas-link atlas-link--missing">No route step</span>
      )}
      {step ? (
        <span className="atlas-step-tag" title={step.instruction}>
          <span className="atlas-step-tag-label">Tracked by step · {step.area}</span>
          <span className="atlas-step-tag-title">{step.instruction}</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * The Done cell. Route-tracked objects are ticked by their journey step, so
 * they get a status marker instead of a checkbox; only objects the route does
 * not cover keep the manual tick, labelled so the two can never be confused.
 */
function DoneCell({
  object,
  step,
  stepDone,
  manualDone,
  onManual,
}: {
  object: WorldObject;
  step: RouteStep | undefined;
  stepDone: boolean;
  manualDone: boolean;
  onManual: (value: boolean) => void;
}) {
  if (step) {
    const strayManual = manualDone && !stepDone;
    return (
      <span className="atlas-auto-wrap">
        <span
          className={`atlas-auto ${stepDone ? "is-auto" : strayManual ? "is-manual" : ""}`.trim()}
          role="img"
          aria-label={
            stepDone
              ? `Done automatically: route step in ${step.area} is marked done`
              : strayManual
                ? `Tick was set by hand; the route step in ${step.area} is not done yet`
                : `Tracked by the route step in ${step.area}; the step is not done yet`
          }
        >
          <span className="atlas-auto-mark">
            <Icon name={stepDone || strayManual ? "check" : "map"} size={11} />
          </span>
          <span className="atlas-auto-text">{stepDone ? "Auto" : strayManual ? "Ticked" : "Step"}</span>
        </span>
        {strayManual ? (
          <button
            type="button"
            className="atlas-link atlas-link-button atlas-clear-tick"
            aria-label={`Clear the manual tick on ${object.name}`}
            onClick={() => onManual(false)}
          >
            Clear
          </button>
        ) : null}
      </span>
    );
  }
  return (
    <span className="atlas-manual">
      <Checkbox
        checked={manualDone}
        onChange={onManual}
        label={<span className="sr-only">Mark {object.name} as visited</span>}
      />
      <span className="atlas-manual-text">Manual</span>
    </span>
  );
}

function GapDisclosure({ gap }: { gap: WorldObjectGap | undefined }) {
  if (!gap) return null;
  return (
    <Disclosure
      title={gap.issue}
      summary="Coverage gap"
      icon="alert"
      className="atlas-gap-disclosure"
    >
      <div className="atlas-gap">
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
    </Disclosure>
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
  const [routeFilter, setRouteFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const appliedFocus = useRef("");
  const scrolledFocus = useRef("");
  const previousCategory = useRef(category);

  const config = CATEGORY_BY_ID[category] ?? CATEGORIES[0];
  const status = WORLD_CATEGORY_STATUS[category];
  const state = CATEGORY_STATE[category];
  const gap = state === "resolved" ? undefined : WORLD_GAPS.find((entry) => entry.category === category);
  const rows = CATEGORY_ROWS[category] ?? [];

  const regions = useMemo(
    () =>
      [
        ...new Set(rows.map((object) => object.region).filter((value) => value.trim())),
      ].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const doneObjects = useMemo(() => {
    const doneIds = new Set<string>();
    for (const object of rows) {
      const step = RESOLVED_STEPS[object.id];
      const done = journey.worldChecks[object.id] || (step ? journey.steps[step.id] === "done" : false);
      if (done) doneIds.add(object.id);
    }
    return doneIds;
  }, [rows, journey.worldChecks, journey.steps]);

  const filtered = useMemo(
    () =>
      rows.filter((object) => {
        if (region !== "all" && object.region !== region) return false;
        if (game === "base" && object.dlc) return false;
        if (game === "dlc" && !object.dlc) return false;
        const checked = doneObjects.has(object.id);
        if (checkFilter === "checked" && !checked) return false;
        if (checkFilter === "unchecked" && checked) return false;
        if (routeFilter === "linked" && !RESOLVED_STEPS[object.id]) return false;
        if (routeFilter === "unlinked" && RESOLVED_STEPS[object.id]) return false;
        return matchesSearch(query, object);
      }),
    [rows, region, game, checkFilter, routeFilter, query, doneObjects],
  );

  const visible = filtered.slice(0, limit);
  const checkedInCategory = doneObjects.size;
  const listedCount = rows.length;
  const linkedInCategory = rows.filter((object) => RESOLVED_STEPS[object.id]).length;
  const unlinkedInCategory = rows.length - linkedInCategory;

  function resetFilters() {
    setQuery("");
    setRegion("all");
    setGame("all");
    setCheckFilter("all");
    setRouteFilter("all");
    setLimit(PAGE_SIZE);
  }

  function changeCategory(next: string) {
    if (next === category) return;
    setCategory(next);
    setQuery("");
    setRegion("all");
    setGame("all");
    setCheckFilter("all");
    setRouteFilter("all");
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
    setRouteFilter("all");
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
    setCategory(TRACKED_CATEGORY_IDS.includes(focusObject.category) ? focusObject.category : TRACKED_CATEGORY_IDS[0]);
    setQuery("");
    const requestedRegion = route.query.get("region") ?? "all";
    setRegion(
      requestedRegion !== "all" && requestedRegion === focusObject.region
        ? requestedRegion
        : "all",
    );
    setGame("all");
    setCheckFilter("all");
    setRouteFilter("all");
    const index = (CATEGORY_ROWS[focusObject.category] ?? []).findIndex(
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
      <PageHeader
        eyebrow="Reference · World ledger"
        title="World atlas"
        description={`Graces, monuments, effigies, and spirits. ${formatNumber(ROUTE_LINKED_COUNT)} of ${formatNumber(
          WORLD_OBJECT_COUNT,
        )} entries link to a route step.`}
      />

      <div className="atlas-summary" aria-label="Atlas summary">
        <div className="atlas-summary-item">
          <strong>{formatNumber(WORLD_OBJECT_COUNT)}</strong>
          <span>World objects</span>
        </div>
        <div className="atlas-summary-item">
          <strong>{formatNumber(WORLD_GRACE_COUNT)}</strong>
          <span>Sites of Grace</span>
        </div>
        <div className="atlas-summary-item">
          <strong>{formatNumber(DLC_OBJECT_COUNT)}</strong>
          <span>Shadow of the Erdtree</span>
        </div>
        <div className="atlas-summary-item">
          <strong>{formatNumber(ROUTE_LINKED_COUNT)}</strong>
          <span>Route-linked</span>
        </div>
        <div className="atlas-summary-item">
          <strong>
            {formatNumber(progress.done)}/{formatNumber(progress.total)}
          </strong>
          <span>Checked</span>
        </div>
        <div className="atlas-summary-item">
          <strong>{formatNumber(RESOLVED_CATEGORY_COUNT)}</strong>
          <span>Categories with a resolved list</span>
        </div>
        <div className="atlas-summary-item">
          <strong>{formatNumber(PARTIAL_CATEGORY_COUNT)}</strong>
          <span>Partial or archived lists</span>
        </div>
        {UNTRACKED_CATEGORIES.length > 0 ? (
          <div className="atlas-summary-item atlas-summary-item--gap">
            <strong>{UNTRACKED_CATEGORIES.length}</strong>
            <span>Categories not tracked</span>
          </div>
        ) : null}
      </div>

      <TabBar
        items={TRACKED_CATEGORIES.map((entry) => ({
          id: entry.id,
          label: entry.tab,
          count: WORLD_CATEGORY_STATUS[entry.id]?.count ?? CATEGORY_ROWS[entry.id].length,
        }))}
        value={category}
        onChange={changeCategory}
      />

      {UNTRACKED_CATEGORIES.length > 0 ? (
        <section className="atlas-untracked" aria-label="Categories that are not tracked">
          <div className="atlas-untracked-head">
            <span className="atlas-untracked-icon" aria-hidden="true">
              <Icon name="alert" size={15} />
            </span>
            <div>
              <div className="atlas-status-eyebrow">Decision recorded</div>
              <h2 className="atlas-untracked-title">Not tracked — no authoritative list exists</h2>
              <p className="atlas-untracked-lede">
                {formatNumber(UNTRACKED_CATEGORIES.length)} categories have no permitted per-object
                list. They are deliberately omitted from the tabs and from every percentage rather
                than filled with invented locations.
              </p>
            </div>
          </div>
          <ul className="atlas-untracked-list">
            {UNTRACKED_CATEGORIES.map((entry) => {
              const categoryStatus = WORLD_CATEGORY_STATUS[entry.id];
              const entryGap = WORLD_GAPS.find((gapEntry) => gapEntry.category === entry.id);
              return (
                <li key={entry.id} className="atlas-untracked-item">
                  <div className="atlas-untracked-item-head">
                    <span className="atlas-untracked-name">
                      <Icon name={entry.icon} size={13} /> {entry.label}
                    </span>
                    <Badge tone="danger">Not tracked</Badge>
                  </div>
                  <p className="atlas-untracked-note">
                    {categoryStatus?.note ?? "No category metadata is recorded for this ledger."}
                  </p>
                  {entryGap ? (
                    <div className="atlas-gap-sources">
                      <span className="atlas-gap-sources-label">Sources attempted</span>
                      {entryGap.sourcesTried.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {hostLabel(url)}
                          <Icon name="external" size={10} />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={`atlas-status atlas-status--${state}`}>
        <div className="atlas-status-head">
          <span className="atlas-status-icon" aria-hidden="true">
            <Icon name={config.icon} size={22} />
          </span>
          <div className="atlas-status-copy">
            <div className="atlas-status-eyebrow">
              Category status · tracked category {TRACKED_CATEGORY_IDS.indexOf(category) + 1} of{" "}
              {TRACKED_CATEGORY_IDS.length}
            </div>
            <h2 className="atlas-status-title">{config.label}</h2>
            <p className="atlas-status-note">
              {status?.note ?? "No category metadata is recorded for this ledger."}
            </p>
            <p className="atlas-status-reason">{STATE_REASON[state]}</p>
          </div>
          <div className="atlas-status-side">
            <div className="atlas-status-badges">
              <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
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
                  {listedCount ? Math.round((checkedInCategory / listedCount) * 100) : 0}%
                </strong>
                <span>complete</span>
              </div>
            </div>
            {state !== "resolved" ? (
              <span className="atlas-status-caveat">
                Lower bound · the true total is unknown, so this percentage only covers listed rows.
              </span>
            ) : null}
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

        <ProgressBar
          value={listedCount ? (checkedInCategory / listedCount) * 100 : 0}
          tone={listedCount > 0 && checkedInCategory >= listedCount ? "success" : "accent"}
          label={`${formatNumber(checkedInCategory)} of ${formatNumber(listedCount)} checked`}
          detail={`${formatNumber(linkedInCategory)} route-linked · ${formatNumber(
            unlinkedInCategory,
          )} unlinked · overall atlas ${formatNumber(progress.done)} / ${formatNumber(progress.total)}`}
        />

        <GapDisclosure gap={gap} />
      </section>

      {rows.length > 0 ? (
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
              Unchecked ({formatNumber(Math.max(0, rows.length - checkedInCategory))})
            </option>
            <option value="checked">Checked ({formatNumber(checkedInCategory)})</option>
          </Select>
          <Select
            label="Route link"
            value={routeFilter}
            onChange={(event) => {
              setRouteFilter(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="all">All entries</option>
            <option value="linked">Route-linked ({formatNumber(linkedInCategory)})</option>
            <option value="unlinked">Unlinked ({formatNumber(unlinkedInCategory)})</option>
          </Select>
          <Button variant="ghost" icon="x" onClick={resetFilters}>
            Reset
          </Button>
        </div>
      ) : null}

      {focusId && !focusObject ? (
        <p className="atlas-focus-warning">
          <Icon name="alert" size={13} /> No world object matches{" "}
          <code>focus={focusId}</code>.
        </p>
      ) : null}

      {rows.length > 0 ? (
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
      ) : null}

      {rows.length === 0 ? null : filtered.length === 0 ? (
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
                  const checked = doneObjects.has(object.id);
                  const step = RESOLVED_STEPS[object.id];
                  const stepDone = Boolean(step && journey.steps[step.id] === "done");
                  const isFocus = object.id === focusId;
                  return (
                    <tr
                      key={object.id}
                      id={`atlas-row-${object.id}`}
                      className={`${checked ? "is-checked " : ""}${isFocus ? "is-focus " : ""}`.trim() || undefined}
                    >
                      <td className="atlas-check-cell" data-label="Done">
                        <DoneCell
                          object={object}
                          step={step}
                          stepDone={stepDone}
                          manualDone={Boolean(journey.worldChecks[object.id])}
                          onManual={(value) => setWorldCheck(object.id, value)}
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
        Rows marked <strong>Auto</strong> are ticked by their journey step: finishing{" "}
        <em>Tracked by step · area</em> checks them in the same write. Only rows the route
        does not cover keep a manual tick. Counts come from the merged world ledger; partial
        categories list every row the sources publish but are never presented as complete, and
        categories with no authoritative list are excluded from the tabs and percentages.
      </p>
    </div>
  );
}
