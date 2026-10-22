import { useEffect, useState } from "react";
import { Badge, Button, Callout, Drawer, SectionTitle, Switch, TierBadge, useToast } from "./ui";
import { Icon } from "./Icon";
import { setItemOwned, useActiveCharacter, useActiveJourney } from "../lib/store";
import { ACHIEVEMENT_BY_ID, REQUIREMENT_GROUPS, ROUTE_AREAS, STEP_BY_ID, TIERS_BY_NAME } from "../lib/data";
import { PATCH_IMPACT_BY_NAME } from "../data/game";
import { stepStatusLabel, stepStatusTone } from "../lib/selectors";
import { navigate } from "../lib/router";
import type { Achievement, Item, RouteStep, StepStatus } from "../lib/types";

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
        Location not recorded in this content pack — the catalogue carries only an acquisition category, not an exact
        spot. Check the wiki source before relying on a location.
      </span>
    );
  }
  if (kind === "area") {
    return (
      <span>
        {item.location}
        <span className="col-location-note">Area only — the exact spot is not recorded in this pack.</span>
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
  const firstStep = autoStep ?? linkedSteps[0];
  const visibleSteps = showAllSteps ? linkedSteps : linkedSteps.slice(0, 6);
  const missable = isItemMissable(item);
  const timingSensitive = isItemTimingSensitive(item);
  const locationKind = itemLocationKind(item);
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
          </span>
          <Switch checked={owned} onChange={toggleOwned} label="Owned" />
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
            <Button icon="map" onClick={() => firstStep && openStep(firstStep)} disabled={!firstStep}>
              Open route step
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
              route data. Treat this as provenance only.
            </span>
          ) : (
            "Not linked to a route step."
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

      <div className="col-drawer-section">
        <SectionTitle
          title="Linked route steps"
          note={linkedSteps.length ? `${linkedSteps.length} linked` : undefined}
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
              identifier that is not part of the merged {ROUTE_AREAS.length}-section route. It is shown as provenance,
              not as a navigable step.
            </span>
          </Callout>
        ) : (
          <p className="small faint">
            No route step in the current content pack links this item, so the route-linked filter will not include it.
            {locationKind === "unrecorded" ? " Its location is also unrecorded — use the wiki source above." : ""}
          </p>
        )}
      </div>
    </Drawer>
  );
}
