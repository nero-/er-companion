import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  TabBar,
  TierBadge,
} from "../components/ui";
import { ITEMS_BY_NAME, TIERS, TIERS_BY_LIST } from "../lib/data";
import { formatNumber } from "../lib/format";
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

const TAB_ITEMS = TIER_LISTS.map((list) => ({
  id: list.id,
  label: list.label,
  count: (TIERS_BY_LIST[list.id] ?? []).length,
}));

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

export function TiersPage() {
  const route = useRoute();
  const listParam = route.query.get("list");
  const activeList = TIER_LISTS.find((list) => list.id === listParam) ?? TIER_LISTS[0];
  const routeQuery = route.query.get("q") ?? "";
  const baseRows = TIERS_BY_LIST[activeList.id] ?? [];

  const [query, setQuery] = useState(routeQuery);
  const [tier, setTier] = useState("all");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const previousList = useRef(activeList.id);

  useEffect(() => {
    setQuery(routeQuery);
  }, [routeQuery]);

  useEffect(() => {
    if (previousList.current === activeList.id) return;
    previousList.current = activeList.id;
    setTier("all");
    setSort("asc");
    setLimit(PAGE_SIZE);
  }, [activeList.id]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [activeList.id, query, tier, sort]);

  const tierOptions = useMemo(() => [...new Set(baseRows.map((entry) => entry.tier))], [baseRows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return baseRows.filter((entry) => {
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
      ].some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  }, [baseRows, query, tier]);

  const sortedRows = useMemo(
    () => [...filteredRows].sort((a, b) => (sort === "asc" ? a.rank - b.rank : b.rank - a.rank)),
    [filteredRows, sort],
  );

  const visibleRows = sortedRows.slice(0, limit);
  const tears = activeList.id === "Crystal Tears";

  function changeList(id: string) {
    if (!TIER_LISTS.some((list) => list.id === id)) return;
    setQuery("");
    setTier("all");
    setSort("asc");
    navigate(`/tiers?list=${encodeURIComponent(id)}`);
  }

  function resetFilters() {
    setQuery("");
    setTier("all");
    setSort("asc");
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
        const itemMatch = ITEMS_BY_NAME[entry.name]?.[0];
        const href = itemMatch
          ? `#/collection?item=${encodeURIComponent(itemMatch.id)}`
          : `#/collection?q=${encodeURIComponent(entry.name)}`;
        return (
          <>
            <a className="tier-link" href={href}>
              {entry.name}
            </a>
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
          <span className="library-count" style={{ marginLeft: "auto", paddingBottom: 10 }}>
            {formatNumber(filteredRows.length)} matching
          </span>
        </div>

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
