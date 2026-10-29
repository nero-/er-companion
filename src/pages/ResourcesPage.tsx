import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  TabBar,
} from "../components/ui";
import {
  RESOURCE_ROW_COUNT,
  RESOURCE_TABLE_COUNT,
  RESOURCE_TABLES,
} from "../lib/data";
import { formatNumber } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import type {
  ResourceCell,
  ResourceRow,
  ResourceTable,
} from "../lib/types";
import "./resources.css";

/* ---------------------------------------------------------------------------
 * Static table metadata
 * ------------------------------------------------------------------------- */

interface RowLink {
  label: string;
  url: string;
}

interface TableMeta {
  id: string;
  label: string;
  sectionId: string;
  sectionTitle: string;
  hasLinks: boolean;
  hasNotes: boolean;
  hasBlanks: boolean;
}

const TABLE_LABELS: Record<string, string> = {
  "soft-caps": "Soft Caps",
  "smithing-stones": "Smithing Stones",
  "somber-smithing-stones": "Somber Smithing Stones",
  "grave-gloveworts": "Grave Gloveworts",
  "ghost-gloveworts": "Ghost Gloveworts",
  "runes-base": "Runes — Base Game",
  "runes-dlc": "Runes — DLC",
  "remembrances-base": "Remembrances — Base Game",
  "remembrances-dlc": "Remembrances — DLC",
  "scadutree-fragments": "Scadutree Fragments",
  "revered-spirit-ashes": "Revered Spirit Ashes",
};

const LINK_KEYS: Record<string, string> = {
  wikiUrl: "Wiki",
  sourceUrl: "Source",
  bellBearingUrl: "Bell bearing",
  mapUrl: "Map",
  noteUrl: "Note",
};

function rowLinkEntries(row: ResourceRow): RowLink[] {
  const links: RowLink[] = [];
  for (const [key, label] of Object.entries(LINK_KEYS)) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) links.push({ label, url: value });
  }
  const noteLinks = row.noteLinks;
  if (Array.isArray(noteLinks)) {
    for (const link of noteLinks) {
      if (!link.url || !link.label) continue;
      if (links.some((entry) => entry.url === link.url)) continue;
      links.push({ label: link.label, url: link.url });
    }
  }
  return links;
}

const TABLE_META: Record<string, TableMeta> = Object.fromEntries(
  RESOURCE_TABLES.map((table) => {
    return [
      table.id,
      {
        id: table.id,
        label: TABLE_LABELS[table.id] ?? table.caption,
        sectionId: table.sectionId,
        sectionTitle: table.sectionTitle,
        hasLinks: table.rows.some((row) => rowLinkEntries(row).length > 0),
        hasNotes: table.rows.some(
          (row) => typeof row.note === "string" && row.note.trim().length > 0,
        ),
        hasBlanks: table.rows.some((row) =>
          table.rowKeys.some(
            (key) => row[key] === null || row[key] === undefined || row[key] === "",
          ),
        ),
      },
    ];
  }),
);

const SECTIONS = RESOURCE_TABLES.reduce<{ id: string; title: string }[]>((sections, table) => {
  if (!sections.some((section) => section.id === table.sectionId)) {
    sections.push({ id: table.sectionId, title: table.sectionTitle });
  }
  return sections;
}, []);

const TABLE_BY_ID: Record<string, ResourceTable> = Object.fromEntries(
  RESOURCE_TABLES.map((table) => [table.id, table]),
);

const DLC_TABLE_COUNT = RESOURCE_TABLES.filter((table) => table.dlc).length;

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function rowCellText(value: ResourceCell | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((link) => link.label).join(" ");
  return String(value);
}

function rowMatches(row: ResourceRow, needle: string): boolean {
  for (const [key, value] of Object.entries(row)) {
    if (key === "wikiUrl" || key === "bellBearingUrl" || key === "sourceUrl") continue;
    if (rowCellText(value).toLowerCase().includes(needle)) return true;
  }
  return rowLinkEntries(row).some((link) => link.label.toLowerCase().includes(needle));
}

function renderCell(value: ResourceCell | undefined): ReactNode {
  if (value === null || value === undefined || value === "") {
    return (
      <span className="resources-blank" title="Blank on the source sheet; not inferred">
        —
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <span className="resources-cell-links">
        {value.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
            {link.label}
            <Icon name="external" size={10} />
          </a>
        ))}
      </span>
    );
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return formatNumber(value);
  return value;
}

/* ---------------------------------------------------------------------------
 * Table rendering
 * ------------------------------------------------------------------------- */

