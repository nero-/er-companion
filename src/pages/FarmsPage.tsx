import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  PageHeader,
  ProgressBar,
  SearchInput,
  Select,
  TabBar,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import {
  FINITE_RESOURCES,
  FARMABLES,
  MATERIALS,
  MERCHANTS,
  SCARABS,
} from "../lib/data";
import { formatNumber, itemGroupIcon } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import { farmSummary } from "../lib/selectors";
import {
  setFarmable,
  setFiniteAcquired,
  setMaterialStock,
  setMerchant,
  setScarabCollected,
  useActiveCharacter,
  useActiveJourney,
} from "../lib/store";
import type { Farmable, FiniteResource, Material, MerchantRecord, Scarab } from "../lib/types";
import "./library.css";

type FarmTabId = "farmables" | "materials" | "finite" | "merchants" | "scarabs";
type TimingGroup = "regional" | "act1" | "maliketh";

interface FarmTab {
  id: FarmTabId;
  label: string;
  count: number;
}

interface Filters {
  query: string;
  game: string;
  category: string;
  timing: string;
  priority: string;
  type: string;
  region: string;
  merchant: string;
  missable: string;
  rewardType: string;
}

const PAGE_SIZE = 120;

const FARM_TABS: FarmTab[] = [
  { id: "farmables", label: "Farmables", count: FARMABLES.length },
  { id: "materials", label: "Materials", count: MATERIALS.length },
  { id: "finite", label: "Finite pickups", count: FINITE_RESOURCES.length },
  { id: "merchants", label: "Merchants", count: MERCHANTS.length },
  { id: "scarabs", label: "Scarabs", count: SCARABS.length },
];

const TAB_ROWS: Record<FarmTabId, { id: string }[]> = {
  farmables: FARMABLES,
  materials: MATERIALS,
  finite: FINITE_RESOURCES,
  merchants: MERCHANTS,
  scarabs: SCARABS,
};

const DEFAULT_FILTERS: Filters = {
  query: "",
  game: "all",
  category: "all",
  timing: "all",
  priority: "all",
  type: "all",
  region: "all",
  merchant: "all",
  missable: "all",
  rewardType: "all",
};

const TIMING_OPTIONS: { value: TimingGroup; label: string }[] = [
  { value: "regional", label: "Regional section / defer" },
  { value: "act1", label: "Act I registration" },
  { value: "maliketh", label: "Before Maliketh" },
];

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort((a, b) => a.localeCompare(b));
}

const FARMABLE_GAMES = uniqueSorted(FARMABLES.map((entry) => entry.game));
const FARMABLE_CATEGORIES = uniqueSorted(FARMABLES.map((entry) => entry.category));
const MATERIAL_GAMES = uniqueSorted(MATERIALS.map((entry) => entry.game));
const MATERIAL_CATEGORIES = uniqueSorted(MATERIALS.map((entry) => entry.category));
const MATERIAL_PRIORITIES = uniqueSorted(MATERIALS.map((entry) => entry.priority));
const FINITE_TYPES = uniqueSorted(FINITE_RESOURCES.map((entry) => entry.type));
const FINITE_REGIONS = uniqueSorted(FINITE_RESOURCES.map((entry) => entry.region));
const MERCHANT_NAMES = uniqueSorted(MERCHANTS.map((entry) => entry.merchant));
const MERCHANT_PRIORITIES = uniqueSorted(MERCHANTS.map((entry) => entry.priority));
const MERCHANT_MISSABLE = uniqueSorted(MERCHANTS.map((entry) => entry.missable));
const SCARAB_REGIONS = uniqueSorted(SCARABS.map((entry) => entry.region));
const SCARAB_REWARDS = uniqueSorted(SCARABS.map((entry) => entry.rewardType));

function isFarmTab(value: string | null): value is FarmTabId {
  return value === "farmables" || value === "materials" || value === "finite" || value === "merchants" || value === "scarabs";
}

