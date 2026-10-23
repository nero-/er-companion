import { useEffect, useMemo, useRef, useState } from "react";
import { ART, ArtBanner } from "../components/Art";
import { Icon } from "../components/Icon";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  PageHeader,
  ProgressBar,
  SearchInput,
  SectionTitle,
  Select,
  Stat,
  TabBar,
  TierBadge,
} from "../components/ui";
import {
  CRAFTING_MATERIALS,
  MATERIALS_BY_CATEGORY,
  MATERIAL_BY_ID,
  UPGRADE_BY_ID,
  UPGRADE_ENTRIES,
  UPGRADE_QUANTITY_TOTALS,
  UPGRADE_STATED_TOTALS,
  UPGRADES_BY_CATEGORY,
} from "../lib/data";
import { formatNumber } from "../lib/format";
import { navigate, useRoute } from "../lib/router";
import { materialProgress, upgradeProgress } from "../lib/selectors";
import { setMaterialStock, setUpgradeCount, useActiveJourney } from "../lib/store";
import type { CraftingMaterial, UpgradeEntry } from "../lib/types";
import "./materials.css";

type TabId = "upgrades" | "materials";
type GameFilter = "all" | "base" | "dlc";
type ResolvedFilter = "all" | "resolved" | "unresolved";

const PAGE_SIZE = 120;
const ALL = "all";

const UPGRADE_CATEGORY_META: { id: string; label: string }[] = [
  { id: "scadutree-fragment", label: "Scadutree Fragments" },
  { id: "revered-spirit-ash", label: "Revered Spirit Ashes" },
  { id: "golden-seed", label: "Golden Seeds" },
  { id: "sacred-tear", label: "Sacred Tears" },
  { id: "smithing-stone", label: "Smithing Stones" },
  { id: "somber-smithing-stone", label: "Somber Smithing Stones" },
  { id: "glovewort", label: "Gloveworts" },
  { id: "great-glovewort", label: "Great Gloveworts" },
];

/** Ledger order: fragments and seeds before the smithing ladder, then gloveworts. */
const UPGRADE_CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
  UPGRADE_CATEGORY_META.map((meta, index) => [meta.id, index]),
);

const UPGRADE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  UPGRADE_CATEGORY_META.map((meta) => [meta.id, meta.label]),
);

const UPGRADE_SOURCE_INDEX: Record<string, number> = Object.fromEntries(
  UPGRADE_ENTRIES.map((entry, index) => [entry.id, index]),
);

const UPGRADE_SEARCH_INDEX: Record<string, string> = Object.fromEntries(
  UPGRADE_ENTRIES.map((entry) => [
    entry.id,
    [
      entry.name,
      entry.tier,
      entry.category,
      UPGRADE_CATEGORY_LABEL[entry.category] ?? "",
      entry.region,
      entry.subregion ?? "",
      entry.location,
      entry.description,
      entry.sourceText,
      entry.acquisitionType,
      entry.variant ?? "",
      entry.note ?? "",
      entry.nearestGrace ?? "",
    ]
      .join(" ")
      .toLowerCase(),
  ]),
);

const MULTI_QUANTITY_UPGRADES = UPGRADE_ENTRIES.filter((entry) => (entry.quantity ?? 0) > 1).length;
const UNSTATED_QUANTITY_UPGRADES = UPGRADE_ENTRIES.filter((entry) => entry.quantity === null).length;
const UNRESOLVED_UPGRADES = UPGRADE_ENTRIES.filter((entry) => entry.unresolved).length;
const TOTAL_UPGRADE_QUANTITY = Object.values(UPGRADE_QUANTITY_TOTALS).reduce((sum, value) => sum + value, 0);
const DLC_UPGRADES = UPGRADE_ENTRIES.filter((entry) => entry.dlc).length;

const SCADUTREE_TOTAL =
  UPGRADE_STATED_TOTALS["scadutree-fragment"] ?? UPGRADE_QUANTITY_TOTALS["scadutree-fragment"] ?? 0;
const REVERED_TOTAL =
  UPGRADE_STATED_TOTALS["revered-spirit-ash"] ?? UPGRADE_QUANTITY_TOTALS["revered-spirit-ash"] ?? 0;
