import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  TabBar,
  TierBadge,
} from "../components/ui";
import { ITEMS_BY_NAME, TIERS, TIERS_BY_LIST } from "../lib/data";
import { PATCH_IMPACT_BY_NAME } from "../data/game";
import { formatNumber } from "../lib/format";
import {
  RemembrancePlanSummary,
  RemembrancePlanTable,
} from "../components/RemembrancePlan";
import { remembrancePlanRows } from "../lib/remembrance";
import { navigate, useRoute } from "../lib/router";
import type { TierEntry } from "../lib/types";
import "./library.css";

const PAGE_SIZE = 120;

interface TierListDefinition {
  id: string;
  label: string;
  description: string;
}

const TIER_LISTS: TierListDefinition[] = [
  {
    id: "Weapons",
    label: "Weapons",
    description:
      "Weapon rankings from the source table, with each weapon's class, pool type, and ranking note. Tiers run from Broken through Trash.",
  },
  {
    id: "Incantations",
    label: "Incantations",
    description: "Incantation rankings with the source's class or function label and ranking note.",
  },
  {
    id: "Sorceries",
    label: "Sorceries",
    description: "Sorcery rankings with the source's class or function label and ranking note.",
  },
  {
    id: "Ashes of War",
    label: "Ashes of War",
    description:
      "Ash of War rankings with the source's skill class, pool type, and weapon-compatibility note.",
  },
  {
    id: "Crystal Tears",
    label: "Crystal Tears",
    description:
      "Crystal Tear rankings with effect, duration, role, ceiling, and limitation from the source table.",
  },
  {
    id: "Talismans",
    label: "Talismans",
    description: "Talisman rankings with the source's effect class and ranking note.",
  },
];

const REMEMBRANCE_TAB_ID = "remembrances";

const TAB_ITEMS = [
  ...TIER_LISTS.map((list) => ({
    id: list.id,
    label: list.label,
    count: (TIERS_BY_LIST[list.id] ?? []).length,
  })),
  {
    id: REMEMBRANCE_TAB_ID,
    label: "Remembrances",
    count: remembrancePlanRows().length || undefined,
  },
];

const TARNISHED_PATTERN = /1\.17|tarnished\s+(pack|edition)/i;

/** How many ranked entries the 1.17 / Tarnished Pack pass touched. */
const TARNISHED_TOTAL = TIERS.filter((entry) => TARNISHED_PATTERN.test(entry.source ?? "")).length;

interface Column {
  key: string;
  label: string;
  width?: string;
  render: (entry: TierEntry) => ReactNode;
}

