import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Disclosure,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  TabBar,
  useToast,
} from "../components/ui";
import { Icon } from "../components/Icon";
import {
  FINITE_RESOURCES,
  FARMABLES,
  ITEMS,
  ITEMS_BY_NAME,
  MATERIALS,
  MERCHANT_INVENTORIES,
  MERCHANT_INVENTORY_ID_BY_LEGACY_ID,
  MERCHANTS,
  ROUTE_STEPS,
  SCARABS,
  STEP_BY_ID,
  SWEEP_STEPS,
  normalizeContentKey,
  remapStepId,
} from "../lib/data";
import { formatNumber, itemGroupIcon } from "../lib/format";
import { navigate, queryString, useRoute } from "../lib/router";
import { sweepStepState } from "../lib/selectors";
import {
  setFarmable,
  setFiniteAcquired,
  setItemCount,
  setMaterialCount,
  setMerchant,
  setScarabCollected,
  useActiveCharacter,
  useActiveJourney,
} from "../lib/store";
import type {
  Farmable,
  FiniteResource,
  JourneyState,
  Material,
  MerchantInventoryItem,
  MerchantRecord,
  Scarab,
} from "../lib/types";
import "./library.css";

type FarmTabId = "farmables" | "materials" | "finite" | "merchants" | "scarabs";
type TimingGroup = "regional" | "act1" | "maliketh";
type MerchantScope = "inventory" | "workbook";

interface InventoryRow extends MerchantInventoryItem {
  merchantId: string;
  merchantName: string;
  merchantSourceUrl: string;
}

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
  stock: string;
  location: string;
  source: string;
  dropSort: string;
}

const PAGE_SIZE = 120;

const INVENTORY_ROWS: InventoryRow[] = MERCHANT_INVENTORIES.flatMap((merchant) =>
  merchant.items.map((item) => ({
    ...item,
    merchantId: merchant.id,
    merchantName: merchant.name,
    merchantSourceUrl: merchant.sourceUrl,
  })),
);

const INVENTORY_ROW_BY_ID: Record<string, InventoryRow> = Object.fromEntries(
  INVENTORY_ROWS.map((row) => [row.id, row]),
);

/** Canonical inventory id → the workbook ledger id bridged to it, when one exists. */
const LEGACY_ID_BY_INVENTORY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(MERCHANT_INVENTORY_ID_BY_LEGACY_ID).map(([legacyId, inventoryId]) => [inventoryId, legacyId]),
);

const FARM_TABS: FarmTab[] = [
  { id: "farmables", label: "Farmables", count: FARMABLES.length },
  { id: "materials", label: "Materials", count: MATERIALS.length },
  { id: "finite", label: "Finite pickups", count: FINITE_RESOURCES.length },
  { id: "merchants", label: "Merchants", count: INVENTORY_ROWS.length },
  { id: "scarabs", label: "Scarabs", count: SCARABS.length },
];

const TAB_ROWS: Record<FarmTabId, { id: string }[]> = {
  farmables: FARMABLES,
  materials: MATERIALS,
  finite: FINITE_RESOURCES,
  merchants: [...INVENTORY_ROWS, ...MERCHANTS],
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
  stock: "all",
  location: "all",
  source: "all",
  dropSort: "default",
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
const INVENTORY_MERCHANT_NAMES = uniqueSorted(MERCHANT_INVENTORIES.map((entry) => entry.name));
const MERCHANT_PRIORITIES = uniqueSorted(MERCHANTS.map((entry) => entry.priority));
const MERCHANT_MISSABLE = uniqueSorted(MERCHANTS.map((entry) => entry.missable));
const SCARAB_REGIONS = uniqueSorted(SCARABS.map((entry) => entry.region));
const SCARAB_REWARDS = uniqueSorted(SCARABS.map((entry) => entry.rewardType));

const FARMABLE_NAMES = new Set(FARMABLES.map((entry) => entry.item));
const LOOSE_PICKUP_NAMES = new Set(
  ITEMS.filter(
    (item) =>
      /pickup|corpse|chest|boss reward|enemy reward|scarab/i.test(item.acquisitionType) &&
      !/catalog|purchase/i.test(item.acquisitionType),
  ).map((item) => item.name),
);

function materialOnHand(journey: JourneyState, id: string): number {
  const count = journey.materialCounts[id] ?? 0;
  if (count > 0) return count;
  return journey.materials[id] ? 1 : 0;
}

function overlapBadge(name: string): { label: string; tone: "accent" | "info" | "default" } {
  if (FARMABLE_NAMES.has(name)) return { label: "Farmable", tone: "accent" };
  if (LOOSE_PICKUP_NAMES.has(name)) return { label: "Loose pickup", tone: "info" };
  return { label: "Merchant only", tone: "default" };
}

/* ---------------------------------------------------------------------------
 * Drop chance parsing
 * ------------------------------------------------------------------------- */

interface DropChance {
  /** Lowest stated percentage, null when the source never states a number. */
  low: number | null;
  /** Human label: "3%", the low end of "1%–1.5%", or "Not stated". */
  label: string;
}

function parseDropChance(raw: string): DropChance {
  const values: number[] = [];
  for (const match of (raw ?? "").matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  if (!values.length) return { low: null, label: "Not stated" };
  const low = Math.min(...values);
  const high = Math.max(...values);
  return { low, label: low === high ? `${low}%` : `${low}%–${high}%` };
}

function dropTone(chance: DropChance): "accent" | "warning" | "default" {
  if (chance.low === null) return "default";
  if (chance.low <= 2) return "warning";
  return "accent";
}

/** Sort weight: stated rates first, unstated rows always last in both directions. */
function dropSortWeight(chance: DropChance, direction: "asc" | "desc"): number {
  if (chance.low === null) return Number.MAX_SAFE_INTEGER;
  return direction === "asc" ? chance.low : -chance.low;
}

const FARMABLE_DROP_CHANCE: Record<string, DropChance> = Object.fromEntries(
  FARMABLES.map((entry) => [entry.id, parseDropChance(entry.dropRate)]),
);

const FARMABLE_LOCATIONS = uniqueSorted(FARMABLES.map((entry) => entry.location));
const FARMABLE_SOURCES = uniqueSorted(FARMABLES.map((entry) => entry.source));

const DROP_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "default", label: "Ledger order" },
  { value: "rarest", label: "Drop chance: rarest first" },
  { value: "commonest", label: "Drop chance: most common first" },
];