const GOLDEN_SEED_TOTAL = UPGRADE_QUANTITY_TOTALS["golden-seed"] ?? 0;
const SACRED_TEAR_TOTAL =
  UPGRADE_STATED_TOTALS["sacred-tear"] ?? UPGRADE_QUANTITY_TOTALS["sacred-tear"] ?? 0;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MATERIAL_CATEGORY_NAMES = Object.keys(MATERIALS_BY_CATEGORY).sort((a, b) => a.localeCompare(b));
const MATERIAL_CATEGORY_BY_SLUG: Record<string, string> = Object.fromEntries(
  MATERIAL_CATEGORY_NAMES.map((name) => [slugify(name), name]),
);

const MATERIAL_RENEWABILITY = [...new Set(CRAFTING_MATERIALS.map((material) => material.renewability))].sort(
  (a, b) => a.localeCompare(b),
);

const MATERIAL_PRIORITY_ORDER = ["High", "Medium", "Low", "Preserve", "None"];
const MATERIAL_PRIORITIES = MATERIAL_PRIORITY_ORDER.filter((priority) =>
  CRAFTING_MATERIALS.some((material) => material.priority === priority),
);

const MATERIAL_GAMES = [...new Set(CRAFTING_MATERIALS.map((material) => material.game))].sort((a, b) =>
  a.localeCompare(b),
);

const MATERIAL_SEARCH_INDEX: Record<string, string> = Object.fromEntries(
  CRAFTING_MATERIALS.map((material) => [
    material.id,
    [
      material.name,
      material.category,
      material.game,
      material.renewability,
      material.priority,
      material.earlySource,
      material.lateSource,
      material.grace,
      material.method,
      material.purchasable,
      material.merchant,
      material.bellBearing,
      material.finiteBeforeUnlock,
      material.use,
      material.note ?? "",
      material.dlc ? "dlc shadow of the erdtree" : "base game",
    ]
      .join(" ")
      .toLowerCase(),
  ]),
);

function resolveTab(raw: string | null, focusUpgrade: UpgradeEntry | null, focusMaterial: CraftingMaterial | null): TabId {
  if (focusUpgrade) return "upgrades";
  if (focusMaterial) return "materials";
  return raw === "materials" ? "materials" : "upgrades";
}

function resolveUpgradeCategory(raw: string | null): string {
  if (raw && raw !== ALL && UPGRADES_BY_CATEGORY[raw]) return raw;
  return ALL;
}

function resolveMaterialCategory(raw: string | null): string {
  if (!raw || raw === ALL) return ALL;
  if (MATERIALS_BY_CATEGORY[raw]) return raw;
  return MATERIAL_CATEGORY_BY_SLUG[raw] ?? ALL;
}

function priorityTone(priority: string): "warning" | "accent" | "info" | "default" {
  if (priority === "High") return "warning";
  if (priority === "Preserve") return "accent";
  if (priority === "Medium") return "info";
  return "default";
}

function renewabilityTone(renewability: string): "success" | "warning" | "danger" | "default" {
  if (renewability.startsWith("Yes")) return "success";
  if (renewability.startsWith("Mixed")) return "warning";
  if (renewability.startsWith("Limited") || renewability.startsWith("No")) return "danger";
  return "default";
}

interface CountStepperProps {
  name: string;
  value: number;
  max: number | null;
  onChange: (value: number) => void;
}

function CountStepper({ name, value, max, onChange }: CountStepperProps) {
  const ceiling = max ?? 999;
  const commit = (next: number) => {
    const clamped = Math.min(ceiling, Math.max(0, Math.floor(next)));
    onChange(clamped);
  };
  return (
    <div className="mat-stepper">
      <button
        type="button"
        className="mat-step-btn"
        aria-label={`Decrease ${name} collected count`}
        onClick={() => commit(value - 1)}
        disabled={value <= 0}
      >
        <Icon name="minus" size={12} strokeWidth={2.4} />
      </button>
      <input
        className="mat-step-input"
        type="number"
        inputMode="numeric"
        min={0}
        max={ceiling}
        value={value}
        aria-label={`${name} collected count`}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(0);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) commit(parsed);
        }}
      />
      <button
        type="button"
        className="mat-step-btn"
        aria-label={`Increase ${name} collected count`}
        onClick={() => commit(value + 1)}
        disabled={value >= ceiling}
      >
        <Icon name="plus" size={12} strokeWidth={2.4} />
      </button>
    </div>
  );
}

interface PagerProps {
  page: number;
  totalPages: number;
  onGo: (page: number) => void;
}