function DetailLine({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="library-line">
      <span className="library-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/**
 * Names link to the wiki whenever the row carries a `wikiUrl`; otherwise the
 * collection entry is the closest in-app destination. The external icon marks
 * links that leave the companion.
 */
function TierName({ entry }: { entry: TierEntry }) {
  const itemMatch = ITEMS_BY_NAME[entry.name]?.[0];
  const href = entry.wikiUrl
    ? entry.wikiUrl
    : itemMatch
      ? `#/collection?item=${encodeURIComponent(itemMatch.id)}`
      : `#/collection?q=${encodeURIComponent(entry.name)}`;
  return (
    <a
      className="tier-link"
      href={href}
      {...(entry.wikiUrl ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      title={entry.wikiUrl ? `${entry.name} on the wiki` : `Open ${entry.name} in the collection`}
    >
      {entry.name}
      {entry.wikiUrl ? <Icon name="external" size={10} className="tier-link-icon" /> : null}
    </a>
  );
}

function TierTable({
  rows,
  columns,
  tears,
  empty,
}: {
  rows: TierEntry[];
  columns: Column[];
  tears: boolean;
  empty: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className="table-wrap library-table-wrap">
      <table className={`data-table library-table tier-table ${tears ? "tier-table-tears" : ""}`.trim()}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={`${entry.list}-${entry.rank}-${entry.name}`}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.label}
                  className={column.key === "name" ? "library-primary-cell" : undefined}
                >
                  {column.render(entry)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Remembrance tab body: the ordered duplication plan rendered on the tiers
 * page, so the ranking context lives next to the tier tables.
 */
export function RemembrancePlanSection() {
  const rows = remembrancePlanRows();
  return (
    <>
      <div className="tier-heading">
        <div className="tier-heading-row">
          <h2>Remembrances</h2>
          <Badge tone="accent">{formatNumber(rows.length)} entries</Badge>
          <Badge tone="info">Ordered by duplicate priority</Badge>
        </div>
        <p className="tier-description">
          Most likely to duplicate first. Each row records the boss, the duplicate decision, the Journey 1 and
          Journey 2 reward picks, and the area the remembrance drops in.
        </p>
      </div>

      <div className="tier-heading tier-heading-tight">
        <RemembrancePlanSummary rows={rows} />
      </div>

      <RemembrancePlanTable rows={rows} />
    </>
  );
}

export function TiersPage() {
  const route = useRoute();
  const listParam = route.query.get("list");
  const isRemembranceTab = listParam === REMEMBRANCE_TAB_ID;
  const activeList = TIER_LISTS.find((list) => list.id === listParam) ?? TIER_LISTS[0];
  const routeQuery = route.query.get("q") ?? "";
  const baseRows = TIERS_BY_LIST[activeList.id] ?? [];

  const [query, setQuery] = useState(routeQuery);
  const [tier, setTier] = useState("all");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [tarnishedOnly, setTarnishedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const previousList = useRef(activeList.id);
  const previousTab = useRef(isRemembranceTab);

  useEffect(() => {
    setQuery(routeQuery);
  }, [routeQuery]);

  useEffect(() => {
    if (previousList.current === activeList.id) return;
    previousList.current = activeList.id;
    setTier("all");
    setSort("asc");
    setTarnishedOnly(false);
    setLimit(PAGE_SIZE);
  }, [activeList.id]);

  useEffect(() => {
    if (previousTab.current === isRemembranceTab) return;
    previousTab.current = isRemembranceTab;
    setQuery("");
    setTier("all");
    setSort("asc");
    setTarnishedOnly(false);
    setLimit(PAGE_SIZE);
  }, [isRemembranceTab]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [activeList.id, query, tier, sort, tarnishedOnly]);

  const tierOptions = useMemo(() => [...new Set(baseRows.map((entry) => entry.tier))], [baseRows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return baseRows.filter((entry) => {
      if (tarnishedOnly && !TARNISHED_PATTERN.test(entry.source ?? "")) return false;
      if (tier !== "all" && entry.tier !== tier) return false;
      if (!needle) return true;
      return [
        entry.name,
        entry.className,
        entry.poolType,
        entry.notes,
        entry.effect,
        entry.duration,
        entry.role,
        entry.ceiling,
        entry.limitation,
        entry.tier,
        entry.list,
        entry.source,
      ].some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  }, [baseRows, query, tier, tarnishedOnly]);

  const sortedRows = useMemo(
    () => [...filteredRows].sort((a, b) => (sort === "asc" ? a.rank - b.rank : b.rank - a.rank)),
    [filteredRows, sort],
  );

  const visibleRows = sortedRows.slice(0, limit);
  const tears = activeList.id === "Crystal Tears";

  function changeList(id: string) {
    if (id !== REMEMBRANCE_TAB_ID && !TIER_LISTS.some((list) => list.id === id)) return;
    setQuery("");
    setTier("all");
    setSort("asc");
    setTarnishedOnly(false);
    navigate(`/tiers?list=${encodeURIComponent(id)}`);
  }

  function resetFilters() {
    setQuery("");
    setTier("all");
    setSort("asc");
    setTarnishedOnly(false);
    setLimit(PAGE_SIZE);
    navigate(`/tiers?list=${encodeURIComponent(activeList.id)}`);
  }

  const columns: Column[] = [
    {
      key: "rank",
      label: "Rank",
      width: "58px",
      render: (entry) => <span className="tier-rank">#{entry.rank}</span>,
    },
    {
      key: "tier",
      label: "Tier",
      width: "80px",
      render: (entry) => <TierBadge tier={entry.tier} />,
    },
    {
      key: "name",
      label: "Name",
      width: "20%",
      render: (entry) => {
        const patchImpact = PATCH_IMPACT_BY_NAME[entry.name];
        return (
          <>
            <span className="row wrap" style={{ gap: 6 }}>
              <TierName entry={entry} />
              {patchImpact ? (
                <span title={`${patchImpact.category}: ${patchImpact.summary}`}>
                  <Badge tone="warning">1.17</Badge>
                </span>
              ) : null}
              {!patchImpact && TARNISHED_PATTERN.test(entry.source ?? "") ? (
                <Badge tone="info">Tarnished Pack</Badge>
              ) : null}
            </span>
            {entry.poolType ? <div className="library-sub">{entry.poolType}</div> : null}
          </>
        );
      },
    },
    {
      key: "class",
      label: tears ? "Class / role" : "Class / function",
      width: "18%",
      render: (entry) => (entry.className ? <div className="small">{entry.className}</div> : null),
    },
  ];

  if (tears) {
    columns.push(
      {
        key: "effect",
        label: "Effect",
        width: "23%",
        render: (entry) => (
          <>
            {entry.effect ? <div className="small">{entry.effect}</div> : null}
            {entry.duration ? (
              <div className="library-badges">
                <Badge tone="info">{entry.duration}</Badge>
              </div>
            ) : null}
          </>
        ),
      },
      {
        key: "role",
        label: "Role / ceiling / limitation",
        render: (entry) => (
          <>
            <DetailLine label="Role" value={entry.role} />
            <DetailLine label="Ceiling" value={entry.ceiling} />
            <DetailLine label="Limit" value={entry.limitation} />
          </>
        ),
      },
    );
  } else {
    columns.push({
      key: "notes",
      label: "Notes",
      render: (entry) => (entry.notes ? <div className="library-note" style={{ marginTop: 0 }}>{entry.notes}</div> : null),
    });
  }

  const empty = (
    <div className="library-empty-wrap">
      <EmptyState
        title="No ranked entries match these filters"
        description="Try a different search, tier, or list."
        icon="filter"
        action={
          <Button icon="refresh" onClick={resetFilters}>
            Reset filters
          </Button>
        }
      />
    </div>
  );

  const tarnishedRows = baseRows.filter((entry) => TARNISHED_PATTERN.test(entry.source ?? ""));

  if (isRemembranceTab) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Journey plan · Remembrance duplication"
          title="Tiers"
          description={
            <>
              Remembrances ranked by how likely each one is to need a duplicate: the entries at the top are the
              ones where spending a mausoleum now protects a build or a paired reward. The ranking below is the
              recorded order, not a percentage.
            </>
          }
          actions={
            <>
              <Badge tone="accent">{formatNumber(remembrancePlanRows().length)} remembrances</Badge>
              <Button icon="sword" onClick={() => navigate("/collection")}>
                Collection
              </Button>
            </>
          }
        />

        <section className="card">
          <TabBar items={TAB_ITEMS} value={REMEMBRANCE_TAB_ID} onChange={changeList} />
          <RemembrancePlanSection />
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Whole-game rankings · Source table"
        title="Tiers"
        description={
          <>
            Six ranked lists covering {formatNumber(TIERS.length)} entries. Ranks and tiers are shown exactly as
            recorded in the source table; the companion does not re-rank anything.
          </>
        }
        actions={
          <>
            <Badge tone="accent">{formatNumber(TIERS.length)} entries</Badge>
            <Button icon="bag" onClick={() => navigate("/collection")}>
              Collection
            </Button>
          </>
        }
      />

      <section className="card">
        <TabBar items={TAB_ITEMS} value={activeList.id} onChange={changeList} />

        <div className="tier-heading">
          <div className="tier-heading-row">
            <h2>{activeList.label}</h2>
            <Badge tone="accent">{formatNumber(baseRows.length)} entries</Badge>
            <Badge>{tierOptions.length} tiers</Badge>
            <Badge tone="info">Source ranks preserved</Badge>
          </div>
          <p className="tier-description">{activeList.description}</p>
        </div>

        <div className="library-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, class, effect, notes…"
          />
          <Select label="Tier" value={tier} onChange={(event) => setTier(event.target.value)}>
            <option value="all">All tiers</option>
            {tierOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value === "desc" ? "desc" : "asc")}
          >
            <option value="asc">Rank: low to high</option>
            <option value="desc">Rank: high to low</option>
          </Select>
          <Select
            label="Patch"
            value={tarnishedOnly ? "tarnished" : "all"}
            onChange={(event) => setTarnishedOnly(event.target.value === "tarnished")}
          >
            <option value="all">All entries</option>
            <option value="tarnished">1.17 additions ({formatNumber(TARNISHED_TOTAL)})</option>
          </Select>
          <span className="library-count" style={{ marginLeft: "auto", paddingBottom: 10 }}>
            {formatNumber(filteredRows.length)} matching
          </span>
        </div>

        {tarnishedRows.length ? (
          <Callout tone="default" icon="spark">
            <div className="tier-tarnished-note">
              <span>
                <strong>{formatNumber(tarnishedRows.length)} entries</strong> come from the 1.17 / Tarnished Pack
                pass and are labeled in the name column. Use the Patch filter to isolate them from the older
                rankings.
              </span>
              <span className="tag-list">
                {tarnishedRows.map((entry) => (
                  <Badge key={`${entry.list}-${entry.name}`} tone="warning">
                    {entry.name}
                  </Badge>
                ))}
              </span>
            </div>
          </Callout>
        ) : null}

        <TierTable rows={visibleRows} columns={columns} tears={tears} empty={empty} />

        {sortedRows.length ? (
          visibleRows.length >= sortedRows.length ? (
            <div className="library-end tiny faint">All {formatNumber(sortedRows.length)} records shown.</div>
          ) : (
            <div className="library-more">
              <Button
                icon="chevronDown"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              >
                Load {formatNumber(Math.min(PAGE_SIZE, sortedRows.length - visibleRows.length))} more
              </Button>
              <span className="tiny faint">
                Showing {formatNumber(visibleRows.length)} of {formatNumber(sortedRows.length)}
              </span>
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
