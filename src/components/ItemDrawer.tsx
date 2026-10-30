import { useEffect, useState } from "react";
import { Badge, Button, Callout, Drawer, SectionTitle, Switch, TierBadge, useToast } from "./ui";
import { Icon } from "./Icon";
import { setItemCount, setItemOwned, useActiveCharacter, useActiveJourney } from "../lib/store";
import {
  ACHIEVEMENT_BY_ID,
  ITEM_DESCRIPTIONS,
  REQUIREMENT_GROUPS,
  ROUTE_AREAS,
  ROUTE_STEPS,
  STEP_BY_ID,
  SWEEP_STEPS,
  SWEEP_STEP_BY_ID,
  TIERS_BY_NAME,
} from "../lib/data";
import { PATCH_IMPACT_BY_NAME } from "../data/game";
import { formatNumber } from "../lib/format";
import { collectionStepFor, stepStatusLabel, stepStatusTone, sweepStepState } from "../lib/selectors";
import { navigate } from "../lib/router";
import type { Achievement, Item, RouteStep, StepStatus, SweepStep } from "../lib/types";

interface ItemDrawerProps {
  item: Item | null;
  onClose: () => void;
}

const NOT_IN_PACK = "Not in the content pack.";
const GAME_NAMES: Record<string, true> = {
  "Base Game": true,
  "Shadow of the Erdtree": true,
  "Tarnished Pack": true,
};
const AREA_NAMES: Record<string, true> = Object.fromEntries(ROUTE_AREAS.map((area) => [area.name, true]));
const PLACEHOLDER_LOCATIONS: Record<string, true> = {
  "redmaw catalog": true,
  gestures: true,
  notes: true,
  keys: true,
};
const SLOT_LABEL = /^(chest|head|arms|legs|body|hands|feet|torso|leg) \(\d+\)$/i;

export type ItemLocationKind = "exact" | "area" | "unrecorded";

/**
 * Location provenance is uneven after the catalog merge. Only claim a spot when
 * the pack actually carries one; label area-only and section-label values.
 */
export function itemLocationKind(item: Item): ItemLocationKind {
  const location = item.location.trim();
  if (!location) return "unrecorded";
  if (PLACEHOLDER_LOCATIONS[location.toLowerCase()] === true || SLOT_LABEL.test(location)) return "unrecorded";
  if (AREA_NAMES[location] === true) return "area";
  if (location === (item.section ?? "").trim()) return "unrecorded";
  return "exact";
}

/** Hard missable flag, e.g. "MISSABLE" or "Missable if Patches is killed". */
export function isItemMissable(item: Item): boolean {
  return /missable/i.test(item.missable);
}

/** Non-missable acquisition constraints: quest timing, state, or prerequisites. */
export function isItemTimingSensitive(item: Item): boolean {
  const note = item.missable.trim();
  return Boolean(note) && note.toLowerCase() !== "no" && !isItemMissable(item);
}

export function isItemRouteLinked(item: Item): boolean {
  return item.routeStepIds.length > 0 || Boolean(item.autoStepId);
}

/** Real geographic region, or null when the merge left the game name in `region`. */
export function itemRegionName(item: Item): string | null {
  const region = item.region.trim();
  return region && GAME_NAMES[region] !== true ? region : null;
}

/** Groups/categories whose entries stack in the inventory, so one press moves more than one. */
const STACKABLE_GROUPS: Record<string, true> = {
  Consumable: true,
  Material: true,
  Upgrade: true,
};

const STACK_STEP = 5;
const MAX_ITEM_COUNT = 999;

/** How many units one +/- press moves for this item. */
export function itemCountStep(item: Item): number {
  const stackable = STACKABLE_GROUPS[item.group] === true || STACKABLE_GROUPS[item.category] === true;
  return stackable ? STACK_STEP : 1;
}

const SWEEP_KIND_LABELS: Record<string, string> = {
  merchants: "Merchant",
  farmables: "Farm",
  pickups: "Pickup",
  materials: "Material",
  cleanup: "Cleanup",
};

/** Short noun for a sweep step kind: "Merchant step", "Cleanup step", … */
export function sweepKindLabel(kind: string | undefined): string {
  return `${SWEEP_KIND_LABELS[kind ?? ""] ?? "Sweep"} step`;
}

