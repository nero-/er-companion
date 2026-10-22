import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Callout,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  SectionTitle,
  Select,
  Stat,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import { ItemDrawer } from "../components/ItemDrawer";
import { bulkSetItems, setItemOwned, useActiveCharacter } from "../lib/store";
import { collectionSummary } from "../lib/selectors";
import { ITEM_BY_ID, ITEMS, ITEMS_BY_GROUP, ITEMS_BY_REGION } from "../lib/data";
import { formatNumber, itemGroupIcon } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import type { Item } from "../lib/types";
import "./collection.css";

type OwnedFilter = "all" | "owned" | "missing";
type SortKey = "name" | "group" | "region";
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

const REGIONS = Object.keys(ITEMS_BY_REGION).sort((a, b) => a.localeCompare(b));

const SEARCH_INDEX: Record<string, string> = Object.fromEntries(
  ITEMS.map((item) => [
    item.id,
    [item.name, item.location, item.region, item.category, item.notes].join(" ").toLowerCase(),
  ]),
);

const COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });



export function CollectionPage() {
  const route = useRoute();
  const character = useActiveCharacter();
  const toast = useToast();
  const resultsRef = useRef<HTMLElement>(null);

  const groupParam = route.query.get("group");
  const regionParam = route.query.get("region");
  const ownedParam = route.query.get("owned");
  const group =
    groupParam && Object.prototype.hasOwnProperty.call(ITEMS_BY_GROUP, groupParam) ? groupParam : "all";
  const region =
    regionParam && Object.prototype.hasOwnProperty.call(ITEMS_BY_REGION, regionParam) ? regionParam : "all";
  const ownedFilter: OwnedFilter =
    ownedParam === "owned" || ownedParam === "missing" ? ownedParam : "all";
  const qParam = route.query.get("q");
  const itemParam = route.query.get("item");
  const activeItem =
    itemParam && Object.prototype.hasOwnProperty.call(ITEM_BY_ID, itemParam) ? ITEM_BY_ID[itemParam] : null;

  const [search, setSearch] = useState(qParam ?? "");
  const [game, setGame] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);

  useEffect(() => {
    if (qParam !== null) setSearch(qParam);
  }, [qParam]);

  const summary = collectionSummary(character);

  const gameSummaries = useMemo(() => {
    const totals: Record<string, { game: string; owned: number; total: number }> = {};
    for (const item of ITEMS) {
      const entry = (totals[item.game] ??= { game: item.game, owned: 0, total: 0 });
      entry.total += 1;
      if (character.items[item.id]) entry.owned += 1;
    }
    const ordered = GAMES.flatMap((name) => (totals[name] ? [totals[name]] : []));
    for (const name of Object.keys(totals)) {
      if (!GAMES.includes(name)) ordered.push(totals[name]);
    }
    return ordered.map((entry) => ({
      ...entry,
      percent: entry.total ? Math.round((entry.owned / entry.total) * 100) : 0,
    }));
  }, [character.items]);

  const filtered = useMemo(() => {
    const pool = group === "all" ? ITEMS : ITEMS_BY_GROUP[group];
    const needle = search.trim().toLowerCase();
    const rows: Item[] = [];
    for (const item of pool) {
      if (region !== "all" && item.region !== region) continue;
      if (game !== "all" && item.game !== game) continue;
      if (ownedFilter === "owned" && character.items[item.id] !== true) continue;
      if (ownedFilter === "missing" && character.items[item.id] === true) continue;
      if (needle && !(SEARCH_INDEX[item.id] || "").includes(needle)) continue;
      rows.push(item);
    }
    rows.sort((a, b) => {
      if (sort === "group") {
        const byGroup = COLLATOR.compare(a.group, b.group);
        if (byGroup) return byGroup;
      } else if (sort === "region") {
        const byRegion = COLLATOR.compare(a.region, b.region);
        if (byRegion) return byRegion;
      }
      return COLLATOR.compare(a.name, b.name) || COLLATOR.compare(a.id, b.id);
    });
    return rows;
  }, [group, region, game, ownedFilter, search, sort, character.items]);

  useEffect(() => {
    setPage(1);
  }, [group, region, game, ownedFilter, search, sort]);

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
    sort !== "name";

  const applyQuery = (patch: {
    group?: string;
    region?: string;
    owned?: OwnedFilter;
    q?: string;
    item?: string | null;
  }) => {
    const params = new URLSearchParams();
    const nextGroup = patch.group ?? group;
    const nextRegion = patch.region ?? region;
    const nextOwned = patch.owned ?? ownedFilter;
    const nextQuery = patch.q === undefined ? search.trim() : patch.q.trim();
    const nextItem = patch.item === undefined ? itemParam : patch.item;
    if (nextGroup !== "all") params.set("group", nextGroup);
    if (nextRegion !== "all") params.set("region", nextRegion);
    if (nextOwned !== "all") params.set("owned", nextOwned);
    if (nextQuery) params.set("q", nextQuery);
    if (nextItem) params.set("item", nextItem);
    const query = params.toString();
    navigate(`/collection${query ? `?${query}` : ""}`);
  };

  const resetFilters = () => {
    setSearch("");
    setGame("all");
    setSort("name");
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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Armory · Whole-game catalogue"
        title="Master collection"
        description="Every catalogued permanent item in the content pack, with ownership shared by the build and equipment checks. Items with an auto-acquisition route step are added when that step is marked done."
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

      <section className="col-stats" aria-label="Collection summary">
        <Stat
          label="Collection complete"
          value={`${summary.percent}%`}
          detail={`${formatNumber(summary.owned)} of ${formatNumber(summary.total)} items owned`}
        />
        {gameSummaries.map((entry) => (
          <Stat
            key={entry.game}
            label={entry.game}
            value={`${entry.percent}%`}
            detail={`${formatNumber(entry.owned)} / ${formatNumber(entry.total)} owned`}
          />
        ))}
        <Stat
          label="Catalogued groups"
          value={summary.byGroup.length}
          detail={`${summary.byGroup.filter((entry) => entry.owned === entry.total).length} groups complete`}
        />
      </section>

      <section className="card card-pad col-groups" aria-label="Progress by group">
        <SectionTitle
          title="Progress by group"
          note={`${summary.byGroup.length} groups · ${formatNumber(summary.total)} items`}
          actions={
            group !== "all" ? (
              <Button size="sm" variant="ghost" icon="x" onClick={() => applyQuery({ group: "all" })}>
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
                onClick={() => applyQuery({ group: active ? "all" : entry.group })}
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
              placeholder="Name, location, region, category, notes…"
            />
          </div>
          <Select label="Group" value={group} onChange={(event) => applyQuery({ group: event.target.value })}>
            <option value="all">All groups</option>
            {GROUPS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select label="Game" value={game} onChange={(event) => setGame(event.target.value)}>
            <option value="all">All games</option>
            {GAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select label="Region" value={region} onChange={(event) => applyQuery({ region: event.target.value })}>
            <option value="all">All regions</option>
            {REGIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            label="Owned state"
            value={ownedFilter}
            onChange={(event) => {
              const value = event.target.value;
              applyQuery({ owned: value === "owned" || value === "missing" ? value : "all" });
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
              const value = event.target.value;
              setSort(value === "group" ? "group" : value === "region" ? "region" : "name");
            }}
          >
            <option value="name">Name</option>
            <option value="group">Group</option>
            <option value="region">Region</option>
          </Select>
        </div>
        <div className="col-filter-foot">
          <span className="small faint">
            {formatNumber(filtered.length)} of {formatNumber(ITEMS.length)} catalogued items match
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
            description="Adjust the search, group, game, region, or owned-state filters to see more of the catalogue."
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
                return (
                  <div className={`item-card col-item${owned ? " owned" : ""}`} key={item.id}>
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
                          {item.category} · {item.region}
                        </span>
                        <span className="col-item-foot">
                          <span className="col-item-acq" title={item.acquisitionType}>
                            {item.acquisitionType || "Acquisition not in content pack"}
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
              <div className="row">
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
          <Callout tone={bulkTarget === "missing" ? "warning" : "success"} icon={bulkTarget === "missing" ? "alert" : "check"}>
            {bulkTarget === "missing"
              ? `${formatNumber(filteredOwned)} items in this filtered set are currently owned.`
              : `${formatNumber(filteredMissing)} items in this filtered set are currently missing.`}
          </Callout>
        </div>
      </Modal>

      <ItemDrawer
        key={activeItem?.id ?? "closed"}
        item={activeItem}
        onClose={() => applyQuery({ item: null })}
      />
    </div>
  );
}