/* ---------------------------------------------------------------------------
 * Finite pickup → actionable step
 * ------------------------------------------------------------------------- */

interface StepLink {
  kind: "route" | "sweep";
  stepId: string;
  area: string;
  title: string;
  /**
   * True when ticking this step actually hands the pickup over. A false value
   * links the area the pickup sits in without claiming the step covers it.
   */
  covers: boolean;
}

const FINITE_NAME_SUFFIX = /\s+(deposits|placements|fixed materials|fixed consumables)$/;

function itemKey(value: string): string {
  return normalizeContentKey(value).replace(FINITE_NAME_SUFFIX, "").trim();
}

const ITEMS_BY_KEY: Record<string, typeof ITEMS> = (() => {
  const grouped: Record<string, typeof ITEMS> = {};
  for (const item of ITEMS) {
    const key = itemKey(item.name);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }
  return grouped;
})();

/** Sweep steps keyed by row name, so a pickup reaches the step that lists it. */
const SWEEP_STEPS_BY_ENTRY_KEY: Record<string, typeof SWEEP_STEPS> = (() => {
  const grouped: Record<string, typeof SWEEP_STEPS> = {};
  for (const step of SWEEP_STEPS) {
    for (const entry of step.entries) {
      const key = itemKey(entry.name);
      if (!grouped[key]) grouped[key] = [];
      if (!grouped[key].some((existing) => existing.id === step.id)) grouped[key].push(step);
    }
  }
  return grouped;
})();

const SWEEP_STEPS_BY_ITEM_ID: Record<string, typeof SWEEP_STEPS> = (() => {
  const grouped: Record<string, typeof SWEEP_STEPS> = {};
  for (const step of SWEEP_STEPS) {
    for (const entry of step.entries) {
      if (!entry.itemId) continue;
      if (!grouped[entry.itemId]) grouped[entry.itemId] = [];
      grouped[entry.itemId].push(step);
    }
  }
  return grouped;
})();

/** Route steps that hand an item over automatically, keyed by catalog item id. */
const ROUTE_STEPS_BY_ITEM_ID: Record<string, string> = (() => {
  const index: Record<string, string> = {};
  for (const step of ROUTE_STEPS) {
    for (const itemId of step.autoAcquireItemIds) {
      if (!index[itemId]) index[itemId] = step.id;
    }
  }
  return index;
})();

/** Sweep kinds in the order that best answers "where do I get this". */
const SWEEP_KIND_ORDER: Record<string, number> = {
  pickups: 0,
  cleanup: 1,
  materials: 2,
  farmables: 3,
  merchants: 4,
};

const AREA_NAME_PREFIX = /^(base game|shadow of the erdtree)\s*[—–-]\s*/i;

const KNOWN_AREAS = new Set<string>([
  ...ROUTE_STEPS.map((step) => step.area),
  ...SWEEP_STEPS.map((step) => step.area),
]);

const SWEEP_BY_AREA: Record<string, typeof SWEEP_STEPS> = (() => {
  const grouped: Record<string, typeof SWEEP_STEPS> = {};
  for (const step of SWEEP_STEPS) {
    if (!grouped[step.area]) grouped[step.area] = [];
    grouped[step.area].push(step);
  }
  for (const steps of Object.values(grouped)) steps.sort((a, b) => a.order - b.order);
  return grouped;
})();

const ROUTE_BY_AREA: Record<string, typeof ROUTE_STEPS> = (() => {
  const grouped: Record<string, typeof ROUTE_STEPS> = {};
  for (const step of ROUTE_STEPS) {
    if (!grouped[step.area]) grouped[step.area] = [];
    grouped[step.area].push(step);
  }
  for (const steps of Object.values(grouped)) steps.sort((a, b) => a.order - b.order);
  return grouped;
})();

/** Route steps whose location or instruction text names the pickup's spot. */
const ROUTE_TEXT_INDEX: { step: (typeof ROUTE_STEPS)[number]; text: string }[] = ROUTE_STEPS.map((step) => ({
  step,
  text: normalizeContentKey(`${step.location} ${step.instruction}`),
}));

function areasForFinite(entry: FiniteResource): string[] {
  const found: string[] = [];
  for (const raw of [entry.region, entry.location]) {
    const stripped = (raw ?? "").replace(AREA_NAME_PREFIX, "").trim();
    for (const part of stripped.split("/")) {
      const name = part.trim();
      if (name && KNOWN_AREAS.has(name) && !found.includes(name)) found.push(name);
    }
  }
  return found;
}