function matchesSearch(query: string, values: (string | number | undefined)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function timingGroup(timing: string): TimingGroup {
  if (/maliketh/i.test(timing)) return "maliketh";
  if (/act i/i.test(timing)) return "act1";
  return "regional";
}

function timingGroupLabel(group: TimingGroup): string {
  if (group === "maliketh") return "Maliketh deadline";
  if (group === "act1") return "Act I registration";
  return "Regional / defer";
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function priorityTone(priority: string): "accent" | "warning" | "default" {
  if (priority === "High" || priority === "Preserve" || priority.includes("Required")) return "warning";
  if (priority === "Medium") return "accent";
  return "default";
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

function SourceLink({ url, name }: { url: string; name: string }) {
  if (!url) return null;
  return (
    <a
      className="library-source-link"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open web source for ${name}`}
    >
      Source <Icon name="external" size={11} />
    </a>
  );
}

interface Column<T> {
  key: string;
  label: string;
  width?: string;
  render: (row: T) => ReactNode;
}

function LedgerTable<T extends { id: string }>({
  rows,
  columns,
  focusId,
  empty,
  className = "",
}: {
  rows: T[];
  columns: Column<T>[];
  focusId: string;
  empty: ReactNode;
  className?: string;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className="table-wrap library-table-wrap">
      <table className={`data-table library-table ${className}`.trim()}>
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
          {rows.map((row) => (
            <tr key={row.id} id={`farm-row-${row.id}`} className={row.id === focusId ? "is-focus" : undefined}>
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  data-label={column.label}
                  className={index === 0 ? "library-primary-cell" : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadMore({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  if (!total) return null;
  if (shown >= total) {
    return <div className="library-end tiny faint">All {formatNumber(total)} records shown.</div>;
  }
  return (
    <div className="library-more">
      <Button icon="chevronDown" onClick={onMore}>
        Load {formatNumber(Math.min(PAGE_SIZE, total - shown))} more
      </Button>
      <span className="tiny faint">
        Showing {formatNumber(shown)} of {formatNumber(total)}
      </span>
    </div>
  );
}

function ListProgress({
  owned,
  total,
  unit,
  scope,
  note,
  matching,
  focus,
  onClearFocus,
}: {
  owned: number;
  total: number;
  unit: string;
  scope: "Lifetime" | "Journey";
  note: string;
  matching: number;
  focus: string;
  onClearFocus: () => void;
}) {
  const percent = total ? (owned / total) * 100 : 0;
  return (
    <div className="library-progress">
      <div className="library-progress-head">
        <div className="row wrap" style={{ gap: 8 }}>
          <Badge tone={scope === "Lifetime" ? "accent" : "info"}>{scope}</Badge>
          <span className="library-progress-note">{note}</span>
        </div>
        <span className="library-count">
          {formatNumber(owned)} / {formatNumber(total)}
        </span>
      </div>
      <ProgressBar
        value={percent}
        tone={total > 0 && owned >= total ? "success" : "accent"}
        label={`${formatNumber(owned)} of ${formatNumber(total)} ${unit}`}
        detail={`${Math.round(percent)}%`}
      />
      <div className="row-between wrap">
        <span className="library-progress-count">
          {formatNumber(matching)} {matching === 1 ? "record matches" : "records match"} the current filters
        </span>
        {focus ? (
          <Button size="sm" variant="ghost" icon="x" onClick={onClearFocus}>
            Clear focus
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function FarmsPage() {
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const summary = farmSummary(character, journey);
  const route = useRoute();
  const toast = useToast();

  const focusId = route.query.get("id") ?? "";
  const focusTab = useMemo<FarmTabId | undefined>(() => {
    if (!focusId) return undefined;
    return FARM_TABS.find((tab) => TAB_ROWS[tab.id].some((row) => row.id === focusId))?.id;
  }, [focusId]);
  const tabParam = route.query.get("tab");
  const activeTab: FarmTabId = focusTab ?? (isFarmTab(tabParam) ? tabParam : "farmables");

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const previousTab = useRef<FarmTabId>(activeTab);
  const focusExpanded = useRef<string | null>(null);
  const scrolledFocus = useRef<string | null>(null);

  useEffect(() => {
    if (previousTab.current === activeTab) return;
    previousTab.current = activeTab;
    setFilters(DEFAULT_FILTERS);
    setLimit(PAGE_SIZE);
  }, [activeTab]);

  useEffect(() => {
    if (!focusId) {
      focusExpanded.current = null;
      return;
    }
    const key = `${focusId}:${activeTab}`;
    if (focusExpanded.current === key) return;
    const index = TAB_ROWS[activeTab].findIndex((row) => row.id === focusId);
    if (index < 0) return;
    focusExpanded.current = key;
    setLimit(Math.max(PAGE_SIZE, index + 1));
  }, [focusId, activeTab]);

  useEffect(() => {
    if (!focusId) {
      scrolledFocus.current = null;
      return;
    }
    if (scrolledFocus.current === focusId) return;
    const node = document.getElementById(`farm-row-${focusId}`);
    if (!node) return;
    scrolledFocus.current = focusId;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, activeTab, limit]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setLimit(PAGE_SIZE);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setLimit(PAGE_SIZE);
  }

  const farmableRows = useMemo(
    () =>
      FARMABLES.filter((entry) => {
        if (filters.game !== "all" && entry.game !== filters.game) return false;
        if (filters.category !== "all" && entry.category !== filters.category) return false;
        if (filters.timing !== "all" && timingGroup(entry.timing) !== filters.timing) return false;
        return matchesSearch(filters.query, [
          entry.item,
          entry.category,
          entry.source,
          entry.location,
          entry.grace,
          entry.dropRate,
          entry.dropType,
          entry.timing,
          entry.notes,
        ]);
      }),
    [filters],
  );

  const materialRows = useMemo(
    () =>
      MATERIALS.filter((entry) => {
        if (filters.game !== "all" && entry.game !== filters.game) return false;
        if (filters.category !== "all" && entry.category !== filters.category) return false;
        if (filters.priority !== "all" && entry.priority !== filters.priority) return false;
        return matchesSearch(filters.query, [
          entry.name,
          entry.category,
          entry.renewability,
          entry.earlySource,
          entry.lateSource,
          entry.grace,
          entry.method,
          entry.purchasable,
          entry.merchant,
          entry.use,
          entry.notes,
        ]);
      }),
    [filters],
  );

  const finiteRows = useMemo(
    () =>
      FINITE_RESOURCES.filter((entry) => {
        if (filters.type !== "all" && entry.type !== filters.type) return false;
        if (filters.region !== "all" && entry.region !== filters.region) return false;
        return matchesSearch(filters.query, [
          entry.name,
          entry.type,
          entry.tier,
          entry.region,
          entry.location,
          entry.acquisitionType,
          entry.eventuallyPurchasable,
          entry.notes,
        ]);
      }),
    [filters],
  );

  const merchantRows = useMemo(
    () =>
      MERCHANTS.filter((entry) => {
        if (filters.merchant !== "all" && entry.merchant !== filters.merchant) return false;
        if (filters.priority !== "all" && entry.priority !== filters.priority) return false;
        if (filters.missable !== "all" && entry.missable !== filters.missable) return false;
        return matchesSearch(filters.query, [
          entry.merchant,
          entry.item,
          entry.category,
          entry.cost,
          entry.stock,
          entry.priority,
          entry.notes,
        ]);
      }),
    [filters],
  );

  const scarabRows = useMemo(
    () =>
      SCARABS.filter((entry) => {
        if (filters.region !== "all" && entry.region !== filters.region) return false;
        if (filters.rewardType !== "all" && entry.rewardType !== filters.rewardType) return false;
        return matchesSearch(filters.query, [
          entry.reward,
          entry.rewardType,
          entry.region,
          entry.section,
          entry.location,
          entry.behavior,
          entry.quantity,
        ]);
      }),
    [filters],
  );

  const visibleFarmables = farmableRows.slice(0, limit);
  const visibleMaterials = materialRows.slice(0, limit);
  const visibleFinite = finiteRows.slice(0, limit);
  const visibleMerchants = merchantRows.slice(0, limit);
  const visibleScarabs = scarabRows.slice(0, limit);

  const matchingCount = {
    farmables: farmableRows.length,
    materials: materialRows.length,
    finite: finiteRows.length,
    merchants: merchantRows.length,
    scarabs: scarabRows.length,
  }[activeTab];

  const shownCount = {
    farmables: visibleFarmables.length,
    materials: visibleMaterials.length,
    finite: visibleFinite.length,
    merchants: visibleMerchants.length,
    scarabs: visibleScarabs.length,
  }[activeTab];

  const progress = {
    farmables: {
      owned: summary.farmablesOwned,
      total: summary.farmablesTotal,
      unit: "owned",
      scope: "Lifetime" as const,
      note: "Permanent character quantities. Reaching a target also marks the matching collection item.",
    },
    materials: {
      owned: summary.materialsStocked,
      total: summary.materialsTotal,
      unit: "stocked",
      scope: "Journey" as const,
      note: "Per-journey material stock. Toggle what is currently on hand for this run.",
    },
    finite: {
      owned: summary.finiteCollected,
      total: summary.finiteTotal,
      unit: "collected",
      scope: "Journey" as const,
      note: "One-time pickups for this journey. These are not lifetime inventory quantities.",
    },
    merchants: {
      owned: summary.merchantsPurchased,
      total: summary.merchantsTotal,
      unit: "purchased",
      scope: "Journey" as const,
      note: "Per-journey merchant purchases. Buying also records matching item ownership on the character.",
    },
    scarabs: {
      owned: summary.scarabsCollected,
      total: summary.scarabsTotal,
      unit: "collected",
      scope: "Journey" as const,
      note: "Scarab collection for this journey, with the linked collection record where one exists.",
    },
  }[activeTab];

  function changeTab(id: string) {
    if (!isFarmTab(id)) return;
    setFilters(DEFAULT_FILTERS);
    setLimit(PAGE_SIZE);
    navigate(`/farms?tab=${id}`);
  }

  function changeFarmable(entry: Farmable, next: number) {
    const target = entry.targetQuantity > 0 ? entry.targetQuantity : 1;
    const value = Math.max(0, Math.min(target, Number.isFinite(next) ? Math.floor(next) : 0));
    const previous = character.farmables[entry.id] ?? 0;
    const acquired = setFarmable(entry.id, value, target, entry.item);
    if (value >= target && previous < target) {
      if (acquired.length) {
        toast.push(`${acquired.join(", ")} added to the collection.`, "success");
      } else {
        toast.push(`${entry.item} target reached. No matching collection record was added.`);
      }
    }
  }

  function toggleMerchant(entry: MerchantRecord, purchased: boolean) {
    const acquired = setMerchant(entry.id, purchased, entry.item);
    if (!purchased) return;
    if (acquired.length) {
      toast.push(`${acquired.join(", ")} added to the collection.`, "success");
    } else {
      toast.push(`${entry.item} marked purchased.`);
    }
  }

  const filterEmpty = (title: string) => (
    <div className="library-empty-wrap">
      <EmptyState
        title={title}
        description="Adjust the search or filters to widen the ledger."
        icon="filter"
        action={
          <Button icon="refresh" onClick={resetFilters}>
            Clear filters
          </Button>
        }
      />
    </div>
  );

  const farmableColumns: Column<Farmable>[] = [
    {
      key: "item",
      label: "Item",
      render: (entry) => {
        const group = timingGroup(entry.timing);
        return (
          <>
            <div className="library-title-row">
              <Icon name={itemGroupIcon(entry.category)} size={14} />
              <span className="library-title">{entry.item}</span>
            </div>
            <div className="library-badges">
              <Badge>{entry.category}</Badge>
              <Badge tone="accent">{entry.game}</Badge>
              {group === "maliketh" ? <Badge tone="warning">Deadline</Badge> : null}
            </div>
            <div className="library-sub">{entry.slot}</div>
          </>
        );
      },
    },
    {
      key: "quantity",
      label: "Quantity",
      width: "145px",
      render: (entry) => {
        const quantity = character.farmables[entry.id] ?? 0;
        const target = entry.targetQuantity;
        const reached = target > 0 && quantity >= target;
        return (
          <>
            <div className="library-stepper">
              <button
                type="button"
                aria-label={`Decrease ${entry.item} quantity`}
                disabled={quantity <= 0}
                onClick={() => changeFarmable(entry, quantity - 1)}
              >
                <Icon name="minus" size={12} />
              </button>
              <input
                type="number"
                min={0}
                max={target}
                value={quantity}
                aria-label={`${entry.item} quantity, target ${formatQuantity(target)}`}
                onChange={(event) => changeFarmable(entry, Number(event.target.value))}
              />
              <button
                type="button"
                aria-label={`Increase ${entry.item} quantity`}
                disabled={target > 0 && quantity >= target}
                onClick={() => changeFarmable(entry, quantity + 1)}
              >
                <Icon name="plus" size={12} />
              </button>
            </div>
            <div className={`library-sub ${reached ? "success" : ""}`}>
              {quantity} / {formatQuantity(target)}
              {reached ? " · Target reached" : ""}
            </div>
          </>
        );
      },
    },
    {
      key: "drop",
      label: "Drop",
      width: "150px",
      render: (entry) => (
        <>
          <div className="small">{entry.dropRate}</div>
          <div className="library-badges">
            <Badge tone="info">{entry.dropType}</Badge>
          </div>
        </>
      ),
    },
    {
      key: "source",
      label: "Source",
      width: "22%",
      render: (entry) => (
        <>
          <div className="small">{entry.source}</div>
          <div className="library-sub">{entry.location}</div>
          <div className="library-sub">Nearest grace · {entry.grace}</div>
        </>
      ),
    },
    {
      key: "guidance",
      label: "Timing & notes",
      render: (entry) => {
        const group = timingGroup(entry.timing);
        return (
          <>
            <Badge tone={group === "maliketh" ? "warning" : "default"}>{timingGroupLabel(group)}</Badge>
            <div className="library-note">{entry.timing}</div>
            {entry.notes ? <div className="library-note">{entry.notes}</div> : null}
            <SourceLink url={entry.sourceUrl} name={entry.item} />
          </>
        );
      },
    },
  ];

  const materialColumns: Column<Material>[] = [
    {
      key: "material",
      label: "Material",
      width: "22%",
      render: (entry) => (
        <>
          <div className="library-title">{entry.name}</div>
          <div className="library-badges">
            <Badge>{entry.category}</Badge>
            <Badge tone="accent">{entry.game}</Badge>
            <Badge tone={priorityTone(entry.priority)}>{entry.priority}</Badge>
          </div>
        </>
      ),
    },
    {
      key: "stock",
      label: "Stock",
      width: "100px",
      render: (entry) => (
        <div className="library-check-cell">
          <Checkbox
            checked={journey.materials[entry.id] ?? false}
            onChange={(checked) => setMaterialStock(entry.id, checked)}
            label="Stocked"
          />
        </div>
      ),
    },
    {
      key: "sources",
      label: "Sources",
      width: "24%",
      render: (entry) => (
        <>
          <DetailLine label="Early" value={entry.earlySource} />
          <DetailLine label="Late" value={entry.lateSource} />
          <DetailLine label="Grace" value={entry.grace} />
          <DetailLine label="Method" value={entry.method} />
        </>
      ),
    },
    {
      key: "supply",
      label: "Supply",
      width: "22%",
      render: (entry) => (
        <>
          <DetailLine label="Renew" value={entry.renewability} />
          <DetailLine label="Purchasable" value={entry.purchasable} />
          <DetailLine label="Merchant" value={entry.merchant} />
          <DetailLine label="Before unlock" value={entry.finiteBeforeUnlock} />
        </>
      ),
    },
    {
      key: "use",
      label: "Use & notes",
      render: (entry) => (
        <>
          <DetailLine label="Use" value={entry.use} />
          {entry.notes ? <div className="library-note">{entry.notes}</div> : null}
          <SourceLink url={entry.sourceUrl} name={entry.name} />
        </>
      ),
    },
  ];

  const finiteColumns: Column<FiniteResource>[] = [
    {
      key: "pickup",
      label: "Pickup",
      width: "24%",
      render: (entry) => (
        <>
          <div className="library-title">{entry.name}</div>
          <div className="library-badges">
            <Badge>{entry.type}</Badge>
            {entry.tier ? <Badge tone="accent">{entry.tier}</Badge> : null}
            <Badge tone="info">×{formatQuantity(entry.quantity)}</Badge>
          </div>
        </>
      ),
    },
    {
      key: "acquired",
      label: "Acquired",
      width: "100px",
      render: (entry) => (
        <div className="library-check-cell">
          <Checkbox
            checked={journey.finite[entry.id] ?? false}
            onChange={(checked) => setFiniteAcquired(entry.id, checked)}
            label="Acquired"
          />
        </div>
      ),
    },
    {
      key: "location",
      label: "Location",
      width: "21%",
      render: (entry) => (
        <>
          <div className="small">{entry.location}</div>
          <div className="library-sub">{entry.region}</div>
        </>
      ),
    },
    {
      key: "acquisition",
      label: "Acquisition",
      width: "20%",
      render: (entry) => (
        <>
          <DetailLine label="Type" value={entry.acquisitionType} />
          <DetailLine label="Later" value={entry.eventuallyPurchasable} />
        </>
      ),
    },
    {
      key: "notes",
      label: "Notes & source",
      render: (entry) => (
        <>
          {entry.notes ? <div className="library-note" style={{ marginTop: 0 }}>{entry.notes}</div> : null}
          <SourceLink url={entry.sourceUrl} name={entry.name} />
        </>
      ),
    },
  ];

  const merchantColumns: Column<MerchantRecord>[] = [
    {
      key: "item",
      label: "Item",
      width: "23%",
      render: (entry) => (
        <>
          <div className="library-title">{entry.item}</div>
          <div className="library-badges">
            <Badge>{entry.category}</Badge>
            <Badge tone={priorityTone(entry.priority)}>{entry.priority}</Badge>
          </div>
        </>
      ),
    },
    {
      key: "purchased",
      label: "Purchased",
      width: "105px",
      render: (entry) => (
        <div className="library-check-cell">
          <Checkbox
            checked={journey.merchants[entry.id] ?? false}
            onChange={(checked) => toggleMerchant(entry, checked)}
            label="Purchased"
          />
        </div>
      ),
    },
    {
      key: "merchant",
      label: "Merchant",
      width: "19%",
      render: (entry) => <div className="small">{entry.merchant}</div>,
    },
    {
      key: "cost",
      label: "Cost & stock",
      width: "13%",
      render: (entry) => (
        <>
          <DetailLine label="Cost" value={entry.cost} />
          <DetailLine label="Stock" value={entry.stock} />
        </>
      ),
    },
    {
      key: "purchase",
      label: "Purchase note",
      render: (entry) => (
        <>
          <DetailLine label="State" value={entry.missable} />
          {entry.notes ? <div className="library-note">{entry.notes}</div> : null}
          <SourceLink url={entry.sourceUrl} name={entry.item} />
        </>
      ),
    },
  ];

  const scarabColumns: Column<Scarab>[] = [
    {
      key: "reward",
      label: "Reward",
      width: "24%",
      render: (entry) => (
        <>
          <div className="library-title">{entry.reward}</div>
          <div className="library-badges">
            <Badge tone="accent">{entry.rewardType}</Badge>
            <Badge tone="info">×{entry.quantity}</Badge>
            <Badge>{entry.game}</Badge>
          </div>
        </>
      ),
    },
    {
      key: "collected",
      label: "Collected",
      width: "105px",
      render: (entry) => (
        <div className="library-check-cell">
          <Checkbox
            checked={journey.scarabs[entry.id] ?? false}
            onChange={(checked) => setScarabCollected(entry.id, checked)}
            label="Collected"
          />
        </div>
      ),
    },
    {
      key: "region",
      label: "Region & section",
      width: "19%",
      render: (entry) => (
        <>
          <div className="small">{entry.region}</div>
          <div className="library-sub">{entry.section}</div>
        </>
      ),
    },
    {
      key: "location",
      label: "Location",
      width: "22%",
      render: (entry) => <div className="small">{entry.location}</div>,
    },
    {
      key: "behavior",
      label: "Behavior",
      width: "14%",
      render: (entry) => <div className="small">{entry.behavior}</div>,
    },
    {
      key: "collection",
      label: "Collection",
      render: (entry) => (
        <>
          {entry.collectionId ? (
            <a
              className="chip"
              href={`#/collection?item=${encodeURIComponent(entry.collectionId)}`}
              aria-label={`Open the linked collection record for ${entry.reward}`}
            >
              <Icon name="bag" size={12} /> Collection
            </a>
          ) : (
            <span className="tiny faint">No linked record</span>
          )}
          <DetailLine label="Route" value={entry.routeRef} />
        </>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${journey.label} · Supply ledger`}
        title="Farms"
        description={
          <>
            Farmable quantities are permanent character records; materials, finite pickups, merchant purchases, and
            scarabs are tracked per journey. Reaching a farmable target also marks the matching collection item.
          </>
        }
        actions={
          <>
            <Button variant="primary" icon="bag" onClick={() => navigate("/collection")}>
              Collection
            </Button>
            <Button icon="map" onClick={() => navigate("/journey")}>
              Journey
            </Button>
          </>
        }
      />

      <section className="card">
        <TabBar items={FARM_TABS} value={activeTab} onChange={changeTab} />
        <ListProgress
          owned={progress.owned}
          total={progress.total}
          unit={progress.unit}
          scope={progress.scope}
          note={progress.note}
          matching={matchingCount}
          focus={focusId}
          onClearFocus={() => navigate(`/farms?tab=${activeTab}`)}
        />

        <div className="library-toolbar">
          {activeTab === "farmables" ? (
            <>
              <SearchInput
                value={filters.query}
                onChange={(value) => updateFilter("query", value)}
                placeholder="Search item, source, location, grace…"
              />
              <Select label="Game" value={filters.game} onChange={(event) => updateFilter("game", event.target.value)}>
                <option value="all">All games</option>
                {FARMABLE_GAMES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Category"
                value={filters.category}
                onChange={(event) => updateFilter("category", event.target.value)}
              >
                <option value="all">All categories</option>
                {FARMABLE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Timing"
                value={filters.timing}
                onChange={(event) => updateFilter("timing", event.target.value)}
              >
                <option value="all">All timing windows</option>
                {TIMING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {activeTab === "materials" ? (
            <>
              <SearchInput
                value={filters.query}
                onChange={(value) => updateFilter("query", value)}
                placeholder="Search material, source, merchant, use…"
              />
              <Select label="Game" value={filters.game} onChange={(event) => updateFilter("game", event.target.value)}>
                <option value="all">All games</option>
                {MATERIAL_GAMES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Category"
                value={filters.category}
                onChange={(event) => updateFilter("category", event.target.value)}
              >
                <option value="all">All categories</option>
                {MATERIAL_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Priority"
                value={filters.priority}
                onChange={(event) => updateFilter("priority", event.target.value)}
              >
                <option value="all">All priorities</option>
                {MATERIAL_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {activeTab === "finite" ? (
            <>
              <SearchInput
                value={filters.query}
                onChange={(value) => updateFilter("query", value)}
                placeholder="Search pickup, location, region…"
              />
              <Select label="Type" value={filters.type} onChange={(event) => updateFilter("type", event.target.value)}>
                <option value="all">All types</option>
                {FINITE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Region"
                value={filters.region}
                onChange={(event) => updateFilter("region", event.target.value)}
              >
                <option value="all">All regions</option>
                {FINITE_REGIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {activeTab === "merchants" ? (
            <>
              <SearchInput
                value={filters.query}
                onChange={(value) => updateFilter("query", value)}
                placeholder="Search merchant, item, notes…"
              />
              <Select
                label="Merchant"
                value={filters.merchant}
                onChange={(event) => updateFilter("merchant", event.target.value)}
              >
                <option value="all">All merchants</option>
                {MERCHANT_NAMES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Priority"
                value={filters.priority}
                onChange={(event) => updateFilter("priority", event.target.value)}
              >
                <option value="all">All priorities</option>
                {MERCHANT_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Missable"
                value={filters.missable}
                onChange={(event) => updateFilter("missable", event.target.value)}
              >
                <option value="all">All purchase states</option>
                {MERCHANT_MISSABLE.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {activeTab === "scarabs" ? (
            <>
              <SearchInput
                value={filters.query}
                onChange={(value) => updateFilter("query", value)}
                placeholder="Search reward, location, region, behavior…"
              />
              <Select
                label="Region"
                value={filters.region}
                onChange={(event) => updateFilter("region", event.target.value)}
              >
                <option value="all">All regions</option>
                {SCARAB_REGIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Reward type"
                value={filters.rewardType}
                onChange={(event) => updateFilter("rewardType", event.target.value)}
              >
                <option value="all">All rewards</option>
                {SCARAB_REWARDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </>
          ) : null}
        </div>

        {activeTab === "farmables" ? (
          <>
            <LedgerTable
              rows={visibleFarmables}
              columns={farmableColumns}
              focusId={focusId}
              className="farm-table"
              empty={filterEmpty("No farmables match these filters")}
            />
            <LoadMore shown={shownCount} total={matchingCount} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
          </>
        ) : null}

        {activeTab === "materials" ? (
          <>
            <LedgerTable
              rows={visibleMaterials}
              columns={materialColumns}
              focusId={focusId}
              className="farm-table"
              empty={filterEmpty("No materials match these filters")}
            />
            <LoadMore shown={shownCount} total={matchingCount} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
          </>
        ) : null}

        {activeTab === "finite" ? (
          <>
            <LedgerTable
              rows={visibleFinite}
              columns={finiteColumns}
              focusId={focusId}
              className="farm-table"
              empty={filterEmpty("No finite pickups match these filters")}
            />
            <LoadMore shown={shownCount} total={matchingCount} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
          </>
        ) : null}

        {activeTab === "merchants" ? (
          <>
            <LedgerTable
              rows={visibleMerchants}
              columns={merchantColumns}
              focusId={focusId}
              className="farm-table"
              empty={filterEmpty("No merchant records match these filters")}
            />
            <LoadMore shown={shownCount} total={matchingCount} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
          </>
        ) : null}

        {activeTab === "scarabs" ? (
          <>
            <LedgerTable
              rows={visibleScarabs}
              columns={scarabColumns}
              focusId={focusId}
              className="farm-table"
              empty={filterEmpty("No scarabs match these filters")}
            />
            <LoadMore shown={shownCount} total={matchingCount} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
          </>
        ) : null}
      </section>
    </div>
  );
}