/**
 * Sweep steps indexed by catalog item id, in route order. The catalogue is
 * 2,325 items against 1,880 ledger rows, so resolving per card straight from
 * the selector would rescan the whole ledger on every render.
 */
const SWEEP_STEPS_BY_ITEM: Map<string, SweepStep[]> = (() => {
  const map = new Map<string, SweepStep[]>();
  for (const step of [...SWEEP_STEPS].sort((a, b) => a.order - b.order)) {
    for (const entry of step.entries) {
      if (!entry.itemId) continue;
      const steps = map.get(entry.itemId);
      if (steps) {
        if (!steps.includes(step)) steps.push(step);
      } else {
        map.set(entry.itemId, [step]);
      }
    }
  }
  return map;
})();

/** Every sweep step whose ledger lists this catalogue item, in route order. */
export function itemSweepSteps(itemId: string): SweepStep[] {
  return SWEEP_STEPS_BY_ITEM.get(itemId) ?? [];
}

export interface ItemStepLink {
  kind: "route" | "sweep";
  stepId: string;
  area: string;
  /** "Route step" or a sweep kind label such as "Cleanup step". */
  label: string;
  /** Sweep kind for sweep links ("cleanup", "merchants", …); undefined for route links. */
  sweepKind?: string;
  title: string;
  /** Journey hash path; sweep ids resolve there alongside route step ids. */
  href: string;
}

export function stepHref(stepId: string, area: string): string {
  return `/journey?step=${encodeURIComponent(stepId)}&area=${encodeURIComponent(area)}`;
}

const STEP_LINK_CACHE = new Map<string, ItemStepLink>();

/**
 * The actionable step for an item. Every catalogue item resolves: the route
 * step that auto-acquires it, else the first sweep step that lists it.
 */
export function itemStepLink(item: Item): ItemStepLink | undefined {
  const cached = STEP_LINK_CACHE.get(item.id);
  if (cached) return cached;
  const link = resolveStepLink(item);
  if (link) STEP_LINK_CACHE.set(item.id, link);
  return link;
}

function routeStepLink(step: RouteStep): ItemStepLink {
  return {
    kind: "route",
    stepId: step.id,
    area: step.area,
    label: "Route step",
    title: step.instruction,
    href: stepHref(step.id, step.area),
  };
}

function sweepStepLink(step: SweepStep): ItemStepLink {
  return {
    kind: "sweep",
    stepId: step.id,
    area: step.area,
    label: sweepKindLabel(step.kind),
    sweepKind: step.kind,
    title: step.title,
    href: stepHref(step.id, step.area),
  };
}

function resolveStepLink(item: Item): ItemStepLink | undefined {
  // Explicit route linkage wins: the item is named by a route step even when
  // that step does not list it in `autoAcquireItemIds`.
  const routeStep =
    (item.autoStepId ? STEP_BY_ID[item.autoStepId] : undefined) ??
    item.routeStepIds.map((id) => STEP_BY_ID[id]).find((step): step is RouteStep => Boolean(step));
  if (routeStep) return routeStepLink(routeStep);

  // `SWEEP_STEPS_BY_ITEM` is the same route-ordered index `sweepStepsForItem`
  // builds per call; use it here so the catalogue does not rescan the ledger.
  const indexed = itemSweepSteps(item.id)[0];
  if (indexed) return sweepStepLink(indexed);

  // Shared selector as the authority of last resort for anything the index misses.
  const resolved = collectionStepFor(item.id);
  const selectorStep = resolved?.kind === "route" ? STEP_BY_ID[resolved.stepId] : undefined;
  if (selectorStep) return routeStepLink(selectorStep);
  const sweep = resolved?.kind === "sweep" ? SWEEP_STEP_BY_ID[resolved.stepId] : undefined;
  return sweep ? sweepStepLink(sweep) : undefined;
}

interface ItemQuantityProps {
  item: Item;
  count: number;
  className?: string;
}

/**
 * Stepper shared by the catalogue grid and the drawer. `setItemCount(0)` marks
 * the item missing, so the count is the single source of ownership truth.
 */
