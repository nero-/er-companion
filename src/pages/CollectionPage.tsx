import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  SectionTitle,
  Select,
  Stat,
  useToast,
} from "../components/ui";
import { ART, ArtBanner } from "../components/Art";
import { Icon } from "../components/Icon";
import {
  ItemDrawer,
  isItemMissable,
  isItemRouteLinked,
  isItemTimingSensitive,
  itemLocationKind,
  itemRegionName,
} from "../components/ItemDrawer";
import { bulkSetItems, setItemOwned, useActiveCharacter } from "../lib/store";
import { collectionSummary } from "../lib/selectors";
import { ITEM_BY_ID, ITEMS, ITEMS_BY_GROUP, ROUTE_STEPS } from "../lib/data";
import { formatNumber, itemGroupIcon } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import type { Item } from "../lib/types";
import "./collection.css";

type OwnedFilter = "all" | "owned" | "missing";
type SortKey = "name" | "group" | "region" | "game" | "section" | "acquisition";
type BulkTarget = "owned" | "missing";

const PAGE_SIZE = 120;

const GROUP_ORDER = [
  "Weapon",
  "Shield",
  "Armor",
  "Talisman",
  "Spell",
  "Ash of War",
  "Spirit Ash",
  "Recipe & Knowledge",
  "Upgrade",
  "Material",
  "Consumable",
  "Crystal Tear",
  "Gesture",
  "Tool",
  "Note",
  "Flask",
  "Key & Lore",
  "Steed Attire",
];

const GAME_ORDER = ["Base Game", "Shadow of the Erdtree", "Tarnished Pack"];

const GAME_NAMES: Record<string, true> = {
  "Base Game": true,
  "Shadow of the Erdtree": true,
  "Tarnished Pack": true,
};

const GROUPS = Object.keys(ITEMS_BY_GROUP).sort((a, b) => {
  const indexA = GROUP_ORDER.indexOf(a);
  const indexB = GROUP_ORDER.indexOf(b);
  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  return a.localeCompare(b);
});

const GAMES = (() => {
  const present: Record<string, true> = {};
  for (const item of ITEMS) present[item.game] = true;
  const ordered = GAME_ORDER.filter((game) => present[game]);
  for (const game of Object.keys(present)) {
    if (!ordered.includes(game)) ordered.push(game);
  }
  return ordered;
})();

const REGIONS = [...new Set(ITEMS.map((item) => item.region).filter((region) => region && GAME_NAMES[region] !== true))].sort(
  (a, b) => a.localeCompare(b),
);

/** Game names left in `region` after the merge — shown honestly, never as a place. */
const UNRECORDED_REGIONS = GAMES.filter((game) => ITEMS.some((item) => item.region === game));

const REGION_VALUES: Record<string, true> = Object.fromEntries(
  [...REGIONS, ...UNRECORDED_REGIONS].map((region) => [region, true]),
);

const SEARCH_INDEX: Record<string, string> = Object.fromEntries(
  ITEMS.map((item) => [
    item.id,
    [
      item.name,
      item.location,
      item.region,
      item.category,
      item.group,
      item.game,
      item.section ?? "",
      item.acquisitionType,
      item.acquisitionText ?? "",
      item.notes,
      item.wikiUrl ?? "",
      item.missable,
    ]
      .join(" ")
      .toLowerCase(),
  ]),
);

const COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const CATALOG_COUNTS = (() => {
  let routeLinked = 0;
  let missable = 0;
  let missableDlc = 0;
  let timing = 0;
  const locations = { exact: 0, area: 0, unrecorded: 0 };
  for (const item of ITEMS) {
    if (isItemRouteLinked(item)) routeLinked += 1;
    if (isItemMissable(item)) {
      missable += 1;
      if (item.dlc) missableDlc += 1;
    } else if (isItemTimingSensitive(item)) {
      timing += 1;
    }
    locations[itemLocationKind(item)] += 1;
  }
  return { routeLinked, missable, missableDlc, timing, locations };
})();

const SORT_KEYS: Record<string, SortKey> = {
  name: "name",
  group: "group",
  region: "region",
  game: "game",
  section: "section",
  acquisition: "acquisition",
};