function Pager({ page, totalPages, onGo }: PagerProps) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  for (let index = 1; index <= totalPages; index += 1) pages.push(index);
  return (
    <div className="mat-pager" aria-label="Pagination">
      <Button size="sm" variant="ghost" onClick={() => onGo(page - 1)} disabled={page <= 1}>
        Previous
      </Button>
      <div className="mat-page-btns">
        {pages.map((value) => (
          <button
            key={value}
            type="button"
            className={`mat-page-btn${value === page ? " is-active" : ""}`}
            aria-label={`Page ${value}`}
            aria-current={value === page ? "page" : undefined}
            onClick={() => onGo(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={() => onGo(page + 1)} disabled={page >= totalPages}>
        Next
      </Button>
    </div>
  );
}

export function MaterialsPage() {
  const route = useRoute();
  const journey = useActiveJourney();
  const resultsRef = useRef<HTMLElement>(null);
  const handledFocus = useRef<string | null>(null);

  const tabParam = route.query.get("tab");
  const categoryParam = route.query.get("category");
  const focusParam = route.query.get("focus");

  const focusUpgrade = focusParam && UPGRADE_BY_ID[focusParam] ? UPGRADE_BY_ID[focusParam] : null;
  const focusMaterial = focusParam && MATERIAL_BY_ID[focusParam] ? MATERIAL_BY_ID[focusParam] : null;

  const tab = resolveTab(tabParam, focusUpgrade, focusMaterial);
  const upgradeCategory = focusUpgrade ? focusUpgrade.category : resolveUpgradeCategory(categoryParam);
  const materialCategory = focusMaterial ? focusMaterial.category : resolveMaterialCategory(categoryParam);

  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState<GameFilter>(ALL);
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>(ALL);
  const [upgradePage, setUpgradePage] = useState(1);

  const [materialSearch, setMaterialSearch] = useState("");
  const [materialGame, setMaterialGame] = useState<string>(ALL);
  const [materialRenewability, setMaterialRenewability] = useState<string>(ALL);
  const [materialPriority, setMaterialPriority] = useState<string>(ALL);

  const basePath = route.path && route.path !== "/" ? route.path : "/materials";

  const pathFor = (nextTab: TabId, category: string | null, focus: string | null) => {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    if (category) params.set("category", category);
    if (focus) params.set("focus", focus);
    return `${basePath}?${params.toString()}`;
  };

  const upgrades = upgradeProgress(journey);
  const materials = materialProgress(journey);

  const filteredUpgrades = useMemo(() => {
    const pool = upgradeCategory === ALL ? UPGRADE_ENTRIES : UPGRADES_BY_CATEGORY[upgradeCategory] ?? [];
    const needle = search.trim().toLowerCase();
    const rows = pool.filter((entry) => {
      if (gameFilter === "base" && entry.dlc) return false;
      if (gameFilter === "dlc" && !entry.dlc) return false;
      if (resolvedFilter === "resolved" && entry.unresolved) return false;
      if (resolvedFilter === "unresolved" && !entry.unresolved) return false;
      if (needle && !(UPGRADE_SEARCH_INDEX[entry.id] ?? "").includes(needle)) return false;
      return true;
    });
    if (upgradeCategory !== ALL) return rows;
    return rows.sort((a, b) => {
      const byCategory = (UPGRADE_CATEGORY_ORDER[a.category] ?? 99) - (UPGRADE_CATEGORY_ORDER[b.category] ?? 99);
      if (byCategory) return byCategory;
      return (UPGRADE_SOURCE_INDEX[a.id] ?? 0) - (UPGRADE_SOURCE_INDEX[b.id] ?? 0);
    });
  }, [upgradeCategory, gameFilter, resolvedFilter, search]);

  const filteredMaterials = useMemo(() => {
    const pool = materialCategory === ALL ? CRAFTING_MATERIALS : MATERIALS_BY_CATEGORY[materialCategory] ?? [];
    const needle = materialSearch.trim().toLowerCase();
    return pool.filter((material) => {
      if (materialGame !== ALL && material.game !== materialGame) return false;
      if (materialRenewability !== ALL && material.renewability !== materialRenewability) return false;
      if (materialPriority !== ALL && material.priority !== materialPriority) return false;
      if (needle && !(MATERIAL_SEARCH_INDEX[material.id] ?? "").includes(needle)) return false;
      return true;
    });
  }, [materialCategory, materialGame, materialRenewability, materialPriority, materialSearch]);

  let filteredQuantity = 0;
  let filteredAcquired = 0;
  let filteredTouched = 0;
  for (const entry of filteredUpgrades) {
    const quantity = entry.quantity ?? 0;
    const raw = journey.upgradeCounts[entry.id] ?? 0;
    filteredQuantity += quantity;
    filteredAcquired += Math.min(raw, quantity);
    if (raw > 0) filteredTouched += 1;
  }

  let filteredMaterialStock = 0;
  for (const material of filteredMaterials) {
    if (journey.materials[material.id] === true) filteredMaterialStock += 1;
  }

  const totalUpgradePages = Math.max(1, Math.ceil(filteredUpgrades.length / PAGE_SIZE));
  const currentUpgradePage = Math.min(upgradePage, totalUpgradePages);
  const upgradeStart = (currentUpgradePage - 1) * PAGE_SIZE;
  const pageUpgrades = filteredUpgrades.slice(upgradeStart, upgradeStart + PAGE_SIZE);

  useEffect(() => {
    setUpgradePage(1);
  }, [upgradeCategory, gameFilter, resolvedFilter, search]);

  useEffect(() => {
    if (!focusParam) handledFocus.current = null;
  }, [focusParam]);

  useEffect(() => {
    const id = focusUpgrade?.id;
    if (!id || handledFocus.current === id) return;
    const index = filteredUpgrades.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      handledFocus.current = id;
      setUpgradePage(Math.floor(index / PAGE_SIZE) + 1);
    }
  }, [focusParam, focusUpgrade, filteredUpgrades]);

  useEffect(() => {
    if (!focusUpgrade) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`upgrade-${focusUpgrade.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [focusParam, focusUpgrade, currentUpgradePage]);

  useEffect(() => {
    if (!focusMaterial) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`material-${focusMaterial.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [focusParam, focusMaterial]);

  const resetUpgradeFilters = () => {
    setSearch("");
    setGameFilter(ALL);
    setResolvedFilter(ALL);
    navigate(pathFor("upgrades", null, null));
  };

  const resetMaterialFilters = () => {
    setMaterialSearch("");
    setMaterialGame(ALL);
    setMaterialRenewability(ALL);
    setMaterialPriority(ALL);
    navigate(pathFor("materials", null, null));
  };

  const goUpgradePage = (next: number) => {
    setUpgradePage(Math.min(Math.max(1, next), totalUpgradePages));
    resultsRef.current?.scrollIntoView({ block: "start" });
  };

  const setStock = (material: CraftingMaterial, checked: boolean) => {
    setMaterialStock(material.id, checked);
  };

  const upgradeFilterActive =
    search.trim().length > 0 || gameFilter !== ALL || resolvedFilter !== ALL || upgradeCategory !== ALL;
  const materialFilterActive =
    materialSearch.trim().length > 0 ||
    materialGame !== ALL ||
    materialRenewability !== ALL ||
    materialPriority !== ALL ||
    materialCategory !== ALL;

  return (
    <div className="page mat-page">
      <PageHeader
        eyebrow="Ledger · Upgrades & crafting"
        title="Materials & upgrades"
        description="Every recorded upgrade pickup and crafting material in one ledger. Quantity totals follow the stated sources; rows whose source never named a place stay marked unresolved rather than guessed."
        actions={
          <>
            <Button icon="map" onClick={() => navigate("/farms")}>
              Farm routes
            </Button>
            <Button variant="ghost" icon="layers" onClick={() => navigate("/completion")}>
              Completion
            </Button>
          </>
        }
      />

      <ArtBanner
        className="mat-banner"
        image={ART.soteShots[1]}
        caption="Shadow of the Erdtree · upgrade ledger"
        title="Fragments, seeds, stones, and tears"
        variant="sote"
        priority
      >
        <p className="mat-banner-note">
          {formatNumber(UPGRADE_ENTRIES.length)} upgrade pickups · {formatNumber(SCADUTREE_TOTAL)} Scadutree
          Fragments · {formatNumber(REVERED_TOTAL)} Revered Spirit Ashes · {formatNumber(GOLDEN_SEED_TOTAL)} Golden
          Seeds · {formatNumber(SACRED_TEAR_TOTAL)} Sacred Tears · {formatNumber(CRAFTING_MATERIALS.length)} crafting
          materials
        </p>
        <p className="mat-banner-warn">
          <Icon name="alert" size={13} />
          {formatNumber(UNRESOLVED_UPGRADES)} upgrade rows keep an unresolved location detail. They are labelled and
          never assigned a guessed place.
        </p>
      </ArtBanner>

      <section className="mat-stats" aria-label="Ledger summary">
        <Stat
          label="Upgrade pickups"
          value={formatNumber(UPGRADE_ENTRIES.length)}
          detail={`8 categories · ${formatNumber(TOTAL_UPGRADE_QUANTITY)} total quantity`}
        />
        <Stat
          label="Scadutree Fragments"
          value={formatNumber(SCADUTREE_TOTAL)}
          detail={`${formatNumber(UPGRADES_BY_CATEGORY["scadutree-fragment"]?.length ?? 0)} recorded pickups · stated total`}
        />
        <Stat
          label="Revered Spirit Ashes"
          value={formatNumber(REVERED_TOTAL)}
          detail={`${formatNumber(UPGRADES_BY_CATEGORY["revered-spirit-ash"]?.length ?? 0)} recorded pickups · stated total`}
        />
        <Stat
          label="Golden Seeds"
          value={formatNumber(GOLDEN_SEED_TOTAL)}
          detail={`${formatNumber(UPGRADES_BY_CATEGORY["golden-seed"]?.length ?? 0)} recorded pickups`}
        />
        <Stat
          label="Sacred Tears"
          value={formatNumber(SACRED_TEAR_TOTAL)}
          detail={`${formatNumber(UPGRADES_BY_CATEGORY["sacred-tear"]?.length ?? 0)} recorded pickups`}
        />
        <Stat
          label="Crafting materials"
          value={formatNumber(CRAFTING_MATERIALS.length)}
          detail={`${formatNumber(MATERIAL_CATEGORY_NAMES.length)} categories · ${materials.percent}% stocked`}
        />
        <Stat
          label="Unresolved locations"
          value={formatNumber(UNRESOLVED_UPGRADES)}
          detail={`${formatNumber(UNSTATED_QUANTITY_UPGRADES)} row without a stated quantity`}
        />
        <Stat
          label="Upgrade quantities"
          value={formatNumber(TOTAL_UPGRADE_QUANTITY)}
          detail={`${formatNumber(DLC_UPGRADES)} DLC rows · ${formatNumber(MULTI_QUANTITY_UPGRADES)} multi-pickup rows`}
        />
      </section>

      <div className="mat-tabs">
        <TabBar
          items={[
            { id: "upgrades", label: "Upgrades", count: UPGRADE_ENTRIES.length },
            { id: "materials", label: "Crafting Materials", count: CRAFTING_MATERIALS.length },
          ]}
          value={tab}
          onChange={(id) => navigate(pathFor(id === "materials" ? "materials" : "upgrades", null, null))}
        />
      </div>

      {tab === "upgrades" ? (
        <>
          <section className="card card-pad mat-progress" aria-label="Upgrade progress">
            <SectionTitle
              title="Quantity ledger"
              note={`${formatNumber(upgrades.acquired)} of ${formatNumber(upgrades.total)} quantities · ${formatNumber(
                upgrades.entriesTouched,
              )} of ${formatNumber(upgrades.entriesTotal)} rows touched`}
            />
            <ProgressBar
              value={upgrades.percent}
              label={`${formatNumber(upgrades.acquired)} / ${formatNumber(upgrades.total)} collected`}
              detail={`${upgrades.percent}% of all recorded upgrade quantities`}
            />
          </section>

          <section className="mat-cat-tabs" aria-label="Upgrade categories">
            <button
              type="button"
              className={`mat-cat${upgradeCategory === ALL ? " is-active" : ""}`}
              aria-pressed={upgradeCategory === ALL}
              onClick={() => navigate(pathFor("upgrades", null, null))}
            >
              <span className="mat-cat-row">
                <span className="mat-cat-label">All upgrades</span>
                <span className="mat-cat-count">{formatNumber(UPGRADE_ENTRIES.length)} rows</span>
              </span>
              <span className="mat-cat-row mat-cat-qty">
                <span>
                  {formatNumber(upgrades.acquired)}/{formatNumber(upgrades.total)}
                </span>
                <span>{upgrades.percent}%</span>
              </span>
              <span className="mat-cat-foot">
                {formatNumber(upgrades.entriesTouched)}/{formatNumber(upgrades.entriesTotal)} rows touched
              </span>
              <span className="mat-mini-track" aria-hidden="true">
                <span className="mat-mini-fill" style={{ width: `${upgrades.percent}%` }} />
              </span>
            </button>
            {UPGRADE_CATEGORY_META.map((meta) => {
              const stat = upgrades.byCategory[meta.id];
              const entries = UPGRADES_BY_CATEGORY[meta.id]?.length ?? 0;
              const active = upgradeCategory === meta.id;
              return (
                <button
                  key={meta.id}
                  type="button"
                  className={`mat-cat${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => navigate(pathFor("upgrades", active ? null : meta.id, null))}
                >
                  <span className="mat-cat-row">
                    <span className="mat-cat-label">{meta.label}</span>
                    <span className="mat-cat-count">{formatNumber(entries)} rows</span>
                  </span>
                  <span className="mat-cat-row mat-cat-qty">
                    <span>
                      {formatNumber(stat?.done ?? 0)}/{formatNumber(stat?.total ?? 0)}
                    </span>
                    <span>{stat?.percent ?? 0}%</span>
                  </span>
                  <span className="mat-cat-foot">
                    {formatNumber(stat?.entriesTouched ?? 0)}/{formatNumber(stat?.entriesTotal ?? entries)} rows touched
                  </span>
                  <span className="mat-mini-track" aria-hidden="true">
                    <span className="mat-mini-fill" style={{ width: `${stat?.percent ?? 0}%` }} />
                  </span>
                </button>
              );
            })}
          </section>

          <section className="card card-pad mat-filters" aria-label="Upgrade filters">
            <div className="mat-filter-grid">
              <div className="field mat-search-field">
                <span className="field-label">Search upgrades</span>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Name, tier, region, location, source text…"
                />
              </div>
              <Select
                label="Game"
                value={gameFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  setGameFilter(value === "base" || value === "dlc" ? value : ALL);
                }}
              >
                <option value="all">Both games</option>
                <option value="base">Base game</option>
                <option value="dlc">Shadow of the Erdtree</option>
              </Select>
              <Select
                label="Location detail"
                value={resolvedFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  setResolvedFilter(value === "resolved" || value === "unresolved" ? value : ALL);
                }}
              >
                <option value="all">All rows</option>
                <option value="resolved">Resolved locations</option>
                <option value="unresolved">Unresolved locations</option>
              </Select>
            </div>
            <div className="mat-filter-foot">
              <span className="small faint">
                {formatNumber(filteredUpgrades.length)} rows match · {formatNumber(filteredTouched)} touched ·{" "}
                {formatNumber(filteredAcquired)}/{formatNumber(filteredQuantity)} quantity collected
                {search.trim() ? ` · search “${search.trim()}”` : ""}
              </span>
              <Button size="sm" variant="ghost" icon="refresh" onClick={resetUpgradeFilters} disabled={!upgradeFilterActive}>
                Reset upgrades
              </Button>
            </div>
          </section>

          <section className="card card-pad mat-results" aria-label="Upgrade ledger" ref={resultsRef}>
            <SectionTitle
              title={upgradeCategory === ALL ? "All upgrade pickups" : UPGRADE_CATEGORY_LABEL[upgradeCategory] ?? upgradeCategory}
              note={`${formatNumber(filteredUpgrades.length)} rows · page ${currentUpgradePage} of ${totalUpgradePages}`}
            />
            {filteredUpgrades.length === 0 ? (
              <EmptyState
                title="No upgrade rows match these filters"
                description="Clear the search or widen the game and location filters to see the full ledger."
                action={
                  <Button variant="primary" icon="refresh" onClick={resetUpgradeFilters}>
                    Reset upgrades
                  </Button>
                }
              />
            ) : (
              <>
                <div className="table-wrap mat-table-wrap">
                  <table className="data-table mat-table">
                    <thead>
                      <tr>
                        <th scope="col">Upgrade</th>
                        <th scope="col">Qty</th>
                        <th scope="col">Collected</th>
                        <th scope="col">Region / location</th>
                        <th scope="col">Source</th>
                        <th scope="col">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageUpgrades.map((entry) => {
                        const quantity = entry.quantity;
                        const raw = journey.upgradeCounts[entry.id] ?? 0;
                        const count = Math.min(raw, quantity ?? raw);
                        const complete = quantity !== null && quantity > 0 && count >= quantity;
                        const isFocus = focusUpgrade?.id === entry.id;
                        const unresolved = entry.unresolved;
                        return (
                          <tr
                            key={entry.id}
                            id={`upgrade-${entry.id}`}
                            className={`mat-row${complete ? " is-complete" : ""}${isFocus ? " is-focus" : ""}`}
                          >
                            <td data-label="Upgrade" className="mat-cell-name">
                              <span className="mat-name-line">
                                <span className="mat-name">{entry.name}</span>
                                {entry.tier ? <TierBadge tier={entry.tier} /> : null}
                              </span>
                              <span className="mat-sub">{UPGRADE_CATEGORY_LABEL[entry.category] ?? entry.category}</span>
                              {entry.variant ? <span className="mat-sub">{entry.variant}</span> : null}
                            </td>
                            <td data-label="Qty">
                              <div className="mat-cell-stack">
                                <span className="mat-qty">{quantity === null ? "—" : formatNumber(quantity)}</span>
                                {quantity === null ? <span className="mat-note">not stated</span> : null}
                              </div>
                            </td>
                            <td data-label="Collected">
                              <div className="mat-cell-stack">
                                <CountStepper
                                  name={entry.name}
                                  value={count}
                                  max={quantity}
                                  onChange={(next) => setUpgradeCount(entry.id, next)}
                                />
                                <span className="mat-note">
                                  {formatNumber(count)}
                                  {quantity === null ? " collected" : `/${formatNumber(quantity)}`}
                                </span>
                              </div>
                            </td>
                            <td data-label="Region / location" className="mat-cell-loc">
                              <div className="mat-cell-stack">
                                <span className="mat-loc-region">{entry.region || "Region not recorded"}</span>
                                {entry.subregion ? <span className="mat-note">{entry.subregion}</span> : null}
                                <span className="mat-loc">{entry.location || "Location not recorded"}</span>
                                {entry.nearestGrace ? (
                                  <span className="mat-note">
                                    <Icon name="grace" size={11} /> {entry.nearestGrace}
                                  </span>
                                ) : null}
                                {entry.note ? <span className="mat-note">{entry.note}</span> : null}
                                {unresolved ? (
                                  <span className="mat-warn-note">Unresolved location detail — not verified as exact.</span>
                                ) : null}
                              </div>
                            </td>
                            <td data-label="Source">
                              <div className="mat-cell-stack">
                                {entry.sourceUrl ? (
                                  <a
                                    className="mat-source"
                                    href={entry.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={entry.sourceText || entry.sourceUrl}
                                  >
                                    Wiki source <Icon name="external" size={12} />
                                  </a>
                                ) : (
                                  <span className="mat-note">No source link</span>
                                )}
                                {entry.sourceText ? <span className="mat-source-text">{entry.sourceText}</span> : null}
                              </div>
                            </td>
                            <td data-label="Flags">
                              <span className="mat-flags">
                                <Badge tone={entry.dlc ? "info" : "default"}>{entry.dlc ? "DLC" : "Base"}</Badge>
                                {unresolved ? <Badge tone="warning">Unresolved</Badge> : <Badge tone="success">Resolved</Badge>}
                                {entry.missable ? <Badge tone="danger">Missable</Badge> : null}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mat-page-foot">
                  <span className="tiny faint">
                    Showing {formatNumber(upgradeStart + 1)}–{formatNumber(Math.min(upgradeStart + PAGE_SIZE, filteredUpgrades.length))} of{" "}
                    {formatNumber(filteredUpgrades.length)} rows · stated quantities only
                  </span>
                  <Pager page={currentUpgradePage} totalPages={totalUpgradePages} onGo={goUpgradePage} />
                </div>
              </>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="card card-pad mat-progress" aria-label="Crafting stock progress">
            <SectionTitle
              title="Stock ledger"
              note={`${formatNumber(materials.done)} of ${formatNumber(materials.total)} materials stocked`}
            />
            <ProgressBar
              value={materials.percent}
              label={`${formatNumber(materials.done)} / ${formatNumber(materials.total)} stocked`}
              detail={`${materials.percent}% of the crafting catalogue`}
            />
          </section>

          <section className="card card-pad mat-filters" aria-label="Crafting material filters">
            <div className="mat-filter-grid">
              <div className="field mat-search-field">
                <span className="field-label">Search materials</span>
                <SearchInput
                  value={materialSearch}
                  onChange={setMaterialSearch}
                  placeholder="Name, source, grace, merchant, use…"
                />
              </div>
              <Select
                label="Category"
                value={materialCategory}
                onChange={(event) => {
                  const value = event.target.value;
                  navigate(pathFor("materials", value === ALL ? null : slugify(value), null));
                }}
              >
                <option value="all">All categories</option>
                {MATERIAL_CATEGORY_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name} ({MATERIALS_BY_CATEGORY[name].length})
                  </option>
                ))}
              </Select>
              <Select label="Game" value={materialGame} onChange={(event) => setMaterialGame(event.target.value)}>
                <option value="all">Both games</option>
                {MATERIAL_GAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
              <Select
                label="Renewability"
                value={materialRenewability}
                onChange={(event) => setMaterialRenewability(event.target.value)}
              >
                <option value="all">All renewal types</option>
                {MATERIAL_RENEWABILITY.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
              <Select
                label="Priority"
                value={materialPriority}
                onChange={(event) => setMaterialPriority(event.target.value)}
              >
                <option value="all">All priorities</option>
                {MATERIAL_PRIORITIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mat-filter-foot">
              <span className="small faint">
                {formatNumber(filteredMaterials.length)} materials match · {formatNumber(filteredMaterialStock)} already
                stocked
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                onClick={resetMaterialFilters}
                disabled={!materialFilterActive}
              >
                Reset materials
              </Button>
            </div>
          </section>

          <section className="mat-materials" aria-label="Crafting materials">
            {filteredMaterials.length === 0 ? (
              <EmptyState
                title="No materials match these filters"
                description="Clear the search or widen the category, game, renewal, and priority filters."
                action={
                  <Button variant="primary" icon="refresh" onClick={resetMaterialFilters}>
                    Reset materials
                  </Button>
                }
              />
            ) : (
              filteredMaterials.map((material) => {
                const stocked = journey.materials[material.id] === true;
                const isFocus = focusMaterial?.id === material.id;
                return (
                  <article
                    key={material.id}
                    id={`material-${material.id}`}
                    className={`card card-pad mat-material${stocked ? " is-stocked" : ""}${isFocus ? " is-focus" : ""}`}
                  >
                    <header className="mat-material-head">
                      <Checkbox
                        checked={stocked}
                        onChange={(checked) => setStock(material, checked)}
                        label={<span className="mat-material-name">{material.name}</span>}
                      />
                      <span className="mat-flags">
                        <Badge tone={material.dlc ? "info" : "default"}>{material.dlc ? "DLC" : "Base"}</Badge>
                        <Badge tone={priorityTone(material.priority)}>{material.priority} priority</Badge>
                        {!material.obtainable ? <Badge tone="danger">Unobtainable</Badge> : null}
                      </span>
                    </header>

                    <div className="mat-material-meta">
                      <span>{material.category}</span>
                      <span>·</span>
                      <Badge tone={renewabilityTone(material.renewability)}>{material.renewability}</Badge>
                      {material.environmental ? <Badge tone="success">Environmental</Badge> : null}
                      {material.inFarms ? <Badge tone="accent">Farm route</Badge> : null}
                    </div>

                    <dl className="mat-material-fields">
                      <div>
                        <dt>Early farm</dt>
                        <dd>{material.earlySource || "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Late farm</dt>
                        <dd>{material.lateSource || "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Nearest grace</dt>
                        <dd>{material.grace || "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Method</dt>
                        <dd>{material.method || "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Purchasable</dt>
                        <dd>
                          {material.purchasable}
                          {material.merchant ? ` · ${material.merchant}` : ""}
                          {material.bellBearing ? ` · Bell bearing: ${material.bellBearing}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>Finite before unlock</dt>
                        <dd>{material.finiteBeforeUnlock || "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Use</dt>
                        <dd>{material.use || "Not recorded"}</dd>
                      </div>
                    </dl>

                    <footer className="mat-material-foot">
                      <a
                        className="mat-source"
                        href={material.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={material.sourceUrl}
                      >
                        Wiki source <Icon name="external" size={12} />
                      </a>
                      <span className="tiny faint">
                        {material.inRoute ? "In route" : "Not in route"}
                        {material.inItemCatalog ? " · In item catalogue" : ""}
                      </span>
                    </footer>
                    {material.note ? <p className="mat-material-note">{material.note}</p> : null}
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}