export function ItemQuantity({ item, count, className = "" }: ItemQuantityProps) {
  const step = itemCountStep(item);
  const value = Math.max(0, Math.min(MAX_ITEM_COUNT, count));
  const set = (next: number) => setItemCount(item.id, Math.max(0, Math.min(MAX_ITEM_COUNT, next)));
  const label = `${item.name} quantity`;

  return (
    <div className={`col-qty ${className}`.trim()} role="group" aria-label={label}>
      <button
        type="button"
        className="col-qty-btn"
        onClick={() => set(value - step)}
        disabled={value <= 0}
        aria-label={`Decrease ${item.name} quantity by ${step}`}
      >
        <Icon name="minus" size={12} />
      </button>
      <span className={`col-qty-value${value > 0 ? " is-owned" : ""}`} aria-live="polite">
        {value > 0 ? `×${value}` : "—"}
      </span>
      <button
        type="button"
        className="col-qty-btn"
        onClick={() => set(value === 0 ? step : value + step)}
        disabled={value >= MAX_ITEM_COUNT}
        aria-label={`Increase ${item.name} quantity by ${step}`}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}

interface ItemAchievementLink {
  achievement: Achievement;
  description: string;
  wikiUrl: string;
  kind: string;
}

const ITEM_ACHIEVEMENTS: Record<string, ItemAchievementLink[]> = {};
for (const group of REQUIREMENT_GROUPS) {
  const achievement = ACHIEVEMENT_BY_ID[group.achievementId];
  if (!achievement) continue;
  for (const requirement of group.items) {
    const links = (ITEM_ACHIEVEMENTS[requirement.itemId] ??= []);
    if (links.some((link) => link.achievement.id === achievement.id)) continue;
    links.push({
      achievement,
      description: requirement.description,
      wikiUrl: requirement.wikiUrl,
      kind: group.kind,
    });
  }
}

function badgeTone(status: StepStatus | undefined): "default" | "success" | "warning" {
  const tone = stepStatusTone(status);
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  return "default";
}

function SourceLink({ url, label }: { url: string; label?: string }) {
  return (
    <a className="col-source-link" href={url} target="_blank" rel="noreferrer">
      <span>{label ?? url}</span>
      <Icon name="external" size={12} />
    </a>
  );
}

function LocationValue({ item }: { item: Item }) {
  const kind = itemLocationKind(item);
  if (kind === "unrecorded") {
    return (
      <span className="col-location-note">
        No location recorded in this content pack — the catalogue carries only an acquisition category. The acquisition
        step below still tracks the item, so it stays on the checklist while you confirm it in game.
      </span>
    );
  }
  if (kind === "area") {
    return (
      <span>
        {item.location}
        <span className="col-location-note">
          Area only — the exact spot is not recorded in this pack. The acquisition step below covers the pickups and
          purchases for this area.
        </span>
      </span>
    );
  }
  return <span>{item.location}</span>;
}

export function ItemDrawer({ item, onClose }: ItemDrawerProps) {
  const character = useActiveCharacter();
  const journey = useActiveJourney();
  const toast = useToast();
  const [showAllSteps, setShowAllSteps] = useState(false);

  useEffect(() => {
    setShowAllSteps(false);
  }, [item?.id]);

  if (!item) return null;

  const owned = character.items[item.id] === true;
  const count = Math.max(0, character.itemCounts[item.id] ?? (owned ? 1 : 0));
  const description = ITEM_DESCRIPTIONS[item.id];
  const stepLink = itemStepLink(item);
  const sweepRows = itemSweepSteps(item.id).map((step) => {
    const state = sweepStepState(step.id, character, journey);
    return {
      step,
      complete: state?.complete ?? false,
      acquired: state?.acquired ?? 0,
      total: state?.total ?? step.entries.length,
      entries: step.entries
        .map((entry, index) => ({ entry, acquired: state?.entries[index]?.acquired ?? false }))
        .filter(({ entry }) => entry.itemId === item.id),
    };
  });
  const sweepAreas = [...new Set(sweepRows.map((row) => row.step.area))];
  const acquisitionAreas = stepLink
    ? [...new Set([stepLink.area, ...sweepAreas])]
    : sweepAreas;
  const primarySweep = stepLink?.kind === "sweep" ? sweepRows.find((row) => row.step.id === stepLink.stepId) : undefined;
  const patchImpact = PATCH_IMPACT_BY_NAME[item.name];
  const tierEntries = Object.prototype.hasOwnProperty.call(TIERS_BY_NAME, item.name)
    ? TIERS_BY_NAME[item.name]
    : [];
  const stepIds = [...new Set([...item.routeStepIds, ...(item.autoStepId ? [item.autoStepId] : [])])];
  const linkedSteps = stepIds
    .map((id) => STEP_BY_ID[id])
    .filter((step): step is RouteStep => Boolean(step))
    .sort((a, b) => {
      if (a.id === item.autoStepId) return -1;
      if (b.id === item.autoStepId) return 1;
      return a.order - b.order;
    });
  const autoStep = item.autoStepId ? STEP_BY_ID[item.autoStepId] : undefined;
  const visibleSteps = showAllSteps ? linkedSteps : linkedSteps.slice(0, 6);
  const missable = isItemMissable(item);
  const timingSensitive = isItemTimingSensitive(item);
  const region = itemRegionName(item);
  const achievementLinks = ITEM_ACHIEVEMENTS[item.id] ?? [];
  const unresolvedRouteRef = item.linkedRouteRaw.trim() && linkedSteps.length === 0 ? item.linkedRouteRaw.trim() : "";
  const externalSource = item.wikiUrl || item.sourceUrl;
  const tierCount = tierEntries.length;

  const toggleOwned = () => {
    const next = !owned;
    setItemOwned(item.id, next);
    toast.push(`${item.name} ${next ? "marked owned" : "marked missing"}.`, next ? "success" : "default");
  };

  const openStep = (step: RouteStep) => {
    navigate(`/journey?area=${encodeURIComponent(step.area)}&step=${encodeURIComponent(step.id)}`);
  };

  const openStepLink = () => {
    if (stepLink) navigate(stepLink.href);
  };

  return (
    <Drawer
      open
      title={item.name}
      subtitle={
        <div className="col-drawer-sub">
          <span className="row wrap col-drawer-badges">
            <Badge tone="accent">{item.group}</Badge>
            {item.category && item.category !== item.group && !/^Category \d+$/.test(item.category) ? (
              <Badge>{item.category}</Badge>
            ) : null}
            <Badge tone="info">{item.game}</Badge>
            {item.dlc ? <Badge tone="accent">DLC</Badge> : null}
            {missable ? <Badge tone="danger">MISSABLE</Badge> : null}
            {timingSensitive ? <Badge tone="warning">Timing</Badge> : null}
            {isItemRouteLinked(item) ? <Badge tone="success">Route-linked</Badge> : null}
            {stepLink?.kind === "sweep" ? <Badge tone="info">{stepLink.label}</Badge> : null}
          </span>
          <div className="row wrap col-drawer-owned">
            <ItemQuantity item={item} count={count} />
            <Switch checked={owned} onChange={toggleOwned} label="Owned" />
          </div>
        </div>
      }
      onClose={onClose}
      footer={
        <div className="row-between wrap">
          <Button variant={owned ? "default" : "primary"} icon={owned ? "x" : "check"} onClick={toggleOwned}>
            {owned ? "Mark missing" : "Mark owned"}
          </Button>
          <div className="row wrap">
            {externalSource ? (
              <a className="btn btn-ghost" href={externalSource} target="_blank" rel="noreferrer">
                <Icon name="external" size={16} />
                {item.wikiUrl ? "Wiki" : "Source"}
              </a>
            ) : null}
            <Button icon="map" onClick={openStepLink} disabled={!stepLink}>
              {stepLink?.kind === "sweep" ? `Open ${stepLink.label.toLowerCase()}` : "Open route step"}
            </Button>
          </div>
        </div>
      }
    >
      {missable || timingSensitive || patchImpact ? (
        <div className="col-drawer-alerts">
          {missable ? (
            <Callout tone="danger" icon="alert">
              <strong>Missable.</strong>{" "}
              {item.missable.trim().toUpperCase() === "MISSABLE"
                ? "This item is locked out by quest or area progression. Grab it before the linked section closes."
                : item.missable}
            </Callout>
          ) : timingSensitive ? (
            <Callout tone="warning" icon="clock">
              <strong>Acquisition note:</strong> {item.missable}
            </Callout>
          ) : null}
          {patchImpact ? (
            <Callout tone="warning" icon="alert">
              <strong>Patch 1.17 balance change:</strong> {patchImpact.summary} ({patchImpact.category}). The
              certified build and tier data is 1.16.1 baseline; re-check this item before relying on its ranking.
            </Callout>
          ) : null}
        </div>
      ) : null}

      {description?.text ? (
        <section className="col-desc" aria-label="In-game description">
          <SectionTitle title="Description" note="In-game item text" />
          <p className="col-desc-text">{description.text}</p>
          {description.sourceUrl ? <SourceLink url={description.sourceUrl} label="Description source" /> : null}
        </section>
      ) : (
        <p className="col-desc-missing small faint">No in-game description recorded.</p>
      )}

      <p className="tiny faint col-shared-note">
        Owned items are shared across every area and route step.
      </p>

      <dl className="kv col-kv">
        <dt>Section</dt>
        <dd>{item.section || "No section recorded in the content pack."}</dd>
        <dt>Location</dt>
        <dd>
          <LocationValue item={item} />
        </dd>
        <dt>Region</dt>
        <dd>{region ?? `Not recorded — catalogue groups this under ${item.game}.`}</dd>
        <dt>Game</dt>
        <dd>{item.game}</dd>
        <dt>DLC</dt>
        <dd>{item.dlc ? "Yes — Shadow of the Erdtree" : item.game === "Tarnished Pack" ? "Tarnished Pack" : "No — base game"}</dd>
        <dt>Acquisition</dt>
        <dd>{item.acquisitionType || "Acquisition not recorded in the content pack."}</dd>
        <dt>Acquisition text</dt>
        <dd>{item.acquisitionText || "No expanded acquisition text in the content pack."}</dd>
        <dt>Missable / timing</dt>
        <dd>{item.missable || "Not flagged in the content pack."}</dd>
        <dt>Route raw ref</dt>
        <dd className="mono tiny">{item.linkedRouteRaw || "—"}</dd>
        <dt>Route reference</dt>
        <dd>
          {linkedSteps.length ? (
            `${linkedSteps.length} route ${linkedSteps.length === 1 ? "step" : "steps"} linked (${linkedSteps
              .slice(0, 3)
              .map((step) => `#${step.order + 1}`)
              .join(", ")}${linkedSteps.length > 3 ? "…" : ""}).`
          ) : unresolvedRouteRef ? (
            <span>
              Legacy reference <code className="mono tiny">{unresolvedRouteRef}</code> — not present in the current
              route data. Treat this as provenance only; the acquisition step below is current.
            </span>
          ) : stepLink ? (
            `Tracked by the ${stepLink.label.toLowerCase()} in ${stepLink.area} instead of the route step list.`
          ) : (
            "Tracked by a sweep step."
          )}
        </dd>
        <dt>Wiki source</dt>
        <dd>{item.wikiUrl ? <SourceLink url={item.wikiUrl} /> : NOT_IN_PACK}</dd>
        <dt>Catalogue sheet</dt>
        <dd>{item.sourceUrl ? <SourceLink url={item.sourceUrl} /> : NOT_IN_PACK}</dd>
        <dt>Validation</dt>
        <dd>{item.validation || NOT_IN_PACK}</dd>
        <dt>Item ID</dt>
        <dd className="mono tiny col-item-id">{item.id}</dd>
      </dl>

      <div className="col-drawer-section">
        <SectionTitle title="Notes" />
        <p className="small muted col-notes">{item.notes || NOT_IN_PACK}</p>
      </div>

      {achievementLinks.length ? (
        <div className="col-drawer-section">
          <SectionTitle
            title="Achievement requirements"
            note={`${achievementLinks.length} ${achievementLinks.length === 1 ? "achievement" : "achievements"}`}
          />
          <div className="col-ach-list">
            {achievementLinks.map((link) => (
              <div className="col-ach" key={link.achievement.id}>
                <div className="row-between wrap">
                  <button
                    type="button"
                    className="col-ach-name"
                    onClick={() => navigate("/completion?tab=achievements")}
                  >
                    <Icon name="achievement" size={14} />
                    <span>{link.achievement.name}</span>
                  </button>
                  {link.achievement.wikiUrl ? <SourceLink url={link.achievement.wikiUrl} label="Wiki" /> : null}
                </div>
                <div className="tiny faint">
                  {link.achievement.section} · {link.kind} requirement
                  {link.achievement.missable ? " · missable achievement" : ""}
                </div>
                {link.description ? <p className="small muted col-tier-notes">{link.description}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tierCount ? (
        <div className="col-drawer-section">
          <SectionTitle
            title="Tier placement"
            note={`${tierCount} ${tierCount === 1 ? "entry" : "entries"}`}
          />
          <div className="col-tier-list">
            {tierEntries.map((entry, index) => (
              <div className="col-tier" key={`${entry.list}-${entry.rank}-${index}`}>
                <div className="row-between wrap">
                  <span className="row wrap">
                    <TierBadge tier={entry.tier} />
                    <span className="small muted">{entry.list}</span>
                    <span className="tiny faint mono">Rank #{entry.rank}</span>
                  </span>
                  {entry.className ? <Badge>{entry.className}</Badge> : null}
                </div>
                {entry.poolType ? <div className="tiny faint">Pool: {entry.poolType}</div> : null}
                {entry.notes ? <p className="small muted col-tier-notes">{entry.notes}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {stepLink?.kind === "route" ? (
        <div className="col-drawer-section">
          <SectionTitle title="Acquisition step" note={`${stepLink.label} · ${stepLink.area}`} />
          <div className="col-step-list">
            <button
              type="button"
              className="col-step"
              onClick={openStepLink}
              aria-label={`Open route step in ${stepLink.area}`}
            >
              <span className="row-between wrap">
                <span className="row wrap">
                  <Badge tone="success">{stepLink.label}</Badge>
                  <Badge>{stepLink.area}</Badge>
                </span>
                <Badge tone={badgeTone(journey.steps[stepLink.stepId])}>
                  {stepStatusLabel(journey.steps[stepLink.stepId])}
                </Badge>
              </span>
              <span className="col-step-instruction">{stepLink.title}</span>
              <span className="tiny faint col-step-meta">
                <span>Journey step</span>
                <span>Opens at {stepLink.area}</span>
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {sweepRows.length ? (
        <div className="col-drawer-section">
          <SectionTitle
            title="Sweep coverage"
            note={`${sweepRows.length} ${sweepRows.length === 1 ? "step" : "steps"} · ${sweepAreas.length} ${
              sweepAreas.length === 1 ? "area" : "areas"
            }`}
          />
          {primarySweep ? (
            <Callout tone="success" icon="check">
              Start with the <strong>{primarySweep.step.title}</strong> step in {primarySweep.step.area} — it is the
              first sweep step that lists this item.
            </Callout>
          ) : null}
          {acquisitionAreas.length > 1 ? (
            <Callout tone="default" icon="layers">
              Obtainable in {acquisitionAreas.length} areas: {acquisitionAreas.join(", ")}. Ownership is character-wide —
              acquiring it once marks it owned everywhere, so pick whichever area is on your route and skip the rest.
            </Callout>
          ) : null}
          <div className="col-step-list">
            {sweepRows.map(({ step, entries, complete, acquired, total }) => (
              <div className="col-sweep-card" key={step.id}>
                <div className="row-between wrap">
                  <span className="row wrap">
                    <Badge tone="info">{sweepKindLabel(step.kind)}</Badge>
                    <Icon name="map" size={13} />
                    <strong>{step.area}</strong>
                    <Badge>{step.phase}</Badge>
                    <Badge tone={complete ? "success" : "default"}>
                      {complete ? "Step done" : `${formatNumber(acquired)}/${formatNumber(total)} ticked`}
                    </Badge>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="map"
                    onClick={() => navigate(stepHref(step.id, step.area))}
                    aria-label={`Open ${sweepKindLabel(step.kind).toLowerCase()} in ${step.area}`}
                  >
                    Open step
                  </Button>
                </div>
                <p className="tiny faint">{step.title}</p>
                <ul className="col-entry-list">
                  {entries.map(({ entry, acquired: entryAcquired }, index) => (
                    <li className="col-entry" key={`${step.id}-${index}`}>
                      <span className="col-entry-source">
                        {entry.source || "Source not recorded"}
                        {entry.dropRate ? <span> · {entry.dropRate} drop</span> : null}
                      </span>
                      <span className="tiny faint col-entry-meta">
                        {entry.quantity > 1 ? <span>×{entry.quantity}</span> : null}
                        {entry.stock ? <span>Stock {entry.stock}</span> : null}
                        {entry.price ? <span>{formatNumber(entry.price)} runes</span> : null}
                        <span className={entryAcquired ? "success" : undefined}>
                          {entryAcquired ? "Acquired" : "Missing"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {step.instruction ? <p className="tiny faint col-sweep-notes">{step.instruction}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="col-drawer-section">
        <SectionTitle
          title="Linked route steps"
          note={
            linkedSteps.length
              ? `${linkedSteps.length} linked`
              : stepLink?.kind === "sweep"
                ? `Tracked by the ${stepLink.label.toLowerCase()} above`
                : "Route linkage"
          }
        />
        {autoStep ? (
          <Callout tone="success" icon="check">
            <span>
              Auto-acquired: marking step {autoStep.order + 1} done in the active journey adds this item to the
              collection automatically.
              <span className="col-auto-instruction">{autoStep.instruction}</span>
            </span>
          </Callout>
        ) : null}
        {linkedSteps.length ? (
          <div className="col-step-list">
            {visibleSteps.map((step) => {
              const status = journey.steps[step.id];
              return (
                <button
                  type="button"
                  className="col-step"
                  key={step.id}
                  onClick={() => openStep(step)}
                  aria-label={`Open route step: ${step.instruction}`}
                >
                  <span className="row-between wrap">
                    <span className="row wrap">
                      <span className="tiny faint mono">#{step.order + 1}</span>
                      <Badge>{step.area}</Badge>
                      {step.id === item.autoStepId ? <Badge tone="success">Auto</Badge> : null}
                      {step.required ? <Badge>Required</Badge> : <Badge>Optional</Badge>}
                    </span>
                    <Badge tone={badgeTone(status)}>{stepStatusLabel(status)}</Badge>
                  </span>
                  <span className="col-step-instruction">{step.instruction}</span>
                  <span className="tiny faint col-step-meta">
                    <span className="col-step-phase">{step.phase}</span>
                    <span>{step.sectionTitle}</span>
                    <span>{step.type}</span>
                  </span>
                </button>
              );
            })}
            {linkedSteps.length > 6 ? (
              <Button
                size="sm"
                variant="ghost"
                icon={showAllSteps ? "chevronDown" : "chevronRight"}
                onClick={() => setShowAllSteps(!showAllSteps)}
              >
                {showAllSteps ? "Show fewer linked steps" : `Show all ${linkedSteps.length} linked steps`}
              </Button>
            ) : null}
          </div>
        ) : unresolvedRouteRef ? (
          <Callout tone="warning" icon="alert">
            <span>
              This item still points at <code className="mono tiny">{unresolvedRouteRef}</code>, a legacy route
              identifier that is not part of the merged {ROUTE_AREAS.length}-section route. It is shown as provenance
              only — the acquisition step above is the one to follow.
            </span>
          </Callout>
        ) : (
          <p className="small faint">
            The merged {formatNumber(ROUTE_STEPS.length)}-step route does not hand this item out on its own, so the
            route-linked filter excludes it.
            {stepLink?.kind === "sweep"
              ? ` Use the ${stepLink.label.toLowerCase()} in ${stepLink.area} above to collect it.`
              : ""}
            {sweepAreas.length > 1
              ? ` It appears in ${sweepAreas.length} areas; one acquisition clears all of them.`
              : ""}
          </p>
        )}
      </div>
    </Drawer>
  );
}