const PICKUP_SWEEP_KINDS = new Set(["pickups", "cleanup", "farmables"]);

function pickSweepStep(steps: typeof SWEEP_STEPS, areas: string[]): (typeof SWEEP_STEPS)[number] | undefined {
  // Purchase and crafting-stock steps track different ledgers, so a placed
  // pickup must never be linked to one of them.
  const candidates = steps.filter((step) => PICKUP_SWEEP_KINDS.has(step.kind));
  if (!candidates.length) return undefined;
  return [...candidates].sort((a, b) => {
    const byArea = Number(!areas.includes(a.area)) - Number(!areas.includes(b.area));
    if (byArea) return byArea;
    const byKind = (SWEEP_KIND_ORDER[a.kind] ?? 9) - (SWEEP_KIND_ORDER[b.kind] ?? 9);
    if (byKind) return byKind;
    return a.order - b.order;
  })[0];
}

function routeStepForLocation(location: string) {
  const tokens = normalizeContentKey(location).split(" ").filter((token) => token.length >= 3);
  if (tokens.length < 2) return undefined;
  for (let size = Math.min(3, tokens.length); size >= 2; size -= 1) {
    const phrase = tokens.slice(0, size).join(" ");
    const hit = ROUTE_TEXT_INDEX.find((row) => row.text.includes(phrase));
    if (hit) return hit.step;
  }
  return undefined;
}

function resolveFiniteLink(entry: FiniteResource): StepLink | undefined {
  const areas = areasForFinite(entry);

  for (const raw of [entry.autoStepId ?? "", ...entry.routeStepIds]) {
    if (!raw) continue;
    const stepId = remapStepId(raw) ?? raw;
    const step = STEP_BY_ID[stepId];
    if (step) return { kind: "route", stepId: step.id, area: step.area, title: step.objectiveName, covers: true };
  }

  for (const item of ITEMS_BY_KEY[itemKey(entry.name)] ?? []) {
    const routeId = ROUTE_STEPS_BY_ITEM_ID[item.id];
    const routeStep = routeId ? STEP_BY_ID[routeId] : undefined;
    if (routeStep) {
      return { kind: "route", stepId: routeStep.id, area: routeStep.area, title: routeStep.objectiveName, covers: true };
    }
    const sweep = pickSweepStep(SWEEP_STEPS_BY_ITEM_ID[item.id] ?? [], areas);
    if (sweep) return { kind: "sweep", stepId: sweep.id, area: sweep.area, title: sweep.title, covers: true };
  }

  const byName = pickSweepStep(SWEEP_STEPS_BY_ENTRY_KEY[itemKey(entry.name)] ?? [], areas);
  if (byName) return { kind: "sweep", stepId: byName.id, area: byName.area, title: byName.title, covers: true };

  for (const area of areas) {
    const sweep = pickSweepStep(SWEEP_BY_AREA[area] ?? [], areas);
    if (sweep) return { kind: "sweep", stepId: sweep.id, area: sweep.area, title: sweep.title, covers: false };
    const routeStep = (ROUTE_BY_AREA[area] ?? []).find((step) => step.autoAcquireItemIds.length > 0);
    if (routeStep) {
      return { kind: "route", stepId: routeStep.id, area: routeStep.area, title: routeStep.objectiveName, covers: false };
    }
  }

  const byLocation = routeStepForLocation(entry.location);
  if (byLocation) {
    return { kind: "route", stepId: byLocation.id, area: byLocation.area, title: byLocation.objectiveName, covers: false };
  }
  return undefined;
}

const FINITE_LINKS: Record<string, StepLink | undefined> = Object.fromEntries(
  FINITE_RESOURCES.map((entry) => [entry.id, resolveFiniteLink(entry)]),
);

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

function stockLabel(stock: string): string {
  if (stock === "infinite") return "Infinite";
  if (!stock) return "Not listed";
  return `×${stock}`;
}