function ResourceTableBlock({
  table,
  rows,
}: {
  table: ResourceTable;
  rows: ResourceRow[];
}) {
  const meta = TABLE_META[table.id];
  const isFiltered = rows.length !== table.rows.length;
  return (
    <section className="resources-table-block" id={`resource-table-${table.id}`}>
      <div className="resources-table-head">
        <div className="resources-table-title">
          <div className="resources-table-eyebrow">{table.sectionTitle}</div>
          <h2>{meta.label}</h2>
        </div>
        <div className="resources-table-meta">
          {table.dlc ? <Badge tone="info">Shadow of the Erdtree</Badge> : null}
          <span className="resources-table-count">
            {formatNumber(rows.length)}
            {isFiltered ? ` of ${formatNumber(table.rows.length)}` : ""} rows
          </span>
          {table.sourceUrl ? (
            <a
              className="resources-source-link"
              href={table.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Source
              <Icon name="external" size={11} />
            </a>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="resources-table-empty">No rows in this table match the search.</p>
      ) : (
        <div className="table-wrap resources-table-wrap">
          <table className="data-table resources-table">
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                {meta.hasLinks ? <th>Links</th> : null}
                {meta.hasNotes ? <th>Notes</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const links = rowLinkEntries(row);
                return (
                  <tr key={`${table.id}-${rowIndex}`}>
                    {table.rowKeys.map((key, columnIndex) => (
                      <td
                        key={key}
                        data-label={table.columns[columnIndex] ?? key}
                        className={columnIndex === 0 ? "resources-primary-cell" : undefined}
                      >
                        {columnIndex === 0 ? (
                          <span className="resources-primary-value">
                            {renderCell(row[key])}
                            {typeof row.wikiUrl === "string" && row.wikiUrl ? (
                              <a
                                className="resources-inline-link"
                                href={row.wikiUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Wiki
                                <Icon name="external" size={10} />
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          renderCell(row[key])
                        )}
                      </td>
                    ))}
                    {meta.hasLinks ? (
                      <td data-label="Links">
                        {links.length ? (
                          <span className="resources-cell-links">
                            {links.map((link) => (
                              <a
                                key={`${link.url}-${link.label}`}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {link.label}
                                <Icon name="external" size={10} />
                              </a>
                            ))}
                          </span>
                        ) : (
                          <span className="resources-blank">—</span>
                        )}
                      </td>
                    ) : null}
                    {meta.hasNotes ? (
                      <td data-label="Notes" className="resources-note-cell">
                        {typeof row.note === "string" && row.note ? (
                          row.note
                        ) : (
                          <span className="resources-blank">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta.hasBlanks ? (
        <p className="resources-table-legend">
          <span className="resources-blank">—</span> Blank on the source sheet; values are
          not inferred.
          {table.sectionId === "smithing-stones" || table.sectionId === "gloveworts"
            ? " Top-tier material costs and bell-bearings are left blank rather than estimated."
            : ""}
        </p>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export function ResourcesPage() {
  const route = useRoute();
  const initialTable = route.query.get("table") ?? "";
  const [tableId, setTableId] = useState(() =>
    TABLE_BY_ID[initialTable] ? initialTable : "all",
  );
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();

  const matchingTables = useMemo(
    () =>
      RESOURCE_TABLES.filter((table) => tableId === "all" || table.id === tableId)
        .map((table) => ({
          table,
          rows: needle
            ? table.rows.filter((row) => rowMatches(row, needle))
            : table.rows,
        }))
        .filter((group) => !needle || group.rows.length > 0),
    [tableId, needle],
  );

  const matchingRowCount = matchingTables.reduce(
    (total, group) => total + group.rows.length,
    0,
  );

  function selectTable(next: string) {
    if (next === tableId) return;
    setTableId(next);
    setQuery("");
    navigate(next === "all" ? "/resources" : `/resources?table=${encodeURIComponent(next)}`);
  }

  const routeTableParam = route.query.get("table") ?? "";
  const routeTable = TABLE_BY_ID[routeTableParam] ? routeTableParam : "all";
  const lastRouteTable = useRef(routeTable);

  useEffect(() => {
    if (lastRouteTable.current === routeTable) return;
    lastRouteTable.current = routeTable;
    setTableId(routeTable);
    setQuery("");
  }, [routeTable]);

  const activeMeta = tableId === "all" ? undefined : TABLE_META[tableId];

  // Selecting a table keeps the whole table reachable: bring its block into view
  // so the tab never appears to render nothing.
  useEffect(() => {
    if (tableId === "all") return;
    const node = document.getElementById(`resource-table-${tableId}`);
    node?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [tableId]);

  // Keep the active tab inside the scrollable bar on narrow screens.
  useEffect(() => {
    const active = tabBarRef.current?.querySelector<HTMLElement>(".tab.active");
    if (!active) return;
    const bar = tabBarRef.current;
    if (!bar) return;
    const barRect = bar.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    if (tabRect.left < barRect.left || tabRect.right > barRect.right) {
      bar.scrollTo({
        left: tabRect.left - barRect.left + bar.scrollLeft - 12,
        behavior: "smooth",
      });
    }
  }, [tableId]);

  const tabItems = [
    { id: "all", label: "All tables", count: RESOURCE_ROW_COUNT },
    ...RESOURCE_TABLES.map((table) => ({
      id: table.id,
      label: TABLE_META[table.id].label,
      count: table.rows.length,
    })),
  ];

  return (
    <div className="page resources-page">
      <PageHeader
        eyebrow={`Reference · ${formatNumber(RESOURCE_TABLE_COUNT)} tables`}
        title="Resources"
        description={`Soft caps, upgrade costs, rune values, and remembrances from the Redmaw Resources sheet. Blank cells stay blank: a dash means the source does not state a value, not that the value is zero.`}
      />

      <div className="resources-summary" aria-label="Reference summary">
        <div className="resources-summary-item">
          <strong>{formatNumber(RESOURCE_TABLE_COUNT)}</strong>
          <span>Tables</span>
        </div>
        <div className="resources-summary-item">
          <strong>{formatNumber(RESOURCE_ROW_COUNT)}</strong>
          <span>Rows</span>
        </div>
        <div className="resources-summary-item">
          <strong>{formatNumber(SECTIONS.length)}</strong>
          <span>Sections</span>
        </div>
        <div className="resources-summary-item">
          <strong>{formatNumber(DLC_TABLE_COUNT)}</strong>
          <span>DLC tables</span>
        </div>
        <div className="resources-summary-item resources-summary-item--note">
          <span>Nulls preserved · values never inferred</span>
        </div>
      </div>

      <div className="resources-tabbar" ref={tabBarRef}>
        <TabBar items={tabItems} value={tableId} onChange={selectTable} />
      </div>

      <div className="resources-toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search this table or all tables…"
          className="resources-search"
        />
        <Select
          label="Table"
          value={tableId}
          onChange={(event) => selectTable(event.target.value)}
        >
          <option value="all">All {RESOURCE_TABLE_COUNT} tables</option>
          {RESOURCE_TABLES.map((table) => (
            <option key={table.id} value={table.id}>
              {TABLE_META[table.id].label} ({table.rows.length})
            </option>
          ))}
        </Select>
        <Button
          variant="ghost"
          icon="x"
          onClick={() => {
            setQuery("");
            selectTable("all");
          }}
        >
          Reset
        </Button>
      </div>

      <div className="resources-result-row">
        <span>
          <strong>{formatNumber(matchingRowCount)}</strong>{" "}
          {matchingRowCount === 1 ? "row" : "rows"}
          {needle ? ` matching “${query.trim()}”` : ""}
          {activeMeta ? ` in ${activeMeta.label}` : ` across ${formatNumber(RESOURCE_TABLE_COUNT)} tables`}
        </span>
        <span className="tiny faint">
          {activeMeta
            ? `${formatNumber(TABLE_BY_ID[tableId]?.rows.length ?? 0)} rows in this table`
            : "Every table is shown below; jump with a tab or the table selector."}
        </span>
      </div>

      {matchingTables.length === 0 ? (
        <EmptyState
          title="No table rows match"
          description="Try a stat, material, rune value, or remembrance name — or clear the search."
          icon="search"
          action={
            <Button
              variant="primary"
              icon="refresh"
              onClick={() => {
                setQuery("");
                selectTable("all");
              }}
            >
              Clear search
            </Button>
          }
        />
      ) : tableId === "all" ? (
        SECTIONS.map((section) => {
          const groups = matchingTables.filter(
            (group) => group.table.sectionId === section.id,
          );
          if (!groups.length) return null;
          return (
            <section className="resources-section" key={section.id}>
              <div className="resources-section-head">
                <h2>{section.title}</h2>
                <span className="resources-section-count">
                  {groups.reduce((total, group) => total + group.rows.length, 0)} rows ·{" "}
                  {groups.length} {groups.length === 1 ? "table" : "tables"}
                </span>
              </div>
              {groups.map((group) => (
                <ResourceTableBlock
                  key={group.table.id}
                  table={group.table}
                  rows={group.rows}
                />
              ))}
            </section>
          );
        })
      ) : (
        matchingTables.map((group) => (
          <ResourceTableBlock key={group.table.id} table={group.table} rows={group.rows} />
        ))
      )}

      <p className="resources-footnote">
        Rows render directly from <code>research/resources.json</code> via{" "}
        <code>RESOURCE_TABLES</code>. Columns and keys are not remapped, so every source
        field keeps its original meaning. {formatNumber(RESOURCE_ROW_COUNT)} rows total.
      </p>
    </div>
  );
}