function sortLabel(item: Item, key: SortKey): string {
  if (key === "group") return item.group;
  if (key === "region") return itemRegionName(item) ?? item.region;
  if (key === "game") return item.game;
  if (key === "section") return item.section ?? "";
  if (key === "acquisition") return item.acquisitionType;
  return item.name;
}

interface QueryPatch {
  group?: string;
  game?: string;
  region?: string;
  owned?: OwnedFilter;
  missable?: boolean;
  route?: boolean;
  q?: string;
  sort?: SortKey;
  item?: string;
}

export function CollectionPage() {
  const route = useRoute();
  const character = useActiveCharacter();
  const toast = useToast();
  const resultsRef = useRef<HTMLElement>(null);

  const groupParam = route.query.get("group");
  const regionParam = route.query.get("region");
  const gameParam = route.query.get("game");
  const ownedParam = route.query.get("owned");
  const missableParam = route.query.get("missable");
  const routeParam = route.query.get("route");
  const sortParam = route.query.get("sort");
  const qParam = route.query.get("q");
  const itemParam = route.query.get("item");

  const group =
    groupParam && Object.prototype.hasOwnProperty.call(ITEMS_BY_GROUP, groupParam) ? groupParam : "all";
  const region = regionParam && REGION_VALUES[regionParam] === true ? regionParam : "all";
  const game = gameParam && GAMES.includes(gameParam) ? gameParam : "all";
  const ownedFilter: OwnedFilter =
    ownedParam === "owned" || ownedParam === "missing" ? ownedParam : "all";
  const missableOnly = missableParam === "1" || missableParam === "true";
  const routeOnly = routeParam === "1" || routeParam === "true";
  const sort: SortKey =
    sortParam && Object.prototype.hasOwnProperty.call(SORT_KEYS, sortParam) ? SORT_KEYS[sortParam] : "name";
  const activeItem =
    itemParam && Object.prototype.hasOwnProperty.call(ITEM_BY_ID, itemParam) ? ITEM_BY_ID[itemParam] : null;

  const [search, setSearch] = useState(qParam ?? "");
  const [page, setPage] = useState(1);
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);
  const lastSyncedQuery = useRef(qParam ?? "");

  useEffect(() => {
    const next = qParam ?? "";
    if (next === lastSyncedQuery.current) return;
    lastSyncedQuery.current = next;
    setSearch(next);
  }, [qParam]);

  const summary = collectionSummary(character);

  const collectionPath = (patch: QueryPatch) => {
    const params = new URLSearchParams();
    const nextGroup = patch.group ?? group;
    const nextGame = patch.game ?? game;
    const nextRegion = patch.region ?? region;
    const nextOwned = patch.owned ?? ownedFilter;
    const nextMissable = patch.missable ?? missableOnly;
    const nextRoute = patch.route ?? routeOnly;
    const nextSort = patch.sort ?? sort;
    const nextQuery = (patch.q ?? search).trim();
    const nextItem = patch.item === undefined ? itemParam ?? "" : patch.item;

    if (nextGroup !== "all") params.set("group", nextGroup);
    if (nextGame !== "all") params.set("game", nextGame);
    if (nextRegion !== "all") params.set("region", nextRegion);
    if (nextOwned !== "all") params.set("owned", nextOwned);
    if (nextMissable) params.set("missable", "1");
    if (nextRoute) params.set("route", "1");
    if (nextSort !== "name") params.set("sort", nextSort);
    if (nextQuery) params.set("q", nextQuery);
    if (nextItem) params.set("item", nextItem);

    const query = params.toString();
    return `/collection${query ? `?${query}` : ""}`;
  };

  const applyQuery = (patch: QueryPatch) => {
    navigate(collectionPath(patch));
  };

  const applyFilter = (patch: QueryPatch) => {
    setPage(1);
    applyQuery({ ...patch, item: "" });
  };

  useEffect(() => {
    const next = search.trim();
    if (next === (qParam ?? "")) return;
    const timer = window.setTimeout(() => {
      lastSyncedQuery.current = next;
      navigate(collectionPath({ q: search, item: "" }));
    }, 220);
    return () => window.clearTimeout(timer);
    // collectionPath closes over every filter; the dependency list mirrors that on purpose.
  }, [search, qParam, group, game, region, ownedFilter, missableOnly, routeOnly, sort, itemParam]);

  const filtered = useMemo(() => {
    const pool = group === "all" ? ITEMS : ITEMS_BY_GROUP[group];
    const needle = search.trim().toLowerCase();
    const rows: Item[] = [];
    for (const item of pool) {
      if (region !== "all" && item.region !== region) continue;
      if (game !== "all" && item.game !== game) continue;
      if (ownedFilter === "owned" && character.items[item.id] !== true) continue;
      if (ownedFilter === "missing" && character.items[item.id] === true) continue;
      if (missableOnly && !isItemMissable(item)) continue;
      if (routeOnly && !isItemRouteLinked(item)) continue;
      if (needle && !(SEARCH_INDEX[item.id] || "").includes(needle)) continue;
      rows.push(item);
    }
    rows.sort((a, b) => {
      if (sort !== "name") {
        const byKey = COLLATOR.compare(sortLabel(a, sort), sortLabel(b, sort));
        if (byKey) return byKey;
      }
      return COLLATOR.compare(a.name, b.name) || COLLATOR.compare(a.id, b.id);
    });
    return rows;
  }, [group, game, region, ownedFilter, missableOnly, routeOnly, search, sort, character.items]);

  useEffect(() => {
    setPage(1);
  }, [group, game, region, ownedFilter, missableOnly, routeOnly, search, sort]);

  let filteredOwned = 0;
  for (const item of filtered) {
    if (character.items[item.id] === true) filteredOwned += 1;
  }
  const filteredMissing = filtered.length - filteredOwned;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const hasFilters =
    search.trim().length > 0 ||
    game !== "all" ||
    group !== "all" ||
    region !== "all" ||
    ownedFilter !== "all" ||
    missableOnly ||
    routeOnly ||
    sort !== "name";

  const activeFilterCount =
    (game !== "all" ? 1 : 0) +
    (group !== "all" ? 1 : 0) +
    (region !== "all" ? 1 : 0) +
    (ownedFilter !== "all" ? 1 : 0) +
    (missableOnly ? 1 : 0) +
    (routeOnly ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const resetFilters = () => {
    setSearch("");
    lastSyncedQuery.current = "";
    setPage(1);
    navigate("/collection");
  };

  const toggleOwned = (item: Item) => {
    const next = character.items[item.id] !== true;
    setItemOwned(item.id, next);
    toast.push(`${item.name} ${next ? "marked owned" : "marked missing"}.`, next ? "success" : "default");
  };

  const goToPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), totalPages));
    resultsRef.current?.scrollIntoView({ block: "start" });
  };

  const confirmBulk = () => {
    if (bulkTarget === null) return;
    const markOwned = bulkTarget === "owned";
    let changed = 0;
    for (const item of filtered) {
      if ((character.items[item.id] === true) !== markOwned) changed += 1;
    }
    bulkSetItems(
      filtered.map((item) => item.id),
      markOwned,
    );
    setBulkTarget(null);
    toast.push(
      markOwned
        ? `Marked ${formatNumber(changed)} filtered ${changed === 1 ? "item" : "items"} owned.`
        : `Marked ${formatNumber(changed)} filtered ${changed === 1 ? "item" : "items"} missing.`,
      markOwned ? "success" : "default",
    );
  };

  const gameSummaries = [summary.baseGame, summary.dlc, summary.tarnishedPack];
  const groupsComplete = summary.byGroup.filter((entry) => entry.owned === entry.total).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Armory · Whole-game catalogue"
        title="Master collection"
        description={`Every catalogued permanent item across the base game, Shadow of the Erdtree, and the Tarnished Pack. Ownership is shared with the build and equipment checks; auto-acquisition items are added when their route step is marked done.`}
        actions={
          <>
            <Button icon="map" onClick={() => navigate("/journey")}>
              Route steps
            </Button>
            <Button variant="ghost" icon="trophy" onClick={() => navigate("/tiers")}>
              Tier lists
            </Button>
          </>
        }
      />

      <ArtBanner
        className="col-banner"
        image={ART.erdtreeShots[1]}
        caption="The Lands Between · armory index"
        title="One ledger for every acquisition"
        variant="erdtree"
      >
        <p className="col-banner-note">
          {formatNumber(summary.total)} catalogued items · {formatNumber(CATALOG_COUNTS.routeLinked)} route-linked ·{" "}
          {formatNumber(CATALOG_COUNTS.missable)} flagged missable
        </p>
      </ArtBanner>

      <section className="col-stats" aria-label="Collection summary">
        <Stat
          label="Catalogue"
          value={formatNumber(summary.total)}
          detail={`${summary.byGroup.length} groups · ${formatNumber(CATALOG_COUNTS.routeLinked)} route-linked`}
        />
        <Stat
          label="Owned"
          value={formatNumber(summary.owned)}
          detail={`${summary.percent}% · ${formatNumber(summary.total - summary.owned)} missing`}
        />
        {gameSummaries.map((entry) => (
          <Stat
            key={entry.group}
            label={entry.group}
            value={formatNumber(entry.owned)}
            detail={`${entry.percent}% · ${formatNumber(entry.total)} catalogued`}
          />
        ))}
        <Stat
          label="Catalogued groups"
          value={summary.byGroup.length}
          detail={`${groupsComplete} ${groupsComplete === 1 ? "group" : "groups"} complete`}
        />
        <Stat
          label="Route-linked"
          value={formatNumber(CATALOG_COUNTS.routeLinked)}
          detail="Linked to a route step"
        />
        <Stat
          label="Missable"
          value={formatNumber(CATALOG_COUNTS.missable)}
          detail={`${formatNumber(CATALOG_COUNTS.missableDlc)} in the DLC · ${formatNumber(
            CATALOG_COUNTS.timing,
          )} timing notes`}
        />
        <Stat
          label="Exact locations"
          value={formatNumber(CATALOG_COUNTS.locations.exact)}
          detail={`${formatNumber(CATALOG_COUNTS.locations.area)} area-only · ${formatNumber(
            CATALOG_COUNTS.locations.unrecorded,
          )} unrecorded`}
        />
      </section>

      <section className="card card-pad col-groups" aria-label="Progress by group">
        <SectionTitle
          title="Progress by group"
          note={`${summary.byGroup.length} groups · ${formatNumber(summary.total)} items`}
          actions={
            group !== "all" ? (
              <Button size="sm" variant="ghost" icon="x" onClick={() => applyFilter({ group: "all" })}>
                Clear group
              </Button>
            ) : undefined
          }
        />
        <div className="col-group-grid">
          {summary.byGroup.map((entry) => {
            const active = group === entry.group;
            return (
              <button
                type="button"
                key={entry.group}
                className={`col-group${active ? " is-active" : ""}`}
                aria-pressed={active}
                onClick={() => applyFilter({ group: active ? "all" : entry.group })}
              >
                <span className="row-between">
                  <span className="col-group-name">
                    <Icon name={itemGroupIcon(entry.group)} size={14} />
                    <span>{entry.group}</span>
                  </span>
                  <span className="tiny faint mono">
                    {formatNumber(entry.owned)}/{formatNumber(entry.total)}
                  </span>
                </span>
                <span className="col-mini-track" aria-hidden="true">
                  <span className="col-mini-fill" style={{ width: `${entry.percent}%` }} />
                </span>
                <span className="tiny faint">{entry.percent}% complete</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card card-pad col-filters" aria-label="Collection filters">
        <div className="col-filter-grid">
          <div className="field col-search-field">
            <span className="field-label">Search catalogue</span>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Name, location, region, category, section, notes, wiki…"
            />
          </div>
          <Select label="Group" value={group} onChange={(event) => applyFilter({ group: event.target.value })}>
            <option value="all">All groups</option>
            {GROUPS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select label="Game" value={game} onChange={(event) => applyFilter({ game: event.target.value })}>
            <option value="all">All games</option>
            {GAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select label="Region" value={region} onChange={(event) => applyFilter({ region: event.target.value })}>
            <option value="all">All regions</option>
            {REGIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {UNRECORDED_REGIONS.map((name) => (
              <option key={name} value={name}>
                {name} — region not recorded
              </option>
            ))}
          </Select>
          <Select
            label="Owned state"
            value={ownedFilter}
            onChange={(event) => {
              const value = event.target.value;
              applyFilter({ owned: value === "owned" || value === "missing" ? value : "all" });
            }}
          >
            <option value="all">All items</option>
            <option value="owned">Owned only</option>
            <option value="missing">Missing only</option>
          </Select>
          <Select
            label="Sort"
            value={sort}
            onChange={(event) => {
              const value = Object.prototype.hasOwnProperty.call(SORT_KEYS, event.target.value)
                ? SORT_KEYS[event.target.value]
                : "name";
              applyFilter({ sort: value });
            }}
          >
            <option value="name">Name</option>
            <option value="group">Group</option>
            <option value="region">Region</option>
            <option value="game">Game</option>
            <option value="section">Section</option>
            <option value="acquisition">Acquisition type</option>
          </Select>
        </div>
        <div className="col-filter-toggles">
          <Checkbox
            checked={missableOnly}
            onChange={(checked) => applyFilter({ missable: checked })}
            label={
              <span className="row">
                Missable only
                <span className="tiny faint mono">{formatNumber(CATALOG_COUNTS.missable)}</span>
              </span>
            }
          />
          <Checkbox
            checked={routeOnly}
            onChange={(checked) => applyFilter({ route: checked })}
            label={
              <span className="row">
                Route-linked only
                <span className="tiny faint mono">{formatNumber(CATALOG_COUNTS.routeLinked)}</span>
              </span>
            }
          />
          <span className="tiny faint">
            {missableOnly
              ? "Hard missables only — timing and quest notes stay visible in the cards and drawer."
              : `Route links resolve against the merged ${formatNumber(ROUTE_STEPS.length)}-step route.`}
          </span>
        </div>
        <div className="col-filter-foot">
          <span className="small faint">
            {formatNumber(filtered.length)} of {formatNumber(ITEMS.length)} catalogued items match
            {activeFilterCount ? ` · ${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}` : ""}
          </span>
          <Button size="sm" variant="ghost" icon="refresh" onClick={resetFilters} disabled={!hasFilters}>
            Clear search &amp; filters
          </Button>
        </div>
      </section>

      <section className="card card-pad col-results" aria-label="Catalogue results" ref={resultsRef}>
        <SectionTitle
          title="Catalogue"
          note={`${formatNumber(filtered.length)} items · ${formatNumber(filteredOwned)} owned · ${formatNumber(
            filteredMissing,
          )} missing`}
          actions={
            <div className="row wrap">
              <Button
                size="sm"
                icon="check"
                onClick={() => setBulkTarget("owned")}
                disabled={filteredMissing === 0}
              >
                Mark filtered owned
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="x"
                onClick={() => setBulkTarget("missing")}
                disabled={filteredOwned === 0}
              >
                Mark filtered missing
              </Button>
            </div>
          }
        />

        {filtered.length === 0 ? (
          <EmptyState
            title="No items match these filters"
            description="Adjust the search, group, game, region, owned-state, missable, or route filter to see more of the catalogue."
            icon="search"
            action={
              <Button variant="primary" icon="refresh" onClick={resetFilters}>
                Reset filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="item-grid col-item-grid">
              {pageItems.map((item) => {
                const owned = character.items[item.id] === true;
                const missable = isItemMissable(item);
                const timing = !missable && isItemTimingSensitive(item);
                const routeLinked = isItemRouteLinked(item);
                const legacyRef = !routeLinked && item.linkedRouteRaw.trim().length > 0;
                const regionName = itemRegionName(item);
                return (
                  <div
                    className={`item-card col-item${owned ? " owned" : ""}${missable ? " is-missable" : ""}`}
                    key={item.id}
                  >
                    <button
                      type="button"
                      className="col-item-open"
                      onClick={() => applyQuery({ item: item.id })}
                      aria-label={`Open details for ${item.name}`}
                    >
                      <span className="item-glyph">
                        <Icon name={itemGroupIcon(item.group)} size={15} />
                      </span>
                      <span className="col-item-copy">
                        <span className="item-name">{item.name}</span>
                        <span className="item-sub">
                          {item.group}
                          {item.category && item.category !== item.group ? ` · ${item.category}` : ""}
                        </span>
                        <span className="col-item-tags">
                          <span className="col-item-tag">{item.game}</span>
                          {regionName ? (
                            <span className="col-item-tag" title={`Region: ${regionName}`}>
                              <Icon name="map" size={10} />
                              {regionName}
                            </span>
                          ) : (
                            <span className="col-item-tag is-faint" title="The merged catalogue records the game, not a region.">
                              Region not recorded
                            </span>
                          )}
                          {missable ? (
                            <span className="col-item-tag is-missable">
                              <Icon name="alert" size={10} />
                              MISSABLE
                            </span>
                          ) : timing ? (
                            <span className="col-item-tag is-timing" title={item.missable}>
                              <Icon name="clock" size={10} />
                              Note
                            </span>
                          ) : null}
                          {routeLinked ? (
                            <span
                              className="col-item-tag is-route"
                              title={`Linked to ${Math.max(item.routeStepIds.length, 1)} route ${
                                Math.max(item.routeStepIds.length, 1) === 1 ? "step" : "steps"
                              }`}
                            >
                              <Icon name="map" size={10} />
                              {item.autoStepId ? "Auto route" : "Route"}
                            </span>
                          ) : legacyRef ? (
                            <span className="col-item-tag is-legacy" title={`Legacy route reference: ${item.linkedRouteRaw}`}>
                              <Icon name="clock" size={10} />
                              Legacy ref
                            </span>
                          ) : null}
                        </span>
                        <span className="col-item-foot">
                          <span className="col-item-acq" title={item.acquisitionType}>
                            {item.acquisitionType || "Acquisition not recorded"}
                          </span>
                          <span className={`col-item-state${owned ? " is-owned" : ""}`}>
                            {owned ? "Owned" : "Missing"}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`col-item-toggle${owned ? " is-owned" : ""}`}
                      aria-pressed={owned}
                      aria-label={owned ? `Mark ${item.name} as missing` : `Mark ${item.name} as owned`}
                      title={owned ? "Owned — click to mark missing" : "Missing — click to mark owned"}
                      onClick={() => toggleOwned(item)}
                    >
                      <Icon name={owned ? "check" : "plus"} size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="col-pager">
              <span className="small faint">
                Page {currentPage} of {totalPages} · {formatNumber(pageStart + 1)}–
                {formatNumber(Math.min(pageStart + PAGE_SIZE, filtered.length))} of{" "}
                {formatNumber(filtered.length)}
              </span>
              <div className="row wrap col-pager-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  icon="chevronLeft"
                  onClick={() => goToPage(1)}
                  disabled={currentPage <= 1}
                  aria-label="First page"
                >
                  First
                </Button>
                <Button
                  size="sm"
                  icon="chevronLeft"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  iconRight="chevronRight"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconRight="chevronRight"
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  aria-label="Last page"
                >
                  Last
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <Modal
        open={bulkTarget !== null}
        title={bulkTarget === "missing" ? "Mark filtered items missing" : "Mark filtered items owned"}
        onClose={() => setBulkTarget(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setBulkTarget(null)}>
              Cancel
            </Button>
            <Button variant={bulkTarget === "missing" ? "danger" : "primary"} onClick={confirmBulk}>
              {bulkTarget === "missing"
                ? `Mark ${formatNumber(filteredOwned)} missing`
                : `Mark ${formatNumber(filteredMissing)} owned`}
            </Button>
          </>
        }
      >
        <p className="muted">
          Ownership changes only for the {formatNumber(filtered.length)} items matching the current filters. The rest
          of the catalogue is untouched.
        </p>
        <div className="col-confirm-callout">
          <Callout
            tone={bulkTarget === "missing" ? "warning" : "success"}
            icon={bulkTarget === "missing" ? "alert" : "check"}
          >
            {bulkTarget === "missing"
              ? `${formatNumber(filteredOwned)} items in this filtered set are currently owned and will be marked missing.`
              : `${formatNumber(filteredMissing)} items in this filtered set are currently missing and will be marked owned.`}
          </Callout>
        </div>
        {missableOnly || routeOnly ? (
          <p className="tiny faint">
            This filtered set is narrowed by{" "}
            {[missableOnly ? "missable" : "", routeOnly ? "route-linked" : ""].filter(Boolean).join(" and ")} status.
          </p>
        ) : null}
      </Modal>

      <ItemDrawer key={activeItem?.id ?? "closed"} item={activeItem} onClose={() => applyQuery({ item: "" })} />
    </div>
  );
}