function unlockBadge(note?: string, cost?: string): { label: string; tone: "info" | "warning" | "default" } | null {
  if (cost && /MISSABLE/i.test(cost)) return { label: "Missable", tone: "warning" };
  if (cost && /remembrance/i.test(cost)) return { label: "Remembrance", tone: "warning" };
  if (!note) return null;
  if (/bell bearing/i.test(note)) return { label: "Bell bearing", tone: "info" };
  if (/MISSABLE/i.test(note)) return { label: "Missable", tone: "warning" };
  if (/remembrance/i.test(note)) return { label: "Remembrance", tone: "warning" };
  if (/quest|side with|giving|gave|relocat|moving|join|killing|defeating|finishing|selecting|buying|hearing|telling|reading|agree/i.test(note)) {
    return { label: "Quest gate", tone: "default" };
  }
  return { label: "Unlock gate", tone: "default" };
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

function SourceLink({ url, name, label = "Source" }: { url: string; name: string; label?: string }) {
  if (!url) return null;
  return (
    <a
      className="library-source-link"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${label.toLowerCase()} for ${name}`}
    >
      {label} <Icon name="external" size={11} />
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
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  focusId: string;
  empty: ReactNode;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
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
            <tr
              key={row.id}
              id={`farm-row-${row.id}`}
              className={[row.id === focusId ? "is-focus" : "", rowClassName?.(row)].filter(Boolean).join(" ") || undefined}
            >
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

function QuantityStepper({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (next: number) => void;
}) {
  const clamp = (next: number) => Math.max(0, Math.min(max, Number.isFinite(next) ? Math.floor(next) : 0));
  return (
    <div className="library-stepper">
      <button
        type="button"
        aria-label={`Decrease ${label} quantity`}
        disabled={value <= 0}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Icon name="minus" size={12} />
      </button>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        aria-label={`${label} quantity, maximum ${max}`}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <button
        type="button"
        aria-label={`Increase ${label} quantity`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}

function LockedCheckbox({ label }: { label: string }) {
  return (
    <span className="check check-locked" aria-disabled="true">
      <input type="checkbox" defaultChecked disabled />
      <span className="check-box">
        <Icon name="check" size={12} strokeWidth={2.4} />
      </span>
      <span>{label}</span>
    </span>
  );
}

interface SummaryCell {
  id: FarmTabId;
  label: string;
  done: number;
  total: number;
  scope: "Lifetime" | "Journey";
}

function FarmSummaryStrip({
  cells,
  active,
  focus,
  onSelect,
  onClearFocus,
}: {
  cells: SummaryCell[];
  active: FarmTabId;
  focus: string;
  onSelect: (id: FarmTabId) => void;
  onClearFocus: () => void;
}) {
  return (
    <div className="farm-summary-strip">
      {cells.map((cell) => {
        const percent = cell.total ? Math.round((cell.done / cell.total) * 100) : 0;
        const complete = cell.total > 0 && cell.done >= cell.total;
        return (
          <button
            key={cell.id}
            type="button"
            className={`farm-summary-cell ${cell.id === active ? "is-active" : ""}`.trim()}
            aria-pressed={cell.id === active}
            onClick={() => onSelect(cell.id)}
          >
            <span className="stat-label">{cell.label}</span>
            <strong>
              {formatNumber(cell.done)} <span className="faint">/ {formatNumber(cell.total)}</span>
            </strong>
            <span className="farm-summary-track" aria-hidden="true">
              <span className={complete ? "is-complete" : undefined} style={{ width: `${percent}%` }} />
            </span>
            <span className="farm-summary-scope">{cell.scope}</span>
          </button>
        );
      })}
      {focus ? (
        <div className="farm-summary-focus">
          <span className="tiny faint">Focused record</span>
          <Button size="sm" variant="ghost" icon="x" onClick={onClearFocus}>
            Clear focus
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function FarmsPage() {
  const character = useActiveCharacter();
  const journey = useActiveJourney();
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
  const [merchantScope, setMerchantScope] = useState<MerchantScope>("inventory");
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
    if (!focusId) return;
    if (INVENTORY_ROW_BY_ID[focusId]) {
      setMerchantScope("inventory");
    } else if (MERCHANTS.some((entry) => entry.id === focusId)) {
      setMerchantScope("workbook");
    }
  }, [focusId]);

  useEffect(() => {
    if (!focusId) {
      focusExpanded.current = null;
      return;
    }
    const key = `${focusId}:${activeTab}`;
    if (focusExpanded.current === key) return;
    const index =
      activeTab === "merchants"
        ? INVENTORY_ROW_BY_ID[focusId]
          ? INVENTORY_ROWS.findIndex((row) => row.id === focusId)
          : MERCHANTS.findIndex((row) => row.id === focusId)
        : TAB_ROWS[activeTab].findIndex((row) => row.id === focusId);
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

  const farmableRows = useMemo(() => {
    const rows = FARMABLES.filter((entry) => {
      if (filters.game !== "all" && entry.game !== filters.game) return false;
      if (filters.category !== "all" && entry.category !== filters.category) return false;
      if (filters.timing !== "all" && timingGroup(entry.timing) !== filters.timing) return false;
      if (filters.location !== "all" && entry.location !== filters.location) return false;
      if (filters.source !== "all" && entry.source !== filters.source) return false;
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
    });
    if (filters.dropSort === "default") return rows;
    const direction = filters.dropSort === "rarest" ? "asc" : "desc";
    return [...rows].sort(
      (a, b) =>
        dropSortWeight(FARMABLE_DROP_CHANCE[a.id], direction) -
          dropSortWeight(FARMABLE_DROP_CHANCE[b.id], direction) || a.item.localeCompare(b.item),
    );
  }, [filters]);

  const materialRows = useMemo(
    () =>
      MATERIALS.filter((entry) => {
        if (filters.game !== "all" && entry.game !== filters.game) return false;
        if (filters.category !== "all" && entry.category !== filters.category) return false;
        if (filters.priority !== "all" && entry.priority !== filters.priority) return false;
        const stocked = materialOnHand(journey, entry.id) > 0;
        if (filters.stock === "stocked" && !stocked) return false;
        if (filters.stock === "missing" && stocked) return false;
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
    [filters, journey.materialCounts, journey.materials],
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

  const inventoryRows = useMemo(
    () =>
      INVENTORY_ROWS.filter((entry) => {
        if (filters.merchant !== "all" && entry.merchantName !== filters.merchant) return false;
        return matchesSearch(filters.query, [
          entry.name,
          entry.merchantName,
          entry.cost,
          entry.price,
          entry.stock,
          entry.note,
          entry.stepId,
        ]);
      }),
    [filters],
  );

  const purchasedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [id, purchased] of Object.entries(journey.merchants)) {
      if (!purchased) continue;
      keys.add(MERCHANT_INVENTORY_ID_BY_LEGACY_ID[id] || id);
    }
    return keys;
  }, [journey.merchants]);

  const inventoryStats = useMemo(() => {
    const stats: Record<string, { owned: number; total: number }> = {};
    for (const merchant of MERCHANT_INVENTORIES) {
      stats[merchant.id] = {
        owned: merchant.items.filter((item) => purchasedKeys.has(item.id)).length,
        total: merchant.items.length,
      };
    }
    return stats;
  }, [purchasedKeys]);

  const inventoryPurchased = useMemo(
    () => INVENTORY_ROWS.filter((row) => purchasedKeys.has(row.id)).length,
    [purchasedKeys],
  );

  const selectedInventoryMerchant =
    filters.merchant === "all" ? undefined : MERCHANT_INVENTORIES.find((entry) => entry.name === filters.merchant);

  const finiteStepState = useMemo(() => {
    // `tracked` means the linked step really contains this pickup's row, so the
    // step — not a second checkbox — decides whether it is collected.
    const rows: Record<string, { link: StepLink | undefined; done: boolean; tracked: boolean }> = {};
    for (const entry of FINITE_RESOURCES) {
      const link = FINITE_LINKS[entry.id];
      if (!link?.covers) {
        rows[entry.id] = { link, done: false, tracked: false };
        continue;
      }
      const items = ITEMS_BY_KEY[itemKey(entry.name)] ?? [];
      if (link.kind === "route") {
        // The route step owns the pickup, and owning the catalog item proves it
        // was collected even if the step tick was never set.
        const owned = items.some((item) => Boolean(character.items[item.id]));
        rows[entry.id] = { link, done: owned || journey.steps[link.stepId] === "done", tracked: true };
        continue;
      }
      // A sweep step holds many rows, so check only the row that covers this
      // pickup. Ticks are character-wide, so one acquisition clears every copy.
      const itemIds = new Set(items.map((item) => item.id));
      const nameKey = normalizeContentKey(entry.name);
      const matching = (sweepStepState(link.stepId, character, journey)?.entries ?? []).filter(
        (row) =>
          (row.entry.itemId.length > 0 && itemIds.has(row.entry.itemId)) ||
          normalizeContentKey(row.entry.name) === nameKey,
      );
      rows[entry.id] = {
        link,
        done: matching.some((row) => row.acquired),
        tracked: matching.length > 0,
      };
    }
    return rows;
  }, [journey, character]);

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
  const visibleInventory = inventoryRows.slice(0, limit);
  const visibleScarabs = scarabRows.slice(0, limit);

  const matchingCount = {
    farmables: farmableRows.length,
    materials: materialRows.length,
    finite: finiteRows.length,
    merchants: merchantScope === "inventory" ? inventoryRows.length : merchantRows.length,
    scarabs: scarabRows.length,
  }[activeTab];

  const shownCount = {
    farmables: visibleFarmables.length,
    materials: visibleMaterials.length,
    finite: visibleFinite.length,
    merchants: merchantScope === "inventory" ? visibleInventory.length : visibleMerchants.length,
    scarabs: visibleScarabs.length,
  }[activeTab];

  const summaryCells: SummaryCell[] = [
    {
      id: "farmables",
      label: "Farmables",
      done: Object.values(character.farmables).filter((value) => value > 0).length,
      total: FARMABLES.length,
      scope: "Lifetime",
    },
    {
      id: "materials",
      label: "Materials",
      done: MATERIALS.filter((entry) => materialOnHand(journey, entry.id) > 0).length,
      total: MATERIALS.length,
      scope: "Journey",
    },
    {
      id: "finite",
      label: "Finite pickups",
      done: FINITE_RESOURCES.filter((entry) => {
        const state = finiteStepState[entry.id];
        return state?.tracked ? state.done : Boolean(journey.finite[entry.id]);
      }).length,
      total: FINITE_RESOURCES.length,
      scope: "Journey",
    },
    {
      id: "merchants",
      label: "Merchants",
      done: inventoryPurchased,
      total: INVENTORY_ROWS.length,
      scope: "Journey",
    },
    {
      id: "scarabs",
      label: "Scarabs",
      done: Object.values(journey.scarabs).filter(Boolean).length,
      total: SCARABS.length,
      scope: "Journey",
    },
  ];

  function changeTab(id: string) {
    if (!isFarmTab(id)) return;
    setFilters(DEFAULT_FILTERS);
    setLimit(PAGE_SIZE);
    navigate(`/farms?tab=${id}`);
  }

  function changeMerchantScope(scope: MerchantScope) {
    if (scope === merchantScope) return;
    setMerchantScope(scope);
    setFilters(DEFAULT_FILTERS);
    setLimit(PAGE_SIZE);
  }

  function selectInventoryMerchant(name: string) {
    updateFilter("merchant", filters.merchant === name ? "all" : name);
  }

  function changeFarmable(entry: Farmable, next: number) {
    const target = entry.targetQuantity > 0 ? entry.targetQuantity : 1;
    const value = Math.max(0, Math.min(target, Number.isFinite(next) ? Math.floor(next) : 0));
    const previous = character.farmables[entry.id] ?? 0;
    setFarmable(entry.id, value, target, entry.item);
    if (value < target || previous >= target) return;
    const matches = ITEMS_BY_NAME[entry.item] ?? [];
    const match = matches.find((item) => !character.items[item.id]) ?? matches[0];
    if (!match) {
      toast.push(`${entry.item} target reached. No matching collection record was added.`);
      return;
    }
    const count = Math.max(value, character.itemCounts[match.id] ?? 0);
    setItemCount(match.id, count);
    toast.push(`${match.name} now ×${formatNumber(count)} in the collection.`, "success");
  }

  function changeMaterial(entry: Material, next: number) {
    setMaterialCount(entry.id, Math.max(0, Math.min(999, Number.isFinite(next) ? Math.floor(next) : 0)));
  }

  function toggleMerchant(entry: MerchantRecord, purchased: boolean) {
    // The workbook ledger and the full inventory are separate store keys. Every
    // tick goes to the canonical inventory id so one purchase clears both views.
    const canonical = MERCHANT_INVENTORY_ID_BY_LEGACY_ID[entry.id];
    const acquired = setMerchant(canonical || entry.id, purchased, entry.item);
    if (!purchased && canonical) setMerchant(entry.id, false, entry.item);
    recordPurchase(entry.item, acquired, purchased);
  }

  function toggleInventory(entry: InventoryRow, purchased: boolean) {
    const acquired = setMerchant(entry.id, purchased, entry.name);
    // Clear any legacy workbook key bridged to this row so the ledger cannot
    // keep a stale tick the inventory no longer agrees with.
    const legacy = LEGACY_ID_BY_INVENTORY_ID[entry.id];
    if (!purchased && legacy) setMerchant(legacy, false, entry.name);
    recordPurchase(entry.name, acquired, purchased);
  }

  function recordPurchase(itemName: string, acquired: string[], purchased: boolean) {
    const matches = ITEMS_BY_NAME[acquired[0] ?? itemName] ?? [];
    const target = purchased
      ? matches.find((item) => character.items[item.id]) ?? matches[0]
      : matches.find((item) => character.items[item.id]);
    if (!target) {
      if (purchased) toast.push(`${itemName} marked purchased. No matching collection record.`);
      return;
    }
    const count = character.items[target.id] ? Math.max(1, character.itemCounts[target.id] ?? 1) : 0;
    const next = purchased ? count + 1 : Math.max(1, count - 1);
    setItemCount(target.id, next);
    if (purchased) toast.push(`${target.name} owned ×${formatNumber(next)} in the collection.`, "success");
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
        const target = entry.targetQuantity > 0 ? entry.targetQuantity : 1;
        const reached = quantity >= target;
        const match = (ITEMS_BY_NAME[entry.item] ?? [])[0];
        const itemCount = match ? character.itemCounts[match.id] ?? 0 : 0;
        return (
          <>
            <QuantityStepper
              value={Math.min(quantity, target)}
              max={target}
              label={entry.item}
              onChange={(next) => changeFarmable(entry, next)}
            />
            <div className={`library-sub ${reached ? "success" : ""}`}>
              {quantity} / {formatQuantity(target)}
              {reached ? " · Target reached" : ""}
            </div>
            {itemCount > 0 ? <Badge tone="success">×{formatNumber(itemCount)} owned</Badge> : null}
          </>
        );
      },
    },
    {
      key: "drop",
      label: "Drop",
      width: "150px",
      render: (entry) => {
        const chance = FARMABLE_DROP_CHANCE[entry.id];
        return (
          <>
            <div className="library-badges">
              <Badge tone={dropTone(chance)}>
                {chance.low === null ? "Chance not stated" : `Drop ${chance.label}`}
              </Badge>
              <Badge tone="info">{entry.dropType}</Badge>
            </div>
            {/* Show the source wording only when it adds detail beyond the badge. */}
            {entry.dropRate.trim() !== chance.label ? <div className="small">{entry.dropRate}</div> : null}
          </>
        );
      },
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
      label: "On hand",
      width: "148px",
      render: (entry) => {
        const count = materialOnHand(journey, entry.id);
        return (
          <>
            <QuantityStepper
              value={count}
              max={999}
              label={entry.name}
              onChange={(next) => changeMaterial(entry, next)}
            />
            <div className={`library-sub ${count > 0 ? "success" : ""}`}>
              {count > 0 ? `×${formatNumber(count)} stocked` : "Not stocked"}
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={count > 0 ? "refresh" : "check"}
              onClick={() => changeMaterial(entry, count > 0 ? 0 : Math.max(1, count))}
            >
              {count > 0 ? "Clear" : "Mark stocked"}
            </Button>
          </>
        );
      },
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
      render: (entry) => {
        const state = finiteStepState[entry.id];
        const link = state?.link;
        const done = Boolean(state?.done);
        return (
          <>
            <div className="library-title">{entry.name}</div>
            <div className="library-badges">
              <Badge>{entry.type}</Badge>
              {entry.tier ? <Badge tone="accent">{entry.tier}</Badge> : null}
              <Badge tone="info">×{formatQuantity(entry.quantity)}</Badge>
              {link ? (
                <Badge tone="info">
                  {state?.tracked
                    ? link.kind === "route"
                      ? "Route step"
                      : "Sweep step"
                    : "Area step"}
                </Badge>
              ) : null}
              {state?.tracked && done ? <Badge tone="success">Collected by step</Badge> : null}
            </div>
            {link ? (
              <button
                type="button"
                className="library-route-link"
                onClick={() => navigate(`/journey${queryString({ step: link.stepId, area: link.area })}`)}
                aria-label={`Open the ${link.title} step for ${entry.name}`}
                title={link.title}
              >
                <Icon name="map" size={12} /> {link.area}
              </button>
            ) : (
              <span className="library-sub">No linked route or sweep step.</span>
            )}
          </>
        );
      },
    },
    {
      key: "acquired",
      label: "Acquired",
      width: "150px",
      render: (entry) => {
        const state = finiteStepState[entry.id];
        // A row its step hands over is tracked in exactly one place: the step.
        if (state?.tracked && state.link) {
          const kind = state.link.kind === "route" ? "route" : "sweep";
          return (
            <div className="library-check-cell">
              {state.done ? (
                <>
                  <LockedCheckbox label="Acquired" />
                  <div className="library-sub">Collected by step · {kind}</div>
                </>
              ) : (
                <>
                  <Badge tone="info">Handled by step</Badge>
                  <div className="library-sub">Tick it in the linked step — no second checkbox here.</div>
                </>
              )}
            </div>
          );
        }
        return (
          <div className="library-check-cell">
            <Checkbox
              checked={journey.finite[entry.id] ?? false}
              onChange={(checked) => setFiniteAcquired(entry.id, checked)}
              label="Acquired"
            />
            {state?.link ? (
              <div className="library-sub">Linked step does not list this row — tick manually.</div>
            ) : null}
          </div>
        );
      },
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

  const inventoryColumns: Column<InventoryRow>[] = [
    {
      key: "item",
      label: "Item",
      width: "24%",
      render: (entry) => {
        const unlock = unlockBadge(entry.note, entry.cost);
        const overlap = overlapBadge(entry.name);
        return (
          <>
            <div className="library-title">{entry.name}</div>
            <div className="library-badges">
              <Badge tone={overlap.tone}>{overlap.label}</Badge>
              {entry.price != null ? <Badge tone="accent">Runes</Badge> : null}
              {entry.cost ? (
                <Badge tone="info">
                  {/remembrance/i.test(entry.cost) ? "Remembrance cost" : "Alternate cost"}
                </Badge>
              ) : null}
              {unlock && unlock.label !== "Remembrance" ? <Badge tone={unlock.tone}>{unlock.label}</Badge> : null}
            </div>
            <div className="library-sub">Sheet row {entry.stepId}</div>
            <SourceLink url={entry.wikiUrl} name={entry.name} label="Wiki" />
          </>
        );
      },
    },
    {
      key: "purchased",
      label: "Purchased",
      width: "105px",
      render: (entry) => (
        <div className="library-check-cell">
          <Checkbox
            checked={purchasedKeys.has(entry.id)}
            onChange={(checked) => toggleInventory(entry, checked)}
            label="Purchased"
          />
        </div>
      ),
    },
    {
      key: "merchant",
      label: "Merchant",
      width: "18%",
      render: (entry) => (
        <>
          <div className="small">{entry.merchantName}</div>
          <SourceLink url={entry.merchantSourceUrl} name={entry.merchantName} label="Sheet" />
        </>
      ),
    },
    {
      key: "price",
      label: "Price & stock",
      width: "14%",
      render: (entry) => (
        <>
          <DetailLine label="Runes" value={entry.price != null ? formatNumber(entry.price) : undefined} />
          <DetailLine label="Cost" value={entry.cost} />
          <DetailLine label="Stock" value={stockLabel(entry.stock)} />
        </>
      ),
    },
    {
      key: "unlock",
      label: "Unlock & note",
      render: (entry) => (
        <>
          {entry.note ? (
            <div className="library-note" style={{ marginTop: 0 }}>{entry.note}</div>
          ) : (
            <span className="tiny faint">No extra unlock note in the sheet.</span>
          )}
        </>
      ),
    },
  ];

  const merchantColumns: Column<MerchantRecord>[] = [
    {
      key: "item",
      label: "Item",
      width: "23%",
      render: (entry) => {
        const overlap = overlapBadge(entry.item);
        return (
          <>
            <div className="library-title">{entry.item}</div>
            <div className="library-badges">
              <Badge>{entry.category}</Badge>
              <Badge tone={priorityTone(entry.priority)}>{entry.priority}</Badge>
              <Badge tone={overlap.tone}>{overlap.label}</Badge>
            </div>
          </>
        );
      },
    },
    {
      key: "purchased",
      label: "Purchased",
      width: "105px",
      render: (entry) => (
        <div className="library-check-cell">
          <Checkbox
            checked={purchasedKeys.has(MERCHANT_INVENTORY_ID_BY_LEGACY_ID[entry.id] || entry.id)}
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
        description={`${formatNumber(summaryCells[0].done)} farmables owned, ${formatNumber(summaryCells[1].done)} materials stocked, ${formatNumber(summaryCells[2].done)} pickups collected on ${journey.label}.`}
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

      <FarmSummaryStrip
        cells={summaryCells}
        active={activeTab}
        focus={focusId}
        onSelect={changeTab}
        onClearFocus={() => navigate(`/farms?tab=${activeTab}`)}
      />

      <section className="card">
        <TabBar items={FARM_TABS} value={activeTab} onChange={changeTab} />
        <div className="farm-filter-note">
          <span className="library-count">
            {formatNumber(matchingCount)} {matchingCount === 1 ? "record matches" : "records match"} the current filters
          </span>
          <Disclosure title="How tracking works" summary="Lifetime vs. journey state" icon="lock">
            <p className="small muted" style={{ margin: 0 }}>
              Farmable quantities are permanent: they belong to the character and survive a new journey. Reaching a
              farmable target also records the matching collection item with a duplicate count. Materials, finite
              pickups, merchant purchases, and scarabs are journey state and reset when you start a new run. A merchant
              row ticks the shared inventory record, so the workbook ledger and the full inventory always agree. A
              finite pickup whose route or sweep step lists it is collected by that step and shows no second checkbox.
            </p>
          </Disclosure>
        </div>

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
              <Select
                label="Location"
                value={filters.location}
                onChange={(event) => updateFilter("location", event.target.value)}
              >
                <option value="all">All locations</option>
                {FARMABLE_LOCATIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Enemy / source"
                value={filters.source}
                onChange={(event) => updateFilter("source", event.target.value)}
              >
                <option value="all">All enemies & sources</option>
                {FARMABLE_SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                label="Sort"
                value={filters.dropSort}
                onChange={(event) => updateFilter("dropSort", event.target.value)}
              >
                {DROP_SORT_OPTIONS.map((option) => (
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
              <Select
                label="Stock"
                value={filters.stock}
                onChange={(event) => updateFilter("stock", event.target.value)}
              >
                <option value="all">All stock states</option>
                <option value="stocked">In stock</option>
                <option value="missing">Not stocked</option>
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
              <div className="library-scope-switch" role="group" aria-label="Merchant record scope">
                <Button
                  size="sm"
                  variant={merchantScope === "inventory" ? "primary" : "default"}
                  onClick={() => changeMerchantScope("inventory")}
                >
                  Full inventory · {formatNumber(INVENTORY_ROWS.length)} rows
                </Button>
                <Button
                  size="sm"
                  variant={merchantScope === "workbook" ? "primary" : "default"}
                  onClick={() => changeMerchantScope("workbook")}
                >
                  Workbook ledger · {formatNumber(MERCHANTS.length)} rows
                </Button>
              </div>
              <SearchInput
                value={filters.query}
                onChange={(value) => updateFilter("query", value)}
                placeholder={
                  merchantScope === "inventory"
                    ? "Search item, merchant, unlock note, cost…"
                    : "Search merchant, item, notes…"
                }
              />
              <Select
                label="Merchant"
                value={filters.merchant}
                onChange={(event) => updateFilter("merchant", event.target.value)}
              >
                <option value="all">All merchants</option>
                {(merchantScope === "inventory" ? INVENTORY_MERCHANT_NAMES : MERCHANT_NAMES).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              {merchantScope === "workbook" ? (
                <>
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
              {merchantScope === "inventory" && selectedInventoryMerchant ? (
                <div className="library-scope-summary">
                  <Badge tone="accent">{selectedInventoryMerchant.name}</Badge>
                  <span className="library-count">
                    {formatNumber(inventoryStats[selectedInventoryMerchant.id]?.owned ?? 0)} /{" "}
                    {formatNumber(inventoryStats[selectedInventoryMerchant.id]?.total ?? 0)} purchased
                  </span>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => updateFilter("merchant", "all")}>
                    Clear
                  </Button>
                </div>
              ) : null}
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

        {activeTab === "farmables" && (filters.location !== "all" || filters.source !== "all") ? (
          <p className="small faint" style={{ margin: "8px 0 0" }}>
            Showing drops from{" "}
            {filters.source !== "all" ? <strong>{filters.source}</strong> : "every enemy"}
            {" at "}
            {filters.location !== "all" ? <strong>{filters.location}</strong> : "every recorded location"}. Drop chance
            comes from the source wording; “Chance not stated” means the workbook never named a rate.
          </p>
        ) : null}

        {activeTab === "merchants" && merchantScope === "inventory" ? (
          <div className="merchant-roster">
            <Disclosure
              title="Merchant roster"
              summary={`${formatNumber(inventoryPurchased)} / ${formatNumber(INVENTORY_ROWS.length)} purchased overall`}
              icon="users"
            >
              <div className="merchant-roster-grid">
                {MERCHANT_INVENTORIES.map((merchant) => {
                  const stats = inventoryStats[merchant.id];
                  const percent = stats.total ? (stats.owned / stats.total) * 100 : 0;
                  const selected = filters.merchant === merchant.name;
                  return (
                    <button
                      key={merchant.id}
                      type="button"
                      className={`merchant-roster-card ${selected ? "is-active" : ""}`.trim()}
                      onClick={() => selectInventoryMerchant(merchant.name)}
                      aria-pressed={selected}
                    >
                      <span className="merchant-roster-row">
                        <span className="merchant-roster-name">{merchant.name}</span>
                        <span className="merchant-roster-count">
                          {formatNumber(stats.owned)}/{formatNumber(stats.total)}
                        </span>
                      </span>
                      <span className="merchant-roster-track" aria-hidden="true">
                        <span style={{ width: `${Math.round(percent)}%` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Disclosure>
          </div>
        ) : null}

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
              rowClassName={(entry) => (finiteStepState[entry.id]?.done ? "is-collected" : undefined)}
              empty={filterEmpty("No finite pickups match these filters")}
            />
            <LoadMore shown={shownCount} total={matchingCount} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
          </>
        ) : null}

        {activeTab === "merchants" ? (
          merchantScope === "inventory" ? (
            <>
              <LedgerTable
                rows={visibleInventory}
                columns={inventoryColumns}
                focusId={focusId}
                className="farm-table"
                empty={filterEmpty("No merchant inventory rows match these filters")}
              />
              <LoadMore shown={shownCount} total={matchingCount} onMore={() => setLimit((current) => current + PAGE_SIZE)} />
            </>
          ) : (
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
          )
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
